import { PLUGIN_NAME } from "../../../constants/plugin"
import type { LocalStorageFactory } from "../../ai-services"

export function embeddingSettingsKey(pluginName = PLUGIN_NAME): string {
  return `${pluginName}:embedding-client:settings:v1`
}

export const defaultEmbeddingStorageFactory: LocalStorageFactory = () => risuai.getLocalPluginStorage()
