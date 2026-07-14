import { LlmError } from "../core/errors"
import type {
  CredentialSlot,
  GoogleVertexConfig,
  ProviderConfig,
  StoredCredential,
} from "../core/types"
import { buildChatCompletionsUrl } from "../network/url-policy"
import {
  credentialKey,
  defaultLocalStorageFactory,
  type LocalStorageFactory,
} from "./storage-keys"

export function credentialSlotFor(config: ProviderConfig): CredentialSlot {
  if (config.provider === "google-vertex") {
    return config.authMode === "api-key"
      ? "google-vertex-api-key"
      : "google-vertex-service-account"
  }
  return config.provider
}

export function credentialAudienceFor(config: ProviderConfig): string {
  switch (config.provider) {
    case "google-ai-studio": return "https://generativelanguage.googleapis.com"
    case "google-vertex": return config.authMode === "api-key"
      ? "https://aiplatform.googleapis.com"
      : `vertex:${config.projectId.trim()}:${config.location.trim()}`
    case "openai-compatible":
    case "ollama": return buildChatCompletionsUrl(config.baseUrl)
  }
}

export function createCredentialRecord(
  config: ProviderConfig,
  secret: Record<string, string>,
  revision: string = crypto.randomUUID(),
  updatedAt = Date.now(),
): StoredCredential {
  return {
    schemaVersion: 1,
    slot: credentialSlotFor(config),
    audience: credentialAudienceFor(config),
    revision,
    updatedAt,
    secret,
  }
}

function isStoredCredential(value: unknown, slot: CredentialSlot): value is StoredCredential {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  if (
    record["schemaVersion"] !== 1
    || record["slot"] !== slot
    || typeof record["audience"] !== "string"
    || typeof record["revision"] !== "string"
    || typeof record["updatedAt"] !== "number"
    || typeof record["secret"] !== "object"
    || record["secret"] === null
    || Array.isArray(record["secret"])
  ) {
    return false
  }
  return Object.values(record["secret"]).every(secret => typeof secret === "string")
}

export function parseServiceAccountJson(value: string, config: GoogleVertexConfig): Record<string, string> {
  let decoded: unknown
  try {
    decoded = JSON.parse(value)
  } catch {
    throw new LlmError("CONFIG_INVALID", "Service Account JSON is not valid JSON.", "google-vertex")
  }
  if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) {
    throw new LlmError("CONFIG_INVALID", "Service Account JSON must be an object.", "google-vertex")
  }
  const parsed = decoded as Record<string, unknown>
  if (parsed["type"] !== "service_account") {
    throw new LlmError("CONFIG_INVALID", "Credential type must be service_account.", "google-vertex")
  }
  if (parsed["token_uri"] !== undefined && parsed["token_uri"] !== "https://oauth2.googleapis.com/token") {
    throw new LlmError("CONFIG_INVALID", "Service Account token_uri must use Google's OAuth endpoint.", "google-vertex")
  }
  const clientEmail = typeof parsed["client_email"] === "string" ? parsed["client_email"].trim() : ""
  const privateKey = typeof parsed["private_key"] === "string" ? parsed["private_key"] : ""
  const projectId = typeof parsed["project_id"] === "string" ? parsed["project_id"].trim() : config.projectId.trim()
  if (!clientEmail || !privateKey || !projectId) {
    throw new LlmError("CONFIG_INVALID", "Service Account JSON requires project_id, client_email, and private_key.", "google-vertex")
  }
  if (
    !privateKey.includes("-----BEGIN PRIVATE KEY-----")
    || !privateKey.includes("-----END PRIVATE KEY-----")
  ) {
    throw new LlmError("CONFIG_INVALID", "Service Account private_key must be PKCS#8 PEM.", "google-vertex")
  }
  return {
    projectId,
    clientEmail,
    privateKey,
    ...(typeof parsed["private_key_id"] === "string" ? { privateKeyId: parsed["private_key_id"] } : {}),
  }
}

export class LocalCredentialRepository {
  constructor(
    private readonly storageFactory: LocalStorageFactory = defaultLocalStorageFactory,
    private readonly pluginName?: string,
    private readonly revision: () => string = (): string => crypto.randomUUID(),
    private readonly now: () => number = () => Date.now(),
  ) {}

  async load(config: ProviderConfig): Promise<StoredCredential | null> {
    const slot = credentialSlotFor(config)
    const storage = await this.storageFactory()
    const record = await storage.getItem<unknown>(credentialKey(slot, this.pluginName))
    if (!isStoredCredential(record, slot)) return null
    return record.audience === credentialAudienceFor(config) ? record : null
  }

  async has(config: ProviderConfig): Promise<boolean> {
    return (await this.load(config)) !== null
  }

  async status(config: ProviderConfig): Promise<"missing" | "stored" | "stale"> {
    const storage = await this.storageFactory()
    const slot = credentialSlotFor(config)
    const record = await storage.getItem<unknown>(credentialKey(slot, this.pluginName))
    if (record === null) return "missing"
    return isStoredCredential(record, slot) && record.audience === credentialAudienceFor(config)
      ? "stored"
      : "stale"
  }

  private async save(config: ProviderConfig, secret: Record<string, string>): Promise<void> {
    const slot = credentialSlotFor(config)
    const record = createCredentialRecord(config, secret, this.revision(), this.now())
    const storage = await this.storageFactory()
    await storage.setItem(credentialKey(slot, this.pluginName), record)
  }

  async saveApiKey(
    config: ProviderConfig,
    apiKey: string,
    customHeaders: Readonly<Record<string, string>>,
  ): Promise<void> {
    await this.save(config, { ...customHeaders, apiKey: apiKey.trim() })
  }

  async saveServiceAccountJson(config: GoogleVertexConfig, value: string): Promise<void> {
    if (config.authMode !== "service-account") {
      throw new LlmError("CONFIG_INVALID", "Select Service Account authentication before saving JSON.", "google-vertex")
    }
    await this.save(config, parseServiceAccountJson(value, config))
  }

  async clear(config: ProviderConfig): Promise<void> {
    const storage = await this.storageFactory()
    await storage.removeItem(credentialKey(credentialSlotFor(config), this.pluginName))
  }

  async clearProvider(provider: ProviderConfig["provider"]): Promise<void> {
    const slots: CredentialSlot[] = provider === "google-vertex"
      ? ["google-vertex-api-key", "google-vertex-service-account"]
      : [provider]
    const storage = await this.storageFactory()
    await Promise.all(slots.map(slot => storage.removeItem(credentialKey(slot, this.pluginName))))
  }
}
