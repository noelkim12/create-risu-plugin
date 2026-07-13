import { describe, expect, it, vi } from "vitest"

import type { GoogleServiceAccountTokenProvider } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/auth/google-service-account"
import type { StoredCredential } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/core/types"
import type {
  HttpRequest,
  HttpTransport,
} from "../../../templates/features/llm-client/common/ts/src/features/llm-client/network/native-fetch-transport"
import { GoogleVertexProvider } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/providers/google-vertex"

function harness() {
  const requests: HttpRequest[] = []
  const transport: HttpTransport = {
    async request(request) {
      requests.push(request)
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        bodyText: JSON.stringify({ candidates: [{ content: { parts: [{ text: "OK" }] } }] }),
      }
    },
  }
  const tokens = { getAccessToken: vi.fn().mockResolvedValue("access-a") }
  const provider = new GoogleVertexProvider(
    transport,
    tokens as unknown as GoogleServiceAccountTokenProvider,
  )
  return { provider, requests, tokens }
}

const apiKeyCredential: StoredCredential = {
  schemaVersion: 1,
  slot: "google-vertex-api-key",
  audience: "https://aiplatform.googleapis.com",
  revision: "revision-api",
  updatedAt: 1,
  secret: { apiKey: "vertex-secret" },
}

const serviceAccountCredential: StoredCredential = {
  schemaVersion: 1,
  slot: "google-vertex-service-account",
  audience: "vertex:project-a:us-central1",
  revision: "revision-service",
  updatedAt: 1,
  secret: {
    projectId: "project-a",
    clientEmail: "vertex@project-a.iam.gserviceaccount.com",
    privateKey: "runtime-key",
  },
}

describe("GoogleVertexProvider", () => {
  it("uses the Express Mode API-key endpoint without project or location", async () => {
    const { provider, requests, tokens } = harness()
    await provider.complete({
      config: {
        provider: "google-vertex",
        authMode: "api-key",
        projectId: "ignored-project",
        location: "ignored-location",
        model: "gemini-test",
        timeoutMs: 60_000,
      },
      credential: apiKeyCredential,
      request: { messages: [{ role: "user", content: "Reply OK" }] },
      options: {},
    })
    const captured = requests[0]
    expect(captured?.url).toBe(
      "https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-test:generateContent",
    )
    expect(captured?.headers).toMatchObject({ "x-goog-api-key": "vertex-secret" })
    expect(captured?.url).not.toContain("vertex-secret")
    expect(captured?.url).not.toContain("ignored-project")
    expect(tokens.getAccessToken).not.toHaveBeenCalled()
  })

  it("uses a regional project endpoint with a Service Account access token", async () => {
    const { provider, requests, tokens } = harness()
    await provider.complete({
      config: {
        provider: "google-vertex",
        authMode: "service-account",
        projectId: "project-a",
        location: "us-central1",
        model: "gemini-test",
        timeoutMs: 60_000,
      },
      credential: serviceAccountCredential,
      request: { messages: [{ role: "user", content: "Reply OK" }] },
      options: {},
    })
    expect(requests[0]?.url).toBe(
      "https://us-central1-aiplatform.googleapis.com/v1/projects/project-a/locations/us-central1/publishers/google/models/gemini-test:generateContent",
    )
    expect(requests[0]?.headers).toMatchObject({ Authorization: "Bearer access-a" })
    expect(tokens.getAccessToken).toHaveBeenCalledWith(serviceAccountCredential, undefined, 60_000)
  })

  it("uses the non-regional host for global Service Account calls", async () => {
    const { provider, requests } = harness()
    await provider.complete({
      config: {
        provider: "google-vertex",
        authMode: "service-account",
        projectId: "project-a",
        location: "global",
        model: "gemini-test",
        timeoutMs: 60_000,
      },
      credential: { ...serviceAccountCredential, audience: "vertex:project-a:global" },
      request: { messages: [{ role: "user", content: "Reply OK" }] },
      options: {},
    })
    expect(requests[0]?.url).toBe(
      "https://aiplatform.googleapis.com/v1/projects/project-a/locations/global/publishers/google/models/gemini-test:generateContent",
    )
  })
})
