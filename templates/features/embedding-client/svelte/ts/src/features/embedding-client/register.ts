import { mount, unmount } from "svelte"
import type { ContainerHost } from "../../ui/container-host"
import { aiServicesSectionRegistry, AI_SERVICE_SECTION_ORDER } from "../ai-services"
import { embeddingSettingsController } from "./runtime"
import EmbeddingSection from "./ui/EmbeddingSection.svelte"

export async function registerEmbeddingClientFeature(host: ContainerHost): Promise<void> {
  void host
  aiServicesSectionRegistry.register({
    id: "embedding",
    label: "Embedding",
    order: AI_SERVICE_SECTION_ORDER.embedding,
    mount: ({ target }) => {
      const component = mount(EmbeddingSection, {
        target,
        props: { controller: embeddingSettingsController },
      })
      return () => unmount(component)
    },
  })
}
