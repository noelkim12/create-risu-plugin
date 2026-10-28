import { GoogleServiceAccountTokenProvider } from "../auth/google-service-account"
import { LlmError } from "../core/errors"
import type { GoogleVertexModelConfig } from "../core/types"
import type { HttpTransport } from "../network/native-fetch-transport"
import { fromGeminiResponse, fromGeminiStream, toGeminiRequest } from "./gemini-protocol"
import {
  assertStreamResponse,
  parseJsonResponse,
  type LlmProvider,
  type ProviderExecution,
} from "./provider"

function serviceAccountUrl(model: GoogleVertexModelConfig): string {
  const location = model.location.trim()
  const projectId = model.projectId.trim()
  const origin = location === "global"
    ? "https://aiplatform.googleapis.com"
    : `https://${location}-aiplatform.googleapis.com`
  return `${origin}/v1/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model.modelId)}:generateContent`
}

export class GoogleVertexProvider implements LlmProvider {
  constructor(
    private readonly transport: HttpTransport,
    private readonly tokens: GoogleServiceAccountTokenProvider,
  ) {}

  async complete(execution: ProviderExecution) {
    if (execution.model.provider !== "google-vertex") {
      throw new LlmError("CONFIG_INVALID", "Google Vertex received an incompatible model configuration.")
    }
    const model = execution.model
    const body = toGeminiRequest(model, execution.request)
    const timeoutMs = execution.options.timeoutMs ?? model.timeoutMs
    if (execution.credential === null) throw new LlmError("CREDENTIAL_MISSING", "Service Account credential is missing.", model.provider)
    const token = await this.tokens.getAccessToken(execution.credential, execution.options.signal, timeoutMs)
    const headers: Record<string, string> = {
      "content-type": "application/json",
      Authorization: `Bearer ${token}`,
    }

    const response = await this.transport.request({
      url: serviceAccountUrl(model),
      method: "POST",
      headers,
      body: JSON.stringify(body),
      ...(execution.options.signal === undefined ? {} : { signal: execution.options.signal }),
      timeoutMs,
      networkRoute: "auto",
    })
    return fromGeminiResponse(model, parseJsonResponse(response, model.provider))
  }

  async *stream(execution: ProviderExecution) {
    if (execution.model.provider !== "google-vertex") {
      throw new LlmError("CONFIG_INVALID", "Google Vertex received an incompatible model configuration.")
    }
    const model = execution.model
    const timeoutMs = execution.options.timeoutMs ?? model.timeoutMs
    const headers: Record<string, string> = {
      "content-type": "application/json",
      Accept: "text/event-stream",
    }
    if (execution.credential === null) throw new LlmError("CREDENTIAL_MISSING", "Service Account credential is missing.", model.provider)
    const token = await this.tokens.getAccessToken(execution.credential, execution.options.signal, timeoutMs)
    headers["Authorization"] = `Bearer ${token}`
    const response = await this.transport.stream({
      url: `${serviceAccountUrl(model).replace(":generateContent", ":streamGenerateContent")}?alt=sse`,
      method: "POST",
      headers,
      body: JSON.stringify(toGeminiRequest(model, execution.request)),
      ...(execution.options.signal === undefined ? {} : { signal: execution.options.signal }),
      timeoutMs,
      networkRoute: "auto",
    })
    assertStreamResponse(response, model.provider)
    yield* fromGeminiStream(model, response.body, execution.options.signal)
  }
}
