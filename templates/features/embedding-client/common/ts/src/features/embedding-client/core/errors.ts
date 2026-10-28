import type { AiServiceErrorCode, RetrievalCapabilityId, RetrievalProviderId } from "../../ai-services"

// Provider-level failure kinds the base AI Services error set does not cover.
export const EMBEDDING_ERROR_CODES = [
  "AUTH_FAILED",
  "RATE_LIMITED",
  "HTTP_ERROR",
  "INVALID_RESPONSE",
] as const

export type EmbeddingErrorCode = AiServiceErrorCode | (typeof EMBEDDING_ERROR_CODES)[number]

export type EmbeddingErrorContext = {
  readonly provider?: RetrievalProviderId
  readonly capability?: RetrievalCapabilityId
}

// The embedding client normalizes every thrown AiServiceError into this single
// public error type; its code union is a superset of the base codes.
export class EmbeddingError extends Error {
  readonly name = "EmbeddingError"

  constructor(
    readonly code: EmbeddingErrorCode,
    message: string,
    readonly context: EmbeddingErrorContext = {},
  ) {
    super(message)
  }
}
