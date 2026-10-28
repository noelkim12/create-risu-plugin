export { ContextualEmbeddingError, type ContextualEmbeddingErrorCode, CONTEXTUAL_EMBEDDING_ERROR_CODES } from "./core/errors"
// The client and repository also throw the shared retrieval error for config,
// credential, and transport failures, so it is part of this feature's surface.
export { AiServiceError, type AiServiceErrorCode } from "../ai-services"
export {
  DEFAULT_CONTEXTUAL_EMBEDDING_MODEL,
  DEFAULT_CONTEXTUAL_EMBEDDING_TIMEOUT_MS,
  defaultContextualEmbeddingDraft,
  isContextualEmbeddingConfigId,
  isContextualEmbeddingInputType,
  isContextualEmbeddingOutputDtype,
  type ContextualEmbeddingCallOptions,
  type ContextualEmbeddingChunkResult,
  type ContextualEmbeddingConfig,
  type ContextualEmbeddingConfigDraft,
  type ContextualEmbeddingConfigId,
  type ContextualEmbeddingEncoding,
  type ContextualEmbeddingGroupResult,
  type ContextualEmbeddingInput,
  type ContextualEmbeddingInputType,
  type ContextualEmbeddingOutputDtype,
  type ContextualEmbeddingProviderId,
  type ContextualEmbeddingRequest,
  type ContextualEmbeddingResult,
  type ContextualEmbeddingSettings,
  type ContextualEmbeddingUsage,
  type ContextualEmbeddingVector,
  type VoyageContextualEmbeddingConfig,
} from "./core/types"
export {
  assertContextualEmbeddingInputs,
  MAX_CONTEXTUAL_EMBEDDING_CHUNKS,
  MAX_CONTEXTUAL_EMBEDDING_GROUPS,
  validateContextualEmbeddingDraft,
} from "./core/validation"
export { ContextualEmbeddingClient, type ContextualEmbeddingClientDeps, type ContextualEmbeddingConfigRepositoryPort } from "./contextual-embedding-client"
export { type ContextualEmbeddingProvider, type ContextualEmbeddingProviderCall } from "./providers/contract"
export { ContextualEmbeddingProviderRegistry } from "./providers/registry"
export { VOYAGE_CONTEXTUAL_EMBEDDINGS_URL, VoyageContextualEmbeddingProvider } from "./providers/voyage"
export {
  ContextualEmbeddingSettingsController,
  type ContextualEmbeddingConnectionTestPort,
  type ContextualEmbeddingConfigEditingPort,
  type ContextualEmbeddingConfigSummary,
  type ContextualEmbeddingCredentialListingPort,
  type ContextualEmbeddingSettingsOperation,
  type ContextualEmbeddingSettingsState,
} from "./settings/settings-controller"
export {
  contextualEmbeddingSettingsKey,
  createDefaultContextualEmbeddingSettings,
  LocalContextualEmbeddingConfigRepository,
  parseContextualEmbeddingSettings,
} from "./storage/local-config-repository"
export {
  contextualEmbeddingClient,
  contextualEmbeddingSettingsController,
  createContextualEmbeddingRuntime,
  type ContextualEmbeddingRuntime,
} from "./runtime"
