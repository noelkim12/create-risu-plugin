import { LlmError } from "../core/errors"
import type {
  LlmCallOptions,
  LlmRequest,
  LlmResponse,
  ProviderConfig,
  StoredCredential,
} from "../core/types"
import type { HttpResponse } from "../network/native-fetch-transport"

export interface ProviderExecution {
  readonly config: ProviderConfig
  readonly credential: StoredCredential | null
  readonly request: LlmRequest
  readonly options: LlmCallOptions
}

export interface LlmProvider {
  complete(execution: ProviderExecution): Promise<LlmResponse>
}

export function requireSecret(
  credential: StoredCredential | null,
  name: string,
  provider: ProviderConfig["provider"],
): string {
  const value = credential?.secret[name]?.trim()
  if (!value) throw new LlmError("CREDENTIAL_MISSING", `${name} is not stored.`, provider)
  if (/[\r\n]/.test(value)) {
    throw new LlmError("CONFIG_INVALID", `${name} contains an invalid line break.`, provider)
  }
  return value
}

export function parseJsonResponse(response: HttpResponse, provider: ProviderConfig["provider"]): unknown {
  if (!response.ok) {
    const code = response.status === 401 || response.status === 403
      ? "AUTH_FAILED"
      : response.status === 429
        ? "RATE_LIMITED"
        : "HTTP_ERROR"
    throw new LlmError(code, `Provider request failed with HTTP ${response.status}.`, provider, response.status)
  }
  try {
    return JSON.parse(response.bodyText) as unknown
  } catch {
    throw new LlmError("INVALID_RESPONSE", "Provider returned malformed JSON.", provider, response.status)
  }
}
