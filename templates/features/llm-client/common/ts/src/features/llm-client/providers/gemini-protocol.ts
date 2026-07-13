import { LlmError } from "../core/errors"
import type { LlmRequest, LlmResponse, ProviderId } from "../core/types"

type UnknownRecord = Record<string, unknown>

function record(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : null
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

export function toGeminiRequest(request: LlmRequest): UnknownRecord {
  const systemText = request.messages
    .filter(message => message.role === "system")
    .map(message => message.content)
    .join("\n")
  const generationConfig = {
    ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
    ...(request.topP === undefined ? {} : { topP: request.topP }),
    ...(request.maxOutputTokens === undefined ? {} : { maxOutputTokens: request.maxOutputTokens }),
  }
  return {
    ...(systemText === "" ? {} : { systemInstruction: { parts: [{ text: systemText }] } }),
    contents: request.messages
      .filter(message => message.role !== "system")
      .map(message => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      })),
    ...(Object.keys(generationConfig).length === 0 ? {} : { generationConfig }),
  }
}

export function fromGeminiResponse(
  provider: ProviderId,
  model: string,
  value: unknown,
): LlmResponse {
  const root = record(value)
  const candidates = root?.candidates
  const firstCandidate = Array.isArray(candidates) ? record(candidates[0]) : null
  const content = record(firstCandidate?.content)
  const parts = content?.parts
  const text = Array.isArray(parts)
    ? parts
      .map(part => record(part)?.text)
      .filter((part): part is string => typeof part === "string")
      .join("")
    : ""
  if (text === "") {
    throw new LlmError("INVALID_RESPONSE", "Gemini response did not contain text.", provider)
  }

  const usageMetadata = record(root?.usageMetadata)
  const inputTokens = optionalNumber(usageMetadata?.promptTokenCount)
  const outputTokens = optionalNumber(usageMetadata?.candidatesTokenCount)
  const totalTokens = optionalNumber(usageMetadata?.totalTokenCount)
  const hasUsage = inputTokens !== undefined
    || outputTokens !== undefined
    || totalTokens !== undefined

  return {
    provider,
    model,
    text,
    finishReason: typeof firstCandidate?.finishReason === "string"
      ? firstCandidate.finishReason
      : null,
    ...(hasUsage ? { usage: { inputTokens, outputTokens, totalTokens } } : {}),
  }
}
