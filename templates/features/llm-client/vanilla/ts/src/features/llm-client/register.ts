import { PLUGIN_DISPLAY_NAME, PLUGIN_NAME } from "../../constants/plugin"
import type { ContainerHost } from "../../ui/container-host"
import { llmSettingsController } from "./runtime"
import { mountLlmSettingsPanel } from "./ui/settings-panel"
import "./ui/settings-panel.css"

export async function registerLlmClientFeature(host: ContainerHost): Promise<void> {
  await risuai.registerSetting(
    `${PLUGIN_DISPLAY_NAME} LLM Settings`,
    () => host.open(({ target, close }) => {
      const mounted = mountLlmSettingsPanel(target, llmSettingsController, close)
      return () => mounted.destroy()
    }),
    '<span aria-hidden="true">LLM</span>',
    "html",
    `${PLUGIN_NAME}-llm-settings`,
  )
}
