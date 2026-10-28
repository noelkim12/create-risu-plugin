import { mount, unmount } from "svelte"
import type { ContainerHost } from "../../ui/container-host"
import { AI_SERVICE_SECTION_ORDER, aiServicesSectionRegistry } from "../ai-services"
import { rerankerSettingsController } from "./runtime"
import RerankerSection from "./ui/RerankerSection.svelte"

export async function registerRerankerClientFeature(host: ContainerHost): Promise<void> {
  void host
  aiServicesSectionRegistry.register({
    id: "reranker",
    label: "Reranker",
    order: AI_SERVICE_SECTION_ORDER.reranker,
    mount: ({ target }) => {
      const component = mount(RerankerSection, {
        target,
        props: { controller: rerankerSettingsController },
      })
      return () => unmount(component)
    },
  })
}
