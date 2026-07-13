import { GoogleServiceAccountTokenProvider } from "./auth/google-service-account"
import { LlmClient } from "./core/llm-client"
import { NativeFetchTransport, type NativeFetchApi } from "./network/native-fetch-transport"
import { GoogleAiStudioProvider } from "./providers/google-ai-studio"
import { GoogleVertexProvider } from "./providers/google-vertex"
import { OllamaProvider } from "./providers/ollama"
import { OpenAiCompatibleProvider } from "./providers/openai-compatible"
import { ProviderRegistry } from "./providers/registry"
import { LlmSettingsController } from "./settings/settings-controller"
import { LocalCredentialRepository } from "./storage/local-credential-repository"
import { LocalSettingsRepository } from "./storage/local-settings-repository"
import type { LocalStoragePort } from "./storage/storage-keys"

export interface LlmRisuApi extends NativeFetchApi {
  getLocalPluginStorage(): Promise<LocalStoragePort>
  getRuntimeInfo(): Promise<{ readonly platform: string }>
}

function assembleRuntime(api: LlmRisuApi) {
  const transport = new NativeFetchTransport(api)
  const tokenProvider = new GoogleServiceAccountTokenProvider(transport)
  const storageFactory = () => api.getLocalPluginStorage()
  const settingsRepository = new LocalSettingsRepository(storageFactory)
  const credentialRepository = new LocalCredentialRepository(storageFactory)
  const providers = new ProviderRegistry({
    "google-ai-studio": new GoogleAiStudioProvider(transport),
    "google-vertex": new GoogleVertexProvider(transport, tokenProvider),
    "openai-compatible": new OpenAiCompatibleProvider(transport),
    ollama: new OllamaProvider(transport),
  })
  const client = new LlmClient({
    settings: settingsRepository,
    credentials: credentialRepository,
    providers,
    getRuntimeInfo: () => api.getRuntimeInfo(),
  })
  const controller = new LlmSettingsController(
    settingsRepository,
    credentialRepository,
    client,
    () => api.getRuntimeInfo(),
    () => tokenProvider.invalidate(),
  )
  return { client, controller }
}

export function createLlmClient(api: LlmRisuApi = risuai): LlmClient {
  return assembleRuntime(api).client
}

const defaultRuntime = assembleRuntime(risuai)
export const llmClient = defaultRuntime.client
export const llmSettingsController = defaultRuntime.controller
