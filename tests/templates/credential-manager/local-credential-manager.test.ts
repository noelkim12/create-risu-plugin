import { describe, expect, it } from "vitest"

import { MemoryLocalStorage } from "../../helpers/memory-local-storage"
import {
  isCredentialId,
  type CredentialBinding,
  type CredentialId,
  type CredentialMetadata,
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
const PLUGIN_NAME = "credential-manager-test"

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

function metadata(name = "Voyage"): CredentialMetadata {
  return { id: KEY_ID, name, ...binding, updatedAt: 10 }
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

async function importStoredCredential(manager: LocalCredentialManager): Promise<void> {
  await manager.importLegacyCatalog({ keys: [metadata()], credentials: [credential()] })
}

describe("credential-manager saved-key repository", () => {
  it("lazily migrates legacy retrieval material and shares one exact matcher for compatibility and resolution", async () => {
    const storage = new MemoryLocalStorage()
    storage.values.set(aiServicesSettingsKey(PLUGIN_NAME), {
      schemaVersion: 1,
      credentials: [{
        id: KEY_ID,
        name: "Legacy Voyage",
        provider: "voyage",
        authMode: "bearer",
        audience: binding.audience,
        updatedAt: 10,
      }],
    })
    storage.values.set(retrievalCredentialSecretKey(KEY_ID, PLUGIN_NAME), {
      schemaVersion: 1,
      credentialId: KEY_ID,
      provider: "voyage",
      audience: binding.audience,
      apiKey: "legacy-material",
      updatedAt: 10,
    })
    const manager = createManager(storage)

    const summaries = await manager.listCompatible(binding)
    const resolved = await manager.resolveCredential(KEY_ID, binding)

    expect(summaries).toEqual([expect.objectContaining({ id: KEY_ID, status: "stored" })])
    expect(JSON.stringify(summaries)).not.toContain("legacy-material")
    expect(resolved).toMatchObject({ keyId: KEY_ID, kind: "api-key" })
    expect(storage.values.get(aiServicesSettingsKey(PLUGIN_NAME))).toMatchObject({ schemaVersion: 2 })
    expect(storage.values.has(retrievalCredentialSecretKey(KEY_ID, PLUGIN_NAME))).toBe(false)
    await expect(manager.listCompatible({ ...binding, audience: "https://other.example" })).resolves.toEqual([])
    await expect(manager.resolveCredential(KEY_ID, { ...binding, audience: "https://other.example" }))
      .rejects.toMatchObject({ code: "CREDENTIAL_SCOPE_MISMATCH" })
  })

  it("reports a conflicting legacy import without overwriting stored metadata or secret material", async () => {
    const storage = new MemoryLocalStorage()
    const manager = createManager(storage)
    await expect(manager.importLegacyCatalog({ keys: [metadata()], credentials: [credential()] }))
      .resolves.toMatchObject({ kind: "imported" })
    const metadataBefore = structuredClone(storage.values.get(aiServicesSettingsKey(PLUGIN_NAME)))
    const secretBefore = structuredClone(storage.values.get(savedCredentialKey(KEY_ID, "api-key", PLUGIN_NAME)))

    const outcome = await manager.importLegacyCatalog({
      keys: [metadata("Conflicting name")],
      credentials: [credential("conflicting-material")],
    })

    expect(outcome).toEqual({ kind: "conflict", conflictingCredentialIds: [KEY_ID] })
    expect(storage.values.get(aiServicesSettingsKey(PLUGIN_NAME))).toEqual(metadataBefore)
    expect(storage.values.get(savedCredentialKey(KEY_ID, "api-key", PLUGIN_NAME))).toEqual(secretBefore)
  })

  it("retains an omitted secret for a name-only update", async () => {
    const storage = new MemoryLocalStorage()
    const manager = createManager(storage)
    await importStoredCredential(manager)

    await manager.update(KEY_ID, { ...binding, name: "Renamed Voyage" })

    await expect(manager.resolveCredential(KEY_ID, binding)).resolves.toMatchObject({
      secret: { apiKey: "credential-material" },
    })
    await expect(manager.listCompatible(binding)).resolves.toEqual([
      expect.objectContaining({ name: "Renamed Voyage", status: "stored" }),
    ])
  })

  it("rejects an omitted secret when the binding changes without mutating the stored credential", async () => {
    const storage = new MemoryLocalStorage()
    const manager = createManager(storage)
    await importStoredCredential(manager)
    const changedBinding = { ...binding, audience: "https://api.voyageai.com/v2" }

    await expect(manager.update(KEY_ID, { ...changedBinding, name: "Moved Voyage" }))
      .rejects.toMatchObject({ code: "CONFIG_INVALID" })

    await expect(manager.resolveCredential(KEY_ID, binding)).resolves.toMatchObject({
      secret: { apiKey: "credential-material" },
    })
    await expect(manager.listCompatible(changedBinding)).resolves.toEqual([])
  })

  it("replaces a kind transition under its new storage key and removes the obsolete record", async () => {
    const storage = new MemoryLocalStorage()
    const manager = createManager(storage)
    await importStoredCredential(manager)

    await manager.update(KEY_ID, {
      ...vertexBinding,
      name: "Vertex",
      secret: {
        projectId: "project",
        location: "global",
        clientEmail: "service@example.test",
        privateKey: "-----BEGIN PRIVATE KEY-----\nMAoCAQAwAwYBKgQA\n-----END PRIVATE KEY-----",
      },
    })

    expect(storage.values.has(savedCredentialKey(KEY_ID, "api-key", PLUGIN_NAME))).toBe(false)
    expect(storage.values.get(savedCredentialKey(KEY_ID, "vertex-service-account", PLUGIN_NAME)))
      .toMatchObject({ kind: "vertex-service-account", audience: vertexBinding.audience })
    await expect(manager.resolveCredential(KEY_ID, vertexBinding)).resolves.toMatchObject({
      kind: "vertex-service-account",
    })
    await expect(manager.resolveCredential(KEY_ID, binding)).rejects.toMatchObject({ code: "CREDENTIAL_SCOPE_MISMATCH" })
  })

  it("clears all secret records when an omitted-secret update transitions to no-auth", async () => {
    const storage = new MemoryLocalStorage()
    const manager = createManager(storage)
    await importStoredCredential(manager)

    await manager.update(KEY_ID, {
      name: "No auth",
      provider: "voyage",
      kind: "none",
      authMode: "none",
      audience: "unbound",
    })

    expect(storage.values.has(savedCredentialKey(KEY_ID, "api-key", PLUGIN_NAME))).toBe(false)
    expect(storage.values.has(retrievalCredentialSecretKey(KEY_ID, PLUGIN_NAME))).toBe(false)
    await expect(manager.status(KEY_ID)).resolves.toMatchObject({ status: "not-required" })
  })

  it("clears stored material when the secret is explicitly null", async () => {
    const storage = new MemoryLocalStorage()
    const manager = createManager(storage)
    await importStoredCredential(manager)

    await manager.update(KEY_ID, { ...binding, name: "Cleared Voyage", secret: null })

    expect(storage.values.has(savedCredentialKey(KEY_ID, "api-key", PLUGIN_NAME))).toBe(false)
    expect(storage.values.has(retrievalCredentialSecretKey(KEY_ID, PLUGIN_NAME))).toBe(false)
    await expect(manager.reveal(KEY_ID)).resolves.toBeNull()
  })
})
