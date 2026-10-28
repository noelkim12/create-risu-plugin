import { mount, unmount } from "svelte"
import type { ContainerHost } from "../../ui/container-host"
import { aiServicesSectionRegistry, AI_SERVICE_SECTION_ORDER } from "../ai-services"
import { contextualEmbeddingSettingsController } from "./runtime"
import ContextualEmbeddingSection from "./ui/ContextualEmbeddingSection.svelte"

export async function registerContextualEmbeddingClientFeature(host: ContainerHost): Promise<void> {
  void host
  aiServicesSectionRegistry.register({
    id: "contextual-embedding",
    label: "Contextual Embedding",
    order: AI_SERVICE_SECTION_ORDER["contextual-embedding"],
    mount: ({ target }) => {
      const component = mount(ContextualEmbeddingSection, {
        target,
        props: { controller: contextualEmbeddingSettingsController },
      })
      return () => unmount(component)
    },
  })
}
