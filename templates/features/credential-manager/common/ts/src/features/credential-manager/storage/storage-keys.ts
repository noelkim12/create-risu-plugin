import { PLUGIN_NAME } from "../../../constants/plugin"
import type { LocalStorageFactory, LocalStoragePort } from "../../ai-services/storage/storage-keys"
import type { CredentialId, CredentialKind } from "../core/types"

export type { LocalStorageFactory, LocalStoragePort }
export { defaultLocalStorageFactory } from "../../ai-services/storage/storage-keys"

export function aiServicesSettingsKey(pluginName = PLUGIN_NAME): string {
  return `${pluginName}:ai-services:settings:v1`
}

export function retrievalCredentialSecretKey(credentialId: CredentialId, pluginName = PLUGIN_NAME): string {
  return `${pluginName}:ai-services:credential:${credentialId}:secret:v1`
}

export function savedCredentialKey(
  keyId: CredentialId,
  kind: Exclude<CredentialKind, "none">,
  pluginName = PLUGIN_NAME,
): string {
  return `${pluginName}:llm-client:credential:${keyId}:${kind}:v2`
}

export function savedCredentialPrefix(keyId: CredentialId, pluginName = PLUGIN_NAME): string {
  return `${pluginName}:llm-client:credential:${keyId}:`
}
