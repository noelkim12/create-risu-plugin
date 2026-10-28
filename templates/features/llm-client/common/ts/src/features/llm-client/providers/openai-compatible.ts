import { LlmError } from "../core/errors"
import type { HttpTransport } from "../network/native-fetch-transport"
import { buildChatCompletionsUrl, networkRouteForUrl } from "../network/url-policy"
import { fromOpenAiChatResponse, fromOpenAiChatStream, toOpenAiChatRequest } from "./openai-chat-protocol"
import {
  assertStreamResponse,
  parseJsonResponse,
  requireSecret,
  type LlmProvider,
  type ProviderExecution,
} from "./provider"

export class OpenAiCompatibleProvider implements LlmProvider {
  constructor(private readonly transport: HttpTransport) {}

  async complete(execution: ProviderExecution) {
    if (execution.model.provider !== "openai-compatible") {
      throw new LlmError("CONFIG_INVALID", "OpenAI-compatible provider received an incompatible model configuration.")
    }
    const model = execution.model
    const body = toOpenAiChatRequest(model, execution.request)
    const url = buildChatCompletionsUrl(model.baseUrl)
    const customHeaders = Object.fromEntries(
      Object.keys(execution.credential?.secret ?? {}).filter(name => name !== "apiKey").map(name => [
        name,
        requireSecret(execution.credential, name, model.provider),
      ]),
    )
    const headers = {
      ...customHeaders,
      "content-type": "application/json",
      ...(model.authMode === "bearer"
        ? { Authorization: `Bearer ${requireSecret(execution.credential, "apiKey", model.provider)}` }
        : {}),
    }
    const response = await this.transport.request({
      url,
      method: "POST",
      headers,
      body: JSON.stringify(body),
      ...(execution.options.signal === undefined ? {} : { signal: execution.options.signal }),
      timeoutMs: execution.options.timeoutMs ?? model.timeoutMs,
      networkRoute: networkRouteForUrl(url),
    })
    return fromOpenAiChatResponse(model, parseJsonResponse(response, model.provider))
  }

  async *stream(execution: ProviderExecution) {
    if (execution.model.provider !== "openai-compatible") {
      throw new LlmError("CONFIG_INVALID", "OpenAI-compatible provider received an incompatible model configuration.")
    }
    const model = execution.model
    const body = toOpenAiChatRequest(model, execution.request, true)
    const url = buildChatCompletionsUrl(model.baseUrl)
    const customHeaders = Object.fromEntries(
      Object.keys(execution.credential?.secret ?? {}).filter(name => name !== "apiKey").map(name => [
        name,
        requireSecret(execution.credential, name, model.provider),
      ]),
    )
    const response = await this.transport.stream({
      url,
      method: "POST",
      headers: {
        ...customHeaders,
        "content-type": "application/json",
        Accept: "text/event-stream",
        ...(model.authMode === "bearer"
          ? { Authorization: `Bearer ${requireSecret(execution.credential, "apiKey", model.provider)}` }
          : {}),
      },
      body: JSON.stringify(body),
      ...(execution.options.signal === undefined ? {} : { signal: execution.options.signal }),
      timeoutMs: execution.options.timeoutMs ?? model.timeoutMs,
      networkRoute: networkRouteForUrl(url),
    })
    assertStreamResponse(response, model.provider)
    yield* fromOpenAiChatStream(model, response.body, execution.options.signal)
  }
}
