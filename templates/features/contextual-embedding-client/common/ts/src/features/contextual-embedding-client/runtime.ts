import { aiServicesRuntime, type AiServicesRuntime, type AiServicesRisuApi } from "../ai-services"
import { credentialManagerRuntime } from "../credential-manager"
import { ContextualEmbeddingClient } from "./contextual-embedding-client"
import { ContextualEmbeddingProviderRegistry } from "./providers/registry"
import { VoyageContextualEmbeddingProvider } from "./providers/voyage"
import { ContextualEmbeddingSettingsController } from "./settings/settings-controller"
import { LocalContextualEmbeddingConfigRepository } from "./storage/local-config-repository"

export type ContextualEmbeddingRuntime = {
  readonly client: ContextualEmbeddingClient
  readonly configs: LocalContextualEmbeddingConfigRepository
  readonly controller: ContextualEmbeddingSettingsController
  readonly dispose: () => void
}

export function createContextualEmbeddingRuntime(
  api: AiServicesRisuApi = risuai,
  retrieval: AiServicesRuntime = aiServicesRuntime,
): ContextualEmbeddingRuntime {
  const configs = new LocalContextualEmbeddingConfigRepository(() => api.getLocalPluginStorage())
  // Registering the repository makes credential deletion clear the credential id
  // from every referencing contextual embedding config while keeping the configs.
  const unregisterCredentialReferences = credentialManagerRuntime.manager.registerReferences(configs)
  const capabilityProviders = new ContextualEmbeddingProviderRegistry()
  capabilityProviders.register(new VoyageContextualEmbeddingProvider(retrieval.transport))
  const client = new ContextualEmbeddingClient({
    configs,
    credentials: credentialManagerRuntime.resolver,
    capabilityProviders,
  })
  return {
    client,
    configs,
    controller: new ContextualEmbeddingSettingsController(
      configs,
      credentialManagerRuntime.manager,
      {
        async testConnection(configId, signal) {
          const result = await client.embed(
            { inputs: [["connection test"]] },
            { configId, signal },
          )
          return { provider: result.provider, model: result.model }
        },
      },
    ),
    dispose: unregisterCredentialReferences,
  }
}

const defaultRuntime = createContextualEmbeddingRuntime()
export const contextualEmbeddingClient = defaultRuntime.client
export const contextualEmbeddingSettingsController = defaultRuntime.controller
