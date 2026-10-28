import type { RetrievalCapabilityId } from "./types"

export const AI_SERVICE_ERROR_CODES = [
  "ABORTED",
  "CONFIG_INVALID",
  "CREDENTIAL_MISSING",
  "CREDENTIAL_SCOPE_MISMATCH",
  "NETWORK_ERROR",
  "STORAGE_CONFLICT",
  "TIMEOUT",
  "UNSUPPORTED_CAPABILITY",
  "UNSUPPORTED_RUNTIME",
] as const

export type AiServiceErrorCode = (typeof AI_SERVICE_ERROR_CODES)[number]

export class AiServiceError extends Error {
  readonly name = "AiServiceError"

  constructor(
    readonly code: AiServiceErrorCode,
    message: string,
    readonly context: {
      readonly provider?: string
      readonly capability?: RetrievalCapabilityId
    } = {},
  ) {
    super(message)
  }
}
