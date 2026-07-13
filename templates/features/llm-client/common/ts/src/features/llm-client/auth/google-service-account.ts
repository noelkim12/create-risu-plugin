import { LlmError } from "../core/errors"
import type { StoredCredential } from "../core/types"
import type { HttpTransport } from "../network/native-fetch-transport"

const TOKEN_URL = "https://oauth2.googleapis.com/token"
const TOKEN_SCOPE = "https://www.googleapis.com/auth/cloud-platform"
const JWT_LIFETIME_SECONDS = 3600
const REFRESH_SKEW_MS = 60_000

type CachedToken = { readonly value: string; readonly usableUntil: number }

function base64Url(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function encodeJson(value: unknown): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)))
}

function pemBytes(pem: string): Uint8Array {
  const base64 = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "")
  const binary = atob(base64)
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

async function signAssertion(credential: StoredCredential, nowMs: number): Promise<string> {
  const clientEmail = credential.secret.clientEmail
  const privateKey = credential.secret.privateKey
  if (!clientEmail || !privateKey) {
    throw new LlmError("CREDENTIAL_MISSING", "Service Account credential is incomplete.", "google-vertex")
  }
  const nowSeconds = Math.floor(nowMs / 1000)
  const header = {
    alg: "RS256",
    typ: "JWT",
    ...(credential.secret.privateKeyId ? { kid: credential.secret.privateKeyId } : {}),
  }
  const claims = {
    iss: clientEmail,
    scope: TOKEN_SCOPE,
    aud: TOKEN_URL,
    iat: nowSeconds,
    exp: nowSeconds + JWT_LIFETIME_SECONDS,
  }
  const unsigned = `${encodeJson(header)}.${encodeJson(claims)}`
  try {
    const key = await crypto.subtle.importKey(
      "pkcs8",
      pemBytes(privateKey),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    )
    const signature = await crypto.subtle.sign(
      { name: "RSASSA-PKCS1-v1_5" },
      key,
      new TextEncoder().encode(unsigned),
    )
    return `${unsigned}.${base64Url(new Uint8Array(signature))}`
  } catch {
    throw new LlmError(
      "AUTH_FAILED",
      "Service Account private key could not sign the OAuth assertion.",
      "google-vertex",
    )
  }
}

export class GoogleServiceAccountTokenProvider {
  private readonly cache = new Map<string, CachedToken>()
  private readonly inFlight = new Map<string, Promise<string>>()

  constructor(
    private readonly transport: HttpTransport,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async getAccessToken(
    credential: StoredCredential,
    signal?: AbortSignal,
    timeoutMs = 60_000,
  ): Promise<string> {
    const cached = this.cache.get(credential.revision)
    if (cached && this.now() < cached.usableUntil) return cached.value
    const existing = this.inFlight.get(credential.revision)
    if (existing) return existing

    const request = this.refresh(credential, signal, timeoutMs)
    this.inFlight.set(credential.revision, request)
    try {
      return await request
    } finally {
      this.inFlight.delete(credential.revision)
    }
  }

  private async refresh(
    credential: StoredCredential,
    signal: AbortSignal | undefined,
    timeoutMs: number,
  ): Promise<string> {
    const assertion = await signAssertion(credential, this.now())
    const response = await this.transport.request({
      url: TOKEN_URL,
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }).toString(),
      signal,
      timeoutMs,
      networkRoute: "auto",
    })
    if (!response.ok) {
      throw new LlmError(
        response.status === 400 || response.status === 401 ? "AUTH_FAILED" : "HTTP_ERROR",
        `Google OAuth token request failed with HTTP ${response.status}.`,
        "google-vertex",
        response.status,
      )
    }
    let decoded: unknown
    try {
      decoded = JSON.parse(response.bodyText)
    } catch {
      throw new LlmError("INVALID_RESPONSE", "Google OAuth returned malformed JSON.", "google-vertex")
    }
    const value = typeof decoded === "object" && decoded !== null && !Array.isArray(decoded)
      ? decoded as Record<string, unknown>
      : null
    if (
      value === null
      || typeof value.access_token !== "string"
      || value.access_token === ""
      || typeof value.expires_in !== "number"
      || !Number.isFinite(value.expires_in)
      || value.expires_in <= 0
    ) {
      throw new LlmError("INVALID_RESPONSE", "Google OAuth response is missing token fields.", "google-vertex")
    }
    this.cache.set(credential.revision, {
      value: value.access_token,
      usableUntil: this.now() + value.expires_in * 1000 - REFRESH_SKEW_MS,
    })
    return value.access_token
  }

  invalidate(): void {
    this.cache.clear()
    this.inFlight.clear()
  }
}
