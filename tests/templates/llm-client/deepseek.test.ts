import { describe, expect, it } from "vitest"

import type { StoredCredential } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/core/types"
import { parseStoredSettings } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/core/validation"
import type { HttpRequest, HttpTransport } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/network/native-fetch-transport"
import { DeepSeekProvider } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/providers/deepseek"

function deepSeekModel(additionalJson: string) {
  const settings = parseStoredSettings({
    schemaVersion: 2,
    savedKeys: [{
      id: "11111111-1111-4111-8111-111111111111",
      name: "DeepSeek key",
      provider: "deepseek",
      kind: "api-key",
    }],
    savedModelConfigs: [{
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "DeepSeek model",
      provider: "deepseek",
      authMode: "bearer",
      baseUrl: "https://api.deepseek.com",
      modelId: "deepseek-test",
      keyId: "11111111-1111-4111-8111-111111111111",
      timeoutMs: 60_000,
      reasoning: { provider: "deepseek", enabled: true },
       flags: ["hasPrefill", "deepSeekPrefix", "deepSeekThinkingInput", "deepSeekThinkingOutput"],
      additionalJson,
    }],
    selectedModelConfigId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    defaultModelConfigId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  })
  const model = settings.savedModelConfigs[0]
  if (model?.provider !== "deepseek") throw new TypeError("Expected DeepSeek model fixture.")
  return model
}

const credential: StoredCredential = {
  schemaVersion: 1,
  slot: "deepseek",
  audience: "https://api.deepseek.com/chat/completions",
  revision: "revision-a",
  updatedAt: 1,
  secret: { apiKey: "deepseek-test-key" },
}

describe("DeepSeekProvider", () => {
  it("maps DeepSeek-specific thinking input, prefix, output, and allowed JSON", async () => {
    const requests: HttpRequest[] = []
    const transport: HttpTransport = {
      async request(request) {
        requests.push(request)
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          bodyText: JSON.stringify({
            choices: [{ message: { content: "OK", reasoning_content: "because" } }],
            usage: { completion_tokens_details: { reasoning_tokens: 3 } },
          }),
        }
      },
      async stream() {
        throw new TypeError("Streaming transport must not be called.")
      },
    }
    const model = deepSeekModel("{\"response_format\":{\"type\":\"text\"}}")
    const result = await new DeepSeekProvider(transport).complete({
      model,
      credential,
      request: {
        messages: [{ role: "assistant", content: "Prior", reasoning: "prior reasoning" }],
        prefill: { role: "assistant", content: "Continue" },
      },
      options: { modelConfigId: model.id },
    })

    expect(result).toMatchObject({ reasoning: "because", usage: { reasoningTokens: 3 } })
    expect(JSON.parse(requests[0]?.body ?? "")).toMatchObject({
      thinking: { type: "enabled" },
      response_format: { type: "text" },
      messages: [
        { role: "assistant", reasoning_content: "prior reasoning" },
        { role: "assistant", content: "Continue", prefix: true },
      ],
    })
  })

  it("rejects a protected collision before requesting DeepSeek", async () => {
    const requests: HttpRequest[] = []
    const transport: HttpTransport = { async request(request) {
      requests.push(request)
      throw new TypeError("Transport must not be called.")
    }, async stream() {
      throw new TypeError("Streaming transport must not be called.")
    } }
    const model = { ...deepSeekModel(""), additionalJson: "{\"model\":\"other\"}" }

    await expect(new DeepSeekProvider(transport).complete({
      model,
      credential,
      request: { messages: [{ role: "user", content: "Hello" }] },
      options: { modelConfigId: model.id },
    })).rejects.toMatchObject({ code: "CONFIG_INVALID" })
    expect(requests).toHaveLength(0)
  })
})
