import { aiServicesRuntime, type AiServicesRuntime } from "../ai-services"
import { credentialManagerRuntime } from "../credential-manager/runtime"
import { GoogleServiceAccountTokenProvider } from "./auth/google-service-account"
import { LlmClient } from "./core/llm-client"
import { NativeFetchTransport, type NativeFetchApi } from "./network/native-fetch-transport"
import { GoogleAiStudioProvider } from "./providers/google-ai-studio"
import { GoogleVertexProvider } from "./providers/google-vertex"
import { DeepSeekProvider } from "./providers/deepseek"
import { OllamaProvider } from "./providers/ollama"
import { OpenAiCompatibleProvider } from "./providers/openai-compatible"
import { ProviderRegistry } from "./providers/registry"
import { LlmSettingsController } from "./settings/settings-controller"
import { LocalSettingsRepository } from "./storage/local-settings-repository"
import type { LocalStoragePort } from "../ai-services/storage/storage-keys"

export interface LlmRisuApi extends NativeFetchApi {
  getLocalPluginStorage(): Promise<LocalStoragePort>
  getRuntimeInfo(): Promise<{ readonly platform: string }>
}

function assembleRuntime(api: LlmRisuApi, _services: AiServicesRuntime) {
  const transport = new NativeFetchTransport(api)
  const tokenProvider = new GoogleServiceAccountTokenProvider(transport)
  const storageFactory = () => api.getLocalPluginStorage()
  const settingsRepository = new LocalSettingsRepository(storageFactory)
  credentialManagerRuntime.manager.registerReferences(settingsRepository)
  const providers = new ProviderRegistry({
    "google-ai-studio": new GoogleAiStudioProvider(transport),
    "google-vertex": new GoogleVertexProvider(transport, tokenProvider),
    "openai-compatible": new OpenAiCompatibleProvider(transport),
    ollama: new OllamaProvider(transport),
    deepseek: new DeepSeekProvider(transport),
  })
  const client = new LlmClient({
    settings: settingsRepository,
    credentials: credentialManagerRuntime.resolver,
    providers,
    getRuntimeInfo: () => api.getRuntimeInfo(),
  })
  const controller = new LlmSettingsController(
    settingsRepository,
    credentialManagerRuntime.manager,
    client,
    () => api.getRuntimeInfo(),
  )
  return { client, controller }
}

export function createLlmClient(services: AiServicesRuntime, api: LlmRisuApi = risuai): LlmClient {
  return assembleRuntime(api, services).client
}

const defaultRuntime = assembleRuntime(risuai, aiServicesRuntime)
export const llmClient = defaultRuntime.client
export const llmSettingsController = defaultRuntime.controller
