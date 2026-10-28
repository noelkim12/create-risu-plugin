import { describe, expect, it } from "vitest"

import { LlmError } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/core/errors"
import { parseStoredSettings } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/core/validation"
import {
  fromOpenAiChatResponse,
  toOpenAiChatRequest,
} from "../../../templates/features/llm-client/common/ts/src/features/llm-client/providers/openai-chat-protocol"

function openAiModel(
  additionalJson = "",
  flags: readonly string[] = ["hasFullSystemPrompt"],
  effort: "minimal" | "low" | "medium" | "high" | null = null,
) {
  const model = parseStoredSettings({
    schemaVersion: 2,
    savedKeys: [],
    savedModelConfigs: [{
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "OpenAI protocol",
      provider: "openai-compatible",
      authMode: "bearer",
      baseUrl: "https://llm.example/v1",
      modelId: "test-model",
      keyId: null,
      timeoutMs: 60_000,
      maxTokens: 64,
      temperature: 0.7,
      topP: 0.8,
      reasoning: { provider: "openai-compatible", effort },
      flags,
      additionalJson,
    }],
    selectedModelConfigId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    defaultModelConfigId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  }).savedModelConfigs[0]
  if (model?.provider !== "openai-compatible") throw new TypeError("Expected OpenAI-compatible model fixture.")
  return model
}

describe("OpenAI Chat protocol", () => {
  it("maps normalized request fields to a non-streaming request", () => {
    expect(toOpenAiChatRequest(openAiModel(), {
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

  it("maps completion-token mode, developer system messages, reasoning, and allowed JSON once", () => {
    const body = toOpenAiChatRequest(openAiModel("{\"seed\":7}", ["hasFullSystemPrompt", "OAICompletionTokens", "DeveloperRole"], "medium"), {
      messages: [{ role: "system", content: "Be concise" }, { role: "user", content: "Hi" }],
    })

    expect(body).toMatchObject({
      max_completion_tokens: 64,
      reasoning_effort: "medium",
      seed: 7,
    })
    expect(body.messages).toEqual(expect.arrayContaining([{ role: "developer", content: "Be concise" }]))
    expect(body).not.toHaveProperty("max_tokens")
    expect(JSON.stringify(body).match(/\"seed\"/g)).toHaveLength(1)
  })

  it.each([
    "{\"model\":\"other\"}",
    "{\"messages\":{}}",
    "{\"auth\":{}}",
    "{\"stream\":true}",
    "{\"generationConfig\":{}}",
    "{\"thinkingConfig\":{}}",
    "{\"__proto__\":{}}",
    "{\"seed\":1,\"seed\":2}",
    "[1]",
  ])("rejects protected or unsafe additional JSON %s", additionalJson => {
    expect(() => toOpenAiChatRequest({ ...openAiModel(), additionalJson }, {
      messages: [{ role: "user", content: "Hi" }],
    })).toThrow(expect.objectContaining({ code: "CONFIG_INVALID" }))
  })

  it("normalizes text, model, finish reason, and usage", () => {
    expect(fromOpenAiChatResponse(openAiModel(), {
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
    expect(() => fromOpenAiChatResponse(openAiModel(), {
      choices: [{ message: { content: null } }],
    })).toThrowError(LlmError)
  })

  it("encodes image and audio input, assistant prefill, and supported media output", () => {
    const model = openAiModel("", ["hasImageInput", "hasAudioInput", "hasImageOutput", "hasAudioOutput", "hasPrefill"])
    const body = toOpenAiChatRequest(model, {
      messages: [{
        role: "user",
        content: [
          { type: "image", base64: "aW1hZ2U=", mimeType: "image/png" },
          { type: "audio", base64: "YXVkaW8=", mimeType: "audio/wav" },
        ],
      }],
      prefill: { role: "assistant", content: "Continue" },
    })

    expect(body.messages).toEqual([
      { role: "user", content: [
        { type: "image_url", image_url: { url: "data:image/png;base64,aW1hZ2U=" } },
        { type: "input_audio", input_audio: { data: "YXVkaW8=", format: "wav" } },
      ] },
      { role: "assistant", content: "Continue" },
    ])
    expect(fromOpenAiChatResponse(model, {
      choices: [{ message: {
        content: [
          { type: "output_text", text: "Caption" },
          { type: "image_url", image_url: { url: "data:image/png;base64,aW1hZ2U=" } },
        ],
        audio: { data: "YXVkaW8=", format: "wav" },
      } }],
    })).toMatchObject({
      text: "Caption",
      parts: [
        { type: "text", text: "Caption" },
        { type: "image", mimeType: "image/png" },
        { type: "audio", mimeType: "audio/wav" },
      ],
    })
  })

  it("rejects unsupported OpenAI media output rather than silently discarding it", () => {
    expect(() => fromOpenAiChatResponse(openAiModel(), {
      choices: [{ message: { content: [{ type: "image_url", image_url: { url: "data:image/png;base64,aW1hZ2U=" } }] } }],
    })).toThrow(expect.objectContaining({ code: "UNSUPPORTED_FEATURE" }))
  })
})
