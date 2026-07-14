import type { ProviderId } from "./types"

export type LlmErrorCode =
  | "CONFIG_INVALID"
  | "CREDENTIAL_MISSING"
  | "AUTH_FAILED"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "ABORTED"
  | "NETWORK_ERROR"
  | "HTTP_ERROR"
  | "INVALID_RESPONSE"
  | "UNSUPPORTED_RUNTIME"

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
