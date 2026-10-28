import { parseProviderAdditionalJson, type AdditionalJsonObject } from "../core/additional-json"
import { LlmError } from "../core/errors"
import { assertValidRequest } from "../core/validation"
import type {
  DeepSeekModelConfig,
  LlmRequest,
  LlmResponse,
  LlmStreamEvent,
  LlmUsage,
  OllamaModelConfig,
  OpenAiCompatibleModelConfig,
} from "../core/types"
import { fromOpenAiAudio, fromOpenAiContent, toOpenAiContent } from "./content-parts"
import { parseSseJson } from "./sse-stream"

type OpenAiModel = OpenAiCompatibleModelConfig | OllamaModelConfig | DeepSeekModelConfig
type UnknownRecord = Readonly<Record<string, unknown>>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function record(value: unknown): UnknownRecord | null {
  return isRecord(value) ? value : null
}

function additionalOpenAiOptions(model: OpenAiModel): AdditionalJsonObject {
  const additional = parseProviderAdditionalJson(model.additionalJson, model.provider)
  if (additional === null) return {}
  return additional
}

function unsupported(model: OpenAiModel, feature: string): never {
  throw new LlmError("UNSUPPORTED_FEATURE", `${feature} is not supported by ${model.provider}.`, model.provider)
}

function assertActive(signal: AbortSignal | undefined, model: OpenAiModel): void {
  if (signal?.aborted) throw new LlmError("ABORTED", "LLM request was cancelled.", model.provider)
}

function messagesFor(model: OpenAiModel, request: LlmRequest) {
  const messages = request.messages.map(message => ({
    role: model.provider === "openai-compatible" && model.flags.includes("DeveloperRole") && message.role === "system"
      ? "developer"
      : message.role,
    content: toOpenAiContent(model, message.content),
    ...(model.provider === "deepseek" && message.role === "assistant" && message.reasoning !== undefined
      ? { reasoning_content: message.reasoning }
      : {}),
  }))
  if (request.prefill === undefined) return messages
  if (!model.flags.includes("hasPrefill")) return unsupported(model, "Assistant prefill")
  if (model.provider === "deepseek") {
    if (!model.flags.includes("deepSeekPrefix")) return unsupported(model, "DeepSeek prefix")
    return [...messages, { role: "assistant", content: request.prefill.content, prefix: true }]
  }
  return [...messages, { role: "assistant", content: request.prefill.content }]
}

export function toOpenAiChatRequest(
  model: OpenAiModel,
  request: LlmRequest,
  stream = false,
) {
  assertValidRequest(request, model)
  if (request.cache !== undefined) unsupported(model, "Cache references")
  if (model.topK !== undefined) unsupported(model, "topK")
  if (model.provider === "ollama" && model.reasoning.enabled) unsupported(model, "Ollama reasoning")
  if (model.provider === "deepseek" && model.reasoning.enabled && !model.flags.includes("deepSeekThinkingOutput")) {
    unsupported(model, "DeepSeek reasoning output")
  }
  const maxOutputTokens = request.maxOutputTokens ?? model.maxTokens
  return {
    ...additionalOpenAiOptions(model),
    model: model.modelId,
    messages: messagesFor(model, request),
    stream,
    ...((request.temperature ?? model.temperature) === undefined ? {} : { temperature: request.temperature ?? model.temperature }),
    ...((request.topP ?? model.topP) === undefined ? {} : { top_p: request.topP ?? model.topP }),
    ...(maxOutputTokens === undefined
      ? {}
      : model.provider === "openai-compatible" && model.flags.includes("OAICompletionTokens")
        ? { max_completion_tokens: maxOutputTokens }
        : { max_tokens: maxOutputTokens }),
    ...(model.provider === "openai-compatible" && model.reasoning.effort !== null
      ? { reasoning_effort: model.reasoning.effort }
      : {}),
    ...(model.provider === "deepseek" ? { thinking: { type: model.reasoning.enabled ? "enabled" : "disabled" } } : {}),
  }
}

function usageFor(model: OpenAiModel, value: unknown): LlmUsage | undefined {
  const usage = record(value)
  const inputTokens = typeof usage?.["prompt_tokens"] === "number" ? usage["prompt_tokens"] : undefined
  const outputTokens = typeof usage?.["completion_tokens"] === "number" ? usage["completion_tokens"] : undefined
  const totalTokens = typeof usage?.["total_tokens"] === "number" ? usage["total_tokens"] : undefined
  const completionDetails = record(usage?.["completion_tokens_details"])
  const reasoningTokens = typeof completionDetails?.["reasoning_tokens"] === "number"
    ? completionDetails["reasoning_tokens"]
    : undefined
  if (reasoningTokens !== undefined && (model.provider !== "deepseek" || !model.flags.includes("deepSeekThinkingOutput"))) {
    unsupported(model, "Reasoning token output")
  }
  if (inputTokens === undefined && outputTokens === undefined && reasoningTokens === undefined && totalTokens === undefined) {
    return undefined
  }
  return {
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
    ...(reasoningTokens === undefined ? {} : { reasoningTokens }),
    ...(totalTokens === undefined ? {} : { totalTokens }),
  }
}

function responseParts(model: OpenAiModel, message: UnknownRecord): readonly import("../core/types").LlmResponsePart[] {
  const content = fromOpenAiContent(message["content"], model)
  const audio = fromOpenAiAudio(message["audio"], model)
  return audio === null ? content : [...content, audio]
}

function responseText(parts: readonly import("../core/types").LlmResponsePart[]): string {
  return parts.filter((part): part is Extract<typeof part, { readonly type: "text" }> => part.type === "text")
    .map(part => part.text)
    .join("")
}

function responseReasoning(model: OpenAiModel, message: UnknownRecord): string | undefined {
  const reasoning = message["reasoning_content"]
  if (reasoning === undefined) return undefined
  if (typeof reasoning !== "string") {
    throw new LlmError("INVALID_RESPONSE", "OpenAI-compatible response contained malformed reasoning.", model.provider)
  }
  if (model.provider !== "deepseek" || !model.flags.includes("deepSeekThinkingOutput")) {
    unsupported(model, "Reasoning output")
  }
  return reasoning
}

export function fromOpenAiChatResponse(model: OpenAiModel, value: unknown): LlmResponse {
  const root = record(value)
  const choices = root?.["choices"]
  const choice = Array.isArray(choices) ? record(choices[0]) : null
  const message = record(choice?.["message"])
  if (message === null) {
    throw new LlmError("INVALID_RESPONSE", "OpenAI-compatible response did not contain a message.", model.provider)
  }
  const parts = responseParts(model, message)
  const text = responseText(parts)
  if (parts.length === 0 || (text === "" && parts.every(part => part.type === "text"))) {
    throw new LlmError("INVALID_RESPONSE", "OpenAI-compatible response did not contain content.", model.provider)
  }
  const reasoning = responseReasoning(model, message)
  const usage = usageFor(model, root?.["usage"])
  const hasMedia = parts.some(part => part.type !== "text")
  return {
    provider: model.provider,
    model: typeof root?.["model"] === "string" ? root["model"] : model.modelId,
    text,
    ...(hasMedia ? { parts } : {}),
    ...(reasoning === undefined ? {} : { reasoning }),
    finishReason: typeof choice?.["finish_reason"] === "string" ? choice["finish_reason"] : null,
    ...(usage === undefined ? {} : { usage }),
  }
}

export async function* fromOpenAiChatStream(
  model: OpenAiModel,
  source: AsyncIterable<Uint8Array>,
  signal?: AbortSignal,
): AsyncIterable<LlmStreamEvent> {
  for await (const value of parseSseJson(source, model.provider, signal)) {
    assertActive(signal, model)
    const root = record(value)
    const choices = root?.["choices"]
    const choice = Array.isArray(choices) ? record(choices[0]) : null
    const delta = record(choice?.["delta"])
    if (delta !== null && delta["content"] !== undefined) {
      for (const part of fromOpenAiContent(delta["content"], model)) {
        assertActive(signal, model)
        yield { type: "part", part }
      }
    }
    if (delta !== null) {
      const reasoning = responseReasoning(model, delta)
      if (reasoning !== undefined) {
        assertActive(signal, model)
        yield { type: "reasoning", text: reasoning }
      }
    }
    const usage = usageFor(model, root?.["usage"])
    if (usage !== undefined) {
      assertActive(signal, model)
      yield { type: "usage", usage }
    }
    if (typeof choice?.["finish_reason"] === "string") {
      assertActive(signal, model)
      yield { type: "finish", finishReason: choice["finish_reason"] }
    }
  }
}
