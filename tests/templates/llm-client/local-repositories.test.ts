import { afterEach, describe, expect, it, vi } from "vitest"

import { credentialManagerRuntime } from "../../../templates/features/credential-manager/common/ts/src/features/credential-manager/runtime"
import { legacyDefaultSettings } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/core/validation"
import { LocalSettingsRepository } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/storage/local-settings-repository"
import { legacyCredentialKey, settingsKey } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/storage/storage-keys"
import { MemoryLocalStorage } from "../../helpers/memory-local-storage"

const KEY_ID = "11111111-1111-4111-8111-111111111111"
const MODEL_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const PLUGIN_NAME = "model-only-test"

function combinedSettings(): unknown {
  return {
    schemaVersion: 2,
    savedKeys: [{
      id: KEY_ID,
      name: "OpenAI key",
      provider: "openai-compatible",
      kind: "api-key",
    }],
    savedModelConfigs: [{
      id: MODEL_ID,
      name: "OpenAI model",
      provider: "openai-compatible",
      authMode: "bearer",
      baseUrl: "https://llm.example/v1",
      modelId: "test-model",
      keyId: KEY_ID,
      timeoutMs: 60_000,
      reasoning: { provider: "openai-compatible", effort: null },
      flags: [],
      additionalJson: "",
    }],
    selectedModelConfigId: MODEL_ID,
    defaultModelConfigId: MODEL_ID,
  }
}

class InterruptingStorage extends MemoryLocalStorage {
  failSettingsWrites = false

  override async setItem<T>(key: string, value: T): Promise<void> {
    if (this.failSettingsWrites && key === settingsKey(PLUGIN_NAME)) {
      throw new Error("simulated model-settings interruption")
    }
    await super.setItem(key, value)
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("model-only LLM settings repository", () => {
  it("imports a legacy combined catalog before replacing it with model-only settings", async () => {
    const storage = new MemoryLocalStorage()
    const original = combinedSettings()
    await storage.setItem(settingsKey(PLUGIN_NAME), original)
    const importCatalog = vi.spyOn(credentialManagerRuntime.manager, "importLegacyCatalog")
      .mockResolvedValue({ kind: "unchanged" })
    const repository = new LocalSettingsRepository(() => Promise.resolve(storage), PLUGIN_NAME)

    const loaded = await repository.load()

    expect(importCatalog).toHaveBeenCalledWith({
      keys: [{
        id: KEY_ID,
        name: "OpenAI key",
        provider: "openai-compatible",
        kind: "api-key",
        authMode: "bearer",
        audience: "https://llm.example/v1/chat/completions",
        updatedAt: 0,
      }],
      credentials: [],
    })
    expect(loaded).not.toHaveProperty("savedKeys")
    expect(await storage.getItem(settingsKey(PLUGIN_NAME))).toEqual(loaded)
    expect(await storage.getItem(settingsKey(PLUGIN_NAME))).not.toHaveProperty("savedKeys")
  })

  it("retries an interrupted legacy migration with identical manager records", async () => {
    const storage = new InterruptingStorage()
    const legacy = legacyDefaultSettings()
    await storage.setItem(settingsKey(PLUGIN_NAME), legacy)
    await storage.setItem(legacyCredentialKey("google-ai-studio", PLUGIN_NAME), {
      schemaVersion: 1,
      slot: "google-ai-studio",
      audience: "https://generativelanguage.googleapis.com",
      revision: "legacy-revision",
      updatedAt: 1,
      secret: { apiKey: "legacy-secret" },
    })
    const catalogs: unknown[] = []
    const importCatalog = vi.spyOn(credentialManagerRuntime.manager, "importLegacyCatalog")
      .mockImplementation(async catalog => {
        catalogs.push(structuredClone(catalog))
        return catalogs.length === 1 ? { kind: "imported", importedCredentialIds: catalog.keys.map(key => key.id) } : { kind: "unchanged" }
      })
    const repository = new LocalSettingsRepository(() => Promise.resolve(storage), PLUGIN_NAME)
    storage.failSettingsWrites = true

    await expect(repository.load()).rejects.toThrow("simulated model-settings interruption")
    expect(await storage.getItem(settingsKey(PLUGIN_NAME))).toEqual(legacy)
    storage.failSettingsWrites = false

    const loaded = await repository.load()

    expect(importCatalog).toHaveBeenCalledTimes(2)
    expect(catalogs[1]).toEqual(catalogs[0])
    expect(loaded).not.toHaveProperty("savedKeys")
    expect(await storage.getItem(settingsKey(PLUGIN_NAME))).toEqual(loaded)
  })

  it("leaves legacy settings untouched when manager import reports a conflict", async () => {
    const storage = new MemoryLocalStorage()
    const original = combinedSettings()
    await storage.setItem(settingsKey(PLUGIN_NAME), original)
    vi.spyOn(credentialManagerRuntime.manager, "importLegacyCatalog")
      .mockImplementation(async catalog => {
        const first = catalog.keys[0]
        return first === undefined
          ? { kind: "unchanged" }
          : { kind: "conflict", conflictingCredentialIds: [first.id] }
      })
    const repository = new LocalSettingsRepository(() => Promise.resolve(storage), PLUGIN_NAME)

    await expect(repository.load()).rejects.toMatchObject({ code: "CONFIG_INVALID" })

    expect(await storage.getItem(settingsKey(PLUGIN_NAME))).toEqual(original)
  })

  it("persists canonical settings without shadow saved-key writes", async () => {
    const storage = new MemoryLocalStorage()
    const repository = new LocalSettingsRepository(() => Promise.resolve(storage), PLUGIN_NAME)
    const settings = {
      schemaVersion: 2 as const,
      savedModelConfigs: [],
      selectedModelConfigId: null,
      defaultModelConfigId: null,
    }
    const importCatalog = vi.spyOn(credentialManagerRuntime.manager, "importLegacyCatalog")

    await repository.save(settings)

    expect(importCatalog).not.toHaveBeenCalled()
    expect(await storage.getItem(settingsKey(PLUGIN_NAME))).toEqual(settings)
  })
})
