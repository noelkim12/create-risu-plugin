import type { RetrievalProviderId } from "../../ai-services"

export const RERANKER_ERROR_CODES = [
  "AUTH_FAILED",
  "RATE_LIMITED",
  "HTTP_ERROR",
  "INVALID_RESPONSE",
] as const

export type RerankerErrorCode = (typeof RERANKER_ERROR_CODES)[number]

export class RerankerError extends Error {
  readonly name = "RerankerError"

  constructor(
    readonly code: RerankerErrorCode,
    message: string,
    readonly provider?: RetrievalProviderId,
    readonly status?: number,
  ) {
    super(message)
  }
}
