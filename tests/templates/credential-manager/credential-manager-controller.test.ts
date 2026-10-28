import { describe, expect, it } from "vitest"

import { MemoryLocalStorage } from "../../helpers/memory-local-storage"
import {
  type CredentialCreate,
  type CredentialDraft,
} from "../../../templates/features/credential-manager/common/ts/src/features/credential-manager"
import { CredentialManagerController } from "../../../templates/features/credential-manager/common/ts/src/features/credential-manager/settings/credential-manager-controller"
import { CredentialReferenceRegistry } from "../../../templates/features/credential-manager/common/ts/src/features/credential-manager/storage/credential-reference-registry"
import { LocalCredentialCatalogRepository } from "../../../templates/features/credential-manager/common/ts/src/features/credential-manager/storage/local-credential-catalog-repository"
import { LocalCredentialManager } from "../../../templates/features/credential-manager/common/ts/src/features/credential-manager/storage/local-credential-manager"
import {
  aiServicesSettingsKey,
  retrievalCredentialSecretKey,
  savedCredentialKey,
} from "../../../templates/features/credential-manager/common/ts/src/features/credential-manager/storage/storage-keys"

const PLUGIN_NAME = "credential-manager-controller-test"
const SECRET = "controller-secret-material"

class RecordingStorage extends MemoryLocalStorage {
  readonly events: string[] = []

  override async setItem<T>(key: string, value: T): Promise<void> {
    await super.setItem(key, value)
    if (key === aiServicesSettingsKey(PLUGIN_NAME)) this.events.push("metadata")
  }

  override async removeItem(key: string): Promise<void> {
    await super.removeItem(key)
    this.events.push(`secret:${key}`)
  }
}

function createRequest(name = "Voyage"): CredentialCreate {
  return {
    name,
    provider: "voyage",
    kind: "api-key",
    authMode: "bearer",
    audience: "https://api.voyageai.com",
    secret: { apiKey: SECRET },
  }
}

function draft(name = "Voyage"): CredentialDraft {
  return {
    name,
    provider: "voyage",
    kind: "api-key",
    authMode: "bearer",
    audience: "https://api.voyageai.com",
  }
}

function createdCredentialId(controller: CredentialManagerController) {
  const [summary] = controller.snapshot().credentials
  if (summary === undefined) throw new TypeError("Expected a created credential.")
  return summary.id
}

function createHarness(storage = new RecordingStorage()): {
  readonly storage: RecordingStorage
  readonly references: CredentialReferenceRegistry
  readonly manager: LocalCredentialManager
  readonly controller: CredentialManagerController
} {
  const references = new CredentialReferenceRegistry()
  const manager = new LocalCredentialManager(
    {
      catalog: new LocalCredentialCatalogRepository(() => Promise.resolve(storage), PLUGIN_NAME),
      references,
    },
    {
      storageFactory: () => Promise.resolve(storage),
      pluginName: PLUGIN_NAME,
      revision: () => "revision-1",
      now: () => 20,
    },
  )
  return { storage, references, manager, controller: new CredentialManagerController(manager) }
}

describe("CredentialManagerController", () => {
  it("keeps secrets out of lifecycle state while retaining, revealing, and explicitly clearing them", async () => {
    const { controller, manager, storage } = createHarness()

    await controller.load()
    expect(controller.beginCreate()).toMatchObject({ provider: "google-ai-studio", kind: "api-key" })
    await controller.create(createRequest())
    const afterCreate = controller.snapshot()
    const keyId = createdCredentialId(controller)
    expect(afterCreate.credentials).toEqual([expect.objectContaining({ id: keyId, status: "stored" })])
    expect(JSON.stringify(afterCreate)).not.toContain(SECRET)

    await controller.update(keyId, { ...draft("Renamed Voyage") })
    expect(await controller.reveal(keyId)).toMatchObject({ secret: { apiKey: SECRET } })
    expect(JSON.stringify(controller.snapshot())).not.toContain(SECRET)

    await controller.clearSecret(keyId, draft("Renamed Voyage"))

    expect(await manager.reveal(keyId)).toBeNull()
    expect(controller.snapshot().credentials).toEqual([expect.objectContaining({ status: "missing" })])
    expect(storage.values.has(savedCredentialKey(keyId, "api-key", PLUGIN_NAME))).toBe(false)
    expect(JSON.stringify(controller.snapshot())).not.toContain(SECRET)
  })

  it("does not unlink or persist when a pending deletion is cancelled", async () => {
    const { controller, manager, references, storage } = createHarness()
    await manager.create(createRequest())
    await controller.load()
    const keyId = createdCredentialId(controller)
    references.register({ unlinkCredential: async () => { storage.events.push("unlink") } })
    storage.events.length = 0

    controller.requestDelete(keyId)
    controller.cancelDelete()

    expect(storage.events).toEqual([])
    expect(await manager.reveal(keyId)).toMatchObject({ secret: { apiKey: SECRET } })
    expect(controller.snapshot().pendingDeleteId).toBeNull()
  })

  it("unlinks references before removing secrets and catalog metadata after confirmation", async () => {
    const { controller, manager, references, storage } = createHarness()
    await manager.create(createRequest())
    await controller.load()
    const keyId = createdCredentialId(controller)
    references.register({ unlinkCredential: async () => { storage.events.push("unlink") } })
    storage.events.length = 0

    controller.requestDelete(keyId)
    await controller.confirmDelete()

    expect(storage.events).toEqual([
      "unlink",
      `secret:${savedCredentialKey(keyId, "api-key", PLUGIN_NAME)}`,
      `secret:${retrievalCredentialSecretKey(keyId, PLUGIN_NAME)}`,
      "metadata",
    ])
    expect(await manager.list()).toEqual([])
    expect(controller.snapshot()).toMatchObject({ operation: "success", pendingDeleteId: null })
  })

  it("retains metadata and secret bytes when unlinking rejects and reports a safe failure", async () => {
    const { controller, manager, references, storage } = createHarness()
    await manager.create(createRequest())
    await controller.load()
    const keyId = createdCredentialId(controller)
    references.register({
      unlinkCredential: async () => { throw new Error(`unlink failed for ${SECRET}`) },
    })
    const metadataBefore = structuredClone(storage.values.get(aiServicesSettingsKey(PLUGIN_NAME)))
    const secretBefore = structuredClone(storage.values.get(savedCredentialKey(keyId, "api-key", PLUGIN_NAME)))

    controller.requestDelete(keyId)
    const error = await controller.confirmDelete().then(
      () => { throw new TypeError("Expected deletion to fail.") },
      reason => reason,
    )
    if (!(error instanceof Error)) throw new TypeError("Expected an error result.")

    expect(storage.values.get(aiServicesSettingsKey(PLUGIN_NAME))).toEqual(metadataBefore)
    expect(storage.values.get(savedCredentialKey(keyId, "api-key", PLUGIN_NAME))).toEqual(secretBefore)
    expect(error.message).toBe("Credential operation failed.")
    expect(error.message).not.toContain(SECRET)
    expect(controller.snapshot()).toMatchObject({ operation: "error", statusMessage: "Credential operation failed." })
    expect(JSON.stringify(controller.snapshot())).not.toContain(SECRET)
  })
})
