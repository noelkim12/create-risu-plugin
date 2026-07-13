import { GoogleServiceAccountTokenProvider } from "../auth/google-service-account"
import type { GoogleVertexConfig } from "../core/types"
import type { HttpTransport } from "../network/native-fetch-transport"
import { fromGeminiResponse, toGeminiRequest } from "./gemini-protocol"
import { parseJsonResponse, requireSecret, type LlmProvider, type ProviderExecution } from "./provider"

function serviceAccountUrl(config: GoogleVertexConfig): string {
  const location = config.location.trim()
  const projectId = config.projectId.trim()
  const origin = location === "global"
    ? "https://aiplatform.googleapis.com"
    : `https://${location}-aiplatform.googleapis.com`
  return `${origin}/v1/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(config.model)}:generateContent`
}

export class GoogleVertexProvider implements LlmProvider {
  constructor(
    private readonly transport: HttpTransport,
    private readonly tokens: GoogleServiceAccountTokenProvider,
  ) {}

  async complete(execution: ProviderExecution) {
    const config = execution.config as GoogleVertexConfig
    const timeoutMs = execution.options.timeoutMs ?? config.timeoutMs
    const headers: Record<string, string> = { "content-type": "application/json" }
    let url: string

    if (config.authMode === "api-key") {
      const apiKey = requireSecret(execution.credential, "apiKey", config.provider)
      headers["x-goog-api-key"] = apiKey
      url = `https://aiplatform.googleapis.com/v1/publishers/google/models/${encodeURIComponent(config.model)}:generateContent`
    } else {
      if (!execution.credential) {
        requireSecret(null, "Service Account JSON", config.provider)
      }
      const token = await this.tokens.getAccessToken(
        execution.credential!,
        execution.options.signal,
        timeoutMs,
      )
      headers.Authorization = `Bearer ${token}`
      url = serviceAccountUrl(config)
    }

    const response = await this.transport.request({
      url,
      method: "POST",
      headers,
      body: JSON.stringify(toGeminiRequest(execution.request)),
      signal: execution.options.signal,
      timeoutMs,
      networkRoute: "auto",
    })
    return fromGeminiResponse(config.provider, config.model, parseJsonResponse(response, config.provider))
  }
}
