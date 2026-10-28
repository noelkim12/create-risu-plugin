import { describe, expect, it } from "vitest"

import type { StoredCredential } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/core/types"
import { parseStoredSettings } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/core/validation"
import type { HttpRequest, HttpTransport } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/network/native-fetch-transport"
import { OpenAiCompatibleProvider } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/providers/openai-compatible"

describe("OpenAiCompatibleProvider", () => {
  it("sends canonical auth plus configured secret headers", async () => {
    let captured: HttpRequest | undefined
    const transport: HttpTransport = {
      async request(request) {
        captured = request
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          bodyText: JSON.stringify({ choices: [{ message: { content: "OK" } }] }),
        }
      },
      async stream() {
        throw new TypeError("Streaming transport must not be called.")
      },
    }
    const credential: StoredCredential = {
      schemaVersion: 1,
      slot: "openai-compatible",
      audience: "https://llm.example/v1/chat/completions",
      revision: "revision-a",
      updatedAt: 1,
      secret: { apiKey: "test-key", "x-tenant": "tenant-secret" },
    }
    const provider = new OpenAiCompatibleProvider(transport)
    const settings = parseStoredSettings({
      schemaVersion: 2,
      savedKeys: [],
      savedModelConfigs: [{
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        name: "OpenAI compatible",
        provider: "openai-compatible",
        authMode: "bearer",
        baseUrl: "https://llm.example/v1",
        modelId: "chat-test",
        keyId: null,
        timeoutMs: 60_000,
        reasoning: { provider: "openai-compatible", effort: null },
        flags: [],
        additionalJson: "{\"seed\":7}",
      }],
      selectedModelConfigId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      defaultModelConfigId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    })
    const model = settings.savedModelConfigs[0]
    if (model === undefined) throw new TypeError("Expected OpenAI-compatible model fixture.")
    await provider.complete({
      model,
      credential,
      request: { messages: [{ role: "user", content: "Reply OK" }] },
      options: { modelConfigId: model.id },
    })

    expect(captured?.url).toBe("https://llm.example/v1/chat/completions")
    expect(captured?.headers).toMatchObject({
      "content-type": "application/json",
      Authorization: "Bearer test-key",
      "x-tenant": "tenant-secret",
    })
    expect(JSON.parse(captured?.body ?? "")).toMatchObject({ stream: false, seed: 7 })
    expect((captured?.body ?? "").match(/\"seed\"/g)).toHaveLength(1)
    expect(captured?.networkRoute).toBe("auto")
  })
})
