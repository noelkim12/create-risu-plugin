import type { LocalStorageFactory } from "../../ai-services/storage/storage-keys"
import { defaultLocalStorageFactory } from "../../ai-services/storage/storage-keys"
import type { CredentialReferenceRepository } from "../../credential-manager/contracts"
import type { CredentialId } from "../../credential-manager/core/types"
import { credentialManagerRuntime } from "../../credential-manager/runtime"
import { LlmError } from "../core/errors"
import type { CredentialSlot, LlmSettings } from "../core/types"
import { createDefaultSettings, parseStoredSettings, parseStoredSettingsDocument } from "../core/validation"
import { legacyCredentialKey, settingsKey } from "./storage-keys"

const LEGACY_SLOTS = [
  "google-ai-studio",
  "google-vertex-service-account",
  "openai-compatible",
  "ollama",
] as const satisfies readonly CredentialSlot[]

function cloneSettings(settings: LlmSettings): LlmSettings {
  return structuredClone(settings)
}

function hash32(value: string, seed: number): number {
  let hash = seed
  for (const character of value) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619)
  }
  return hash >>> 0
}

function stableUuid(value: string): string {
  const hex = [2_166_136_261, 2_166_136_262, 2_166_136_263, 2_166_136_264]
    .map(seed => hash32(value, seed).toString(16).padStart(8, "0"))
    .join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

function migrationIdGenerator(value: unknown, pluginName?: string): () => string {
  const seed = `${settingsKey(pluginName)}:${JSON.stringify(value)}`
  let ordinal = 0
  return () => stableUuid(`${seed}:${ordinal++}`)
}

export class LocalSettingsRepository implements CredentialReferenceRepository {
  private persistenceTail: Promise<void> = Promise.resolve()

  constructor(
    private readonly storageFactory: LocalStorageFactory = defaultLocalStorageFactory,
    private readonly pluginName?: string,
  ) {}

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.persistenceTail.then(operation)
    this.persistenceTail = result.then(() => undefined, () => undefined)
    return result
  }

  async load(): Promise<LlmSettings> {
    return this.enqueue(async () => {
      const storage = await this.storageFactory()
      const stored = await storage.getItem<unknown>(settingsKey(this.pluginName))
      if (stored === null) return createDefaultSettings()
      const legacyValues = await Promise.all(LEGACY_SLOTS.map(slot => (
        storage.getItem<unknown>(legacyCredentialKey(slot, this.pluginName))
      )))
      const legacyCredentials = legacyValues.filter((value): value is {} => value !== null)
      const parsed = parseStoredSettingsDocument(stored, {
        legacyCredentials,
        generateId: migrationIdGenerator(stored, this.pluginName),
      })
      if (parsed.requiresPersistence) {
        const result = await credentialManagerRuntime.manager.importLegacyCatalog(parsed.legacyCatalog)
        if (result.kind === "conflict") {
          throw new LlmError("CONFIG_INVALID", "A saved credential conflicts with stored material.")
        }
        await storage.setItem(settingsKey(this.pluginName), cloneSettings(parsed.settings))
      }
      return cloneSettings(parsed.settings)
    })
  }

  async save(settings: LlmSettings): Promise<void> {
    const validated = parseStoredSettings(settings)
    await this.enqueue(async () => {
      const storage = await this.storageFactory()
      await storage.setItem(settingsKey(this.pluginName), cloneSettings(validated))
    })
  }

  async unlinkCredential(keyId: CredentialId): Promise<void> {
    const settings = await this.load()
    if (!settings.savedModelConfigs.some(model => model.keyId === keyId)) return
    await this.save({
      ...settings,
      savedModelConfigs: settings.savedModelConfigs.map(model => model.keyId === keyId ? { ...model, keyId: null } : model),
    })
  }
}
