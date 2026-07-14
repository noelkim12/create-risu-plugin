import { mount, unmount } from "svelte"
import { PLUGIN_DISPLAY_NAME, PLUGIN_NAME } from "../../constants/plugin"
import type { ContainerHost } from "../../ui/container-host"
import { llmSettingsController } from "./runtime"
import LlmSettingsPanel from "./ui/LlmSettingsPanel.svelte"

export async function registerLlmClientFeature(host: ContainerHost): Promise<void> {
  await risuai.registerSetting(
    `${PLUGIN_DISPLAY_NAME} LLM Settings`,
    () => host.open(({ target, close }) => {
      const component = mount(LlmSettingsPanel, {
        target,
        props: { controller: llmSettingsController, onClose: close },
      })
      return () => unmount(component)
    }),
    '<span aria-hidden="true">LLM</span>',
    "html",
    `${PLUGIN_NAME}-llm-settings`,
  )
}
