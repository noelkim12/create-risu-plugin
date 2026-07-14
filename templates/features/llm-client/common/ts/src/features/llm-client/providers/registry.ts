import type { ProviderConfig } from "../core/types"
import type { LlmProvider } from "./provider"

export class ProviderRegistry {
  constructor(private readonly providers: Readonly<Record<ProviderConfig["provider"], LlmProvider>>) {}

  for(config: ProviderConfig): LlmProvider {
    return this.providers[config.provider]
  }
}
