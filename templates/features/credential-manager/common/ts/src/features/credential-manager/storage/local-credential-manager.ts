import { AiServiceError } from "../../ai-services/core/errors"
import type { CredentialManagerRuntime, CredentialReferenceRepository } from "../contracts"
import type {
  ApiKeySecret,
  CredentialBinding,
  CredentialCreate,
  CredentialId,
  CredentialMetadata,
  CredentialStatus,
  CredentialSummary,
  CredentialUpdate,
  LegacyCatalogImportResult,
  LegacyCredentialCatalog,
  ResolvedCredential,
  VertexServiceAccountSecret,
} from "../core/types"
import {
  assertCredentialMatches,
  createResolvedCredential,
  matchesCredentialBinding,
  parseLegacyRetrievalCredential,
  parseCredentialMetadata,
  parseResolvedCredential,
} from "../core/validation"
import { CredentialReferenceRegistry } from "./credential-reference-registry"
import { LocalCredentialCatalogRepository } from "./local-credential-catalog-repository"
import {
  defaultLocalStorageFactory,
  retrievalCredentialSecretKey,
  savedCredentialKey,
  savedCredentialPrefix,
  type LocalStorageFactory,
  type LocalStoragePort,
} from "./storage-keys"

function maskSecret(value: string): string {
  return value.length <= 6 ? "***" : `${value.slice(0, 3)}…${value.slice(-3)}`
}

function sameRecord(left: unknown, right: unknown): boolean { return JSON.stringify(left) === JSON.stringify(right) }

type SecretSnapshot = {
  readonly keyId: CredentialId
  readonly storage: LocalStoragePort
  readonly records: readonly { readonly key: string; readonly value: unknown }[]
}

type SecretWrite = {
  readonly metadata: CredentialMetadata
  readonly secret: ApiKeySecret | VertexServiceAccountSecret | null
  readonly replacing: boolean
}

function safePersistenceError(error: unknown): AiServiceError {
  return error instanceof AiServiceError
    ? error
    : new AiServiceError("CONFIG_INVALID", "Unable to persist the saved credential.")
}

export class LocalCredentialManager implements CredentialManagerRuntime {
  private readonly storageFactory: LocalStorageFactory
  private readonly pluginName: string | undefined
  private readonly revision: () => string
  private readonly now: () => number

  constructor(
    private readonly dependencies: {
      readonly catalog: LocalCredentialCatalogRepository
      readonly references: CredentialReferenceRegistry
    },
    options: {
      readonly storageFactory?: LocalStorageFactory
      readonly pluginName?: string
      readonly revision?: () => string
      readonly now?: () => number
    } = {},
  ) {
    this.storageFactory = options.storageFactory ?? defaultLocalStorageFactory
    this.pluginName = options.pluginName
    this.revision = options.revision ?? (() => crypto.randomUUID())
    this.now = options.now ?? (() => Date.now())
  }

  async list(): Promise<readonly CredentialSummary[]> {
    const catalog = await this.dependencies.catalog.load()
    return Promise.all(catalog.savedKeys.map(async metadata => ({ ...metadata, ...(await this.statusFor(metadata)) })))
  }

  async listCompatible(binding: CredentialBinding): Promise<readonly CredentialSummary[]> {
    const summaries = await this.list()
    return summaries.filter(summary => matchesCredentialBinding(summary, binding))
  }

  async status(keyId: CredentialId): Promise<CredentialStatus | null> {
    const metadata = await this.getMetadata(keyId)
    return metadata === null ? null : this.statusFor(metadata)
  }

  async create(input: CredentialCreate): Promise<CredentialMetadata> {
    const metadata = this.metadataFrom(input)
    if (await this.getMetadata(metadata.id) !== null) {
      throw new AiServiceError("CONFIG_INVALID", "A saved key with this ID already exists.")
    }
    const storage = await this.storageFactory()
    const snapshots = [await this.captureSecretSnapshot(storage, metadata.id)]
    await this.mutateSecretRecords(snapshots, async () => {
      await this.writeSecret(storage, { metadata, secret: input.secret, replacing: false })
      const catalog = await this.dependencies.catalog.load()
      await this.saveCatalog(catalog.savedKeys, [...catalog.savedKeys, metadata])
    })
    return metadata
  }

  async update(keyId: CredentialId, input: CredentialUpdate): Promise<CredentialMetadata> {
    const existing = await this.getMetadata(keyId)
    if (existing === null) throw new AiServiceError("CREDENTIAL_MISSING", "The saved key does not exist.")
    const metadata = this.metadataFrom(input, keyId)
    const bindingChanged = existing.provider !== metadata.provider
      || existing.kind !== metadata.kind
      || existing.authMode !== metadata.authMode
      || existing.audience !== metadata.audience
    let secretToWrite = input.secret
    if (input.secret === undefined && bindingChanged) {
      if (metadata.kind === "none") secretToWrite = null
      else {
        throw new AiServiceError(
          "CONFIG_INVALID",
          "Changing a saved key binding requires replacing or clearing its secret.",
          { provider: metadata.provider },
        )
      }
    }
    if (secretToWrite === undefined) {
      const catalog = await this.dependencies.catalog.load()
      await this.saveCatalog(catalog.savedKeys, catalog.savedKeys.map(item => item.id === keyId ? metadata : item))
      return metadata
    }
    const storage = await this.storageFactory()
    const snapshots = [await this.captureSecretSnapshot(storage, keyId)]
    await this.mutateSecretRecords(snapshots, async () => {
      await this.writeSecret(storage, { metadata, secret: secretToWrite, replacing: true })
      const catalog = await this.dependencies.catalog.load()
      await this.saveCatalog(catalog.savedKeys, catalog.savedKeys.map(item => item.id === keyId ? metadata : item))
    })
    return metadata
  }

  async reveal(keyId: CredentialId): Promise<ResolvedCredential | null> {
    const metadata = await this.getMetadata(keyId)
    return metadata === null ? null : this.loadResolved(metadata)
  }

  async delete(keyId: CredentialId): Promise<void> {
    if (await this.getMetadata(keyId) === null) throw new AiServiceError("CREDENTIAL_MISSING", "The saved key does not exist.")
    const storage = await this.storageFactory()
    const snapshots = [await this.captureSecretSnapshot(storage, keyId)]
    await this.dependencies.references.unlinkCredential(keyId)
    await this.mutateSecretRecords(snapshots, async () => {
      await this.removeSecretRecords(storage, keyId)
      const catalog = await this.dependencies.catalog.load()
      await this.saveCatalog(catalog.savedKeys, catalog.savedKeys.filter(item => item.id !== keyId))
    })
  }

  async importLegacyCatalog(catalog: LegacyCredentialCatalog): Promise<LegacyCatalogImportResult> {
    const incomingKeys = catalog.keys.map(parseCredentialMetadata)
    const incomingCredentials = catalog.credentials.map(parseResolvedCredential)
    if (incomingKeys.some(key => key === null) || incomingCredentials.some(record => record === null)) {
      throw new AiServiceError("CONFIG_INVALID", "A migrated saved credential is invalid.")
    }
    const keys = incomingKeys.filter((key): key is CredentialMetadata => key !== null)
    const credentials = incomingCredentials.filter((record): record is ResolvedCredential => record !== null)
    const current = await this.dependencies.catalog.load()
    const merged = [...current.savedKeys]
    const conflicts = new Set<CredentialId>()
    const imported = new Set<CredentialId>()

    for (const key of keys) {
      const existing = merged.find(item => item.id === key.id)
      if (existing === undefined) {
        merged.push(key)
        imported.add(key.id)
      } else if (!sameRecord(existing, key)) {
        conflicts.add(key.id)
      }
    }

    const storage = await this.storageFactory()
    for (const credential of credentials) {
      const metadata = merged.find(item => item.id === credential.keyId)
      if (
        metadata === undefined || metadata.kind === "none" || metadata.provider !== credential.provider
        || metadata.kind !== credential.kind || metadata.audience !== credential.audience
      ) {
        conflicts.add(credential.keyId)
        continue
      }
      const existing = await this.loadStoredCredential(storage, credential.keyId)
      if (existing === null) {
        if ((await this.credentialKeysForId(storage, credential.keyId)).length !== 0) conflicts.add(credential.keyId)
        else imported.add(credential.keyId)
      } else if (!sameRecord(existing, credential)) {
        conflicts.add(credential.keyId)
      }
    }

    if (conflicts.size > 0) return { kind: "conflict", conflictingCredentialIds: [...conflicts] }
    if (imported.size === 0) return { kind: "unchanged" }
    const snapshots = await Promise.all(
      [...new Set(credentials.map(credential => credential.keyId))]
        .map(keyId => this.captureSecretSnapshot(storage, keyId)),
    )
    await this.mutateSecretRecords(snapshots, async () => {
      for (const credential of credentials) {
        const existing = await this.loadStoredCredential(storage, credential.keyId)
        if (existing === null) await storage.setItem(savedCredentialKey(credential.keyId, credential.kind, this.pluginName), credential)
      }
      if (!sameRecord(current.savedKeys, merged)) await this.saveCatalog(current.savedKeys, merged)
    })
    return { kind: "imported", importedCredentialIds: [...imported] }
  }

  registerReferences(repository: CredentialReferenceRepository): () => void {
    return this.dependencies.references.register(repository)
  }

  async resolveCredential(keyId: CredentialId, binding: CredentialBinding): Promise<ResolvedCredential> {
    const metadata = await this.getMetadata(keyId)
    if (metadata === null) throw new AiServiceError("CREDENTIAL_MISSING", "The saved key does not exist.")
    assertCredentialMatches(metadata, binding)
    const credential = await this.loadResolved(metadata)
    if (credential === null) throw new AiServiceError("CREDENTIAL_MISSING", "The saved-key secret is missing.")
    return credential
  }

  private metadataFrom(input: CredentialCreate | CredentialUpdate, id?: CredentialId): CredentialMetadata {
    const { secret: _secret, ...metadata } = input
    const parsed = parseCredentialMetadata({ ...metadata, id: id ?? this.createId(), updatedAt: this.now() })
    if (parsed === null) throw new AiServiceError("CONFIG_INVALID", "The saved key is invalid.")
    return parsed
  }

  private createId(): CredentialId {
    const id = crypto.randomUUID()
    const metadata = parseCredentialMetadata({
      id, name: "id", provider: "voyage", kind: "none", authMode: "none", audience: "unbound", updatedAt: 0,
    })
    if (metadata === null) throw new AiServiceError("CONFIG_INVALID", "Unable to create a saved-key identifier.")
    return metadata.id
  }

  private async getMetadata(keyId: CredentialId): Promise<CredentialMetadata | null> {
    return (await this.dependencies.catalog.load()).savedKeys.find(item => item.id === keyId) ?? null
  }

  private async statusFor(metadata: CredentialMetadata): Promise<CredentialStatus> {
    if (metadata.kind === "none") return { status: "not-required", credentialUpdatedAt: null, maskedSecret: null }
    const credential = await this.loadResolved(metadata)
    if (credential !== null) {
      return {
        status: "stored",
        credentialUpdatedAt: credential.updatedAt,
        maskedSecret: credential.kind === "api-key" ? maskSecret(credential.secret.apiKey) : "***",
      }
    }
    const storage = await this.storageFactory()
    const hasStoredValue = (await this.credentialKeysForId(storage, metadata.id)).length > 0
      || await storage.getItem<unknown>(retrievalCredentialSecretKey(metadata.id, this.pluginName)) !== null
    return { status: hasStoredValue ? "stale" : "missing", credentialUpdatedAt: null, maskedSecret: null }
  }

  private async writeSecret(storage: LocalStoragePort, write: SecretWrite): Promise<void> {
    const { metadata, secret, replacing } = write
    const candidates = await this.credentialKeysForId(storage, metadata.id)
    if (metadata.kind === "none") {
      if (secret !== null) throw new AiServiceError("CONFIG_INVALID", "A no-authentication key cannot store a secret.")
      await this.removeSecretRecords(storage, metadata.id)
      return
    }
    if (secret === null) {
      if (!replacing) throw new AiServiceError("CREDENTIAL_MISSING", "A saved-key secret is required.", { provider: metadata.provider })
      await this.removeSecretRecords(storage, metadata.id)
      return
    }
    if ((!replacing && candidates.length !== 0) || (replacing && candidates.length !== 1)) {
      throw new AiServiceError("CONFIG_INVALID", "Saved key credential records conflict.", { provider: metadata.provider })
    }
    const credential = createResolvedCredential({ metadata, secret, revision: this.revision(), updatedAt: this.now() })
    const targetKey = savedCredentialKey(credential.keyId, credential.kind, this.pluginName)
    await storage.setItem(targetKey, credential)
    for (const key of candidates) {
      if (key !== targetKey) await storage.removeItem(key)
    }
    await storage.removeItem(retrievalCredentialSecretKey(metadata.id, this.pluginName))
  }

  private async loadResolved(metadata: CredentialMetadata): Promise<ResolvedCredential | null> {
    if (metadata.kind === "none") return null
    const storage = await this.storageFactory()
    const candidates = await this.credentialKeysForId(storage, metadata.id)
    if (candidates.length === 0) return this.migrateLegacyRetrievalSecret(storage, metadata)
    const credential = await this.loadStoredCredential(storage, metadata.id)
    if (credential === null) return null
    if (
      metadata.provider !== credential.provider || metadata.kind !== credential.kind || metadata.audience !== credential.audience
    ) return null
    return credential
  }

  private async loadStoredCredential(storage: LocalStoragePort, keyId: CredentialId): Promise<ResolvedCredential | null> {
    const candidates = await this.credentialKeysForId(storage, keyId)
    if (candidates.length !== 1) return null
    const key = candidates[0]
    if (key === undefined) return null
    const record = parseResolvedCredential(await storage.getItem<unknown>(key))
    return record !== null && savedCredentialKey(record.keyId, record.kind, this.pluginName) === key ? record : null
  }

  private async migrateLegacyRetrievalSecret(
    storage: LocalStoragePort,
    metadata: CredentialMetadata,
  ): Promise<ResolvedCredential | null> {
    const legacy = await storage.getItem<unknown>(retrievalCredentialSecretKey(metadata.id, this.pluginName))
    const credential = parseLegacyRetrievalCredential(legacy, metadata, this.revision())
    if (credential === null) return null
    const snapshots = [await this.captureSecretSnapshot(storage, metadata.id)]
    await this.mutateSecretRecords(snapshots, async () => {
      await storage.setItem(savedCredentialKey(credential.keyId, credential.kind, this.pluginName), credential)
      await storage.removeItem(retrievalCredentialSecretKey(metadata.id, this.pluginName))
    })
    return credential
  }

  private async saveCatalog(
    previous: readonly CredentialMetadata[],
    next: readonly CredentialMetadata[],
  ): Promise<void> {
    try {
      await this.dependencies.catalog.save(next)
    } catch (error) {
      await this.dependencies.catalog.save(previous).then(
        () => undefined,
        () => undefined,
      )
      throw safePersistenceError(error)
    }
  }

  private async mutateSecretRecords(
    snapshots: readonly SecretSnapshot[],
    operation: () => Promise<void>,
  ): Promise<void> {
    try {
      await operation()
    } catch (error) {
      await this.restoreSecretSnapshots(snapshots).then(
        () => undefined,
        () => undefined,
      )
      throw safePersistenceError(error)
    }
  }

  private async captureSecretSnapshot(storage: LocalStoragePort, keyId: CredentialId): Promise<SecretSnapshot> {
    const records: { key: string; value: unknown }[] = []
    const keys = [...await this.credentialKeysForId(storage, keyId), retrievalCredentialSecretKey(keyId, this.pluginName)]
    for (const key of keys) {
      const value = await storage.getItem<unknown>(key)
      if (value !== null) records.push({ key, value })
    }
    return { keyId, storage, records }
  }

  private async restoreSecretSnapshots(snapshots: readonly SecretSnapshot[]): Promise<void> {
    for (const snapshot of snapshots) {
      await this.removeSecretRecords(snapshot.storage, snapshot.keyId)
      for (const record of snapshot.records) await snapshot.storage.setItem(record.key, record.value)
    }
  }

  private async removeSecretRecords(storage: LocalStoragePort, keyId: CredentialId): Promise<void> {
    for (const key of await this.credentialKeysForId(storage, keyId)) await storage.removeItem(key)
    await storage.removeItem(retrievalCredentialSecretKey(keyId, this.pluginName))
  }

  private async credentialKeysForId(storage: LocalStoragePort, keyId: CredentialId): Promise<readonly string[]> {
    return (await storage.keys()).filter((key: string) => key.startsWith(savedCredentialPrefix(keyId, this.pluginName)))
  }
}
