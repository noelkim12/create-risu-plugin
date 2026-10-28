import { PLUGIN_NAME } from "../../../constants/plugin"
import {
  AiServiceError,
  type LocalStorageFactory,
} from "../../ai-services"
import type { CredentialId, CredentialReferenceRepository } from "../../credential-manager"
import {
  isContextualEmbeddingConfigId,
  isContextualEmbeddingInputType,
  isContextualEmbeddingOutputDtype,
  isLinkedCredentialId,
  type ContextualEmbeddingConfig,
  type ContextualEmbeddingConfigDraft,
  type ContextualEmbeddingConfigId,
  type ContextualEmbeddingSettings,
} from "../core/types"
import { validateContextualEmbeddingDraft } from "../core/validation"

export function contextualEmbeddingSettingsKey(pluginName = PLUGIN_NAME): string {
  return `${pluginName}:contextual-embedding:settings:v1`
}

const CONFIG_FIELDS = [
  "id",
  "name",
  "provider",
  "model",
  "credentialId",
  "timeoutMs",
  "inputType",
  "outputDimension",
  "outputDtype",
  "base64",
  "updatedAt",
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every(key => allowed.includes(key))
}

function parseStoredConfig(value: unknown): ContextualEmbeddingConfig | null {
  if (!isRecord(value) || !hasOnlyKeys(value, CONFIG_FIELDS)) return null
  const { id, name, provider, model, credentialId, timeoutMs, inputType, outputDimension, outputDtype, base64, updatedAt } = value
  if (
    !isContextualEmbeddingConfigId(id)
    || typeof name !== "string"
    || name.trim().length === 0
    || provider !== "voyage"
    || typeof model !== "string"
    || model.trim().length === 0
    || (credentialId !== null && !isLinkedCredentialId(credentialId))
    || typeof timeoutMs !== "number"
    || !Number.isInteger(timeoutMs)
    || timeoutMs <= 0
    || (inputType !== null && !isContextualEmbeddingInputType(inputType))
    || (outputDimension !== null && (typeof outputDimension !== "number" || !Number.isInteger(outputDimension) || outputDimension <= 0))
    || !isContextualEmbeddingOutputDtype(outputDtype)
    || typeof base64 !== "boolean"
    || typeof updatedAt !== "number"
    || !Number.isFinite(updatedAt)
  ) {
    return null
  }
  return { id, name, provider, model, credentialId, timeoutMs, inputType, outputDimension, outputDtype, base64, updatedAt }
}

export function createDefaultContextualEmbeddingSettings(): ContextualEmbeddingSettings {
  return { schemaVersion: 1, configs: [] }
}

export function parseContextualEmbeddingSettings(value: unknown): ContextualEmbeddingSettings {
  if (!isRecord(value) || !hasOnlyKeys(value, ["schemaVersion", "configs"])) {
    throw new AiServiceError("CONFIG_INVALID", "Contextual embedding settings are invalid.")
  }
  const configs = value["configs"]
  if (value["schemaVersion"] !== 1 || !Array.isArray(configs)) {
    throw new AiServiceError("CONFIG_INVALID", "Contextual embedding settings are invalid.")
  }
  const parsed = configs.map(parseStoredConfig)
  if (parsed.some(config => config === null)) {
    throw new AiServiceError("CONFIG_INVALID", "Contextual embedding settings are invalid.")
  }
  const resolved = parsed.filter((config): config is ContextualEmbeddingConfig => config !== null)
  if (new Set(resolved.map(config => config.id)).size !== resolved.length) {
    throw new AiServiceError("CONFIG_INVALID", "Contextual embedding settings are invalid.")
  }
  return { schemaVersion: 1, configs: resolved }
}

function createConfigId(): ContextualEmbeddingConfigId {
  const value = crypto.randomUUID()
  if (!isContextualEmbeddingConfigId(value)) {
    throw new AiServiceError("CONFIG_INVALID", "Unable to create a contextual embedding configuration identifier.")
  }
  return value
}

export class LocalContextualEmbeddingConfigRepository implements CredentialReferenceRepository {
  private persistenceTail: Promise<void> = Promise.resolve()

  constructor(
    private readonly storageFactory: LocalStorageFactory = () => risuai.getLocalPluginStorage(),
    private readonly pluginName?: string,
    private readonly now: () => number = () => Date.now(),
  ) {}

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.persistenceTail.then(operation)
    this.persistenceTail = result.then(() => undefined, () => undefined)
    return result
  }

  async load(): Promise<ContextualEmbeddingSettings> {
    return this.enqueue(async () => {
      const storage = await this.storageFactory()
      const stored = await storage.getItem<unknown>(contextualEmbeddingSettingsKey(this.pluginName))
      return stored === null
        ? createDefaultContextualEmbeddingSettings()
        : structuredClone(parseContextualEmbeddingSettings(stored))
    })
  }

  async save(settings: ContextualEmbeddingSettings): Promise<void> {
    const validated = parseContextualEmbeddingSettings(settings)
    await this.enqueue(async () => {
      const storage = await this.storageFactory()
      await storage.setItem(contextualEmbeddingSettingsKey(this.pluginName), structuredClone(validated))
    })
  }

  async list(): Promise<readonly ContextualEmbeddingConfig[]> {
    return (await this.load()).configs
  }

  async get(id: ContextualEmbeddingConfigId): Promise<ContextualEmbeddingConfig | null> {
    return (await this.list()).find(config => config.id === id) ?? null
  }

  async create(draft: ContextualEmbeddingConfigDraft): Promise<ContextualEmbeddingConfig> {
    const validated = validateContextualEmbeddingDraft(draft)
    const settings = await this.load()
    const config: ContextualEmbeddingConfig = {
      id: createConfigId(),
      name: validated.name,
      provider: "voyage",
      model: validated.model,
      credentialId: validated.credentialId,
      timeoutMs: validated.timeoutMs,
      inputType: validated.inputType,
      outputDimension: validated.outputDimension,
      outputDtype: validated.outputDtype,
      base64: validated.base64,
      updatedAt: this.now(),
    }
    await this.save({ schemaVersion: 1, configs: [...settings.configs, config] })
    return config
  }

  async update(id: ContextualEmbeddingConfigId, draft: ContextualEmbeddingConfigDraft): Promise<ContextualEmbeddingConfig> {
    const validated = validateContextualEmbeddingDraft(draft)
    const settings = await this.load()
    if (!settings.configs.some(config => config.id === id)) {
      throw new AiServiceError("CONFIG_INVALID", "The contextual embedding configuration does not exist.")
    }
    const config: ContextualEmbeddingConfig = {
      id,
      name: validated.name,
      provider: "voyage",
      model: validated.model,
      credentialId: validated.credentialId,
      timeoutMs: validated.timeoutMs,
      inputType: validated.inputType,
      outputDimension: validated.outputDimension,
      outputDtype: validated.outputDtype,
      base64: validated.base64,
      updatedAt: this.now(),
    }
    await this.save({ schemaVersion: 1, configs: settings.configs.map(entry => entry.id === id ? config : entry) })
    return config
  }

  async delete(id: ContextualEmbeddingConfigId): Promise<void> {
    const settings = await this.load()
    if (!settings.configs.some(config => config.id === id)) {
      throw new AiServiceError("CONFIG_INVALID", "The contextual embedding configuration does not exist.")
    }
    await this.save({ schemaVersion: 1, configs: settings.configs.filter(config => config.id !== id) })
  }

  // Credential deletion fans out here before the secret is removed: referencing
  // configs stay saved with the credential link cleared.
  async unlinkCredential(credentialId: CredentialId): Promise<void> {
    const settings = await this.load()
    if (!settings.configs.some(config => config.credentialId === credentialId)) return
    await this.save({
      schemaVersion: 1,
      configs: settings.configs.map(config => config.credentialId === credentialId ? { ...config, credentialId: null } : config),
    })
  }
}
