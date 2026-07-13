import { describe, expect, it } from "vitest"

import type { HttpRequest, HttpTransport } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/network/native-fetch-transport"
import { OllamaProvider } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/providers/ollama"

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
    }
    const provider = new OllamaProvider(transport)
    await provider.complete({
      config: {
        provider: "ollama",
        baseUrl: "http://127.0.0.1:11434/v1",
        authMode: "none",
        model: "llama-test",
        timeoutMs: 60_000,
      },
      credential: null,
      request: { messages: [{ role: "user", content: "Reply OK" }] },
      options: {},
    })

    expect(captured?.url).toBe("http://127.0.0.1:11434/v1/chat/completions")
    expect(captured?.networkRoute).toBe("local_network")
    expect(captured?.headers).not.toHaveProperty("Authorization")
    expect(JSON.parse(captured?.body ?? "").stream).toBe(false)
  })
})
