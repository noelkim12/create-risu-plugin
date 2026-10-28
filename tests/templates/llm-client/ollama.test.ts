import { describe, expect, it } from "vitest"

import type { HttpRequest, HttpTransport } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/network/native-fetch-transport"
import { OllamaProvider } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/providers/ollama"
import { parseStoredSettings } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/core/validation"

describe("OllamaProvider", () => {
  it("uses Ollama's OpenAI-compatible route without auth by default", async () => {
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
    const provider = new OllamaProvider(transport)
    const settings = parseStoredSettings({
      schemaVersion: 2,
      savedKeys: [],
      savedModelConfigs: [{
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        name: "Ollama",
        provider: "ollama",
        authMode: "none",
        baseUrl: "http://127.0.0.1:11434/v1",
        modelId: "llama-test",
        keyId: null,
        timeoutMs: 60_000,
        reasoning: { provider: "ollama", enabled: false },
        flags: [],
        additionalJson: "{\"seed\":11}",
      }],
      selectedModelConfigId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      defaultModelConfigId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    })
    const model = settings.savedModelConfigs[0]
    if (model === undefined) throw new TypeError("Expected Ollama model fixture.")
    await provider.complete({
      model,
      credential: null,
      request: { messages: [{ role: "user", content: "Reply OK" }] },
      options: { modelConfigId: model.id },
    })

    expect(captured?.url).toBe("http://127.0.0.1:11434/v1/chat/completions")
    expect(captured?.networkRoute).toBe("local_network")
    expect(captured?.headers).not.toHaveProperty("Authorization")
    expect(JSON.parse(captured?.body ?? "")).toMatchObject({ stream: false, seed: 11 })
    expect((captured?.body ?? "").match(/\"seed\"/g)).toHaveLength(1)
  })
})
