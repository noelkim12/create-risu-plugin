import { describe, expect, it } from "vitest"

import { createRsaPrivateKeyPem } from "../../helpers/rsa-key-pair"
import { GoogleServiceAccountTokenProvider } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/auth/google-service-account"
import type { StoredCredential } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/core/types"
import type {
  HttpRequest,
  HttpTransport,
} from "../../../templates/features/llm-client/common/ts/src/features/llm-client/network/native-fetch-transport"

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
})
