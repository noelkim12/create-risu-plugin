import { describe, expect, it } from "vitest"

import { MemoryLocalStorage } from "../../helpers/memory-local-storage"
import { createDefaultSettings } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/core/validation"
import { LocalCredentialRepository } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/storage/local-credential-repository"
import { LocalSettingsRepository } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/storage/local-settings-repository"

describe("device-local LLM repositories", () => {
  it("persists settings under a plugin-namespaced versioned key", async () => {
    const storage = new MemoryLocalStorage()
    const repository = new LocalSettingsRepository(() => Promise.resolve(storage), "sample-plugin")
    const settings = createDefaultSettings()
    await repository.save(settings)

    expect(await repository.load()).toEqual(settings)
    expect([...storage.values.keys()]).toEqual(["sample-plugin:llm-client:settings:v1"])
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
    expect(stored?.secret).not.toHaveProperty("extra_field")
    expect(JSON.stringify(stored)).not.toContain("token_uri")
  })
})
