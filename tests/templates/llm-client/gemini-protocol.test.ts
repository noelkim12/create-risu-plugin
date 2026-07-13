import { describe, expect, it } from "vitest"

import {
  fromGeminiResponse,
  toGeminiRequest,
} from "../../../templates/features/llm-client/common/ts/src/features/llm-client/providers/gemini-protocol"

describe("Gemini protocol", () => {
  it("maps system, user, assistant, and generation options", () => {
    expect(toGeminiRequest({
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
      generationConfig: { temperature: 0.7, topP: 0.8, maxOutputTokens: 64 },
    })
  })

  it("joins text parts and normalizes usage", () => {
    expect(fromGeminiResponse("google-ai-studio", "gemini-test", {
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
})
