import { describe, expect, it } from "vitest"

import type { LlmStreamEvent, StoredCredential } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/core/types"
import { parseStoredSettings } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/core/validation"
import type {
  HttpRequest,
  HttpTransport,
} from "../../../templates/features/llm-client/common/ts/src/features/llm-client/network/native-fetch-transport"
import { GoogleAiStudioProvider } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/providers/google-ai-studio"

describe("GoogleAiStudioProvider", () => {
  it("sends the key only as a header and normalizes the response", async () => {
    let captured: HttpRequest | undefined
    const transport: HttpTransport = {
      async request(request) {
        captured = request
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          bodyText: JSON.stringify({
            candidates: [{
              content: { parts: [{ text: "OK" }] },
              finishReason: "STOP",
            }],
          }),
        }
      },
      async stream() {
        throw new TypeError("Streaming transport must not be called.")
      },
    }
    const credential: StoredCredential = {
      schemaVersion: 1,
      slot: "google-ai-studio",
      audience: "https://generativelanguage.googleapis.com",
      revision: "revision-a",
      updatedAt: 1,
      secret: { apiKey: "google-secret" },
    }
    const provider = new GoogleAiStudioProvider(transport)
    const settings = parseStoredSettings({
      schemaVersion: 2,
      savedKeys: [],
      savedModelConfigs: [{
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        name: "Google AI Studio",
        provider: "google-ai-studio",
        authMode: "api-key",
        modelId: "gemini-test",
        keyId: null,
        timeoutMs: 60_000,
        reasoning: { provider: "google-ai-studio", level: null },
        flags: [],
        additionalJson: "{\"toolConfig\":{\"functionCallingConfig\":{\"mode\":\"AUTO\"}}}",
      }],
      selectedModelConfigId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      defaultModelConfigId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    })
    const model = settings.savedModelConfigs[0]
    if (model === undefined) throw new TypeError("Expected Google AI Studio model fixture.")

    await expect(provider.complete({
      model,
      credential,
      request: { messages: [{ role: "user", content: "Reply OK" }] },
      options: { modelConfigId: model.id },
    })).resolves.toMatchObject({
      provider: "google-ai-studio",
      model: "gemini-test",
      text: "OK",
    })

    expect(captured).toBeDefined()
    expect(captured?.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent",
    )
    expect(captured?.headers).toEqual({
      "content-type": "application/json",
      "x-goog-api-key": "google-secret",
    })
    expect(captured?.url).not.toContain("google-secret")
    expect(captured?.networkRoute).toBe("auto")
    expect(JSON.parse(captured?.body ?? "")).toMatchObject({
      contents: [{ role: "user", parts: [{ text: "Reply OK" }] }],
      toolConfig: { functionCallingConfig: { mode: "AUTO" } },
    })
  })

  it("uses the Gemini SSE endpoint for a flagged stream", async () => {
    const encoder = new TextEncoder()
    let captured: HttpRequest | undefined
    const transport: HttpTransport = {
      async request() {
        throw new TypeError("Final response transport must not be called.")
      },
      async stream(request) {
        captured = request
        async function* body(): AsyncIterable<Uint8Array> {
          yield encoder.encode("data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"OK\"}]},\"finishReason\":\"STOP\"}]}\n\n")
        }
        return { ok: true, status: 200, headers: new Headers(), body: body() }
      },
    }
    const settings = parseStoredSettings({
      schemaVersion: 2,
      savedKeys: [],
      savedModelConfigs: [{
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        name: "Google AI Studio stream",
        provider: "google-ai-studio",
        authMode: "api-key",
        modelId: "gemini-test",
        keyId: null,
        timeoutMs: 60_000,
        reasoning: { provider: "google-ai-studio", level: null },
        flags: ["hasStreaming"],
        additionalJson: "",
      }],
      selectedModelConfigId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      defaultModelConfigId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    })
    const model = settings.savedModelConfigs[0]
    if (model === undefined) throw new TypeError("Expected Google AI Studio stream model.")
    const credential: StoredCredential = {
      schemaVersion: 1,
      slot: "google-ai-studio",
      audience: "https://generativelanguage.googleapis.com",
      revision: "stream-revision",
      updatedAt: 1,
      secret: { apiKey: "google-secret" },
    }
    const events: LlmStreamEvent[] = []
    for await (const event of new GoogleAiStudioProvider(transport).stream({
      model,
      credential,
      request: { messages: [{ role: "user", content: "Reply OK" }] },
      options: { modelConfigId: model.id },
    })) events.push(event)

    expect(captured?.url).toContain(":streamGenerateContent?alt=sse")
    expect(events).toEqual([
      { type: "part", part: { type: "text", text: "OK" } },
      { type: "finish", finishReason: "STOP" },
    ])
  })
})
