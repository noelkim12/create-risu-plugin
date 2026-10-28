import type { ContainerHost } from "../../ui/container-host"
import { AI_SERVICE_SECTION_ORDER, aiServicesSectionRegistry } from "../ai-services"
import { credentialManagerRuntime } from "./runtime"
import { mountKeysPanel } from "./ui/keys-panel"

export async function registerCredentialManagerFeature(host: ContainerHost): Promise<void> {
  void host
  aiServicesSectionRegistry.register({
    id: "keys",
    label: "Keys",
    order: AI_SERVICE_SECTION_ORDER.keys,
    mount: ({ target }) => mountKeysPanel(target, credentialManagerRuntime.controller),
  })
}
