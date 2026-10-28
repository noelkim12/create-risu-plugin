import type { ContextualEmbeddingProviderId } from "./types"

export const CONTEXTUAL_EMBEDDING_ERROR_CODES = [
  "AUTH_FAILED",
  "RATE_LIMITED",
  "HTTP_ERROR",
  "MALFORMED_RESPONSE",
] as const

export type ContextualEmbeddingErrorCode = (typeof CONTEXTUAL_EMBEDDING_ERROR_CODES)[number]

// Transport-level failures (ABORTED, TIMEOUT, NETWORK_ERROR, UNSUPPORTED_RUNTIME) stay
// AiServiceError from the shared transport; this class carries provider response
// mapping for auth, rate limit, HTTP, and malformed JSON/result paths only.
export class ContextualEmbeddingError extends Error {
  readonly name = "ContextualEmbeddingError"

  constructor(
    readonly code: ContextualEmbeddingErrorCode,
    message: string,
    readonly provider: ContextualEmbeddingProviderId = "voyage",
    readonly status?: number,
  ) {
    super(message)
  }
}
