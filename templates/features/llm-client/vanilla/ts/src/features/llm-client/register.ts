import type { ContainerHost } from "../../ui/container-host"
import { aiServicesSectionRegistry, AI_SERVICE_SECTION_ORDER } from "../ai-services"
import { llmSettingsController } from "./runtime"
import { mountLlmSettingsPanel } from "./ui/settings-panel"
import "./ui/settings-panel.css"

export async function registerLlmClientFeature(host: ContainerHost): Promise<void> {
  void host
  aiServicesSectionRegistry.register({
    id: "llm",
    label: "LLM",
    order: AI_SERVICE_SECTION_ORDER.llm,
    mount: ({ target }) => {
      const mounted = mountLlmSettingsPanel(target, llmSettingsController)
      return () => mounted.destroy()
    },
  })
}
