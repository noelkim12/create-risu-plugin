import { mount, unmount } from "svelte"
import type { ContainerHost } from "../../ui/container-host"
import { aiServicesSectionRegistry, AI_SERVICE_SECTION_ORDER } from "../ai-services"
import { llmSettingsController } from "./runtime"
import LlmSettingsPanel from "./ui/LlmSettingsPanel.svelte"

export async function registerLlmClientFeature(host: ContainerHost): Promise<void> {
  void host
  aiServicesSectionRegistry.register({
    id: "llm",
    label: "LLM",
    order: AI_SERVICE_SECTION_ORDER.llm,
    mount: ({ target }) => {
      const component = mount(LlmSettingsPanel, {
        target,
        props: { controller: llmSettingsController },
      })
      return () => unmount(component)
    },
  })
}
