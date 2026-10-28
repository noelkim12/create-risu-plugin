import { describe, expect, it, vi } from "vitest"

import type { GoogleServiceAccountTokenProvider } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/auth/google-service-account"
import type { StoredCredential } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/core/types"
import { parseStoredSettings } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/core/validation"
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
      async stream() {
        throw new TypeError("Streaming transport must not be called.")
      },
  }
  const tokens = { getAccessToken: vi.fn().mockResolvedValue("access-a") }
  const provider = new GoogleVertexProvider(
    transport,
    tokens as unknown as GoogleServiceAccountTokenProvider,
  )
  return { provider, requests, tokens }
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

function vertexModel(location: string, additionalJson = "") {
  const settings = parseStoredSettings({
    schemaVersion: 2,
    savedKeys: [],
    savedModelConfigs: [{
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Google Vertex",
      provider: "google-vertex",
      authMode: "service-account",
      projectId: "project-a",
      location,
      modelId: "gemini-test",
      keyId: null,
      timeoutMs: 60_000,
      reasoning: { provider: "google-vertex", level: null },
      flags: [],
        additionalJson,
    }],
    selectedModelConfigId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    defaultModelConfigId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  })
  const model = settings.savedModelConfigs[0]
  if (model === undefined) throw new TypeError("Expected Google Vertex model fixture.")
  return model
}

describe("GoogleVertexProvider", () => {
  it("uses a regional project endpoint with a Service Account access token", async () => {
    const { provider, requests, tokens } = harness()
    const model = vertexModel("us-central1")
    await provider.complete({
      model,
      credential: serviceAccountCredential,
      request: { messages: [{ role: "user", content: "Reply OK" }] },
      options: { modelConfigId: model.id },
    })
    expect(requests[0]?.url).toBe(
      "https://us-central1-aiplatform.googleapis.com/v1/projects/project-a/locations/us-central1/publishers/google/models/gemini-test:generateContent",
    )
    expect(requests[0]?.headers).toMatchObject({ Authorization: "Bearer access-a" })
    expect(tokens.getAccessToken).toHaveBeenCalledWith(serviceAccountCredential, undefined, 60_000)
  })

  it("uses the non-regional host for global Service Account calls", async () => {
    const { provider, requests } = harness()
    const model = vertexModel("global")
    const credential = { ...serviceAccountCredential, audience: "vertex:project-a:global" }
    await provider.complete({
      model,
      credential,
      request: { messages: [{ role: "user", content: "Reply OK" }] },
      options: { modelConfigId: model.id },
    })
    expect(requests[0]?.url).toBe(
      "https://aiplatform.googleapis.com/v1/projects/project-a/locations/global/publishers/google/models/gemini-test:generateContent",
    )
  })

  it("rejects protected additional JSON before a Service Account token or HTTP request", async () => {
    const { provider, requests, tokens } = harness()
    const model = { ...vertexModel("global"), additionalJson: "{\"generationConfig\":{}}" }

    await expect(provider.complete({
      model,
      credential: serviceAccountCredential,
      request: { messages: [{ role: "user", content: "Reply OK" }] },
      options: { modelConfigId: model.id },
    })).rejects.toMatchObject({ code: "CONFIG_INVALID" })

    expect(tokens.getAccessToken).not.toHaveBeenCalled()
    expect(requests).toHaveLength(0)
  })
})
