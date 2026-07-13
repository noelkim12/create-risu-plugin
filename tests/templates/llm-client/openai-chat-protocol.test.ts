import { describe, expect, it } from "vitest"

import { LlmError } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/core/errors"
import {
  fromOpenAiChatResponse,
  toOpenAiChatRequest,
} from "../../../templates/features/llm-client/common/ts/src/features/llm-client/providers/openai-chat-protocol"

const config = {
  provider: "openai-compatible" as const,
  baseUrl: "https://llm.example/v1",
  authMode: "bearer" as const,
  customHeaderNames: [],
  model: "test-model",
  timeoutMs: 60_000,
}

describe("OpenAI Chat protocol", () => {
  it("maps normalized request fields to a non-streaming request", () => {
    expect(toOpenAiChatRequest(config, {
      messages: [
        { role: "system", content: "Be concise" },
        { role: "user", content: "Hi" },
      ],
      temperature: 0.7,
      topP: 0.8,
      maxOutputTokens: 64,
    })).toEqual({
      model: "test-model",
      messages: [
        { role: "system", content: "Be concise" },
        { role: "user", content: "Hi" },
      ],
      stream: false,
      temperature: 0.7,
      top_p: 0.8,
      max_tokens: 64,
    })
  })

  it("normalizes text, model, finish reason, and usage", () => {
    expect(fromOpenAiChatResponse("openai-compatible", "fallback", {
      model: "response-model",
      choices: [{ message: { content: "Hello" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
    })).toEqual({
      provider: "openai-compatible",
      model: "response-model",
      text: "Hello",
      finishReason: "stop",
      usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
    })
  })

  it("rejects a response without string content", () => {
    expect(() => fromOpenAiChatResponse("ollama", "fallback", {
      choices: [{ message: { content: null } }],
    })).toThrowError(LlmError)
  })
})
