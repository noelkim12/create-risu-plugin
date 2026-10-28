import type { RetrievalHttpResponse, RetrievalProviderId } from "../../ai-services"
import { EmbeddingError } from "../core/errors"
import type {
  EmbeddingResult,
  NormalizedEmbeddingRequest,
  SavedEmbeddingConfig,
} from "../core/types"

export type EmbeddingCredential =
  | { readonly authMode: "bearer"; readonly apiKey: string }
  | { readonly authMode: "none" }

export type EmbeddingProviderExecution = {
  readonly config: SavedEmbeddingConfig
  readonly credential: EmbeddingCredential
  readonly request: NormalizedEmbeddingRequest
  readonly signal: AbortSignal | undefined
  readonly timeoutMs: number
}

export interface EmbeddingProvider {
  embed(execution: EmbeddingProviderExecution): Promise<EmbeddingResult>
}

const MAX_PROVIDER_DETAIL_LENGTH = 200

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

// Extracts only the provider's own message field, flattened and length-capped.
// Never echoes the raw body, headers, or credentials.
function sanitizedProviderDetail(bodyText: string): string | null {
  try {
    const parsed: unknown = JSON.parse(bodyText)
    if (!isRecord(parsed)) return null
    const raw = typeof parsed["detail"] === "string"
      ? parsed["detail"]
      : isRecord(parsed["error"]) && typeof parsed["error"]["message"] === "string"
        ? parsed["error"]["message"]
        : null
    if (raw === null || raw.trim().length === 0) return null
    return raw.replace(/\s+/g, " ").trim().slice(0, MAX_PROVIDER_DETAIL_LENGTH)
  } catch {
    return null
  }
}

export function parseEmbeddingJsonResponse(
  response: RetrievalHttpResponse,
  provider: RetrievalProviderId,
): unknown {
  if (!response.ok) {
    const code = response.status === 401 || response.status === 403
      ? "AUTH_FAILED"
      : response.status === 429
        ? "RATE_LIMITED"
        : "HTTP_ERROR"
    const detail = sanitizedProviderDetail(response.bodyText)
    throw new EmbeddingError(
      code,
      `Embedding request failed with HTTP ${response.status}${detail === null ? "." : `. ${detail}`}`,
      { provider, capability: "embedding" },
    )
  }
  try {
    return JSON.parse(response.bodyText) as unknown
  } catch {
    throw new EmbeddingError(
      "INVALID_RESPONSE",
      "The embedding provider returned malformed JSON.",
      { provider, capability: "embedding" },
    )
  }
}
