import { GoogleServiceAccountTokenProvider } from "./auth/google-service-account"
import { LlmClient } from "./core/llm-client"
import { NativeFetchTransport, type NativeFetchApi } from "./network/native-fetch-transport"
import { GoogleAiStudioProvider } from "./providers/google-ai-studio"
import { GoogleVertexProvider } from "./providers/google-vertex"
import { OllamaProvider } from "./providers/ollama"
import { OpenAiCompatibleProvider } from "./providers/openai-compatible"
import { ProviderRegistry } from "./providers/registry"
import { LocalCredentialRepository } from "./storage/local-credential-repository"
import { LocalSettingsRepository } from "./storage/local-settings-repository"
import type { LocalStoragePort } from "./storage/storage-keys"

export interface LlmRisuApi extends NativeFetchApi {
  getLocalPluginStorage(): Promise<LocalStoragePort>
  getRuntimeInfo(): Promise<{ readonly platform: string }>
}

export function createLlmClient(api: LlmRisuApi = risuai): LlmClient {
  const transport = new NativeFetchTransport(api)
  const tokens = new GoogleServiceAccountTokenProvider(transport)
  const storageFactory = () => api.getLocalPluginStorage()
  const settings = new LocalSettingsRepository(storageFactory)
  const credentials = new LocalCredentialRepository(storageFactory)
  const providers = new ProviderRegistry({
    "google-ai-studio": new GoogleAiStudioProvider(transport),
    "google-vertex": new GoogleVertexProvider(transport, tokens),
    "openai-compatible": new OpenAiCompatibleProvider(transport),
    ollama: new OllamaProvider(transport),
  })
  return new LlmClient({
    settings,
    credentials,
    providers,
    getRuntimeInfo: () => api.getRuntimeInfo(),
  })
}

export const llmClient = createLlmClient()
