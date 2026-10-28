import {
  aiServicesRuntime,
  type AiServicesRuntime,
  type LocalStorageFactory,
} from "../ai-services"
import { credentialManagerRuntime } from "../credential-manager"
import { EmbeddingClient } from "./core/embedding-client"
import { EmbeddingProviderRegistry } from "./providers/registry"
import { OpenAiCompatibleEmbeddingProvider } from "./providers/openai-compatible"
import { VoyageEmbeddingProvider } from "./providers/voyage"
import { EmbeddingSettingsController } from "./settings/embedding-controller"
import { LocalEmbeddingSettingsRepository } from "./storage/embedding-settings-repository"
import { defaultEmbeddingStorageFactory } from "./storage/storage-keys"

export type EmbeddingRuntime = {
  readonly settings: LocalEmbeddingSettingsRepository
  readonly client: EmbeddingClient
  readonly controller: EmbeddingSettingsController
  readonly dispose: () => void
}

export type EmbeddingRuntimeOptions = {
  readonly services?: Pick<AiServicesRuntime, "transport" | "providers">
  readonly storageFactory?: LocalStorageFactory
  readonly pluginName?: string
}

export function createEmbeddingRuntime(options: EmbeddingRuntimeOptions = {}): EmbeddingRuntime {
  const services = options.services ?? aiServicesRuntime
  const settings = new LocalEmbeddingSettingsRepository(
    options.storageFactory ?? defaultEmbeddingStorageFactory,
    options.pluginName,
  )
  // Deleting a retrieval credential unlinks it from every referencing embedding config.
  const unregisterCredentialReferences = credentialManagerRuntime.manager.registerReferences(settings)
  const embeddingProviders = new EmbeddingProviderRegistry()
  embeddingProviders.register("voyage", new VoyageEmbeddingProvider(services.transport))
  embeddingProviders.register("openai-compatible", new OpenAiCompatibleEmbeddingProvider(services.transport))
  const client = new EmbeddingClient({
    settings,
    credentials: credentialManagerRuntime.resolver,
    retrievalProviders: services.providers,
    embeddingProviders,
  })
  const controller = new EmbeddingSettingsController({
    settings,
    credentials: credentialManagerRuntime.manager,
    connectionTest: {
      async testConnection(configId, signal) {
        const result = await client.embed({ input: "connection test" }, { configId, signal })
        return { provider: result.provider, model: result.model }
      },
    },
  })
  const dispose = (): void => {
    controller.cancelTest()
    unregisterCredentialReferences()
  }
  return { settings, client, controller, dispose }
}

export const embeddingRuntime = createEmbeddingRuntime()
export const embeddingClient = embeddingRuntime.client
export const embeddingSettingsController = embeddingRuntime.controller
