import { networkRouteForUrl, type RetrievalHttpTransport } from "../../ai-services"
import { EmbeddingError } from "../core/errors"
import type {
  EmbeddingResult,
  NormalizedEmbeddingRequest,
  VoyageEmbeddingConfig,
  VoyageOutputDtype,
} from "../core/types"
import { parseEmbeddingJsonResponse, type EmbeddingProvider, type EmbeddingProviderExecution } from "./provider"
import { toEmbeddingResult } from "./result"

export const VOYAGE_EMBEDDINGS_URL = "https://api.voyageai.com/v1/embeddings"

type VoyageEmbeddingsRequest = {
  readonly input: string | readonly string[]
  readonly model: string
  readonly input_type?: "query" | "document"
  readonly truncation: boolean
  readonly output_dimension?: number
  readonly output_dtype: VoyageOutputDtype
  readonly encoding_format?: "base64"
}

function voyageConfig(execution: EmbeddingProviderExecution): VoyageEmbeddingConfig {
  const config = execution.config
  if (config.provider !== "voyage") {
    throw new EmbeddingError(
      "CONFIG_INVALID",
      "The Voyage embedding provider received an incompatible configuration.",
      { provider: "voyage", capability: "embedding" },
    )
  }
  return config
}

export class VoyageEmbeddingProvider implements EmbeddingProvider {
  constructor(private readonly transport: RetrievalHttpTransport) {}

  async embed(execution: EmbeddingProviderExecution): Promise<EmbeddingResult> {
    const config = voyageConfig(execution)
    if (execution.credential.authMode !== "bearer") {
      throw new EmbeddingError(
        "CONFIG_INVALID",
        "Voyage embeddings require a Bearer API key credential.",
        { provider: "voyage", capability: "embedding" },
      )
    }
    const request = toVoyageRequest(execution.request, config)
    const response = await this.transport.request({
      url: VOYAGE_EMBEDDINGS_URL,
      method: "POST",
      headers: {
        Authorization: `Bearer ${execution.credential.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
      ...(execution.signal === undefined ? {} : { signal: execution.signal }),
      timeoutMs: execution.timeoutMs,
      networkRoute: networkRouteForUrl(VOYAGE_EMBEDDINGS_URL),
    })
    return toEmbeddingResult(
      parseEmbeddingJsonResponse(response, "voyage"),
      config,
      execution.request,
    )
  }
}

function toVoyageRequest(
  request: NormalizedEmbeddingRequest,
  config: VoyageEmbeddingConfig,
): VoyageEmbeddingsRequest {
  return {
    input: request.input,
    model: config.modelId,
    ...(request.inputType === null ? {} : { input_type: request.inputType }),
    truncation: config.truncation,
    ...(config.outputDimension === null ? {} : { output_dimension: config.outputDimension }),
    output_dtype: config.outputDtype,
    ...(config.encodingFormat === "base64" ? { encoding_format: "base64" } : {}),
  }
}
