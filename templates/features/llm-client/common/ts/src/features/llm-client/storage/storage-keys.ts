import { PLUGIN_NAME } from "../../../constants/plugin"
import type { CredentialSlot } from "../core/types"

export function settingsKey(pluginName = PLUGIN_NAME): string {
  return `${pluginName}:llm-client:settings:v1`
}

export function legacyCredentialKey(slot: CredentialSlot, pluginName = PLUGIN_NAME): string {
  return `${pluginName}:llm-client:credential:${slot}:v1`
}
