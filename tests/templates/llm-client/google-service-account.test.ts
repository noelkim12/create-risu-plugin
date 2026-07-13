import { describe, expect, it } from "vitest"

import { createRsaPrivateKeyPem } from "../../helpers/rsa-key-pair"
import { GoogleServiceAccountTokenProvider } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/auth/google-service-account"
import type { StoredCredential } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/core/types"
import type {
  HttpRequest,
  HttpResponse,
  HttpTransport,
} from "../../../templates/features/llm-client/common/ts/src/features/llm-client/network/native-fetch-transport"

interface Deferred<T> {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
  readonly reject: (reason: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function tokenResponse(accessToken: string, status = 200): HttpResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": "application/json" }),
    bodyText: JSON.stringify({ access_token: accessToken, expires_in: 3600 }),
  }
}

async function waitForRequests(requests: readonly HttpRequest[], count: number): Promise<void> {
  while (requests.length < count) {
    await new Promise(resolve => setTimeout(resolve, 0))
  }
}

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=")
  return Uint8Array.from(atob(base64), character => character.charCodeAt(0))
}

function decodeJson(value: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as Record<string, unknown>
}

describe("GoogleServiceAccountTokenProvider", () => {
  it("signs RS256 assertions, refreshes single-flight, and honors the expiry skew", async () => {
    const { pem, publicKey } = await createRsaPrivateKeyPem()
    const requests: HttpRequest[] = []
    const transport: HttpTransport = {
      async request(request) {
        requests.push(request)
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          bodyText: JSON.stringify({
            access_token: requests.length === 1 ? "access-a" : "access-b",
            expires_in: 3600,
            token_type: "Bearer",
          }),
        }
      },
    }
    let now = 1_700_000_000_000
    const credential: StoredCredential = {
      schemaVersion: 1,
      slot: "google-vertex-service-account",
      audience: "vertex:test-project:us-central1",
      revision: "revision-a",
      updatedAt: now,
      secret: {
        projectId: "test-project",
        clientEmail: "vertex@test-project.iam.gserviceaccount.com",
        privateKey: pem,
        privateKeyId: "key-id",
      },
    }
    const tokens = new GoogleServiceAccountTokenProvider(transport, () => now)

    await expect(Promise.all([
      tokens.getAccessToken(credential),
      tokens.getAccessToken(credential),
    ])).resolves.toEqual(["access-a", "access-a"])
    expect(requests).toHaveLength(1)

    const tokenRequest = requests[0]
    if (!tokenRequest) throw new Error("Token request was not captured")
    expect(tokenRequest.url).toBe("https://oauth2.googleapis.com/token")
    expect(tokenRequest.headers).toEqual({ "content-type": "application/x-www-form-urlencoded" })
    const form = new URLSearchParams(tokenRequest.body ?? "")
    expect(form.get("grant_type"))
      .toBe("urn:ietf:params:oauth:grant-type:jwt-bearer")
    const assertion = form.get("assertion")
    if (!assertion) throw new Error("JWT assertion was not sent")
    const [encodedHeader, encodedClaims, encodedSignature] = assertion.split(".")
    if (!encodedHeader || !encodedClaims || !encodedSignature) {
      throw new Error("JWT assertion did not have three segments")
    }
    expect(decodeJson(encodedHeader)).toEqual({ alg: "RS256", typ: "JWT", kid: "key-id" })
    expect(decodeJson(encodedClaims)).toMatchObject({
      iss: "vertex@test-project.iam.gserviceaccount.com",
      scope: "https://www.googleapis.com/auth/cloud-platform",
      aud: "https://oauth2.googleapis.com/token",
      iat: 1_700_000_000,
      exp: 1_700_003_600,
    })
    expect(await crypto.subtle.verify(
      { name: "RSASSA-PKCS1-v1_5" },
      publicKey,
      decodeBase64Url(encodedSignature),
      new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`),
    )).toBe(true)

    now += 3_540_001
    await expect(tokens.getAccessToken(credential)).resolves.toBe("access-b")
    expect(requests).toHaveLength(2)
  })

  it("does not let a pre-invalidation refresh repopulate cache or clear a newer refresh", async () => {
    const { pem } = await createRsaPrivateKeyPem()
    const requests: HttpRequest[] = []
    const responses: Deferred<HttpResponse>[] = []
    const transport: HttpTransport = {
      request(request) {
        requests.push(request)
        const response = deferred<HttpResponse>()
        responses.push(response)
        return response.promise
      },
    }
    const credential: StoredCredential = {
      schemaVersion: 1,
      slot: "google-vertex-service-account",
      audience: "vertex:test-project:us-central1",
      revision: "revision-race",
      updatedAt: 1,
      secret: {
        projectId: "test-project",
        clientEmail: "vertex@test-project.iam.gserviceaccount.com",
        privateKey: pem,
      },
    }
    const tokens = new GoogleServiceAccountTokenProvider(transport)

    const oldRefresh = tokens.getAccessToken(credential)
    await waitForRequests(requests, 1)
    tokens.invalidate()
    const newRefresh = tokens.getAccessToken(credential)
    await waitForRequests(requests, 2)

    responses[0]?.resolve(tokenResponse("access-old"))
    await expect(oldRefresh).resolves.toBe("access-old")

    const joinedNewRefresh = tokens.getAccessToken(credential)
    await Promise.resolve()
    expect(requests).toHaveLength(2)

    responses[1]?.resolve(tokenResponse("access-new"))
    await expect(Promise.all([newRefresh, joinedNewRefresh])).resolves
      .toEqual(["access-new", "access-new"])
    await expect(tokens.getAccessToken(credential)).resolves.toBe("access-new")
    expect(requests).toHaveLength(2)
  })

  it("lets an aborted caller leave a shared refresh without affecting another caller", async () => {
    const { pem } = await createRsaPrivateKeyPem()
    const response = deferred<HttpResponse>()
    const requests: HttpRequest[] = []
    const transport: HttpTransport = {
      request(request) {
        requests.push(request)
        return response.promise
      },
    }
    const credential: StoredCredential = {
      schemaVersion: 1,
      slot: "google-vertex-service-account",
      audience: "vertex:test-project:us-central1",
      revision: "revision-abort",
      updatedAt: 1,
      secret: {
        projectId: "test-project",
        clientEmail: "vertex@test-project.iam.gserviceaccount.com",
        privateKey: pem,
      },
    }
    const tokens = new GoogleServiceAccountTokenProvider(transport)
    const controller = new AbortController()

    const aborted = tokens.getAccessToken(credential, controller.signal)
    const unaffected = tokens.getAccessToken(credential)
    await waitForRequests(requests, 1)
    controller.abort()

    await expect(aborted).rejects.toMatchObject({ code: "ABORTED" })
    expect(requests[0]?.signal).toBeUndefined()
    response.resolve(tokenResponse("access-shared"))
    await expect(unaffected).resolves.toBe("access-shared")
    expect(requests).toHaveLength(1)
  })

  it("lets a timed-out caller leave a shared refresh without affecting another caller", async () => {
    const { pem } = await createRsaPrivateKeyPem()
    const response = deferred<HttpResponse>()
    const requests: HttpRequest[] = []
    const transport: HttpTransport = {
      request(request) {
        requests.push(request)
        return response.promise
      },
    }
    const credential: StoredCredential = {
      schemaVersion: 1,
      slot: "google-vertex-service-account",
      audience: "vertex:test-project:us-central1",
      revision: "revision-timeout",
      updatedAt: 1,
      secret: {
        projectId: "test-project",
        clientEmail: "vertex@test-project.iam.gserviceaccount.com",
        privateKey: pem,
      },
    }
    const tokens = new GoogleServiceAccountTokenProvider(transport)

    const timedOut = tokens.getAccessToken(credential, undefined, 10)
    const unaffected = tokens.getAccessToken(credential, undefined, 1_000)
    await waitForRequests(requests, 1)

    await expect(timedOut).rejects.toMatchObject({ code: "TIMEOUT" })
    expect(requests[0]?.timeoutMs).toBe(60_000)
    response.resolve(tokenResponse("access-shared"))
    await expect(unaffected).resolves.toBe("access-shared")
    expect(requests).toHaveLength(1)
  })

  it("retries after a failed shared refresh", async () => {
    const { pem } = await createRsaPrivateKeyPem()
    let attempts = 0
    const transport: HttpTransport = {
      async request() {
        attempts += 1
        if (attempts === 1) throw new Error("network unavailable")
        return tokenResponse("access-retry")
      },
    }
    const credential: StoredCredential = {
      schemaVersion: 1,
      slot: "google-vertex-service-account",
      audience: "vertex:test-project:us-central1",
      revision: "revision-retry",
      updatedAt: 1,
      secret: {
        projectId: "test-project",
        clientEmail: "vertex@test-project.iam.gserviceaccount.com",
        privateKey: pem,
      },
    }
    const tokens = new GoogleServiceAccountTokenProvider(transport)

    await expect(tokens.getAccessToken(credential)).rejects.toThrow("network unavailable")
    await expect(tokens.getAccessToken(credential)).resolves.toBe("access-retry")
    expect(attempts).toBe(2)
  })

  it("maps OAuth 403 responses to AUTH_FAILED", async () => {
    const { pem } = await createRsaPrivateKeyPem()
    const transport: HttpTransport = {
      async request() {
        return tokenResponse("ignored", 403)
      },
    }
    const credential: StoredCredential = {
      schemaVersion: 1,
      slot: "google-vertex-service-account",
      audience: "vertex:test-project:us-central1",
      revision: "revision-forbidden",
      updatedAt: 1,
      secret: {
        projectId: "test-project",
        clientEmail: "vertex@test-project.iam.gserviceaccount.com",
        privateKey: pem,
      },
    }

    await expect(new GoogleServiceAccountTokenProvider(transport).getAccessToken(credential))
      .rejects.toMatchObject({ code: "AUTH_FAILED", status: 403 })
  })
})
