import type { SavedModelConfig } from "../core/types"
import type { LlmProvider } from "./provider"

export class ProviderRegistry {
  constructor(private readonly providers: Readonly<Record<SavedModelConfig["provider"], LlmProvider>>) {}

  for(model: SavedModelConfig): LlmProvider {
    return this.providers[model.provider]
  }
}
