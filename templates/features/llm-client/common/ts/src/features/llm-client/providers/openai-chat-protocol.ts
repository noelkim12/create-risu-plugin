import { LlmError } from "../core/errors"
import type { LlmRequest, LlmResponse, OllamaConfig, OpenAiCompatibleConfig } from "../core/types"

export function toOpenAiChatRequest(
  config: OpenAiCompatibleConfig | OllamaConfig,
  request: LlmRequest,
) {
  return {
    model: config.model,
    messages: request.messages.map(message => ({ role: message.role, content: message.content })),
    stream: false,
    ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
    ...(request.topP === undefined ? {} : { top_p: request.topP }),
    ...(request.maxOutputTokens === undefined ? {} : { max_tokens: request.maxOutputTokens }),
  }
}

export function fromOpenAiChatResponse(
  provider: "openai-compatible" | "ollama",
  fallbackModel: string,
  value: unknown,
): LlmResponse {
  const asRecord = (candidate: unknown): Record<string, unknown> | null => (
    typeof candidate === "object" && candidate !== null && !Array.isArray(candidate)
      ? candidate as Record<string, unknown>
      : null
  )
  const root = asRecord(value)
  const choices = root?.["choices"]
  const choice = Array.isArray(choices) ? asRecord(choices[0]) : null
  const message = asRecord(choice?.["message"])
  const content = message?.["content"]
  if (typeof content !== "string" || content === "") {
    throw new LlmError("INVALID_RESPONSE", "OpenAI-compatible response did not contain text.", provider)
  }
  const usage = asRecord(root?.["usage"])
  const inputTokens = typeof usage?.["prompt_tokens"] === "number" ? usage["prompt_tokens"] : undefined
  const outputTokens = typeof usage?.["completion_tokens"] === "number" ? usage["completion_tokens"] : undefined
  const totalTokens = typeof usage?.["total_tokens"] === "number" ? usage["total_tokens"] : undefined
  const hasUsage = inputTokens !== undefined
    || outputTokens !== undefined
    || totalTokens !== undefined
  return {
    provider,
    model: typeof root?.["model"] === "string" ? root["model"] : fallbackModel,
    text: content,
    finishReason: typeof choice?.["finish_reason"] === "string"
      ? choice["finish_reason"]
      : null,
    ...(hasUsage ? { usage: {
      ...(inputTokens === undefined ? {} : { inputTokens }),
      ...(outputTokens === undefined ? {} : { outputTokens }),
      ...(totalTokens === undefined ? {} : { totalTokens }),
    } } : {}),
  }
}
