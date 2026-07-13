import type { LlmSettings } from "../core/types"
import { createDefaultSettings, parseStoredSettings } from "../core/validation"
import {
  defaultLocalStorageFactory,
  settingsKey,
  type LocalStorageFactory,
} from "./storage-keys"

function sanitizeSettings(settings: LlmSettings): LlmSettings {
  const googleAiStudio = settings.providers["google-ai-studio"]
  const googleVertex = settings.providers["google-vertex"]
  const openAiCompatible = settings.providers["openai-compatible"]
  const ollama = settings.providers.ollama
  return {
    schemaVersion: 1,
    activeProvider: settings.activeProvider,
    providers: {
      "google-ai-studio": {
        provider: "google-ai-studio",
        model: googleAiStudio.model,
        timeoutMs: googleAiStudio.timeoutMs,
      },
      "google-vertex": {
        provider: "google-vertex",
        authMode: googleVertex.authMode,
        projectId: googleVertex.projectId,
        location: googleVertex.location,
        model: googleVertex.model,
        timeoutMs: googleVertex.timeoutMs,
      },
      "openai-compatible": {
        provider: "openai-compatible",
        baseUrl: openAiCompatible.baseUrl,
        authMode: openAiCompatible.authMode,
        customHeaderNames: [...openAiCompatible.customHeaderNames],
        model: openAiCompatible.model,
        timeoutMs: openAiCompatible.timeoutMs,
      },
      ollama: {
        provider: "ollama",
        baseUrl: ollama.baseUrl,
        authMode: ollama.authMode,
        model: ollama.model,
        timeoutMs: ollama.timeoutMs,
      },
    },
  }
}

export class LocalSettingsRepository {
  constructor(
    private readonly storageFactory: LocalStorageFactory = defaultLocalStorageFactory,
    private readonly pluginName?: string,
  ) {}

  async load(): Promise<LlmSettings> {
    const storage = await this.storageFactory()
    const value = await storage.getItem<unknown>(settingsKey(this.pluginName))
    if (value === null) return createDefaultSettings()
    return parseStoredSettings(value)
  }

  async save(settings: LlmSettings): Promise<void> {
    const validated = parseStoredSettings(settings)
    const storage = await this.storageFactory()
    await storage.setItem(settingsKey(this.pluginName), sanitizeSettings(validated))
  }
}
