import { describe, expect, it } from "vitest"

import { MemoryLocalStorage } from "../../helpers/memory-local-storage"
import {
  isCredentialId,
  type CredentialBinding,
  type CredentialId,
  type CredentialMetadata,
  type LegacyCredentialCatalog,
  type ResolvedCredential,
} from "../../../templates/features/credential-manager/common/ts/src/features/credential-manager"
import { CredentialReferenceRegistry } from "../../../templates/features/credential-manager/common/ts/src/features/credential-manager/storage/credential-reference-registry"
import { LocalCredentialCatalogRepository } from "../../../templates/features/credential-manager/common/ts/src/features/credential-manager/storage/local-credential-catalog-repository"
import { LocalCredentialManager } from "../../../templates/features/credential-manager/common/ts/src/features/credential-manager/storage/local-credential-manager"
import {
  aiServicesSettingsKey,
  retrievalCredentialSecretKey,
  savedCredentialKey,
} from "../../../templates/features/credential-manager/common/ts/src/features/credential-manager/storage/storage-keys"

const KEY_ID_TEXT = "11111111-1111-4111-8111-111111111111"
if (!isCredentialId(KEY_ID_TEXT)) throw new TypeError("Expected a credential fixture ID.")
const KEY_ID: CredentialId = KEY_ID_TEXT
const PLUGIN_NAME = "credential-manager-persistence-recovery-test"

const binding = {
  provider: "voyage",
  kind: "api-key",
  authMode: "bearer",
  audience: "https://api.voyageai.com",
} satisfies CredentialBinding

const vertexBinding = {
  provider: "google-vertex",
  kind: "vertex-service-account",
  authMode: "service-account",
  audience: "vertex:project:global",
} satisfies CredentialBinding

class InterruptingStorage extends MemoryLocalStorage {
  failNextSetKey: string | null = null
  failNextRemoveKey: string | null = null

  override async setItem<T>(key: string, value: T): Promise<void> {
    await super.setItem(key, value)
    if (key === this.failNextSetKey) {
      this.failNextSetKey = null
      throw new Error("simulated storage set interruption")
    }
  }

  override async removeItem(key: string): Promise<void> {
    await super.removeItem(key)
    if (key === this.failNextRemoveKey) {
      this.failNextRemoveKey = null
      throw new Error("simulated storage removal interruption")
    }
  }
}

function metadata(): CredentialMetadata {
  return { id: KEY_ID, name: "Voyage", ...binding, updatedAt: 10 }
}

function credential(value = "credential-material"): ResolvedCredential {
  return {
    schemaVersion: 2,
    keyId: KEY_ID,
    provider: "voyage",
    kind: "api-key",
    audience: binding.audience,
    revision: "revision-1",
    updatedAt: 10,
    secret: { apiKey: value },
  }
}

function legacyCatalog(): LegacyCredentialCatalog {
  return { keys: [metadata()], credentials: [credential()] }
}

function createManager(storage: MemoryLocalStorage): LocalCredentialManager {
  return new LocalCredentialManager(
    {
      catalog: new LocalCredentialCatalogRepository(() => Promise.resolve(storage), PLUGIN_NAME),
      references: new CredentialReferenceRegistry(),
    },
    {
      storageFactory: () => Promise.resolve(storage),
      pluginName: PLUGIN_NAME,
      revision: () => "revision-2",
      now: () => 20,
    },
  )
}

async function seed(manager: LocalCredentialManager): Promise<void> {
  await manager.importLegacyCatalog(legacyCatalog())
}

function createInput() {
  return { name: "Voyage", ...binding, secret: { apiKey: "credential-material" } }
}

describe("LocalCredentialManager persistence recovery", () => {
  it("removes a newly created secret when catalog persistence rejects", async () => {
    const storage = new InterruptingStorage()
    const manager = createManager(storage)
    storage.failNextSetKey = aiServicesSettingsKey(PLUGIN_NAME)

    await expect(manager.create(createInput())).rejects.toMatchObject({ code: "CONFIG_INVALID" })

    expect(await manager.list()).toEqual([])
    expect([...storage.values.keys()].some(key => key.includes(":llm-client:credential:"))).toBe(false)
  })

  it("restores the previous credential record when update catalog persistence rejects", async () => {
    const storage = new InterruptingStorage()
    const manager = createManager(storage)
    await seed(manager)
    const catalogBefore = structuredClone(storage.values.get(aiServicesSettingsKey(PLUGIN_NAME)))
    const secretBefore = structuredClone(storage.values.get(savedCredentialKey(KEY_ID, "api-key", PLUGIN_NAME)))
    storage.failNextSetKey = aiServicesSettingsKey(PLUGIN_NAME)

    await expect(manager.update(KEY_ID, { ...binding, name: "Renamed", secret: { apiKey: "replacement" } }))
      .rejects.toMatchObject({ code: "CONFIG_INVALID" })

    expect(storage.values.get(aiServicesSettingsKey(PLUGIN_NAME))).toEqual(catalogBefore)
    expect(storage.values.get(savedCredentialKey(KEY_ID, "api-key", PLUGIN_NAME))).toEqual(secretBefore)
  })

  it("restores the previous credential record when update cleanup is interrupted", async () => {
    const storage = new InterruptingStorage()
    const manager = createManager(storage)
    await seed(manager)
    const catalogBefore = structuredClone(storage.values.get(aiServicesSettingsKey(PLUGIN_NAME)))
    const secretBefore = structuredClone(storage.values.get(savedCredentialKey(KEY_ID, "api-key", PLUGIN_NAME)))
    storage.failNextRemoveKey = savedCredentialKey(KEY_ID, "api-key", PLUGIN_NAME)

    await expect(manager.update(KEY_ID, {
      ...vertexBinding,
      name: "Vertex",
      secret: {
        projectId: "project",
        location: "global",
        clientEmail: "service@example.test",
        privateKey: "-----BEGIN PRIVATE KEY-----\nMAoCAQAwAwYBKgQA\n-----END PRIVATE KEY-----",
      },
    })).rejects.toMatchObject({ code: "CONFIG_INVALID" })

    expect(storage.values.get(aiServicesSettingsKey(PLUGIN_NAME))).toEqual(catalogBefore)
    expect(storage.values.get(savedCredentialKey(KEY_ID, "api-key", PLUGIN_NAME))).toEqual(secretBefore)
    expect(storage.values.has(savedCredentialKey(KEY_ID, "vertex-service-account", PLUGIN_NAME))).toBe(false)
  })

  it("removes imported secret material when catalog persistence rejects", async () => {
    const storage = new InterruptingStorage()
    const manager = createManager(storage)
    storage.failNextSetKey = aiServicesSettingsKey(PLUGIN_NAME)

    await expect(manager.importLegacyCatalog(legacyCatalog())).rejects.toMatchObject({ code: "CONFIG_INVALID" })

    expect(await manager.list()).toEqual([])
    expect(storage.values.has(savedCredentialKey(KEY_ID, "api-key", PLUGIN_NAME))).toBe(false)
    await expect(manager.importLegacyCatalog(legacyCatalog())).resolves.toMatchObject({ kind: "imported" })
  })

  it("removes imported secret material when its storage write is interrupted", async () => {
    const storage = new InterruptingStorage()
    const manager = createManager(storage)
    storage.failNextSetKey = savedCredentialKey(KEY_ID, "api-key", PLUGIN_NAME)

    await expect(manager.importLegacyCatalog(legacyCatalog())).rejects.toMatchObject({ code: "CONFIG_INVALID" })

    expect(await manager.list()).toEqual([])
    expect(storage.values.has(savedCredentialKey(KEY_ID, "api-key", PLUGIN_NAME))).toBe(false)
  })

  it("restores metadata and secret material when delete catalog persistence rejects", async () => {
    const storage = new InterruptingStorage()
    const manager = createManager(storage)
    await seed(manager)
    const catalogBefore = structuredClone(storage.values.get(aiServicesSettingsKey(PLUGIN_NAME)))
    const secretBefore = structuredClone(storage.values.get(savedCredentialKey(KEY_ID, "api-key", PLUGIN_NAME)))
    storage.failNextSetKey = aiServicesSettingsKey(PLUGIN_NAME)

    await expect(manager.delete(KEY_ID)).rejects.toMatchObject({ code: "CONFIG_INVALID" })

    expect(storage.values.get(aiServicesSettingsKey(PLUGIN_NAME))).toEqual(catalogBefore)
    expect(storage.values.get(savedCredentialKey(KEY_ID, "api-key", PLUGIN_NAME))).toEqual(secretBefore)
  })

  it("restores metadata and secret material when delete secret removal is interrupted", async () => {
    const storage = new InterruptingStorage()
    const manager = createManager(storage)
    await seed(manager)
    const catalogBefore = structuredClone(storage.values.get(aiServicesSettingsKey(PLUGIN_NAME)))
    const secretBefore = structuredClone(storage.values.get(savedCredentialKey(KEY_ID, "api-key", PLUGIN_NAME)))
    storage.failNextRemoveKey = savedCredentialKey(KEY_ID, "api-key", PLUGIN_NAME)

    await expect(manager.delete(KEY_ID)).rejects.toMatchObject({ code: "CONFIG_INVALID" })

    expect(storage.values.get(aiServicesSettingsKey(PLUGIN_NAME))).toEqual(catalogBefore)
    expect(storage.values.get(savedCredentialKey(KEY_ID, "api-key", PLUGIN_NAME))).toEqual(secretBefore)
  })

  it("restores legacy material when lazy migration cleanup is interrupted", async () => {
    const storage = new InterruptingStorage()
    storage.values.set(aiServicesSettingsKey(PLUGIN_NAME), { schemaVersion: 2, savedKeys: [metadata()] })
    storage.values.set(retrievalCredentialSecretKey(KEY_ID, PLUGIN_NAME), {
      schemaVersion: 1,
      credentialId: KEY_ID,
      provider: "voyage",
      audience: binding.audience,
      apiKey: "legacy-material",
      updatedAt: 10,
    })
    const manager = createManager(storage)
    const legacyBefore = structuredClone(storage.values.get(retrievalCredentialSecretKey(KEY_ID, PLUGIN_NAME)))
    storage.failNextRemoveKey = retrievalCredentialSecretKey(KEY_ID, PLUGIN_NAME)

    await expect(manager.reveal(KEY_ID)).rejects.toMatchObject({ code: "CONFIG_INVALID" })

    expect(storage.values.get(retrievalCredentialSecretKey(KEY_ID, PLUGIN_NAME))).toEqual(legacyBefore)
    expect(storage.values.has(savedCredentialKey(KEY_ID, "api-key", PLUGIN_NAME))).toBe(false)
  })
})
