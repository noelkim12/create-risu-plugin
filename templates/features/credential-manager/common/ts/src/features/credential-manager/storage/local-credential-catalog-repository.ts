import { VOYAGE_RETRIEVAL_ENDPOINT } from "../../ai-services/providers/retrieval-endpoint"
import { AiServiceError } from "../../ai-services/core/errors"
import { validateEndpointUrl } from "../../ai-services/network/url-policy"
import type { CredentialMetadata } from "../core/types"
import { isCredentialId, parseCredentialMetadata } from "../core/validation"
import { aiServicesSettingsKey, defaultLocalStorageFactory, type LocalStorageFactory } from "./storage-keys"

type CredentialCatalog = {
  readonly schemaVersion: 2
  readonly savedKeys: readonly CredentialMetadata[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every(key => allowed.includes(key))
}

function migrateLegacyMetadata(value: unknown): CredentialMetadata | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["id", "name", "provider", "authMode", "audience", "updatedAt"])) return null
  const { id, name, provider, authMode, audience, updatedAt } = value
  if (
    !isCredentialId(id) || typeof name !== "string" || name.trim() === ""
    || (provider !== "voyage" && provider !== "openai-compatible") || (authMode !== "bearer" && authMode !== "none")
    || typeof audience !== "string" || audience === "" || typeof updatedAt !== "number" || !Number.isFinite(updatedAt)
  ) return null
  if (provider === "voyage" && (authMode !== "bearer" || audience !== VOYAGE_RETRIEVAL_ENDPOINT)) return null
  if (provider === "openai-compatible" && validateEndpointUrl(audience) !== null) return null
  if (authMode === "none") {
    return { id, name: name.trim(), provider, kind: "none", authMode, audience, updatedAt }
  }
  return { id, name: name.trim(), provider, kind: "api-key", authMode, audience, updatedAt }
}

function validateCatalog(keys: readonly CredentialMetadata[]): CredentialCatalog {
  if (new Set(keys.map(key => key.id)).size !== keys.length) {
    throw new AiServiceError("CONFIG_INVALID", "AI Services settings contain duplicate saved-key IDs.")
  }
  return { schemaVersion: 2, savedKeys: structuredClone(keys) }
}

function parseDocument(value: unknown): { readonly catalog: CredentialCatalog; readonly migrated: boolean } {
  if (!isRecord(value)) throw new AiServiceError("CONFIG_INVALID", "AI Services settings are invalid.")
  if (value["schemaVersion"] === 2 && hasOnlyKeys(value, ["schemaVersion", "savedKeys"])) {
    const savedKeys = value["savedKeys"]
    if (!Array.isArray(savedKeys)) throw new AiServiceError("CONFIG_INVALID", "AI Services settings are invalid.")
    const parsed = savedKeys.map(parseCredentialMetadata)
    if (parsed.some(key => key === null)) throw new AiServiceError("CONFIG_INVALID", "AI Services settings are invalid.")
    return { catalog: validateCatalog(parsed.filter((key): key is CredentialMetadata => key !== null)), migrated: false }
  }
  if (value["schemaVersion"] === 1 && hasOnlyKeys(value, ["schemaVersion", "credentials"])) {
    const credentials = value["credentials"]
    if (!Array.isArray(credentials)) throw new AiServiceError("CONFIG_INVALID", "AI Services settings are invalid.")
    const parsed = credentials.map(migrateLegacyMetadata)
    if (parsed.some(key => key === null)) throw new AiServiceError("CONFIG_INVALID", "AI Services settings are invalid.")
    return { catalog: validateCatalog(parsed.filter((key): key is CredentialMetadata => key !== null)), migrated: true }
  }
  throw new AiServiceError("CONFIG_INVALID", "AI Services settings are invalid.")
}

export class LocalCredentialCatalogRepository {
  private persistenceTail: Promise<void> = Promise.resolve()

  constructor(
    private readonly storageFactory: LocalStorageFactory = defaultLocalStorageFactory,
    private readonly pluginName?: string,
  ) {}

  async load(): Promise<CredentialCatalog> {
    return this.enqueue(async () => {
      const storage = await this.storageFactory()
      const key = aiServicesSettingsKey(this.pluginName)
      const stored = await storage.getItem<unknown>(key)
      if (stored === null) return { schemaVersion: 2, savedKeys: [] }
      const parsed = parseDocument(stored)
      if (parsed.migrated) await storage.setItem(key, parsed.catalog)
      return structuredClone(parsed.catalog)
    })
  }

  async save(keys: readonly CredentialMetadata[]): Promise<void> {
    const catalog = validateCatalog(keys)
    await this.enqueue(async () => {
      const storage = await this.storageFactory()
      await storage.setItem(aiServicesSettingsKey(this.pluginName), structuredClone(catalog))
    })
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.persistenceTail.then(operation)
    this.persistenceTail = result.then(() => undefined, () => undefined)
    return result
  }
}
