import { describe, expect, it } from "vitest"

import { MemoryLocalStorage } from "../../helpers/memory-local-storage"
import { createDefaultSettings } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/core/validation"
import {
  createCredentialRecord,
  LocalCredentialRepository,
} from "../../../templates/features/llm-client/common/ts/src/features/llm-client/storage/local-credential-repository"
import { LocalSettingsRepository } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/storage/local-settings-repository"

describe("device-local LLM repositories", () => {
  it("builds audience-bound ephemeral credentials with an explicit revision", () => {
    const config = {
      ...createDefaultSettings().providers["google-vertex"],
      authMode: "service-account" as const,
      projectId: "project-a",
      model: "gemini-test",
    }

    expect(createCredentialRecord(config, { clientEmail: "service@example.com" }, "revision-2", 2345))
      .toEqual({
        schemaVersion: 1,
        slot: "google-vertex-service-account",
        audience: "vertex:project-a:us-central1",
        revision: "revision-2",
        updatedAt: 2345,
        secret: { clientEmail: "service@example.com" },
      })
  })

  it("persists settings under a plugin-namespaced versioned key", async () => {
    const storage = new MemoryLocalStorage()
    const repository = new LocalSettingsRepository(() => Promise.resolve(storage), "sample-plugin")
    const settings = createDefaultSettings()
    await repository.save(settings)

    expect(await repository.load()).toEqual(settings)
    expect([...storage.values.keys()]).toEqual(["sample-plugin:llm-client:settings:v1"])
  })

  it("strips runtime secret fields before persisting settings", async () => {
    const storage = new MemoryLocalStorage()
    const repository = new LocalSettingsRepository(() => Promise.resolve(storage), "sample-plugin")
    const settings = createDefaultSettings()
    const unsafeSettings = {
      ...settings,
      apiKey: "root-secret",
      providers: {
        ...settings.providers,
        "google-ai-studio": {
          ...settings.providers["google-ai-studio"],
          apiKey: "studio-secret",
        },
        "google-vertex": {
          ...settings.providers["google-vertex"],
          serviceAccountJson: "vertex-secret-json",
        },
        "openai-compatible": {
          ...settings.providers["openai-compatible"],
          customHeaders: { "X-Secret": "header-secret" },
        },
      },
    }

    await repository.save(unsafeSettings)

    const stored = storage.values.get("sample-plugin:llm-client:settings:v1")
    expect(stored).toEqual(settings)
    expect(JSON.stringify(stored)).not.toContain("secret")
  })

  it("rejects malformed shared-storage settings instead of trusting their shape", async () => {
    const storage = new MemoryLocalStorage()
    storage.values.set("sample-plugin:llm-client:settings:v1", {
      schemaVersion: 1,
      activeProvider: "google-ai-studio",
      providers: {},
    })
    const repository = new LocalSettingsRepository(() => Promise.resolve(storage), "sample-plugin")
    await expect(repository.load()).rejects.toMatchObject({ code: "CONFIG_INVALID" })
  })

  it("keeps secrets outside the settings record and binds them to an audience", async () => {
    const storage = new MemoryLocalStorage()
    const credentials = new LocalCredentialRepository(
      () => Promise.resolve(storage),
      "sample-plugin",
      () => "revision-1",
      () => 1234,
    )
    const config = {
      ...createDefaultSettings().providers["openai-compatible"],
      model: "test-model",
      baseUrl: "https://llm.example/v1",
    }

    await credentials.saveApiKey(config, "secret-key", {})
    await expect(credentials.load(config)).resolves.toMatchObject({
      slot: "openai-compatible",
      audience: "https://llm.example/v1/chat/completions",
      revision: "revision-1",
    })
    await expect(credentials.load({ ...config, baseUrl: "https://other.example/v1" }))
      .resolves.toBeNull()
  })

  it("clears only the active credential key", async () => {
    const storage = new MemoryLocalStorage()
    storage.values.set("another-plugin:data", "preserve")
    const credentials = new LocalCredentialRepository(() => Promise.resolve(storage), "sample-plugin")
    const config = { ...createDefaultSettings().providers.ollama, model: "llama" }
    await credentials.saveApiKey(config, "optional-token", {})
    await credentials.clear(config)

    expect(storage.values.get("another-plugin:data")).toBe("preserve")
    expect(storage.clearCalls).toHaveLength(0)
  })

  it("clears exactly both Vertex credential slots for the provider", async () => {
    const storage = new MemoryLocalStorage()
    storage.values.set("sample-plugin:llm-client:credential:google-vertex-api-key:v1", "api-key")
    storage.values.set("sample-plugin:llm-client:credential:google-vertex-service-account:v1", "service-account")
    storage.values.set("sample-plugin:llm-client:credential:google-ai-studio:v1", "preserve-provider")
    storage.values.set("another-plugin:data", "preserve-plugin")
    const credentials = new LocalCredentialRepository(() => Promise.resolve(storage), "sample-plugin")

    await credentials.clearProvider("google-vertex")

    expect([...storage.values.entries()]).toEqual([
      ["sample-plugin:llm-client:credential:google-ai-studio:v1", "preserve-provider"],
      ["another-plugin:data", "preserve-plugin"],
    ])
    expect(storage.clearCalls).toHaveLength(0)
  })

  it("parses required Service Account fields without storing the original JSON", async () => {
    const storage = new MemoryLocalStorage()
    const credentials = new LocalCredentialRepository(() => Promise.resolve(storage), "sample-plugin")
    const config = {
      ...createDefaultSettings().providers["google-vertex"],
      authMode: "service-account" as const,
      projectId: "project-a",
      model: "gemini-test",
    }
    await credentials.saveServiceAccountJson(config, JSON.stringify({
      type: "service_account",
      project_id: "project-a",
      client_email: "llm@project-a.iam.gserviceaccount.com",
      private_key: "-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----\n",
      private_key_id: "key-id",
      token_uri: "https://oauth2.googleapis.com/token",
      extra_field: "must-not-be-stored",
    }))

    const stored = await credentials.load(config)
    expect(stored).not.toBeNull()
    expect(stored?.secret).toEqual({
      projectId: "project-a",
      clientEmail: "llm@project-a.iam.gserviceaccount.com",
      privateKey: "-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----\n",
      privateKeyId: "key-id",
    })
    expect(JSON.stringify(stored)).not.toContain("token_uri")
  })
})
