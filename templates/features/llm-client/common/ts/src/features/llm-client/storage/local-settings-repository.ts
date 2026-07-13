import type { LlmSettings } from "../core/types"
import { createDefaultSettings, parseStoredSettings } from "../core/validation"
import {
  defaultLocalStorageFactory,
  settingsKey,
  type LocalStorageFactory,
} from "./storage-keys"

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
    parseStoredSettings(settings)
    const storage = await this.storageFactory()
    await storage.setItem(settingsKey(this.pluginName), settings)
  }
}
