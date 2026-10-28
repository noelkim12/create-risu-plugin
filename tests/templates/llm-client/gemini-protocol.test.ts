import { describe, expect, it } from "vitest"

import { parseStoredSettings } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/core/validation"
import {
  fromGeminiResponse,
  toGeminiRequest,
} from "../../../templates/features/llm-client/common/ts/src/features/llm-client/providers/gemini-protocol"

function geminiModel(
  additionalJson = "",
  flags: readonly string[] = ["hasFullSystemPrompt"],
  reasoningLevel: "minimal" | "low" | "medium" | "high" | null = null,
  thinkingTokens?: number,
) {
  const model = parseStoredSettings({
    schemaVersion: 2,
    savedKeys: [],
    savedModelConfigs: [{
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Gemini protocol",
      provider: "google-ai-studio",
      authMode: "api-key",
      modelId: "gemini-test",
      keyId: null,
      timeoutMs: 60_000,
      maxTokens: 64,
      temperature: 0.7,
      topP: 0.8,
      topK: 40,
      ...(thinkingTokens === undefined ? {} : { thinkingTokens }),
      reasoning: { provider: "google-ai-studio", level: reasoningLevel },
      flags,
      additionalJson,
    }],
    selectedModelConfigId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    defaultModelConfigId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  }).savedModelConfigs[0]
  if (model?.provider !== "google-ai-studio") throw new TypeError("Expected Gemini model fixture.")
  return model
}

describe("Gemini protocol", () => {
  it("maps system, user, assistant, and generation options", () => {
    expect(toGeminiRequest(geminiModel(), {
      messages: [
        { role: "system", content: "Be concise." },
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi" },
      ],
      temperature: 0.7,
      topP: 0.8,
      maxOutputTokens: 64,
    })).toEqual({
      systemInstruction: { parts: [{ text: "Be concise." }] },
      contents: [
        { role: "user", parts: [{ text: "Hello" }] },
        { role: "model", parts: [{ text: "Hi" }] },
      ],
      generationConfig: { temperature: 0.7, topP: 0.8, topK: 40, maxOutputTokens: 64 },
    })
  })

  it("maps model topK, thinking, block-off safety, and one allowed provider option", () => {
    const body = toGeminiRequest(
      geminiModel("{\"toolConfig\":{\"functionCallingConfig\":{\"mode\":\"ANY\"}}}", ["hasFullSystemPrompt", "geminiThinking", "geminiBlockOff"], "high", 128),
      { messages: [{ role: "user", content: "Hello" }] },
    )

    expect(body).toMatchObject({
      toolConfig: { functionCallingConfig: { mode: "ANY" } },
      generationConfig: {
        temperature: 0.7,
        topP: 0.8,
        maxOutputTokens: 64,
        topK: 40,
        thinkingConfig: { thinkingLevel: "high", thinkingBudget: 128 },
      },
    })
    expect(body["safetySettings"]).toEqual(expect.arrayContaining([
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "OFF" },
    ]))
    expect(JSON.stringify(body).match(/toolConfig/g)).toHaveLength(1)
  })

  it.each([
    "{\"generationConfig\":{}}",
    "{\"thinkingConfig\":{}}",
    "{\"contents\":{}}",
    "{\"toolConfig\":{\"constructor\":\"x\"}}",
    "{\"toolConfig\":{\"mode\":\"a\",\"mode\":\"b\"}}",
    "{\"toolConfig\":[]}",
  ])("rejects protected or unsafe additional JSON %s", additionalJson => {
    expect(() => toGeminiRequest({ ...geminiModel(), additionalJson }, {
      messages: [{ role: "user", content: "Hello" }],
    })).toThrow(expect.objectContaining({ code: "CONFIG_INVALID" }))
  })

  it("joins text parts and normalizes usage", () => {
    expect(fromGeminiResponse(geminiModel(), {
      candidates: [{
        content: { parts: [{ text: "Hello" }, { text: " world" }] },
        finishReason: "STOP",
      }],
      usageMetadata: {
        promptTokenCount: 2,
        candidatesTokenCount: 3,
        totalTokenCount: 5,
      },
    })).toEqual({
      provider: "google-ai-studio",
      model: "gemini-test",
      text: "Hello world",
      finishReason: "STOP",
      usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
    })
  })

  it("encodes flagged media and cache references, then normalizes supported media output", () => {
    const model = geminiModel("", ["hasImageInput", "hasAudioInput", "hasVideoInput", "hasCache", "hasImageOutput", "hasAudioOutput"])
    const body = toGeminiRequest(model, {
      messages: [{
        role: "user",
        content: [
          { type: "image", base64: "aW1hZ2U=", mimeType: "image/png" },
          { type: "audio", base64: "YXVkaW8=", mimeType: "audio/wav" },
          { type: "video", base64: "dmlkZW8=", mimeType: "video/mp4" },
        ],
      }],
      cache: { id: "cachedContents/demo" },
    })

    expect(body).toMatchObject({
      cachedContent: "cachedContents/demo",
      contents: [{ parts: [
        { inlineData: { mimeType: "image/png", data: "aW1hZ2U=" } },
        { inlineData: { mimeType: "audio/wav", data: "YXVkaW8=" } },
        { inlineData: { mimeType: "video/mp4", data: "dmlkZW8=" } },
      ] }],
    })
    expect(fromGeminiResponse(model, {
      candidates: [{ content: { parts: [
        { text: "Caption" },
        { inlineData: { mimeType: "image/png", data: "aW1hZ2U=" } },
        { inlineData: { mimeType: "audio/wav", data: "YXVkaW8=" } },
      ] } }],
    })).toMatchObject({
      text: "Caption",
      parts: [
        { type: "text", text: "Caption" },
        { type: "image", mimeType: "image/png" },
        { type: "audio", mimeType: "audio/wav" },
      ],
    })
  })

  it("rejects unflagged Gemini media output instead of discarding it", () => {
    expect(() => fromGeminiResponse(geminiModel(), {
      candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "aW1hZ2U=" } }] } }],
    })).toThrow(expect.objectContaining({ code: "UNSUPPORTED_FEATURE" }))
  })
})
