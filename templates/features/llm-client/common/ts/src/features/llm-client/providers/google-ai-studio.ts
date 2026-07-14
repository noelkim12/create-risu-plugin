import type { GoogleAiStudioConfig } from "../core/types"
import type { HttpTransport } from "../network/native-fetch-transport"
import { fromGeminiResponse, toGeminiRequest } from "./gemini-protocol"
import {
  parseJsonResponse,
  requireSecret,
  type LlmProvider,
  type ProviderExecution,
} from "./provider"

export class GoogleAiStudioProvider implements LlmProvider {
  constructor(private readonly transport: HttpTransport) {}

  async complete(execution: ProviderExecution) {
    const config = execution.config as GoogleAiStudioConfig
    const apiKey = requireSecret(execution.credential, "apiKey", config.provider)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`
    const response = await this.transport.request({
      url,
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(toGeminiRequest(execution.request)),
      ...(execution.options.signal === undefined ? {} : { signal: execution.options.signal }),
      timeoutMs: execution.options.timeoutMs ?? config.timeoutMs,
      networkRoute: "auto",
    })
    return fromGeminiResponse(config.provider, config.model, parseJsonResponse(response, config.provider))
  }
}
