import { AiServiceError, type RetrievalProviderId } from "../../ai-services"
import type { RerankerProvider } from "./provider"

export class RerankerProviderRegistry {
  private readonly providers = new Map<RetrievalProviderId, RerankerProvider>()

  register(provider: RerankerProvider): () => void {
    if (this.providers.has(provider.id)) {
      throw new AiServiceError("CONFIG_INVALID", "A reranker provider is already registered.", {
        provider: provider.id,
        capability: "reranker",
      })
    }
    this.providers.set(provider.id, provider)
    return () => this.providers.delete(provider.id)
  }

  get(provider: RetrievalProviderId): RerankerProvider {
    const registered = this.providers.get(provider)
    if (registered === undefined) {
      throw new AiServiceError("UNSUPPORTED_CAPABILITY", "The provider does not support reranking.", {
        provider,
        capability: "reranker",
      })
    }
    return registered
  }
}
