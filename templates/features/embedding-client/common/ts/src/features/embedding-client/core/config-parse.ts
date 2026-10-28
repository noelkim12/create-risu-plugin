import {
  AiServiceError,
  isRetrievalProviderAuthMode,
  validateEndpointUrl,
} from "../../ai-services"
import { isCredentialId } from "../../credential-manager"
import { isEmbeddingConfigId, type EmbeddingEncoding, type EmbeddingSettings, type SavedEmbeddingConfig, type VoyageOutputDtype } from "./types"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every(key => allowed.includes(key))
}

function isEmbeddingEncoding(value: unknown): value is EmbeddingEncoding {
  return value === "float" || value === "base64"
}

function isVoyageOutputDtype(value: unknown): value is VoyageOutputDtype {
  return value === "float" || value === "int8" || value === "uint8" || value === "binary" || value === "ubinary"
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
}

function parseVoyageConfig(value: Record<string, unknown>): SavedEmbeddingConfig | null {
  if (!hasOnlyKeys(value, [
    "id", "name", "provider", "modelId", "credentialId", "timeoutMs",
    "inputType", "truncation", "outputDimension", "outputDtype", "encodingFormat",
  ])) {
    return null
  }
  const { id, name, modelId, credentialId, timeoutMs, inputType, truncation, outputDimension, outputDtype, encodingFormat } = value
  if (
    !isEmbeddingConfigId(id)
    || typeof name !== "string"
    || name.trim().length === 0
    || value["provider"] !== "voyage"
    || typeof modelId !== "string"
    || modelId.trim().length === 0
    || (credentialId !== null && !isCredentialId(credentialId))
    || !isPositiveInteger(timeoutMs)
    || (inputType !== null && inputType !== "query" && inputType !== "document")
    || typeof truncation !== "boolean"
    || (outputDimension !== null && !isPositiveInteger(outputDimension))
    || !isVoyageOutputDtype(outputDtype)
    || !isEmbeddingEncoding(encodingFormat)
  ) {
    return null
  }
  return {
    id, name, provider: "voyage", modelId, credentialId, timeoutMs,
    inputType, truncation, outputDimension, outputDtype, encodingFormat,
  }
}

function parseOpenAiCompatibleConfig(value: Record<string, unknown>): SavedEmbeddingConfig | null {
  if (!hasOnlyKeys(value, [
    "id", "name", "provider", "modelId", "credentialId", "timeoutMs",
    "endpoint", "authMode", "dimensions", "encodingFormat",
  ])) {
    return null
  }
  const { id, name, modelId, credentialId, timeoutMs, endpoint, authMode, dimensions, encodingFormat } = value
  if (
    !isEmbeddingConfigId(id)
    || typeof name !== "string"
    || name.trim().length === 0
    || value["provider"] !== "openai-compatible"
    || typeof modelId !== "string"
    || modelId.trim().length === 0
    || (credentialId !== null && !isCredentialId(credentialId))
    || !isPositiveInteger(timeoutMs)
    || typeof endpoint !== "string"
    || validateEndpointUrl(endpoint) !== null
    || !isRetrievalProviderAuthMode(authMode)
    || (dimensions !== null && !isPositiveInteger(dimensions))
    || !isEmbeddingEncoding(encodingFormat)
    || (authMode === "none" && credentialId !== null)
  ) {
    return null
  }
  return {
    id, name, provider: "openai-compatible", modelId, credentialId, timeoutMs,
    endpoint, authMode, dimensions, encodingFormat,
  }
}

export function createDefaultEmbeddingSettings(): EmbeddingSettings {
  return { schemaVersion: 1, configs: [] }
}

export function parseEmbeddingSettings(value: unknown): EmbeddingSettings {
  if (!isRecord(value) || !hasOnlyKeys(value, ["schemaVersion", "configs"])) {
    throw new AiServiceError("CONFIG_INVALID", "Embedding settings are invalid.")
  }
  const configs = value["configs"]
  if (value["schemaVersion"] !== 1 || !Array.isArray(configs)) {
    throw new AiServiceError("CONFIG_INVALID", "Embedding settings are invalid.")
  }
  const parsed = configs.map(entry => {
    if (!isRecord(entry)) return null
    if (entry["provider"] === "voyage") return parseVoyageConfig(entry)
    if (entry["provider"] === "openai-compatible") return parseOpenAiCompatibleConfig(entry)
    return null
  })
  if (parsed.some(config => config === null)) {
    throw new AiServiceError("CONFIG_INVALID", "Embedding settings are invalid.")
  }
  const resolved = parsed.filter((config): config is SavedEmbeddingConfig => config !== null)
  if (new Set(resolved.map(config => config.id)).size !== resolved.length) {
    throw new AiServiceError("CONFIG_INVALID", "Embedding settings are invalid.")
  }
  return { schemaVersion: 1, configs: resolved }
}
