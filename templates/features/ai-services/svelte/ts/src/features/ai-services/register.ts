import { mount, unmount } from "svelte"
import { PLUGIN_DISPLAY_NAME, PLUGIN_NAME } from "../../constants/plugin"
import type { ContainerHost } from "../../ui/container-host"
import { aiServicesSectionRegistry } from "./runtime"
import AiServicesPanel from "./ui/AiServicesPanel.svelte"

export async function registerAiServicesFeature(host: ContainerHost): Promise<void> {
  await risuai.registerSetting(
    `${PLUGIN_DISPLAY_NAME} AI Services`,
    // The registry is read when the setting opens so sections contributed by features
    // that register after this dependency are included.
    () => host.open(({ target, close }) => {
      const sections = aiServicesSectionRegistry.list()
      const component = mount(AiServicesPanel, { target, props: { sections, onClose: close } })
      return () => unmount(component)
    }),
    '<span aria-hidden="true">AI</span>',
    "html",
    `${PLUGIN_NAME}-ai-services`,
  )
}
