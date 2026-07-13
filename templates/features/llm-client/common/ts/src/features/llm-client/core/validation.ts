import { LlmError } from "./errors"
import { PROVIDER_IDS } from "./types"
import { validateEndpointUrl } from "../network/url-policy"
import type {
  LlmCallOptions,
  LlmRequest,
  LlmSettings,
  ProviderConfig,
  ProviderId,
} from "./types"

export type FieldErrors = Readonly<Record<string, string>>

export const RESERVED_CUSTOM_HEADER_NAMES = new Set([
  "authorization",
  "content-type",
  "content-length",
  "host",
  "connection",
  "transfer-encoding",
  "x-goog-api-key",
  "apikey",
  "__proto__",
  "prototype",
  "constructor",
])

export function validateCustomHeaderNames(names: readonly string[]): string | null {
  const normalized = new Set<string>()
  for (const rawName of names) {
    const name = rawName.trim()
    const lower = name.toLowerCase()
    if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name)) {
      return `Custom header ${rawName || "(empty)"} is not a valid HTTP header name.`
    }
    if (RESERVED_CUSTOM_HEADER_NAMES.has(lower)) {
      return `Custom header ${name} is reserved.`
    }
    if (normalized.has(lower)) return `Custom header ${name} is duplicated.`
    normalized.add(lower)
  }
  return null
}

export function createDefaultSettings(): LlmSettings {
  return {
    schemaVersion: 1,
    activeProvider: "google-ai-studio",
    providers: {
      "google-ai-studio": {
        provider: "google-ai-studio",
        model: "",
        timeoutMs: 60_000,
      },
      "google-vertex": {
        provider: "google-vertex",
        authMode: "api-key",
        projectId: "",
        location: "us-central1",
        model: "",
        timeoutMs: 60_000,
      },
      "openai-compatible": {
        provider: "openai-compatible",
        baseUrl: "",
        authMode: "bearer",
        customHeaderNames: [],
        model: "",
        timeoutMs: 60_000,
      },
      ollama: {
        provider: "ollama",
        baseUrl: "http://127.0.0.1:11434/v1",
        authMode: "none",
        model: "",
        timeoutMs: 60_000,
      },
    },
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && (PROVIDER_IDS as readonly string[]).includes(value)
}

export function parseStoredSettings(value: unknown): LlmSettings {
  const root = object(value)
  const providers = object(root?.providers)
  if (root?.schemaVersion !== 1 || !isProviderId(root.activeProvider) || providers === null) {
    throw new LlmError("CONFIG_INVALID", "Stored LLM settings have an invalid schema.")
  }

  for (const provider of PROVIDER_IDS) {
    const config = object(providers[provider])
    if (
      config?.provider !== provider
      || typeof config.model !== "string"
      || typeof config.timeoutMs !== "number"
    ) {
      throw new LlmError("CONFIG_INVALID", `Stored ${provider} settings are malformed.`, provider)
    }
    if (provider === "google-vertex") {
      if (
        (config.authMode !== "api-key" && config.authMode !== "service-account")
        || typeof config.projectId !== "string"
        || typeof config.location !== "string"
      ) {
        throw new LlmError("CONFIG_INVALID", "Stored Vertex settings are malformed.", provider)
      }
    }
    if (provider === "openai-compatible") {
      if (
        typeof config.baseUrl !== "string"
        || (config.authMode !== "none" && config.authMode !== "bearer")
        || !Array.isArray(config.customHeaderNames)
        || config.customHeaderNames.some(name => typeof name !== "string")
      ) {
        throw new LlmError("CONFIG_INVALID", "Stored OpenAI-compatible settings are malformed.", provider)
      }
    }
    if (provider === "ollama") {
      if (
        typeof config.baseUrl !== "string"
        || (config.authMode !== "none" && config.authMode !== "bearer")
      ) {
        throw new LlmError("CONFIG_INVALID", "Stored Ollama settings are malformed.", provider)
      }
    }
  }
  return value as LlmSettings
}

export function validateProviderConfig(config: ProviderConfig): FieldErrors {
  const errors: Record<string, string> = {}
  if (config.model.trim() === "") errors.model = "Model is required."
  if (!Number.isInteger(config.timeoutMs) || config.timeoutMs < 1_000 || config.timeoutMs > 300_000) {
    errors.timeoutMs = "Timeout must be an integer from 1000 to 300000 milliseconds."
  }

  if (config.provider === "google-vertex" && config.authMode === "service-account") {
    if (config.projectId.trim() === "") {
      errors.projectId = "Project ID is required for Service Account authentication."
    }
    if (config.location.trim() === "") {
      errors.location = "Location is required for Service Account authentication."
    } else if (!/^(?:global|[a-z][a-z0-9-]{1,62})$/.test(config.location.trim())) {
      errors.location = "Location must be global or a lowercase Google Cloud region name."
    }
  }

  if (config.provider === "openai-compatible" || config.provider === "ollama") {
    const error = validateEndpointUrl(config.baseUrl)
    if (error) errors.baseUrl = error
  }
  if (config.provider === "openai-compatible") {
    const error = validateCustomHeaderNames(config.customHeaderNames)
    if (error) errors.customHeaderNames = error
  }

  return errors
}

export function assertValidProviderConfig(config: ProviderConfig): void {
  const errors = validateProviderConfig(config)
  if (Object.keys(errors).length > 0) {
    throw new LlmError("CONFIG_INVALID", Object.values(errors).join(" "), config.provider)
  }
}

export function assertValidRequest(request: LlmRequest): void {
  if (request.messages.length === 0 || request.messages.every(message => message.content.trim() === "")) {
    throw new LlmError("CONFIG_INVALID", "At least one non-empty message is required.")
  }
  if (request.temperature !== undefined && (request.temperature < 0 || request.temperature > 2)) {
    throw new LlmError("CONFIG_INVALID", "temperature must be between 0 and 2.")
  }
  if (request.topP !== undefined && (request.topP < 0 || request.topP > 1)) {
    throw new LlmError("CONFIG_INVALID", "topP must be between 0 and 1.")
  }
  if (request.maxOutputTokens !== undefined && (!Number.isInteger(request.maxOutputTokens) || request.maxOutputTokens < 1)) {
    throw new LlmError("CONFIG_INVALID", "maxOutputTokens must be a positive integer.")
  }
}

export function assertValidCallOptions(options: LlmCallOptions): void {
  if (
    options.timeoutMs !== undefined
    && (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1_000 || options.timeoutMs > 300_000)
  ) {
    throw new LlmError("CONFIG_INVALID", "timeoutMs must be an integer from 1000 to 300000 milliseconds.")
  }
}
