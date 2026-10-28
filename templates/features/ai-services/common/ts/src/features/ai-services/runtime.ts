import { NativeFetchTransport, type NativeFetchApi } from "./network/native-fetch-transport"
import { RetrievalProviderRegistry } from "./providers/registry"
import { AiServiceSectionRegistry } from "./settings/section-registry"
import type { LocalStoragePort } from "./storage/storage-keys"

export interface AiServicesRisuApi extends NativeFetchApi {
  getLocalPluginStorage(): Promise<LocalStoragePort>
}

export type AiServicesRuntime = {
  readonly transport: NativeFetchTransport
  readonly providers: RetrievalProviderRegistry
  readonly sections: AiServiceSectionRegistry
}

export function createAiServicesRuntime(api: AiServicesRisuApi = risuai): AiServicesRuntime {
  const transport = new NativeFetchTransport(api)
  const providers = new RetrievalProviderRegistry()
  return {
    transport,
    providers,
    sections: new AiServiceSectionRegistry(),
  }
}

export const aiServicesRuntime = createAiServicesRuntime()
export const aiServicesSectionRegistry = aiServicesRuntime.sections
