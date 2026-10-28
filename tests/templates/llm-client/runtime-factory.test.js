import { describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
  const storage = {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
    keys: async () => [],
    clear: async () => undefined,
  }
  vi.stubGlobal("risuai", {
    nativeFetch: vi.fn(),
    getLocalPluginStorage: async () => storage,
    getRuntimeInfo: async () => ({ platform: "node" }),
  })
})

import { createAiServicesRuntime } from "../../../templates/features/ai-services/common/ts/src/features/ai-services/runtime"
import { credentialManagerRuntime } from "../../../templates/features/credential-manager/common/ts/src/features/credential-manager/runtime"
import { createLlmClient } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/runtime"
import { settingsKey } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/storage/storage-keys"
import { MemoryLocalStorage } from "../../helpers/memory-local-storage"

const KEY_ID = "11111111-1111-4111-8111-111111111111"
const MODEL_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

describe("createLlmClient shared runtime", () => {
  it("keeps the services/api call shape while credentials use the canonical manager", async () => {
    const storage = new MemoryLocalStorage()
    const api = {
      nativeFetch: vi.fn(),
      getLocalPluginStorage: async () => storage,
      getRuntimeInfo: async () => ({ platform: "node" }),
    }
    const services = createAiServicesRuntime(api)
    await storage.setItem(settingsKey(), {
      schemaVersion: 2,
      savedModelConfigs: [{
        id: MODEL_ID,
        name: "Shared model",
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
    })
    const resolveCredential = vi.spyOn(credentialManagerRuntime.resolver, "resolveCredential")
      .mockResolvedValue({
        schemaVersion: 2,
        keyId: KEY_ID,
        provider: "openai-compatible",
        kind: "api-key",
        audience: "https://llm.example/v1/chat/completions",
        revision: "revision",
        updatedAt: 1,
        secret: { apiKey: "shared-secret" },
      })
    const client = createLlmClient(services, api)

    await expect(client.complete({ messages: [] }, { modelConfigId: MODEL_ID }))
      .rejects.toMatchObject({ code: "CONFIG_INVALID" })

    expect(resolveCredential).toHaveBeenCalledWith(KEY_ID, expect.objectContaining({
      provider: "openai-compatible",
      audience: "https://llm.example/v1/chat/completions",
    }))
  })
})
