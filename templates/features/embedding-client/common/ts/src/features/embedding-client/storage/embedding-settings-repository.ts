import type {
  LocalStorageFactory,
} from "../../ai-services"
import type { CredentialId, CredentialReferenceRepository } from "../../credential-manager"
import { createDefaultEmbeddingSettings, parseEmbeddingSettings } from "../core/config-parse"
import type { EmbeddingSettings } from "../core/types"
import { defaultEmbeddingStorageFactory, embeddingSettingsKey } from "./storage-keys"

function cloneSettings(settings: EmbeddingSettings): EmbeddingSettings {
  return structuredClone(settings)
}

export class LocalEmbeddingSettingsRepository implements CredentialReferenceRepository {
  private persistenceTail: Promise<void> = Promise.resolve()

  constructor(
    private readonly storageFactory: LocalStorageFactory = defaultEmbeddingStorageFactory,
    private readonly pluginName?: string,
  ) {}

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.persistenceTail.then(operation)
    this.persistenceTail = result.then(() => undefined, () => undefined)
    return result
  }

  async load(): Promise<EmbeddingSettings> {
    return this.enqueue(async () => {
      const storage = await this.storageFactory()
      const stored = await storage.getItem<unknown>(embeddingSettingsKey(this.pluginName))
      return stored === null ? createDefaultEmbeddingSettings() : cloneSettings(parseEmbeddingSettings(stored))
    })
  }

  async save(settings: EmbeddingSettings): Promise<void> {
    const validated = parseEmbeddingSettings(settings)
    await this.enqueue(async () => {
      const storage = await this.storageFactory()
      await storage.setItem(embeddingSettingsKey(this.pluginName), cloneSettings(validated))
    })
  }

  // Deleting a credential clears its link here; configs stay saved and unusable
  // until another credential is linked.
  async unlinkCredential(credentialId: CredentialId): Promise<void> {
    await this.enqueue(async () => {
      const storage = await this.storageFactory()
      const stored = await storage.getItem<unknown>(embeddingSettingsKey(this.pluginName))
      if (stored === null) return
      const settings = parseEmbeddingSettings(stored)
      if (!settings.configs.some(config => config.credentialId === credentialId)) return
      await storage.setItem(embeddingSettingsKey(this.pluginName), {
        schemaVersion: 1,
        configs: settings.configs.map(config =>
          config.credentialId === credentialId ? { ...config, credentialId: null } : config),
      })
    })
  }
}
