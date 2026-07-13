import type { OpenAiCompatibleConfig } from "../core/types"
import type { HttpTransport } from "../network/native-fetch-transport"
import { buildChatCompletionsUrl, networkRouteForUrl } from "../network/url-policy"
import { fromOpenAiChatResponse, toOpenAiChatRequest } from "./openai-chat-protocol"
import {
  parseJsonResponse,
  requireSecret,
  type LlmProvider,
  type ProviderExecution,
} from "./provider"

export class OpenAiCompatibleProvider implements LlmProvider {
  constructor(private readonly transport: HttpTransport) {}

  async complete(execution: ProviderExecution) {
    const config = execution.config as OpenAiCompatibleConfig
    const url = buildChatCompletionsUrl(config.baseUrl)
    const customHeaders = Object.fromEntries(
      config.customHeaderNames.map(name => [
        name,
        requireSecret(execution.credential, name, config.provider),
      ]),
    )
    const headers = {
      ...customHeaders,
      "content-type": "application/json",
      ...(config.authMode === "bearer"
        ? { Authorization: `Bearer ${requireSecret(execution.credential, "apiKey", config.provider)}` }
        : {}),
    }
    const response = await this.transport.request({
      url,
      method: "POST",
      headers,
      body: JSON.stringify(toOpenAiChatRequest(config, execution.request)),
      signal: execution.options.signal,
      timeoutMs: execution.options.timeoutMs ?? config.timeoutMs,
      networkRoute: networkRouteForUrl(url),
    })
    return fromOpenAiChatResponse(
      config.provider,
      config.model,
      parseJsonResponse(response, config.provider),
    )
  }
}
