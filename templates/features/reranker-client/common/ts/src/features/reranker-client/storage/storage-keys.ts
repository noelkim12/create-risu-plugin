import { PLUGIN_NAME } from "../../../constants/plugin"

export function rerankerSettingsKey(pluginName = PLUGIN_NAME): string {
  return `${pluginName}:reranker-client:settings:v1`
}
