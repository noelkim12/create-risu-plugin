import { AiServiceError } from "../../ai-services/core/errors"
import { isPkcs8PrivateKey } from "../../ai-services/core/pkcs8"
import type {
  ApiKeyCredential,
  ApiKeySecret,
  CredentialBinding,
  CredentialId,
  CredentialKind,
  CredentialMetadata,
  CredentialProviderId,
  ResolvedCredential,
  VertexServiceAccountCredential,
  VertexServiceAccountSecret,
} from "./types"

const PROVIDERS = ["google-ai-studio", "google-vertex", "openai-compatible", "ollama", "deepseek", "voyage"] as const
const RESERVED_HEADER_NAMES = new Set([
  "authorization", "content-type", "content-length", "host", "connection",
  "transfer-encoding", "x-goog-api-key", "apikey", "__proto__", "prototype", "constructor",
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every(key => allowed.includes(key))
}

function isSafeAudience(value: string): boolean {
  if (value === "unbound" || value.startsWith("vertex:")) return true
  try {
    const url = new URL(value)
    return (url.protocol === "https:" || url.protocol === "http:")
      && url.username === "" && url.password === "" && url.hash === ""
  } catch (error) {
    if (error instanceof TypeError) return false
    throw error
  }
}

function apiKeyError(record: ApiKeyCredential): string | null {
  if (record.secret.apiKey.trim() === "" || /[\r\n]/.test(record.secret.apiKey)) {
    return "API key values must be non-empty strings without newlines."
  }
  if (!isSafeAudience(record.audience)) return "API-key credentials have an invalid audience."
  const headerNames = Object.keys(record.secret).filter(name => name !== "apiKey")
  if (headerNames.length === 0) return null
  if (record.provider !== "openai-compatible" && record.provider !== "deepseek") {
    return "Custom headers are only supported by OpenAI-compatible and DeepSeek credentials."
  }
  const names = new Set<string>()
  for (const rawName of headerNames) {
    const name = rawName.trim()
    const lower = name.toLowerCase()
    if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name) || RESERVED_HEADER_NAMES.has(lower) || names.has(lower)) {
      return "Custom header names are invalid."
    }
    const value = record.secret[rawName]
    if (value === undefined || value.trim() === "" || /[\r\n]/.test(value)) {
      return "Custom header values must be non-empty strings without newlines."
    }
    names.add(lower)
  }
  return null
}

function vertexError(record: VertexServiceAccountCredential): string | null {
  const { projectId, location, clientEmail, privateKey, privateKeyId } = record.secret
  if (
    projectId.trim() === "" || /[\r\n]/.test(projectId)
    || !/^(?:global|[a-z][a-z0-9-]{1,62})$/.test(location.trim())
    || clientEmail.trim() === "" || /[\r\n]/.test(clientEmail)
    || !isPkcs8PrivateKey(privateKey)
    || (privateKeyId !== undefined && (privateKeyId.trim() === "" || /[\r\n]/.test(privateKeyId)))
  ) return "Vertex service-account credentials are malformed."
  return record.audience === "unbound" || record.audience.startsWith(`vertex:${projectId.trim()}:`)
    ? null
    : "Vertex service-account credentials have an incompatible audience."
}

export function isCredentialId(value: unknown): value is CredentialId {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function isCredentialProviderId(value: unknown): value is CredentialProviderId {
  return typeof value === "string" && PROVIDERS.some(provider => provider === value)
}

export function isCredentialKind(value: unknown): value is CredentialKind {
  return value === "api-key" || value === "vertex-service-account" || value === "none"
}

export function matchesCredentialBinding(metadata: CredentialMetadata, binding: CredentialBinding): boolean {
  return metadata.provider === binding.provider
    && metadata.kind === binding.kind
    && metadata.authMode === binding.authMode
    && metadata.audience === binding.audience
}

export function assertCredentialMatches(metadata: CredentialMetadata, binding: CredentialBinding): void {
  if (!matchesCredentialBinding(metadata, binding)) {
    throw new AiServiceError("CREDENTIAL_SCOPE_MISMATCH", "The saved key is not compatible with this configuration.", {
      provider: binding.provider,
    })
  }
}

export function parseCredentialMetadata(value: unknown): CredentialMetadata | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["id", "name", "provider", "kind", "authMode", "audience", "updatedAt"])) return null
  const { id, name, provider, kind, authMode, audience, updatedAt } = value
  if (
    !isCredentialId(id) || typeof name !== "string" || name.trim() === "" || !isCredentialProviderId(provider)
    || !isCredentialKind(kind) || typeof audience !== "string" || audience === ""
    || typeof updatedAt !== "number" || !Number.isFinite(updatedAt)
  ) return null
  if (kind === "none" && authMode === "none") return { id, name: name.trim(), provider, kind, authMode, audience, updatedAt }
  if (kind === "api-key" && (authMode === "api-key" || authMode === "bearer")) {
    return { id, name: name.trim(), provider, kind, authMode, audience, updatedAt }
  }
  if (kind === "vertex-service-account" && provider === "google-vertex" && authMode === "service-account") {
    return { id, name: name.trim(), provider, kind, authMode, audience, updatedAt }
  }
  return null
}

export function parseResolvedCredential(value: unknown): ResolvedCredential | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["schemaVersion", "keyId", "provider", "kind", "audience", "revision", "updatedAt", "secret"])) return null
  const { keyId, provider, kind, audience, revision, updatedAt, secret } = value
  if (
    value["schemaVersion"] !== 2 || !isCredentialId(keyId) || !isCredentialProviderId(provider)
    || (kind !== "api-key" && kind !== "vertex-service-account") || typeof audience !== "string"
    || typeof revision !== "string" || typeof updatedAt !== "number" || !Number.isFinite(updatedAt) || !isRecord(secret)
  ) return null
  if (kind === "api-key") {
    if (Object.values(secret).some(item => typeof item !== "string") || typeof secret["apiKey"] !== "string") return null
    const record: ApiKeyCredential = {
      schemaVersion: 2, keyId, provider, kind, audience, revision, updatedAt,
      secret: { ...secret, apiKey: secret["apiKey"] },
    }
    return apiKeyError(record) === null ? record : null
  }
  if (provider !== "google-vertex" || !hasOnlyKeys(secret, ["projectId", "location", "clientEmail", "privateKey", "privateKeyId"])) return null
  const { projectId, location, clientEmail, privateKey, privateKeyId } = secret
  if (
    typeof projectId !== "string" || typeof location !== "string" || typeof clientEmail !== "string"
    || typeof privateKey !== "string" || (privateKeyId !== undefined && typeof privateKeyId !== "string")
  ) return null
  const record: VertexServiceAccountCredential = {
    schemaVersion: 2, keyId, provider, kind, audience, revision, updatedAt,
    secret: {
      projectId, location, clientEmail, privateKey,
      ...(privateKeyId === undefined ? {} : { privateKeyId }),
    },
  }
  return vertexError(record) === null ? record : null
}

export function createResolvedCredential(input: {
  readonly metadata: CredentialMetadata
  readonly secret: ApiKeySecret | VertexServiceAccountSecret
  readonly revision: string
  readonly updatedAt: number
}): ResolvedCredential {
  const { metadata, secret, revision, updatedAt } = input
  if (metadata.kind === "none") throw new AiServiceError("CONFIG_INVALID", "A no-authentication key cannot store a secret.")
  const parsed = parseResolvedCredential({
    schemaVersion: 2,
    keyId: metadata.id,
    provider: metadata.provider,
    kind: metadata.kind,
    audience: metadata.audience,
    revision,
    updatedAt,
    secret,
  })
  if (parsed === null) throw new AiServiceError("CONFIG_INVALID", "The saved credential is invalid.", { provider: metadata.provider })
  return parsed
}

export function parseLegacyRetrievalCredential(
  value: unknown,
  metadata: CredentialMetadata,
  revision: string,
): ResolvedCredential | null {
  if (
    metadata.kind !== "api-key" || !isRecord(value) || value["schemaVersion"] !== 1
    || value["credentialId"] !== metadata.id || value["provider"] !== metadata.provider
    || value["audience"] !== metadata.audience || typeof value["apiKey"] !== "string"
    || typeof value["updatedAt"] !== "number" || !Number.isFinite(value["updatedAt"])
  ) return null
  return createResolvedCredential({
    metadata,
    secret: { apiKey: value["apiKey"] },
    revision,
    updatedAt: value["updatedAt"],
  })
}
