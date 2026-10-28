import { mount, unmount } from "svelte"
import type { ContainerHost } from "../../ui/container-host"
import { AI_SERVICE_SECTION_ORDER, aiServicesSectionRegistry } from "../ai-services"
import { credentialManagerRuntime } from "./runtime"
import KeysSection from "./ui/KeysSection.svelte"

export async function registerCredentialManagerFeature(host: ContainerHost): Promise<void> {
  void host
  aiServicesSectionRegistry.register({
    id: "keys",
    label: "Keys",
    order: AI_SERVICE_SECTION_ORDER.keys,
    mount: ({ target }) => {
      const component = mount(KeysSection, {
        target,
        props: { controller: credentialManagerRuntime.controller },
      })
      return () => unmount(component)
    },
  })
}
