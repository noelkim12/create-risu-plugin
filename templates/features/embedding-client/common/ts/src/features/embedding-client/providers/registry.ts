import { EmbeddingError } from "../core/errors"
import type { EmbeddingProviderId, SavedEmbeddingConfig } from "../core/types"
import type { EmbeddingProvider } from "./provider"

export class EmbeddingProviderRegistry {
  private readonly providers = new Map<EmbeddingProviderId, EmbeddingProvider>()

  register(provider: EmbeddingProviderId, implementation: EmbeddingProvider): void {
    if (this.providers.has(provider)) {
      throw new EmbeddingError("CONFIG_INVALID", "An embedding provider is already registered.", { provider })
    }
    this.providers.set(provider, implementation)
  }

  for(config: SavedEmbeddingConfig): EmbeddingProvider {
    const implementation = this.providers.get(config.provider)
    if (implementation === undefined) {
      throw new EmbeddingError("CONFIG_INVALID", "The embedding provider is not registered.", {
        provider: config.provider,
        capability: "embedding",
      })
    }
    return implementation
  }
}
