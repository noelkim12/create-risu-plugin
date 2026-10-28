import { AiServiceError } from "../../ai-services"
import type { ContextualEmbeddingProviderId } from "../core/types"
import type { ContextualEmbeddingProvider } from "./contract"

export class ContextualEmbeddingProviderRegistry {
  private readonly providers = new Map<ContextualEmbeddingProviderId, ContextualEmbeddingProvider>()

  register(provider: ContextualEmbeddingProvider): void {
    if (this.providers.has(provider.id)) {
      throw new AiServiceError("CONFIG_INVALID", "A contextual embedding provider is already registered.", {
        provider: provider.id,
        capability: "contextual-embedding",
      })
    }
    this.providers.set(provider.id, provider)
  }

  get(provider: ContextualEmbeddingProviderId): ContextualEmbeddingProvider {
    const registered = this.providers.get(provider)
    if (registered === undefined) {
      throw new AiServiceError("UNSUPPORTED_CAPABILITY", "The provider does not support contextual embedding.", {
        provider,
        capability: "contextual-embedding",
      })
    }
    return registered
  }
}
