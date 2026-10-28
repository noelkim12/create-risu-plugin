import { aiServicesRuntime } from "../ai-services"
import { credentialManagerRuntime } from "../credential-manager"
import { RerankerClient } from "./core/reranker-client"
import { RerankerProviderRegistry } from "./providers/registry"
import { VoyageRerankerProvider } from "./providers/voyage"
import { RerankerSettingsController } from "./settings/settings-controller"
import { LocalRerankerSettingsRepository } from "./storage/local-settings-repository"

const settings = new LocalRerankerSettingsRepository()
// Registered so deleting a Voyage credential clears its links; configs are retained.
credentialManagerRuntime.manager.registerReferences(settings)

const rerankers = new RerankerProviderRegistry()
rerankers.register(new VoyageRerankerProvider(aiServicesRuntime.transport))

const client = new RerankerClient({
  settings,
  credentials: credentialManagerRuntime.resolver,
  providers: aiServicesRuntime.providers,
  rerankers,
})

export const rerankerClient = client
export const rerankerSettingsController = new RerankerSettingsController(
  settings,
  credentialManagerRuntime.manager,
  {
    async testConnection(configId, signal) {
      const result = await client.rerank(
        {
          query: "connection test",
          documents: ["connection test document", "unrelated document"],
          topK: 2,
        },
        { configId, signal },
      )
      return { provider: result.provider, model: result.model }
    },
  },
)
