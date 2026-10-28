import { networkRouteForUrl, type RetrievalHttpTransport } from "../../ai-services"
import { EmbeddingError } from "../core/errors"
import type {
  EmbeddingEncoding,
  EmbeddingResult,
  OpenAiCompatibleEmbeddingConfig,
} from "../core/types"
import { parseEmbeddingJsonResponse, type EmbeddingProvider, type EmbeddingProviderExecution } from "./provider"
import { toEmbeddingResult } from "./result"

type OpenAiEmbeddingsRequest = {
  readonly input: string | readonly string[]
  readonly model: string
  readonly dimensions?: number
  readonly encoding_format: EmbeddingEncoding
}

function customConfig(execution: EmbeddingProviderExecution): OpenAiCompatibleEmbeddingConfig {
  const config = execution.config
  if (config.provider !== "openai-compatible") {
    throw new EmbeddingError(
      "CONFIG_INVALID",
      "The OpenAI-compatible embedding provider received an incompatible configuration.",
      { provider: "openai-compatible", capability: "embedding" },
    )
  }
  return config
}

// Implements only the OpenAI Embeddings create contract: text embedding at the
// exact saved endpoint URL. No contextual embedding or reranking methods exist here.
export class OpenAiCompatibleEmbeddingProvider implements EmbeddingProvider {
  constructor(private readonly transport: RetrievalHttpTransport) {}

  async embed(execution: EmbeddingProviderExecution): Promise<EmbeddingResult> {
    const config = customConfig(execution)
    const body: OpenAiEmbeddingsRequest = {
      input: execution.request.input,
      model: config.modelId,
      ...(config.dimensions === null ? {} : { dimensions: config.dimensions }),
      encoding_format: config.encodingFormat,
    }
    const headers: Record<string, string> = { "content-type": "application/json" }
    if (execution.credential.authMode === "bearer") {
      headers["Authorization"] = `Bearer ${execution.credential.apiKey}`
    }
    // The exact saved endpoint URL is used as-is; no path is appended.
    const response = await this.transport.request({
      url: config.endpoint,
      method: "POST",
      headers,
      body: JSON.stringify(body),
      ...(execution.signal === undefined ? {} : { signal: execution.signal }),
      timeoutMs: execution.timeoutMs,
      networkRoute: networkRouteForUrl(config.endpoint),
    })
    return toEmbeddingResult(
      parseEmbeddingJsonResponse(response, "openai-compatible"),
      config,
      execution.request,
    )
  }
}
