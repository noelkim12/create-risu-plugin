import {
  AiServiceError,
  type RetrievalProviderRegistry,
} from "../../ai-services"
import { isCredentialId, type CredentialResolver } from "../../credential-manager"
import { embeddingCredentialBindingFor } from "./credential-binding"
import { requiresBearerCredential } from "./credential-binding"
import { EmbeddingError } from "./errors"
import type { EmbeddingCallOptions, EmbeddingRequest, EmbeddingResult, EmbeddingSettings, SavedEmbeddingConfig } from "./types"
import { normalizeEmbeddingRequest, resolveTimeoutMs } from "./validation"
import type { EmbeddingCredential, EmbeddingProvider } from "../providers/provider"

export interface EmbeddingClientDependencies {
  readonly settings: { load(): Promise<EmbeddingSettings> }
  readonly credentials: CredentialResolver
  readonly retrievalProviders: RetrievalProviderRegistry
  readonly embeddingProviders: { for(config: SavedEmbeddingConfig): EmbeddingProvider }
}

export class EmbeddingClient {
  constructor(private readonly dependencies: EmbeddingClientDependencies) {}

  async embed(request: EmbeddingRequest, options: EmbeddingCallOptions): Promise<EmbeddingResult> {
    try {
      const config = await this.resolveConfig(options.configId)
      const credential = await this.resolveCredential(config)
      const normalized = normalizeEmbeddingRequest(request, config)
      const timeoutMs = resolveTimeoutMs(options.timeoutMs, config.timeoutMs)
      return await this.dependencies.embeddingProviders.for(config).embed({
        config,
        credential,
        request: normalized,
        signal: options.signal,
        timeoutMs,
      })
    } catch (error) {
      // One public error type: base AI Services codes are widened, not replaced.
      if (!(error instanceof AiServiceError)) throw error
      const provider = error.context.provider
      throw new EmbeddingError(error.code, error.message, {
        ...(provider === "voyage" || provider === "openai-compatible" ? { provider } : {}),
        ...(error.context.capability === undefined ? {} : { capability: error.context.capability }),
      })
    }
  }

  private async resolveConfig(configId: EmbeddingCallOptions["configId"]): Promise<SavedEmbeddingConfig> {
    const settings = await this.dependencies.settings.load()
    const config = settings.configs.find(item => item.id === configId)
    if (config === undefined) {
      throw new AiServiceError("CONFIG_INVALID", "The requested embedding configuration does not exist.")
    }
    this.dependencies.retrievalProviders.assertSupports(config.provider, "embedding")
    return config
  }

  private async resolveCredential(config: SavedEmbeddingConfig): Promise<EmbeddingCredential> {
    const context = { provider: config.provider, capability: "embedding" as const }
    if (!requiresBearerCredential(config)) {
      if (config.credentialId !== null) {
        throw new AiServiceError(
          "CONFIG_INVALID",
          "A no-authentication embedding configuration must not link a credential.",
          context,
        )
      }
      return { authMode: "none" }
    }
    // Bearer modes fail before transport when no compatible key is linked.
    if (config.credentialId === null) {
      throw new AiServiceError("CREDENTIAL_MISSING", "A valid linked credential is required.", context)
    }
    if (!isCredentialId(config.credentialId)) {
      throw new AiServiceError("CREDENTIAL_MISSING", "A valid linked credential is required.", context)
    }
    const credential = await this.dependencies.credentials.resolveCredential(
      config.credentialId,
      embeddingCredentialBindingFor(config),
    )
    if (credential.kind !== "api-key") {
      throw new AiServiceError("CONFIG_INVALID", "The linked credential must be an API key.", context)
    }
    if (credential.secret.apiKey.trim().length === 0) {
      throw new AiServiceError("CREDENTIAL_MISSING", "A valid linked credential is required.", context)
    }
    if (/[\r\n]/.test(credential.secret.apiKey)) {
      throw new AiServiceError("CONFIG_INVALID", "The stored API key contains an invalid line break.", context)
    }
    return { authMode: "bearer", apiKey: credential.secret.apiKey }
  }
}
