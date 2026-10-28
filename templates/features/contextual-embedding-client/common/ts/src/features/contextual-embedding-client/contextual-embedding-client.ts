import {
  AiServiceError,
  VOYAGE_RETRIEVAL_ENDPOINT,
} from "../ai-services"
import { isCredentialId, type CredentialBinding, type CredentialResolver } from "../credential-manager"
import type {
  ContextualEmbeddingCallOptions,
  ContextualEmbeddingConfig,
  ContextualEmbeddingConfigId,
  ContextualEmbeddingRequest,
  ContextualEmbeddingResult,
} from "./core/types"
import { assertContextualEmbeddingInputs } from "./core/validation"
import type { ContextualEmbeddingProviderRegistry } from "./providers/registry"

export interface ContextualEmbeddingConfigRepositoryPort {
  get(id: ContextualEmbeddingConfigId): Promise<ContextualEmbeddingConfig | null>
}

export type ContextualEmbeddingClientDeps = {
  readonly configs: ContextualEmbeddingConfigRepositoryPort
  readonly credentials: CredentialResolver
  readonly capabilityProviders: ContextualEmbeddingProviderRegistry
}

const VOYAGE_CONTEXTUAL_BINDING: CredentialBinding = {
  provider: "voyage",
  kind: "api-key",
  authMode: "bearer",
  audience: VOYAGE_RETRIEVAL_ENDPOINT,
}

export class ContextualEmbeddingClient {
  constructor(private readonly deps: ContextualEmbeddingClientDeps) {}

  async embed(
    request: ContextualEmbeddingRequest,
    options: ContextualEmbeddingCallOptions,
  ): Promise<ContextualEmbeddingResult> {
    const config = await this.deps.configs.get(options.configId)
    if (config === null) {
      throw new AiServiceError("CONFIG_INVALID", "Saved contextual embedding configuration is missing.")
    }
    const inputType = request.inputType ?? config.inputType
    assertContextualEmbeddingInputs(request.inputs, inputType)
    const credentialId = config.credentialId
    if (credentialId === null) {
      throw new AiServiceError("CREDENTIAL_MISSING", "A linked Voyage credential is required.", VOYAGE_CONTEXTUAL_BINDING)
    }
    if (!isCredentialId(credentialId)) {
      throw new AiServiceError("CREDENTIAL_MISSING", "The linked retrieval credential no longer exists.", VOYAGE_CONTEXTUAL_BINDING)
    }
    const credential = await this.deps.credentials.resolveCredential(credentialId, VOYAGE_CONTEXTUAL_BINDING)
    if (credential.kind !== "api-key") {
      throw new AiServiceError("CONFIG_INVALID", "The linked Voyage credential must be an API key.", VOYAGE_CONTEXTUAL_BINDING)
    }
    if (/[\r\n]/.test(credential.secret.apiKey)) {
      throw new AiServiceError("CONFIG_INVALID", "The stored API key contains an invalid line break.", VOYAGE_CONTEXTUAL_BINDING)
    }
    const provider = this.deps.capabilityProviders.get(config.provider)
    return provider.embed({
      config,
      inputs: request.inputs,
      inputType,
      apiKey: credential.secret.apiKey,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      timeoutMs: options.timeoutMs ?? config.timeoutMs,
    })
  }
}
