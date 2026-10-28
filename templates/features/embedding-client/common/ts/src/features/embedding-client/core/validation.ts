import { validateEndpointUrl } from "../../ai-services"
import { EmbeddingError } from "./errors"
import type {
  EmbeddingConfigDraft,
  EmbeddingConfigId,
  NormalizedEmbeddingRequest,
  EmbeddingRequest,
  SavedEmbeddingConfig,
} from "./types"

const MAX_TIMEOUT_MS = 3_600_000

function invalidConfig(message: string): never {
  throw new EmbeddingError("CONFIG_INVALID", message)
}

export function normalizeEmbeddingRequest(
  request: EmbeddingRequest,
  config: SavedEmbeddingConfig,
): NormalizedEmbeddingRequest {
  const input = request.input
  let count: number
  if (typeof input === "string") {
    if (input.length === 0) invalidConfig("Embedding input must not be empty.")
    count = 1
  } else if (Array.isArray(input)) {
    if (input.length === 0) invalidConfig("Embedding input must be a non-empty string or a list of non-empty strings.")
    count = input.length
  } else {
    invalidConfig("Embedding input must be a string or a list of strings.")
  }
  // Provider-neutral retrieval intent; the custom contract has no input_type field.
  const inputType = request.inputType === undefined
    ? config.provider === "voyage" ? config.inputType : null
    : request.inputType
  return { input, inputType, count }
}

export function resolveTimeoutMs(override: number | undefined, fallback: number): number {
  const value = override ?? fallback
  if (!Number.isInteger(value) || value < 1 || value > MAX_TIMEOUT_MS) {
    invalidConfig(`Embedding timeout must be an integer between 1 and ${MAX_TIMEOUT_MS} milliseconds.`)
  }
  return value
}

export function configFromDraft(draft: EmbeddingConfigDraft, id: EmbeddingConfigId): SavedEmbeddingConfig {
  const name = draft.name.trim()
  if (name.length === 0) invalidConfig("An embedding configuration name is required.")
  const modelId = draft.modelId.trim()
  if (modelId.length === 0) invalidConfig("An embedding model ID is required.")
  if (!Number.isInteger(draft.timeoutMs) || draft.timeoutMs < 1 || draft.timeoutMs > MAX_TIMEOUT_MS) {
    invalidConfig(`Embedding timeout must be an integer between 1 and ${MAX_TIMEOUT_MS} milliseconds.`)
  }
  switch (draft.provider) {
    case "voyage": {
      if (draft.outputDimension !== null && (!Number.isInteger(draft.outputDimension) || draft.outputDimension < 1)) {
        invalidConfig("The output dimension must be a positive integer.")
      }
      return {
        id,
        name,
        provider: "voyage",
        modelId,
        credentialId: draft.credentialId,
        timeoutMs: draft.timeoutMs,
        inputType: draft.inputType,
        truncation: draft.truncation,
        outputDimension: draft.outputDimension,
        outputDtype: draft.outputDtype,
        encodingFormat: draft.encodingFormat,
      }
    }
    case "openai-compatible": {
      const endpoint = draft.endpoint.trim()
      const endpointError = validateEndpointUrl(endpoint)
      if (endpointError !== null) invalidConfig(`The custom embedding endpoint is invalid. ${endpointError}`)
      if (draft.dimensions !== null && (!Number.isInteger(draft.dimensions) || draft.dimensions < 1)) {
        invalidConfig("The embedding dimensions must be a positive integer.")
      }
      if (draft.authMode === "none" && draft.credentialId !== null) {
        invalidConfig("A no-authentication embedding configuration must not link a credential.")
      }
      return {
        id,
        name,
        provider: "openai-compatible",
        modelId,
        credentialId: draft.credentialId,
        timeoutMs: draft.timeoutMs,
        endpoint,
        authMode: draft.authMode,
        dimensions: draft.dimensions,
        encodingFormat: draft.encodingFormat,
      }
    }
  }
}
