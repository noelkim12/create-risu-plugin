export { embeddingCredentialBindingFor, requiresBearerCredential } from "./core/credential-binding"
export { createDefaultEmbeddingSettings, parseEmbeddingSettings } from "./core/config-parse"
export { EmbeddingError, EMBEDDING_ERROR_CODES, type EmbeddingErrorContext, type EmbeddingErrorCode } from "./core/errors"
export { EmbeddingClient, type EmbeddingClientDependencies } from "./core/embedding-client"
export {
  EMBEDDING_PROVIDER_IDS,
  isEmbeddingConfigId,
  type EmbeddingCallOptions,
  type EmbeddingConfigDraft,
  type EmbeddingConfigId,
  type EmbeddingEncoding,
  type EmbeddingInputType,
  type EmbeddingProviderId,
  type EmbeddingRequest,
  type EmbeddingResult,
  type EmbeddingResultItem,
  type EmbeddingSettings,
  type EmbeddingUsage,
  type EmbeddingVector,
  type NormalizedEmbeddingRequest,
  type OpenAiCompatibleEmbeddingConfig,
  type SavedEmbeddingConfig,
  type VoyageEmbeddingConfig,
  type VoyageOutputDtype,
} from "./core/types"
export { configFromDraft, normalizeEmbeddingRequest, resolveTimeoutMs } from "./core/validation"
export {
  parseEmbeddingJsonResponse,
  type EmbeddingCredential,
  type EmbeddingProvider,
  type EmbeddingProviderExecution,
} from "./providers/provider"
export { toEmbeddingResult } from "./providers/result"
export { EmbeddingProviderRegistry } from "./providers/registry"
export { VOYAGE_EMBEDDINGS_URL, VoyageEmbeddingProvider } from "./providers/voyage"
export { OpenAiCompatibleEmbeddingProvider } from "./providers/openai-compatible"
export { embeddingSettingsKey, defaultEmbeddingStorageFactory } from "./storage/storage-keys"
export { LocalEmbeddingSettingsRepository } from "./storage/embedding-settings-repository"
export {
  defaultEmbeddingConfigDraft,
  draftFromConfig,
  newEmbeddingConfigId,
  type EmbeddingConfigStatus,
  type EmbeddingConfigSummary,
} from "./settings/config-drafts"
export {
  EmbeddingSettingsController,
  type EmbeddingConnectionTestPort,
  type EmbeddingControllerOperation,
  type EmbeddingControllerState,
  type EmbeddingCredentialPort,
  type EmbeddingDraftSession,
  type EmbeddingSettingsRepositoryPort,
} from "./settings/embedding-controller"
export {
  createEmbeddingRuntime,
  embeddingClient,
  embeddingRuntime,
  embeddingSettingsController,
  type EmbeddingRuntime,
  type EmbeddingRuntimeOptions,
} from "./runtime"
