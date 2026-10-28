// allow: SIZE_OK - this is the plan-mandated versioned catalog boundary.
import { buildChatCompletionsUrl, validateEndpointUrl } from "../network/url-policy"
import { isCredentialId, parseCredentialMetadata, parseResolvedCredential } from "../../credential-manager/core/validation"
import type {
  CredentialId,
  CredentialMetadata,
  LegacyCredentialCatalog,
  ResolvedCredential,
} from "../../credential-manager/core/types"
import { credentialBindingFor } from "./credential-binding"
import { LlmError } from "./errors"
import { parseProviderAdditionalJson } from "./additional-json"
import { isOfficialDeepSeekBaseUrl } from "./deepseek-config"
import { MODEL_FLAGS, PROVIDER_IDS } from "./types"
import type {
  GoogleAiStudioConfig,
  GoogleVertexConfig,
  LlmCallOptions,
  LlmContentPart,
  LlmRequest,
  LlmResponsePart,
  LlmSettings,
  LlmSettingsV1,
  ModelFlag,
  OllamaConfig,
  OpenAiCompatibleConfig,
  ProviderConfig,
  ProviderId,
  ProviderReasoning,
  SavedModelConfig,
  SavedModelConfigId,
} from "./types"

export type FieldErrors = Readonly<Record<string, string>>

export type CatalogWarning = {
  readonly code: "UNKNOWN_MODEL_FLAG"
  readonly modelConfigId: SavedModelConfigId
  readonly flag: string
}

export type CatalogMigrationOptions = {
  readonly legacyCredentials?: readonly unknown[]
  readonly generateId?: () => string
}

export type CatalogMigrationResult = {
  readonly settings: LlmSettings
  readonly legacyCatalog: LegacyCredentialCatalog
  readonly warnings: readonly CatalogWarning[]
}

export type StoredSettingsParseResult = CatalogMigrationResult & {
  readonly requiresPersistence: boolean
}

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

const DEFAULT_TIMEOUT_MS = 60_000
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
const MIME_TYPE_PATTERN = /^([A-Za-z0-9][A-Za-z0-9!#$&^_.+'-]*)\/([A-Za-z0-9][A-Za-z0-9!#$&^_.+'-]*)$/
const LEGACY_PROVIDER_IDS = [
  "google-ai-studio",
  "google-vertex",
  "openai-compatible",
  "ollama",
] as const
const LEGACY_CREDENTIAL_SLOTS = [
  "google-ai-studio",
  "google-vertex-service-account",
  "openai-compatible",
  "ollama",
] as const

type LegacyProviderId = (typeof LEGACY_PROVIDER_IDS)[number]
type LegacyCredentialSlot = (typeof LEGACY_CREDENTIAL_SLOTS)[number]

type LegacyCombinedKey = {
  readonly id: CredentialId
  readonly name: string
  readonly provider: ProviderId
  readonly kind: "api-key" | "vertex-service-account"
}

type LegacyStoredCredential = {
  readonly schemaVersion: 1
  readonly slot: LegacyCredentialSlot
  readonly audience: string
  readonly revision: string
  readonly updatedAt: number
  readonly secret: Readonly<Record<string, string>>
}

type ParsedModelBase = {
  readonly id: SavedModelConfigId
  readonly name: string
  readonly modelId: string
  readonly keyId: CredentialId | null
  readonly timeoutMs: number
  readonly maxTokens?: number
  readonly temperature?: number
  readonly topP?: number
  readonly topK?: number
  readonly thinkingTokens?: number
  readonly flags: readonly string[]
  readonly additionalJson: string
}

type FlagParseContext = {
  readonly provider: ProviderId
  readonly modelConfigId: SavedModelConfigId
  readonly warnings: CatalogWarning[]
}

type NumericRange = {
  readonly field: string
  readonly minimum: number
  readonly maximum: number
}

function invalid(message: string, provider?: ProviderId): never {
  throw new LlmError("CONFIG_INVALID", message, provider)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function assertAllowedKeys(
  record: Readonly<Record<string, unknown>>,
  allowedKeys: readonly string[],
  context: string,
): void {
  const allowed = new Set(allowedKeys)
  const unexpected = Object.keys(record).find(key => !allowed.has(key))
  if (unexpected !== undefined) invalid(`${context} contains unsupported field ${unexpected}.`)
}

function requiredString(
  record: Readonly<Record<string, unknown>>,
  key: string,
  context: string,
): string {
  const value = record[key]
  if (typeof value !== "string") invalid(`${context}.${key} must be a string.`)
  return value
}

function requiredNumber(
  record: Readonly<Record<string, unknown>>,
  key: string,
  context: string,
): number {
  const value = record[key]
  if (typeof value !== "number" || !Number.isFinite(value)) {
    invalid(`${context}.${key} must be a finite number.`)
  }
  return value
}

function optionalNumber(
  record: Readonly<Record<string, unknown>>,
  key: string,
  context: string,
): number | undefined {
  const value = record[key]
  if (value === undefined) return undefined
  if (typeof value !== "number" || !Number.isFinite(value)) {
    invalid(`${context}.${key} must be a finite number when present.`)
  }
  return value
}

function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && PROVIDER_IDS.some(provider => provider === value)
}

function isLegacyProviderId(value: unknown): value is LegacyProviderId {
  return typeof value === "string" && LEGACY_PROVIDER_IDS.some(provider => provider === value)
}

function isLegacyCredentialSlot(value: unknown): value is LegacyCredentialSlot {
  return typeof value === "string" && LEGACY_CREDENTIAL_SLOTS.some(slot => slot === value)
}

function isSavedModelConfigId(value: unknown): value is SavedModelConfigId {
  return typeof value === "string" && UUID_PATTERN.test(value)
}

function isModelFlag(value: string): value is ModelFlag {
  return MODEL_FLAGS.some(flag => flag === value)
}

function normalizedName(value: string, context: string): string {
  const name = value.trim()
  if (name === "") invalid(`${context} name is required.`)
  return name
}

function assertUniqueNames(
  entries: readonly { readonly name: string }[],
  context: string,
): void {
  const names = new Set<string>()
  for (const entry of entries) {
    const normalized = entry.name.trim().toLowerCase()
    if (names.has(normalized)) invalid(`${context} names must be unique ignoring case and surrounding whitespace.`)
    names.add(normalized)
  }
}

function assertPositiveInteger(value: number | undefined, field: string): void {
  if (value !== undefined && (!Number.isInteger(value) || value < 1)) {
    invalid(`${field} must be a positive integer.`)
  }
}

function assertOptionalRange(
  value: number | undefined,
  range: NumericRange,
): void {
  if (value !== undefined && (value < range.minimum || value > range.maximum)) {
    invalid(`${range.field} must be between ${range.minimum} and ${range.maximum}.`)
  }
}

function supportsFlag(provider: ProviderId, flag: ModelFlag): boolean {
  switch (flag) {
    case "geminiThinking":
    case "geminiBlockOff":
    case "hasCache":
    case "hasVideoInput":
      return provider === "google-ai-studio" || provider === "google-vertex"
    case "OAICompletionTokens":
    case "DeveloperRole":
      return provider === "openai-compatible"
    case "deepSeekPrefix":
    case "deepSeekThinkingInput":
    case "deepSeekThinkingOutput":
      return provider === "deepseek"
    case "hasPrefill":
      return provider === "openai-compatible" || provider === "ollama" || provider === "deepseek"
    case "hasImageOutput":
    case "hasAudioInput":
    case "hasAudioOutput":
      return provider === "google-ai-studio"
        || provider === "google-vertex"
        || provider === "openai-compatible"
    case "hasImageInput":
      return provider !== "deepseek"
    case "hasFullSystemPrompt":
    case "hasFirstSystemPrompt":
    case "hasStreaming":
    case "requiresAlternateRole":
    case "mustStartWithUserInput":
      return true
    default:
      return invalid(`Unsupported known model flag ${flag}.`, provider)
  }
}

function parseFlags(
  value: unknown,
  context: FlagParseContext,
): readonly string[] {
  if (!Array.isArray(value) || value.some(flag => typeof flag !== "string")) {
    invalid("Model flags must be an array of symbolic strings.", context.provider)
  }
  const flags = value.filter((flag): flag is string => typeof flag === "string")
  if (new Set(flags).size !== flags.length) invalid("Model flags must not contain duplicates.", context.provider)
  for (const flag of flags) {
    if (!isModelFlag(flag)) {
      context.warnings.push({ code: "UNKNOWN_MODEL_FLAG", modelConfigId: context.modelConfigId, flag })
    } else if (!supportsFlag(context.provider, flag)) {
      invalid(`Flag ${flag} is not supported by ${context.provider}.`, context.provider)
    }
  }
  if (flags.includes("hasFullSystemPrompt") && flags.includes("hasFirstSystemPrompt")) {
    invalid("hasFullSystemPrompt and hasFirstSystemPrompt cannot both be enabled.", context.provider)
  }
  return [...flags]
}

function parseAdditionalJson(value: unknown, provider: ProviderId): string {
  if (typeof value !== "string") invalid("additionalJson must be raw JSON text.", provider)
  parseProviderAdditionalJson(value, provider)
  return value
}

function parseReasoning(
  value: unknown,
  provider: "google-ai-studio",
): Extract<ProviderReasoning, { readonly provider: "google-ai-studio" }>
function parseReasoning(
  value: unknown,
  provider: "google-vertex",
): Extract<ProviderReasoning, { readonly provider: "google-vertex" }>
function parseReasoning(
  value: unknown,
  provider: "openai-compatible",
): Extract<ProviderReasoning, { readonly provider: "openai-compatible" }>
function parseReasoning(
  value: unknown,
  provider: "ollama",
): Extract<ProviderReasoning, { readonly provider: "ollama" }>
function parseReasoning(
  value: unknown,
  provider: "deepseek",
): Extract<ProviderReasoning, { readonly provider: "deepseek" }>
function parseReasoning(value: unknown, provider: ProviderId): ProviderReasoning {
  if (!isRecord(value) || value["provider"] !== provider) {
    invalid("Reasoning settings must be tagged with the model provider.", provider)
  }
  if (provider === "google-ai-studio" || provider === "google-vertex") {
    assertAllowedKeys(value, ["provider", "level"], "Reasoning settings")
    const level = value["level"]
    if (level !== null && level !== "minimal" && level !== "low" && level !== "medium" && level !== "high") {
      invalid("Gemini thinking level is invalid.", provider)
    }
    return { provider, level }
  }
  if (provider === "openai-compatible") {
    assertAllowedKeys(value, ["provider", "effort"], "Reasoning settings")
    const effort = value["effort"]
    if (effort !== null && effort !== "minimal" && effort !== "low" && effort !== "medium" && effort !== "high") {
      invalid("Reasoning effort is invalid.", provider)
    }
    return { provider, effort }
  }
  assertAllowedKeys(value, ["provider", "enabled"], "Reasoning settings")
  if (typeof value["enabled"] !== "boolean") invalid("Reasoning enabled must be boolean.", provider)
  return { provider, enabled: value["enabled"] }
}

function parseModelBase(
  record: Readonly<Record<string, unknown>>,
  provider: ProviderId,
  warnings: CatalogWarning[],
): ParsedModelBase {
  const id = record["id"]
  const keyId = record["keyId"]
  if (!isSavedModelConfigId(id)) invalid("Saved model configuration ID must be a UUID.", provider)
  if (keyId !== null && !isCredentialId(keyId)) invalid("Saved model keyId must be a UUID or null.", provider)
  const timeoutMs = requiredNumber(record, "timeoutMs", "Saved model configuration")
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 300_000) {
    invalid("Saved model timeoutMs must be an integer from 1000 to 300000.", provider)
  }
  const maxTokens = optionalNumber(record, "maxTokens", "Saved model configuration")
  const temperature = optionalNumber(record, "temperature", "Saved model configuration")
  const topP = optionalNumber(record, "topP", "Saved model configuration")
  const topK = optionalNumber(record, "topK", "Saved model configuration")
  const thinkingTokens = optionalNumber(record, "thinkingTokens", "Saved model configuration")
  assertPositiveInteger(maxTokens, "maxTokens")
  assertOptionalRange(temperature, { field: "temperature", minimum: 0, maximum: 2 })
  assertOptionalRange(topP, { field: "topP", minimum: 0, maximum: 1 })
  assertPositiveInteger(topK, "topK")
  assertPositiveInteger(thinkingTokens, "thinkingTokens")
  return {
    id,
    name: normalizedName(requiredString(record, "name", "Saved model configuration"), "Saved model configuration"),
    modelId: requiredString(record, "modelId", "Saved model configuration").trim(),
    keyId,
    timeoutMs,
    ...(maxTokens === undefined ? {} : { maxTokens }),
    ...(temperature === undefined ? {} : { temperature }),
    ...(topP === undefined ? {} : { topP }),
    ...(topK === undefined ? {} : { topK }),
    ...(thinkingTokens === undefined ? {} : { thinkingTokens }),
    flags: parseFlags(record["flags"], { provider, modelConfigId: id, warnings }),
    additionalJson: parseAdditionalJson(record["additionalJson"], provider),
  }
}

function parseLegacyCombinedKey(value: unknown): LegacyCombinedKey {
  if (!isRecord(value)) invalid("Saved key entries must be objects.")
  assertAllowedKeys(value, ["id", "name", "provider", "kind"], "Saved key")
  const id = value["id"]
  const provider = value["provider"]
  const kind = value["kind"]
  if (!isCredentialId(id)) invalid("Saved key ID must be a UUID.")
  if (!isProviderId(provider)) invalid("Saved key provider is invalid.")
  if (kind !== "api-key" && kind !== "vertex-service-account") invalid("Saved key kind is invalid.", provider)
  if (kind === "vertex-service-account" && provider !== "google-vertex") {
    invalid("Vertex service-account keys can only belong to Google Vertex.", provider)
  }
  if (provider === "google-vertex" && kind !== "vertex-service-account") {
    invalid("Google Vertex requires a service-account key.", provider)
  }
  return {
    id,
    name: normalizedName(requiredString(value, "name", "Saved key"), "Saved key"),
    provider,
    kind,
  }
}

const COMMON_MODEL_KEYS = [
  "id",
  "name",
  "provider",
  "modelId",
  "keyId",
  "timeoutMs",
  "maxTokens",
  "temperature",
  "topP",
  "topK",
  "thinkingTokens",
  "flags",
  "additionalJson",
  "authMode",
  "reasoning",
] as const

function parseSavedModelConfig(value: unknown, warnings: CatalogWarning[]): SavedModelConfig {
  if (!isRecord(value)) invalid("Saved model configuration entries must be objects.")
  const provider = value["provider"]
  if (!isProviderId(provider)) invalid("Saved model provider is invalid.")
  const providerKeys = provider === "google-vertex"
    ? ["projectId", "location"]
    : provider === "openai-compatible" || provider === "ollama" || provider === "deepseek"
      ? ["baseUrl"]
      : []
  assertAllowedKeys(value, [...COMMON_MODEL_KEYS, ...providerKeys], "Saved model configuration")
  const base = parseModelBase(value, provider, warnings)
  const authMode = value["authMode"]
  switch (provider) {
    case "google-ai-studio":
      if (authMode !== "api-key") invalid("Google AI Studio requires api-key authentication.", provider)
      return { ...base, provider, authMode, reasoning: parseReasoning(value["reasoning"], provider) }
    case "google-vertex": {
      if (authMode !== "service-account") invalid("Google Vertex requires service-account authentication.", provider)
      return {
        ...base,
        provider,
        authMode,
        projectId: requiredString(value, "projectId", "Saved Vertex model"),
        location: requiredString(value, "location", "Saved Vertex model"),
        reasoning: parseReasoning(value["reasoning"], provider),
      }
    }
    case "openai-compatible": {
      if (authMode !== "none" && authMode !== "bearer") invalid(`${provider} authMode is invalid.`, provider)
      return {
        ...base,
        provider,
        authMode,
        baseUrl: requiredString(value, "baseUrl", `Saved ${provider} model`),
        reasoning: parseReasoning(value["reasoning"], provider),
      }
    }
    case "ollama": {
      if (authMode !== "none" && authMode !== "bearer") invalid(`${provider} authMode is invalid.`, provider)
      return {
        ...base,
        provider,
        authMode,
        baseUrl: requiredString(value, "baseUrl", `Saved ${provider} model`),
        reasoning: parseReasoning(value["reasoning"], provider),
      }
    }
    case "deepseek":
      if (authMode !== "bearer") invalid("DeepSeek requires bearer authentication.", provider)
      return {
        ...base,
        provider,
        authMode,
        baseUrl: requiredString(value, "baseUrl", "Saved DeepSeek model"),
        reasoning: parseReasoning(value["reasoning"], provider),
      }
    default:
      return invalid("Saved model provider is invalid.")
  }
}

function assertSavedModelSemantics(config: SavedModelConfig): void {
  if (config.provider === "google-vertex") {
    if (config.location.trim() !== "" && !/^(?:global|[a-z][a-z0-9-]{1,62})$/.test(config.location.trim())) {
      invalid("Google Vertex location is invalid.", config.provider)
    }
  }
  if (config.provider === "openai-compatible" || config.provider === "ollama" || config.provider === "deepseek") {
    if (config.baseUrl.trim() !== "") {
      const endpointError = validateEndpointUrl(config.baseUrl)
      if (endpointError !== null) invalid(endpointError, config.provider)
    } else if (config.provider === "deepseek") {
      invalid("DeepSeek baseUrl is required.", config.provider)
    }
  }
  if (config.provider === "deepseek" && !isOfficialDeepSeekBaseUrl(config.baseUrl)) {
    invalid("DeepSeek must use its official API endpoint.", config.provider)
  }
  if (config.thinkingTokens !== undefined && !hasFlag(config, "geminiThinking")) {
    invalid("thinkingTokens requires geminiThinking.", config.provider)
  }
  if (
    (config.provider === "google-ai-studio" || config.provider === "google-vertex")
    && config.reasoning.level !== null
    && !hasFlag(config, "geminiThinking")
  ) {
    invalid("Gemini thinking level requires geminiThinking.", config.provider)
  }
  if (
    config.provider === "deepseek"
    && config.reasoning.enabled
    && !hasFlag(config, "deepSeekThinkingOutput")
  ) {
    invalid("DeepSeek reasoning output requires deepSeekThinkingOutput.", config.provider)
  }
}

function assertModelReferences(settings: LlmSettings): void {
  const modelsById = new Map(settings.savedModelConfigs.map(model => [model.id, model] as const))
  if (modelsById.size !== settings.savedModelConfigs.length) invalid("Saved model configuration IDs must be unique.")
  for (const model of settings.savedModelConfigs) {
    if (model.authMode === "none" && model.keyId !== null) {
      invalid(`Saved model ${model.name} must not link a key when authentication is disabled.`, model.provider)
    }
  }
  for (const [field, id] of [
    ["selectedModelConfigId", settings.selectedModelConfigId],
    ["defaultModelConfigId", settings.defaultModelConfigId],
  ] as const) {
    if (id !== null && !modelsById.has(id)) invalid(`${field} references a missing saved model configuration.`)
  }
}

function parseV2Settings(value: unknown): CatalogMigrationResult {
  if (!isRecord(value) || value["schemaVersion"] !== 2) invalid("Stored LLM settings have an invalid schema.")
  assertAllowedKeys(
    value,
    ["schemaVersion", "savedModelConfigs", "selectedModelConfigId", "defaultModelConfigId"],
    "Stored LLM settings",
  )
  if (!Array.isArray(value["savedModelConfigs"])) {
    invalid("Stored LLM model configurations must be an array.")
  }
  const warnings: CatalogWarning[] = []
  const savedModelConfigs = value["savedModelConfigs"].map(model => parseSavedModelConfig(model, warnings))
  savedModelConfigs.forEach(assertSavedModelSemantics)
  const selectedModelConfigId = value["selectedModelConfigId"]
  const defaultModelConfigId = value["defaultModelConfigId"]
  if (selectedModelConfigId !== null && !isSavedModelConfigId(selectedModelConfigId)) {
    invalid("selectedModelConfigId must be a UUID or null.")
  }
  if (defaultModelConfigId !== null && !isSavedModelConfigId(defaultModelConfigId)) {
    invalid("defaultModelConfigId must be a UUID or null.")
  }
  const settings: LlmSettings = {
    schemaVersion: 2,
    savedModelConfigs,
    selectedModelConfigId,
    defaultModelConfigId,
  }
  assertUniqueNames(savedModelConfigs, "Saved model configuration")
  assertModelReferences(settings)
  return { settings, legacyCatalog: { keys: [], credentials: [] }, warnings }
}

function parseLegacyV2Credentials(values: readonly unknown[]): readonly ResolvedCredential[] {
  const credentials: ResolvedCredential[] = []
  for (const value of values) {
    if (!isRecord(value) || value["schemaVersion"] !== 2) continue
    const parsed = parseResolvedCredential(value)
    if (parsed === null) invalid("A migrated saved credential is invalid.")
    credentials.push(parsed)
  }
  return credentials
}

function legacyMetadata(
  key: LegacyCombinedKey,
  models: readonly SavedModelConfig[],
  credentials: readonly ResolvedCredential[],
): CredentialMetadata {
  const credential = credentials.find(record => record.keyId === key.id)
  if (credential !== undefined && (credential.provider !== key.provider || credential.kind !== key.kind)) {
    invalid("A migrated saved credential is incompatible with its key metadata.", key.provider)
  }
  const linkedModel = models.find(model => model.keyId === key.id)
  const binding = linkedModel === undefined ? null : credentialBindingFor(linkedModel)
  const authMode = key.kind === "vertex-service-account"
    ? "service-account"
    : key.provider === "google-ai-studio"
      ? "api-key"
      : "bearer"
  const metadata = parseCredentialMetadata({
    ...key,
    authMode,
    audience: credential?.audience ?? binding?.audience ?? "unbound",
    updatedAt: credential?.updatedAt ?? 0,
  })
  if (metadata === null) invalid("Migrated saved-key metadata is invalid.", key.provider)
  return metadata
}

function parseLegacyV2Settings(value: unknown, options: CatalogMigrationOptions): CatalogMigrationResult {
  if (!isRecord(value) || value["schemaVersion"] !== 2) invalid("Stored LLM settings have an invalid legacy schema.")
  assertAllowedKeys(
    value,
    ["schemaVersion", "savedKeys", "savedModelConfigs", "selectedModelConfigId", "defaultModelConfigId"],
    "Stored legacy LLM settings",
  )
  if (!Array.isArray(value["savedKeys"]) || !Array.isArray(value["savedModelConfigs"])) {
    invalid("Stored legacy LLM catalogs must be arrays.")
  }
  const keys = value["savedKeys"].map(parseLegacyCombinedKey)
  const modelOnly = parseV2Settings({
    schemaVersion: 2,
    savedModelConfigs: value["savedModelConfigs"],
    selectedModelConfigId: value["selectedModelConfigId"],
    defaultModelConfigId: value["defaultModelConfigId"],
  })
  const keysById = new Map(keys.map(key => [key.id, key] as const))
  if (keysById.size !== keys.length) invalid("Saved key IDs must be unique.")
  assertUniqueNames(keys, "Saved key")
  for (const model of modelOnly.settings.savedModelConfigs) {
    if (model.keyId === null) continue
    const key = keysById.get(model.keyId)
    const binding = credentialBindingFor(model)
    if (key === undefined) invalid(`Saved model ${model.name} references a missing key.`, model.provider)
    if (binding === null || key.provider !== binding.provider || key.kind !== binding.kind) {
      invalid(`Saved model ${model.name} references an incompatible key.`, model.provider)
    }
  }
  const credentials = parseLegacyV2Credentials(options.legacyCredentials ?? [])
  return {
    settings: modelOnly.settings,
    legacyCatalog: {
      keys: keys.map(key => legacyMetadata(key, modelOnly.settings.savedModelConfigs, credentials)),
      credentials,
    },
    warnings: modelOnly.warnings,
  }
}

function parseLegacyProviderConfig(value: unknown, provider: "google-ai-studio"): GoogleAiStudioConfig
function parseLegacyProviderConfig(value: unknown, provider: "google-vertex"): GoogleVertexConfig
function parseLegacyProviderConfig(value: unknown, provider: "openai-compatible"): OpenAiCompatibleConfig
function parseLegacyProviderConfig(value: unknown, provider: "ollama"): OllamaConfig
function parseLegacyProviderConfig(value: unknown, provider: LegacyProviderId): ProviderConfig {
  if (!isRecord(value) || value["provider"] !== provider) invalid(`Stored ${provider} settings are malformed.`, provider)
  const allowedKeys = provider === "google-ai-studio"
    ? ["provider", "model", "timeoutMs"]
    : provider === "google-vertex"
      ? ["provider", "authMode", "projectId", "location", "model", "timeoutMs"]
      : provider === "openai-compatible"
        ? ["provider", "baseUrl", "authMode", "customHeaderNames", "model", "timeoutMs"]
        : ["provider", "baseUrl", "authMode", "model", "timeoutMs"]
  assertAllowedKeys(value, allowedKeys, `Stored ${provider} settings`)
  const model = requiredString(value, "model", `Stored ${provider} settings`)
  const timeoutMs = requiredNumber(value, "timeoutMs", `Stored ${provider} settings`)
  if (provider === "google-ai-studio") return { provider, model, timeoutMs }
  if (provider === "google-vertex") {
    const authMode = value["authMode"]
    if (authMode !== "service-account") invalid("Stored Vertex settings must use service-account authentication.", provider)
    return {
      provider,
      authMode,
      projectId: requiredString(value, "projectId", "Stored Vertex settings"),
      location: requiredString(value, "location", "Stored Vertex settings"),
      model,
      timeoutMs,
    }
  }
  const authMode = value["authMode"]
  if (authMode !== "none" && authMode !== "bearer") invalid(`Stored ${provider} settings are malformed.`, provider)
  const baseUrl = requiredString(value, "baseUrl", `Stored ${provider} settings`)
  if (provider === "openai-compatible") {
    const customHeaderNames = value["customHeaderNames"]
    if (!Array.isArray(customHeaderNames) || customHeaderNames.some(name => typeof name !== "string")) {
      invalid("Stored OpenAI-compatible settings are malformed.", provider)
    }
    return {
      provider,
      authMode,
      baseUrl,
      customHeaderNames: customHeaderNames.filter((name): name is string => typeof name === "string"),
      model,
      timeoutMs,
    }
  }
  return { provider, authMode, baseUrl, model, timeoutMs }
}

function parseLegacySettings(value: unknown): LlmSettingsV1 {
  if (!isRecord(value) || value["schemaVersion"] !== 1 || !isLegacyProviderId(value["activeProvider"])) {
    invalid("Stored LLM settings have an invalid legacy schema.")
  }
  const providers = value["providers"]
  if (!isRecord(providers)) invalid("Stored legacy provider settings are malformed.")
  return {
    schemaVersion: 1,
    activeProvider: value["activeProvider"],
    providers: {
      "google-ai-studio": parseLegacyProviderConfig(providers["google-ai-studio"], "google-ai-studio"),
      "google-vertex": parseLegacyProviderConfig(providers["google-vertex"], "google-vertex"),
      "openai-compatible": parseLegacyProviderConfig(providers["openai-compatible"], "openai-compatible"),
      ollama: parseLegacyProviderConfig(providers["ollama"], "ollama"),
    },
  }
}

function parseLegacyCredential(value: unknown): LegacyStoredCredential {
  if (!isRecord(value) || value["schemaVersion"] !== 1 || !isLegacyCredentialSlot(value["slot"])) {
    invalid("A legacy credential record is malformed.")
  }
  assertAllowedKeys(value, ["schemaVersion", "slot", "audience", "revision", "updatedAt", "secret"], "Legacy credential")
  const audience = value["audience"]
  const revision = value["revision"]
  const updatedAt = value["updatedAt"]
  const secret = value["secret"]
  if (
    typeof audience !== "string"
    || typeof revision !== "string"
    || typeof updatedAt !== "number"
    || !Number.isFinite(updatedAt)
    || !isRecord(secret)
    || Object.values(secret).some(item => typeof item !== "string")
  ) {
    invalid("A legacy credential record is malformed.")
  }
  const parsedSecret = Object.fromEntries(
    Object.entries(secret).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  )
  return {
    schemaVersion: 1,
    slot: value["slot"],
    audience,
    revision,
    updatedAt,
    secret: parsedSecret,
  }
}

function expectedLegacyAudience(config: ProviderConfig, slot: LegacyCredentialSlot): string {
  switch (slot) {
    case "google-ai-studio":
      return "https://generativelanguage.googleapis.com"
    case "google-vertex-service-account": {
      const vertex = config.provider === "google-vertex" ? config : invalid("Legacy Vertex credential is incompatible.")
      return `vertex:${vertex.projectId.trim()}:${vertex.location.trim()}`
    }
    case "openai-compatible":
    case "ollama": {
      if (config.provider !== slot) invalid(`Legacy ${slot} credential is incompatible.`)
      return buildChatCompletionsUrl(config.baseUrl)
    }
    default:
      return invalid("Legacy credential slot is invalid.")
  }
}

function legacyCredentialProvider(slot: LegacyCredentialSlot): LegacyProviderId {
  if (slot === "google-vertex-service-account") return "google-vertex"
  return slot
}

function legacyCredentialKind(slot: LegacyCredentialSlot): LegacyCombinedKey["kind"] {
  return slot === "google-vertex-service-account" ? "vertex-service-account" : "api-key"
}

function legacyCredentialName(slot: LegacyCredentialSlot): string {
  switch (slot) {
    case "google-ai-studio": return "Google AI Studio Key"
    case "google-vertex-service-account": return "Google Vertex Service Account"
    case "openai-compatible": return "OpenAI-Compatible Key"
    case "ollama": return "Ollama Key"
    default: return invalid("Legacy credential slot is invalid.")
  }
}

function providerName(provider: LegacyProviderId): string {
  switch (provider) {
    case "google-ai-studio": return "Google AI Studio"
    case "google-vertex": return "Google Vertex"
    case "openai-compatible": return "OpenAI-Compatible"
    case "ollama": return "Ollama"
    default: return invalid("Legacy provider is invalid.")
  }
}

function nextKeyId(generateId: () => string): CredentialId {
  const id = generateId()
  if (!isCredentialId(id)) invalid("Generated saved-key ID must be a UUID.")
  return id
}

function nextModelConfigId(generateId: () => string): SavedModelConfigId {
  const id = generateId()
  if (!isSavedModelConfigId(id)) invalid("Generated model-config ID must be a UUID.")
  return id
}

function migrateLegacyModel(
  config: ProviderConfig,
  id: SavedModelConfigId,
  keyId: CredentialId | null,
): SavedModelConfig {
  const base = {
    id,
    name: providerName(config.provider),
    modelId: config.model,
    keyId,
    timeoutMs: config.timeoutMs,
    flags: [],
    additionalJson: "",
  } as const
  switch (config.provider) {
    case "google-ai-studio":
      return {
        ...base,
        provider: config.provider,
        authMode: "api-key",
        reasoning: { provider: config.provider, level: null },
      }
    case "google-vertex":
      return {
        ...base,
        provider: config.provider,
        authMode: "service-account",
        projectId: config.projectId,
        location: config.location,
        reasoning: { provider: config.provider, level: null },
      }
    case "openai-compatible":
      return {
        ...base,
        provider: config.provider,
        authMode: config.authMode,
        baseUrl: config.baseUrl,
        reasoning: { provider: config.provider, effort: null },
      }
    case "ollama":
      return {
        ...base,
        provider: config.provider,
        authMode: config.authMode,
        baseUrl: config.baseUrl,
        reasoning: { provider: config.provider, enabled: false },
      }
    default:
      return invalid("Legacy provider is invalid.")
  }
}

function linkedLegacySlot(config: ProviderConfig): LegacyCredentialSlot | null {
  if (config.provider === "google-vertex") return "google-vertex-service-account"
  if (config.provider === "google-ai-studio") return config.provider
  return config.authMode === "none" ? null : config.provider
}

export function createDefaultSettings(): LlmSettings {
  return {
    schemaVersion: 2,
    savedModelConfigs: [],
    selectedModelConfigId: null,
    defaultModelConfigId: null,
  }
}

export function migrateLegacyCatalog(
  value: unknown,
  options: CatalogMigrationOptions = {},
): CatalogMigrationResult {
  const legacy = parseLegacySettings(value)
  const generateId = options.generateId ?? ((): string => crypto.randomUUID())
  const credentialsBySlot = new Map<LegacyCredentialSlot, LegacyStoredCredential>()
  for (const rawCredential of options.legacyCredentials ?? []) {
    const credential = parseLegacyCredential(rawCredential)
    if (credentialsBySlot.has(credential.slot)) invalid(`Legacy credential slot ${credential.slot} is duplicated.`)
    const provider = legacyCredentialProvider(credential.slot)
    const config = legacy.providers[provider]
    if (credential.audience !== expectedLegacyAudience(config, credential.slot)) {
      invalid(`Legacy credential slot ${credential.slot} is stale or incompatible.`, provider)
    }
    credentialsBySlot.set(credential.slot, credential)
  }

  const legacyKeys: CredentialMetadata[] = []
  const savedCredentials: ResolvedCredential[] = []
  const keyIdsBySlot = new Map<LegacyCredentialSlot, CredentialId>()
  for (const slot of LEGACY_CREDENTIAL_SLOTS) {
    const credential = credentialsBySlot.get(slot)
    if (credential === undefined) continue
    const id = nextKeyId(generateId)
    const provider = legacyCredentialProvider(slot)
    const kind = legacyCredentialKind(slot)
    const authMode = kind === "vertex-service-account"
      ? "service-account"
      : provider === "google-ai-studio"
        ? "api-key"
        : "bearer"
    const metadata = parseCredentialMetadata({
      id,
      name: legacyCredentialName(slot),
      provider,
      kind,
      authMode,
      audience: credential.audience,
      updatedAt: credential.updatedAt,
    })
    const savedCredential = parseResolvedCredential({
      schemaVersion: 2,
      keyId: id,
      provider,
      kind,
      audience: credential.audience,
      revision: credential.revision,
      updatedAt: credential.updatedAt,
      secret: { ...credential.secret },
    })
    if (metadata === null || savedCredential === null) invalid("A migrated saved credential is invalid.", provider)
    legacyKeys.push(metadata)
    savedCredentials.push(savedCredential)
    keyIdsBySlot.set(slot, id)
  }

  const savedModelConfigs: SavedModelConfig[] = []
  const modelIdsByProvider = new Map<LegacyProviderId, SavedModelConfigId>()
  for (const provider of LEGACY_PROVIDER_IDS) {
    const config = legacy.providers[provider]
    const id = nextModelConfigId(generateId)
    const slot = linkedLegacySlot(config)
    savedModelConfigs.push(migrateLegacyModel(config, id, slot === null ? null : keyIdsBySlot.get(slot) ?? null))
    modelIdsByProvider.set(provider, id)
  }
  const selectedModelConfigId = modelIdsByProvider.get(legacy.activeProvider)
  if (selectedModelConfigId === undefined) invalid("Legacy active provider could not be migrated.")
  const candidate: LlmSettings = {
    schemaVersion: 2,
    savedModelConfigs,
    selectedModelConfigId,
    defaultModelConfigId: selectedModelConfigId,
  }
  const parsed = parseV2Settings(candidate)
  return {
    settings: parsed.settings,
    legacyCatalog: { keys: legacyKeys, credentials: savedCredentials },
    warnings: parsed.warnings,
  }
}

export function parseStoredSettingsDocument(
  value: unknown,
  options: CatalogMigrationOptions = {},
): StoredSettingsParseResult {
  if (!isRecord(value)) invalid("Stored LLM settings have an invalid schema.")
  if (value["schemaVersion"] === 2) {
    const requiresPersistence = Object.prototype.hasOwnProperty.call(value, "savedKeys")
    const parsed = requiresPersistence ? parseLegacyV2Settings(value, options) : parseV2Settings(value)
    return { ...parsed, requiresPersistence }
  }
  if (value["schemaVersion"] === 1) {
    const migrated = migrateLegacyCatalog(value, options)
    return { ...migrated, requiresPersistence: true }
  }
  return invalid("Stored LLM settings have an unsupported schema version.")
}

export function parseStoredSettings(value: unknown): LlmSettings {
  return parseStoredSettingsDocument(value).settings
}

export function validateCustomHeaderNames(names: readonly string[]): string | null {
  const normalized = new Set<string>()
  for (const rawName of names) {
    const name = rawName.trim()
    const lower = name.toLowerCase()
    if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name)) {
      return `Custom header ${rawName || "(empty)"} is not a valid HTTP header name.`
    }
    if (RESERVED_CUSTOM_HEADER_NAMES.has(lower)) return `Custom header ${name} is reserved.`
    if (normalized.has(lower)) return `Custom header ${name} is duplicated.`
    normalized.add(lower)
  }
  return null
}

export function validateProviderConfig(config: ProviderConfig): FieldErrors {
  const errors: Record<string, string> = {}
  if (config.model.trim() === "") errors["model"] = "Model is required."
  if (!Number.isInteger(config.timeoutMs) || config.timeoutMs < 1_000 || config.timeoutMs > 300_000) {
    errors["timeoutMs"] = "Timeout must be an integer from 1000 to 300000 milliseconds."
  }
  if (config.provider === "google-vertex") {
    if (config.projectId.trim() === "") errors["projectId"] = "Project ID is required for Service Account authentication."
    if (config.location.trim() === "") {
      errors["location"] = "Location is required for Service Account authentication."
    } else if (!/^(?:global|[a-z][a-z0-9-]{1,62})$/.test(config.location.trim())) {
      errors["location"] = "Location must be global or a lowercase Google Cloud region name."
    }
  }
  if (config.provider === "openai-compatible" || config.provider === "ollama") {
    const error = validateEndpointUrl(config.baseUrl)
    if (error) errors["baseUrl"] = error
  }
  if (config.provider === "openai-compatible") {
    const error = validateCustomHeaderNames(config.customHeaderNames)
    if (error) errors["customHeaderNames"] = error
  }
  return errors
}

export function assertValidProviderConfig(config: ProviderConfig): void {
  const errors = validateProviderConfig(config)
  if (Object.keys(errors).length > 0) {
    throw new LlmError("CONFIG_INVALID", Object.values(errors).join(" "), config.provider)
  }
}

function hasFlag(config: SavedModelConfig, flag: ModelFlag): boolean {
  return config.flags.includes(flag)
}

function assertValidMediaPart(part: LlmContentPart, config?: SavedModelConfig): void {
  if (part.type === "text") {
    if (typeof part.text !== "string") invalid("Text content parts require text.")
    return
  }
  if (typeof part.base64 !== "string" || part.base64 === "" || !BASE64_PATTERN.test(part.base64)) {
    invalid(`${part.type} content must contain valid base64 data.`)
  }
  const mimeMatch = typeof part.mimeType === "string" ? MIME_TYPE_PATTERN.exec(part.mimeType) : null
  if (mimeMatch === null || mimeMatch[1]?.toLowerCase() !== part.type) {
    invalid(`${part.type} content must use a matching MIME type.`)
  }
  if (config === undefined) return
  const requiredFlag = part.type === "image"
    ? "hasImageInput"
    : part.type === "audio"
      ? "hasAudioInput"
      : "hasVideoInput"
  if (!hasFlag(config, requiredFlag)) invalid(`${part.type} input requires ${requiredFlag}.`, config.provider)
}

export function assertValidResponsePart(part: LlmResponsePart, config: SavedModelConfig): void {
  assertValidMediaPart(part)
  if (part.type === "text") return
  if (part.type === "video") {
    throw new LlmError("UNSUPPORTED_FEATURE", "video output is not supported.", config.provider)
  }
  const requiredFlag = part.type === "image" ? "hasImageOutput" : "hasAudioOutput"
  if (!hasFlag(config, requiredFlag)) {
    throw new LlmError(
      "UNSUPPORTED_FEATURE",
      `${part.type} output requires ${requiredFlag}.`,
      config.provider,
    )
  }
}

function assertValidMessageContent(content: unknown, config?: SavedModelConfig): boolean {
  if (typeof content === "string") return content.trim() !== ""
  if (!Array.isArray(content) || content.length === 0) invalid("Message content must be text or a non-empty parts array.")
  let hasContent = false
  for (const value of content) {
    if (!isRecord(value) || (value["type"] !== "text" && value["type"] !== "image" && value["type"] !== "audio" && value["type"] !== "video")) {
      invalid("Message content contains an invalid typed part.")
    }
    const part: LlmContentPart = value["type"] === "text"
      ? { type: "text", text: requiredString(value, "text", "Text content part") }
      : {
          type: value["type"],
          base64: requiredString(value, "base64", `${value["type"]} content part`),
          mimeType: requiredString(value, "mimeType", `${value["type"]} content part`),
        }
    assertValidMediaPart(part, config)
    hasContent = hasContent || part.type !== "text" || part.text.trim() !== ""
  }
  return hasContent
}

function assertRoleConstraints(request: LlmRequest, config: SavedModelConfig): void {
  const roles = request.messages.map(message => message.role)
  const systemIndexes = roles
    .map((role, index) => ({ role, index }))
    .filter(entry => entry.role === "system")
    .map(entry => entry.index)
  if (systemIndexes.length > 0 && !hasFlag(config, "hasFullSystemPrompt")) {
    if (!hasFlag(config, "hasFirstSystemPrompt") || systemIndexes.length > 1 || systemIndexes[0] !== 0) {
      invalid("System messages require a compatible system-prompt flag.", config.provider)
    }
  }
  const conversationalRoles = roles.filter(role => role === "user" || role === "assistant")
  if (hasFlag(config, "mustStartWithUserInput") && conversationalRoles[0] !== "user") {
    invalid("The first conversational message must be user input.", config.provider)
  }
  if (hasFlag(config, "requiresAlternateRole")) {
    for (let index = 1; index < conversationalRoles.length; index += 1) {
      if (conversationalRoles[index] === conversationalRoles[index - 1]) {
        invalid("User and assistant messages must alternate.", config.provider)
      }
    }
  }
}

export function assertValidRequest(request: LlmRequest, config?: SavedModelConfig): void {
  if (!Array.isArray(request.messages) || request.messages.length === 0) {
    invalid("At least one non-empty message is required.")
  }
  let hasContent = false
  for (const message of request.messages) {
    if (!isRecord(message) || (message["role"] !== "system" && message["role"] !== "developer" && message["role"] !== "user" && message["role"] !== "assistant")) {
      invalid("Messages require a valid role.")
    }
    if (message["role"] === "developer" && config !== undefined && !hasFlag(config, "DeveloperRole")) {
      invalid("Developer messages require DeveloperRole.", config.provider)
    }
    if (message["reasoning"] !== undefined) {
      if (message["role"] !== "assistant" || typeof message["reasoning"] !== "string") {
        invalid("Reasoning input is valid only on assistant messages.")
      }
      if (config !== undefined && !hasFlag(config, "deepSeekThinkingInput")) {
        invalid("Assistant reasoning input requires deepSeekThinkingInput.", config.provider)
      }
    }
    hasContent = assertValidMessageContent(message["content"], config) || hasContent
  }
  if (!hasContent) invalid("At least one non-empty message is required.")
  if (config !== undefined) assertRoleConstraints(request, config)
  if (request.prefill !== undefined) {
    if (!isRecord(request.prefill) || request.prefill["role"] !== "assistant" || typeof request.prefill["content"] !== "string" || request.prefill["content"].trim() === "") {
      invalid("Assistant prefill must contain non-empty assistant text.")
    }
    if (config !== undefined && !hasFlag(config, "hasPrefill")) {
      invalid("Assistant prefill requires hasPrefill.", config.provider)
    }
    if (config?.provider === "deepseek" && !hasFlag(config, "deepSeekPrefix")) {
      invalid("DeepSeek assistant prefill requires deepSeekPrefix.", config.provider)
    }
    if (config !== undefined && hasFlag(config, "requiresAlternateRole")) {
      const conversationalRoles = request.messages
        .filter(message => message.role === "user" || message.role === "assistant")
        .map(message => message.role)
      if (conversationalRoles[conversationalRoles.length - 1] !== "user") {
        invalid("Assistant prefill requires a trailing user message when roles alternate.", config.provider)
      }
    }
  }
  if (request.cache !== undefined) {
    if (!isRecord(request.cache) || typeof request.cache["id"] !== "string" || request.cache["id"].trim() === "") {
      invalid("Cache references require a non-empty ID.")
    }
    if (config !== undefined && !hasFlag(config, "hasCache")) {
      invalid("Cache references require hasCache.", config.provider)
    }
  }
  assertOptionalRange(request.temperature, { field: "temperature", minimum: 0, maximum: 2 })
  assertOptionalRange(request.topP, { field: "topP", minimum: 0, maximum: 1 })
  assertPositiveInteger(request.maxOutputTokens, "maxOutputTokens")
}

export function assertValidStreamRequest(request: LlmRequest, config: SavedModelConfig): void {
  if (!hasFlag(config, "hasStreaming")) invalid("Streaming requires hasStreaming.", config.provider)
  assertValidRequest(request, config)
}

export function assertValidCallOptions(options: LlmCallOptions): void {
  if (!isSavedModelConfigId(options.modelConfigId)) {
    invalid("modelConfigId must be a UUID.")
  }
  if (
    options.timeoutMs !== undefined
    && (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1_000 || options.timeoutMs > 300_000)
  ) {
    invalid("timeoutMs must be an integer from 1000 to 300000 milliseconds.")
  }
}

export function legacyDefaultSettings(): LlmSettingsV1 {
  return {
    schemaVersion: 1,
    activeProvider: "google-ai-studio",
    providers: {
      "google-ai-studio": { provider: "google-ai-studio", model: "", timeoutMs: DEFAULT_TIMEOUT_MS },
      "google-vertex": {
        provider: "google-vertex",
        authMode: "service-account",
        projectId: "",
        location: "us-central1",
        model: "",
        timeoutMs: DEFAULT_TIMEOUT_MS,
      },
      "openai-compatible": {
        provider: "openai-compatible",
        baseUrl: "",
        authMode: "bearer",
        customHeaderNames: [],
        model: "",
        timeoutMs: DEFAULT_TIMEOUT_MS,
      },
      ollama: {
        provider: "ollama",
        baseUrl: "http://127.0.0.1:11434/v1",
        authMode: "none",
        model: "",
        timeoutMs: DEFAULT_TIMEOUT_MS,
      },
    },
  }
}
