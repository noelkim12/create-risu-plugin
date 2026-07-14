import { describe, expect, it } from "vitest"

import type { StoredCredential } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/core/types"
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
    await provider.complete({
      config: {
        provider: "openai-compatible",
        baseUrl: "https://llm.example/v1",
        authMode: "bearer",
        customHeaderNames: ["x-tenant"],
        model: "chat-test",
        timeoutMs: 60_000,
      },
      credential,
      request: { messages: [{ role: "user", content: "Reply OK" }] },
      options: {},
    })

    expect(captured?.url).toBe("https://llm.example/v1/chat/completions")
    expect(captured?.headers).toMatchObject({
      "content-type": "application/json",
      Authorization: "Bearer test-key",
      "x-tenant": "tenant-secret",
    })
    expect(JSON.parse(captured?.body ?? "").stream).toBe(false)
    expect(captured?.networkRoute).toBe("auto")
  })
})
