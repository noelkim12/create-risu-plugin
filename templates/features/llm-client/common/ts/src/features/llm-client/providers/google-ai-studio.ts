import { LlmError } from "../core/errors"
import type { HttpTransport } from "../network/native-fetch-transport"
import { fromGeminiResponse, fromGeminiStream, toGeminiRequest } from "./gemini-protocol"
import {
  assertStreamResponse,
  parseJsonResponse,
  requireSecret,
  type LlmProvider,
  type ProviderExecution,
} from "./provider"

export class GoogleAiStudioProvider implements LlmProvider {
  constructor(private readonly transport: HttpTransport) {}

  async complete(execution: ProviderExecution) {
    if (execution.model.provider !== "google-ai-studio") {
      throw new LlmError("CONFIG_INVALID", "Google AI Studio received an incompatible model configuration.")
    }
    const model = execution.model
    const body = toGeminiRequest(model, execution.request)
    const apiKey = requireSecret(execution.credential, "apiKey", model.provider)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.modelId)}:generateContent`
    const response = await this.transport.request({
      url,
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
      ...(execution.options.signal === undefined ? {} : { signal: execution.options.signal }),
      timeoutMs: execution.options.timeoutMs ?? model.timeoutMs,
      networkRoute: "auto",
    })
    return fromGeminiResponse(model, parseJsonResponse(response, model.provider))
  }

  async *stream(execution: ProviderExecution) {
    if (execution.model.provider !== "google-ai-studio") {
      throw new LlmError("CONFIG_INVALID", "Google AI Studio received an incompatible model configuration.")
    }
    const model = execution.model
    const apiKey = requireSecret(execution.credential, "apiKey", model.provider)
    const response = await this.transport.stream({
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.modelId)}:streamGenerateContent?alt=sse`,
      method: "POST",
      headers: {
        "content-type": "application/json",
        Accept: "text/event-stream",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(toGeminiRequest(model, execution.request)),
      ...(execution.options.signal === undefined ? {} : { signal: execution.options.signal }),
      timeoutMs: execution.options.timeoutMs ?? model.timeoutMs,
      networkRoute: "auto",
    })
    assertStreamResponse(response, model.provider)
    yield* fromGeminiStream(model, response.body, execution.options.signal)
  }
}
