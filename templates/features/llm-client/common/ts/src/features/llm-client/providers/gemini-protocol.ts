import { parseProviderAdditionalJson, type AdditionalJsonObject } from "../core/additional-json"
import { LlmError } from "../core/errors"
import { assertValidRequest } from "../core/validation"
import type {
  GoogleAiStudioModelConfig,
  GoogleVertexModelConfig,
  LlmResponse,
  LlmResponsePart,
  LlmStreamEvent,
  LlmUsage,
  ProviderId,
} from "../core/types"
import { fromGeminiParts, toGeminiParts } from "./content-parts"
import { parseSseJson } from "./sse-stream"

type GeminiModel = GoogleAiStudioModelConfig | GoogleVertexModelConfig
type UnknownRecord = Readonly<Record<string, unknown>>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function record(value: unknown): UnknownRecord | null {
  return isRecord(value) ? value : null
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

const GEMINI_BLOCK_OFF_CATEGORIES = [
  "HARM_CATEGORY_SEXUALLY_EXPLICIT",
  "HARM_CATEGORY_HATE_SPEECH",
  "HARM_CATEGORY_HARASSMENT",
  "HARM_CATEGORY_DANGEROUS_CONTENT",
  "HARM_CATEGORY_CIVIC_INTEGRITY",
] as const

function additionalGeminiOptions(model: GeminiModel): AdditionalJsonObject {
  const additional = parseProviderAdditionalJson(model.additionalJson, model.provider)
  if (additional === null) return {}
  return additional
}

function unsupported(model: GeminiModel, feature: string): never {
  throw new LlmError("UNSUPPORTED_FEATURE", `${feature} is not supported by ${model.provider}.`, model.provider)
}

function assertActive(signal: AbortSignal | undefined, provider: ProviderId): void {
  if (signal?.aborted) throw new LlmError("ABORTED", "LLM request was cancelled.", provider)
}

export function toGeminiRequest(model: GeminiModel, request: import("../core/types").LlmRequest): UnknownRecord {
  assertValidRequest(request, model)
  const thinkingEnabled = model.flags.includes("geminiThinking")
  if (!thinkingEnabled && (model.reasoning.level !== null || model.thinkingTokens !== undefined)) {
    unsupported(model, "Gemini thinking")
  }
  if (request.prefill !== undefined) unsupported(model, "Assistant prefill")
  if (request.cache !== undefined && !model.flags.includes("hasCache")) unsupported(model, "Cache references")
  const systemParts = request.messages
    .filter(message => message.role === "system")
    .flatMap(message => toGeminiParts(model, message.content))
  const generationConfig = {
    ...((request.temperature ?? model.temperature) === undefined ? {} : { temperature: request.temperature ?? model.temperature }),
    ...((request.topP ?? model.topP) === undefined ? {} : { topP: request.topP ?? model.topP }),
    ...((request.maxOutputTokens ?? model.maxTokens) === undefined
      ? {}
      : { maxOutputTokens: request.maxOutputTokens ?? model.maxTokens }),
    ...(model.topK === undefined ? {} : { topK: model.topK }),
    ...(!thinkingEnabled ? {} : { thinkingConfig: {
      ...(model.reasoning.level === null ? {} : { thinkingLevel: model.reasoning.level }),
      ...(model.thinkingTokens === undefined ? {} : { thinkingBudget: model.thinkingTokens }),
    } }),
  }
  return {
    ...additionalGeminiOptions(model),
    ...(systemParts.length === 0 ? {} : { systemInstruction: { parts: systemParts } }),
    contents: request.messages
      .filter(message => message.role !== "system")
      .map(message => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: toGeminiParts(model, message.content),
      })),
    ...(request.cache === undefined ? {} : { cachedContent: request.cache.id.trim() }),
    ...(Object.keys(generationConfig).length === 0 ? {} : { generationConfig }),
    ...(model.flags.includes("geminiBlockOff") ? { safetySettings: GEMINI_BLOCK_OFF_CATEGORIES.map(category => ({
      category,
      threshold: "OFF",
    })) } : {}),
  }
}

function usageFor(value: unknown): LlmUsage | undefined {
  const usageMetadata = record(value)
  const inputTokens = optionalNumber(usageMetadata?.["promptTokenCount"])
  const outputTokens = optionalNumber(usageMetadata?.["candidatesTokenCount"])
  const totalTokens = optionalNumber(usageMetadata?.["totalTokenCount"])
  if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined) return undefined
  return {
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
    ...(totalTokens === undefined ? {} : { totalTokens }),
  }
}

function textFor(parts: readonly LlmResponsePart[]): string {
  return parts.filter((part): part is Extract<typeof part, { readonly type: "text" }> => part.type === "text")
    .map(part => part.text)
    .join("")
}

function candidateFor(value: unknown, provider: ProviderId): UnknownRecord {
  const root = record(value)
  const candidates = root?.["candidates"]
  const candidate = Array.isArray(candidates) ? record(candidates[0]) : null
  if (candidate === null) {
    throw new LlmError("INVALID_RESPONSE", "Gemini response did not contain a candidate.", provider)
  }
  return candidate
}

export function fromGeminiResponse(model: GeminiModel, value: unknown): LlmResponse {
  const root = record(value)
  const candidate = candidateFor(value, model.provider)
  const content = record(candidate["content"])
  const parts = fromGeminiParts(content?.["parts"], model)
  const text = textFor(parts)
  if (parts.length === 0 || (text === "" && parts.every(part => part.type === "text"))) {
    throw new LlmError("INVALID_RESPONSE", "Gemini response did not contain content.", model.provider)
  }
  const usage = usageFor(root?.["usageMetadata"])
  const hasMedia = parts.some(part => part.type !== "text")
  return {
    provider: model.provider,
    model: model.modelId,
    text,
    ...(hasMedia ? { parts } : {}),
    finishReason: typeof candidate["finishReason"] === "string" ? candidate["finishReason"] : null,
    ...(usage === undefined ? {} : { usage }),
  }
}

export async function* fromGeminiStream(
  model: GeminiModel,
  source: AsyncIterable<Uint8Array>,
  signal?: AbortSignal,
): AsyncIterable<LlmStreamEvent> {
  for await (const value of parseSseJson(source, model.provider, signal)) {
    assertActive(signal, model.provider)
    const root = record(value)
    const candidates = root?.["candidates"]
    const candidate = Array.isArray(candidates) ? record(candidates[0]) : null
    if (candidate !== null) {
      const content = record(candidate["content"])
      if (content !== null && content["parts"] !== undefined) {
        for (const part of fromGeminiParts(content["parts"], model)) {
          assertActive(signal, model.provider)
          yield { type: "part", part }
        }
      }
      if (typeof candidate["finishReason"] === "string") {
        assertActive(signal, model.provider)
        yield { type: "finish", finishReason: candidate["finishReason"] }
      }
    }
    const usage = usageFor(root?.["usageMetadata"])
    if (usage !== undefined) {
      assertActive(signal, model.provider)
      yield { type: "usage", usage }
    }
    if (candidate === null && usage === undefined) {
      throw new LlmError("INVALID_RESPONSE", "Gemini stream did not contain a candidate or usage.", model.provider)
    }
  }
}
