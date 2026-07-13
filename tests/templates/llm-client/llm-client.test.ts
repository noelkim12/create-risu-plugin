import { beforeEach, describe, expect, it, vi } from "vitest"

import { LlmClient } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/core/llm-client"
import type { StoredCredential } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/core/types"
import { createDefaultSettings } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/core/validation"
import type { LlmProvider } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/providers/provider"

describe("LlmClient", () => {
  const defaults = createDefaultSettings()
  const settings = {
    ...defaults,
    providers: {
      ...defaults.providers,
      "google-ai-studio": {
        ...defaults.providers["google-ai-studio"],
        model: "gemini-test",
      },
      ollama: {
        ...defaults.providers.ollama,
        model: "llama-test",
      },
    },
  }
  const storedCredential: StoredCredential = {
    schemaVersion: 1,
    slot: "google-ai-studio",
    audience: "https://generativelanguage.googleapis.com",
    revision: "revision-a",
    updatedAt: 1,
    secret: { apiKey: "secret" },
  }
  const response = {
    provider: "google-ai-studio" as const,
    model: "gemini-test",
    text: "OK",
    finishReason: "STOP",
  }
  const provider: LlmProvider = { complete: vi.fn().mockResolvedValue(response) }
  const registry = { for: vi.fn().mockReturnValue(provider) }
  const settingsReader = { load: vi.fn().mockResolvedValue(settings) }
  const credentialReader = { load: vi.fn().mockResolvedValue(storedCredential) }
  const getRuntimeInfo = vi.fn().mockResolvedValue({ platform: "tauri" })
  let client: LlmClient

  beforeEach(() => {
    vi.clearAllMocks()
    client = new LlmClient({
      settings: settingsReader,
      credentials: credentialReader,
      providers: registry,
      getRuntimeInfo,
    })
  })

  it("uses the stored active provider and its audience-bound credential", async () => {
    await expect(client.complete({
      messages: [{ role: "user", content: "hello" }],
    })).resolves.toEqual(response)

    expect(registry.for).toHaveBeenCalledWith(settings.providers[settings.activeProvider])
    expect(provider.complete).toHaveBeenCalledWith(expect.objectContaining({
      config: settings.providers[settings.activeProvider],
      credential: storedCredential,
    }))
  })

  it("uses a one-call provider override without mutating settings", async () => {
    credentialReader.load.mockResolvedValueOnce(null)
    await client.complete(
      { messages: [{ role: "user", content: "hello" }] },
      { provider: "ollama" },
    )

    expect(registry.for).toHaveBeenCalledWith(settings.providers.ollama)
    expect(settings.activeProvider).toBe("google-ai-studio")
  })

  it("rejects invalid messages before provider lookup", async () => {
    await expect(client.complete({ messages: [] })).rejects.toMatchObject({
      code: "CONFIG_INVALID",
    })
    await expect(client.complete(
      { messages: [{ role: "user", content: "hello" }] },
      { timeoutMs: 0 },
    )).rejects.toMatchObject({ code: "CONFIG_INVALID" })
    expect(registry.for).not.toHaveBeenCalled()
  })

  it("uses the fixed minimal request for Test Connection", async () => {
    await client.testConnection(settings.providers["google-ai-studio"], storedCredential)
    expect(provider.complete).toHaveBeenCalledWith(expect.objectContaining({
      request: {
        messages: [{ role: "user", content: "Reply with OK." }],
        maxOutputTokens: 8,
      },
    }))
  })

  it("rejects local endpoints from a hosted web runtime", async () => {
    getRuntimeInfo.mockResolvedValueOnce({ platform: "web" })
    await expect(client.complete(
      { messages: [{ role: "user", content: "hello" }] },
      { provider: "ollama" },
    )).rejects.toMatchObject({ code: "UNSUPPORTED_RUNTIME", provider: "ollama" })
    expect(provider.complete).not.toHaveBeenCalled()
  })
})
