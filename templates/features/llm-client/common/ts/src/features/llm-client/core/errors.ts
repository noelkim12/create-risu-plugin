import type { ProviderId } from "./types"

export type LlmErrorCode =
  | "CONFIG_INVALID"
  | "MODEL_CONFIG_MISSING"
  | "CREDENTIAL_MISSING"
  | "AUTH_FAILED"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "ABORTED"
  | "NETWORK_ERROR"
  | "HTTP_ERROR"
  | "INVALID_RESPONSE"
  | "UNSUPPORTED_RUNTIME"
  | "UNSUPPORTED_FEATURE"

export class LlmError extends Error {
  constructor(
    readonly code: LlmErrorCode,
    message: string,
    readonly provider?: ProviderId,
    readonly status?: number,
  ) {
    super(message)
    this.name = "LlmError"
  }
}
