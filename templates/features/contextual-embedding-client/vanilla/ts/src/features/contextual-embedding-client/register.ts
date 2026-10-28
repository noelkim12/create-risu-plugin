import type { ContainerHost } from "../../ui/container-host"
import { aiServicesSectionRegistry, AI_SERVICE_SECTION_ORDER } from "../ai-services"
import { contextualEmbeddingSettingsController } from "./runtime"
import { mountContextualEmbeddingPanel } from "./ui/contextual-panel"
import "./ui/contextual-panel.css"

export async function registerContextualEmbeddingClientFeature(host: ContainerHost): Promise<void> {
  void host
  aiServicesSectionRegistry.register({
    id: "contextual-embedding",
    label: "Contextual Embedding",
    order: AI_SERVICE_SECTION_ORDER["contextual-embedding"],
    mount: ({ target }) => {
      const mounted = mountContextualEmbeddingPanel(target, contextualEmbeddingSettingsController)
      return () => mounted.destroy()
    },
  })
}
