import { PLUGIN_NAME } from "../../../constants/plugin"
import type { CredentialSlot } from "../core/types"

export interface LocalStoragePort {
  getItem<T>(key: string): Promise<T | null>
  setItem<T>(key: string, value: T): Promise<void>
  removeItem(key: string): Promise<void>
  keys(): Promise<string[]>
  clear(): Promise<void>
}

export type LocalStorageFactory = () => Promise<LocalStoragePort>

export const defaultLocalStorageFactory: LocalStorageFactory = () => risuai.getLocalPluginStorage()

export function settingsKey(pluginName = PLUGIN_NAME): string {
  return `${pluginName}:llm-client:settings:v1`
}

export function credentialKey(slot: CredentialSlot, pluginName = PLUGIN_NAME): string {
  return `${pluginName}:llm-client:credential:${slot}:v1`
}
