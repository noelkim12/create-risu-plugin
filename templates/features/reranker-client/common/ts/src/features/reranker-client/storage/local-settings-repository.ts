import {
  AiServiceError,
  type LocalStorageFactory,
} from "../../ai-services"
import type { CredentialId, CredentialReferenceRepository } from "../../credential-manager"
import { isLinkedCredentialId, isRerankerConfigId, type RerankerConfig, type RerankerSettings } from "../core/types"
import { rerankerSettingsKey } from "./storage-keys"

// The shared ai-services module keeps its storage factory internal, so this
// feature binds plugin storage directly through the same Risu API.
const defaultRerankerStorageFactory: LocalStorageFactory = () => risuai.getLocalPluginStorage()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every(key => allowed.includes(key))
}

function parseDefaults(value: unknown): RerankerConfig["defaults"] | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["topK", "returnDocuments", "truncation"])) {
    return null
  }
  const { topK, returnDocuments, truncation } = value
  if (
    (topK !== null && (typeof topK !== "number" || !Number.isInteger(topK) || topK < 1))
    || typeof returnDocuments !== "boolean"
    || typeof truncation !== "boolean"
  ) {
    return null
  }
  return { topK, returnDocuments, truncation }
}

function parseConfig(value: unknown): RerankerConfig | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["id", "name", "provider", "model", "credentialId", "timeoutMs", "defaults"])) {
    return null
  }
  const { id, name, provider, model, credentialId, timeoutMs, defaults } = value
  if (
    !isRerankerConfigId(id)
    || typeof name !== "string"
    || name.trim().length === 0
    || provider !== "voyage"
    || typeof model !== "string"
    || model.trim().length === 0
    || (credentialId !== null && !isLinkedCredentialId(credentialId))
    || typeof timeoutMs !== "number"
    || !Number.isInteger(timeoutMs)
    || timeoutMs < 1
  ) {
    return null
  }
  const parsedDefaults = parseDefaults(defaults)
  if (parsedDefaults === null) return null
  return { id, name, provider, model, credentialId, timeoutMs, defaults: parsedDefaults }
}

export function createDefaultRerankerSettings(): RerankerSettings {
  return { schemaVersion: 1, configs: [] }
}

export function parseRerankerSettings(value: unknown): RerankerSettings {
  if (!isRecord(value) || !hasOnlyKeys(value, ["schemaVersion", "configs"])) {
    throw new AiServiceError("CONFIG_INVALID", "Reranker settings are invalid.")
  }
  const configs = value["configs"]
  if (value["schemaVersion"] !== 1 || !Array.isArray(configs)) {
    throw new AiServiceError("CONFIG_INVALID", "Reranker settings are invalid.")
  }
  const parsed = configs.map(parseConfig)
  if (parsed.some(config => config === null)) {
    throw new AiServiceError("CONFIG_INVALID", "Reranker settings are invalid.")
  }
  const resolved = parsed.filter((config): config is RerankerConfig => config !== null)
  if (new Set(resolved.map(config => config.id)).size !== resolved.length) {
    throw new AiServiceError("CONFIG_INVALID", "Reranker settings are invalid.")
  }
  return { schemaVersion: 1, configs: resolved }
}

function cloneSettings(settings: RerankerSettings): RerankerSettings {
  return structuredClone(settings)
}

export class LocalRerankerSettingsRepository implements CredentialReferenceRepository {
  private persistenceTail: Promise<void> = Promise.resolve()

  constructor(
    private readonly storageFactory: LocalStorageFactory = defaultRerankerStorageFactory,
    private readonly pluginName?: string,
  ) {}

  async load(): Promise<RerankerSettings> {
    return this.enqueue(async () => {
      const storage = await this.storageFactory()
      const stored = await storage.getItem<unknown>(rerankerSettingsKey(this.pluginName))
      return stored === null ? createDefaultRerankerSettings() : cloneSettings(parseRerankerSettings(stored))
    })
  }

  async save(settings: RerankerSettings): Promise<void> {
    const validated = parseRerankerSettings(settings)
    await this.enqueue(async () => {
      const storage = await this.storageFactory()
      await storage.setItem(rerankerSettingsKey(this.pluginName), cloneSettings(validated))
    })
  }

  // Credential deletion clears the link on every referencing config; configs are retained.
  async unlinkCredential(credentialId: CredentialId): Promise<void> {
    const settings = await this.load()
    if (!settings.configs.some(config => config.credentialId === credentialId)) return
    await this.save({
      schemaVersion: 1,
      configs: settings.configs.map(config =>
        config.credentialId === credentialId ? { ...config, credentialId: null } : config,
      ),
    })
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.persistenceTail.then(operation)
    this.persistenceTail = result.then(() => undefined, () => undefined)
    return result
  }
}
