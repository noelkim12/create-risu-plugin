import { beforeEach, describe, expect, it, vi } from "vitest"

import { AiServiceError } from "../../../templates/features/ai-services/common/ts/src/features/ai-services/core/errors"
import { parseResolvedCredential } from "../../../templates/features/credential-manager/common/ts/src/features/credential-manager/core/validation"
import type { ResolvedCredential } from "../../../templates/features/credential-manager/common/ts/src/features/credential-manager/core/types"
import { LlmClient } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/core/llm-client"
import type { LlmSettings, LlmStreamEvent, SavedModelConfig } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/core/types"
import { legacyDefaultSettings, migrateLegacyCatalog, parseStoredSettings } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/core/validation"
import type { HttpRequest, HttpTransport } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/network/native-fetch-transport"
import { DeepSeekProvider } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/providers/deepseek"
import type { LlmProvider } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/providers/provider"
import { ProviderRegistry } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/providers/registry"

const KEY_ID = "11111111-1111-4111-8111-111111111111"
const MODEL_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const LOCAL_MODEL_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

function catalog(): LlmSettings {
  return parseStoredSettings({
    schemaVersion: 2,
    savedModelConfigs: [{
      id: MODEL_ID,
      name: "OpenAI model",
      provider: "openai-compatible",
      authMode: "bearer",
      baseUrl: "https://llm.example/v1",
      modelId: "openai-test",
      keyId: KEY_ID,
      timeoutMs: 60_000,
      reasoning: { provider: "openai-compatible", effort: null },
      flags: [],
      additionalJson: "",
    }, {
      id: LOCAL_MODEL_ID,
      name: "Ollama model",
      provider: "ollama",
      authMode: "none",
      baseUrl: "http://127.0.0.1:11434/v1",
      modelId: "llama3",
      keyId: null,
      timeoutMs: 60_000,
      reasoning: { provider: "ollama", enabled: false },
      flags: [],
      additionalJson: "",
    }],
    selectedModelConfigId: MODEL_ID,
    defaultModelConfigId: MODEL_ID,
  })
}

function model(settings = catalog()): SavedModelConfig {
  const value = settings.savedModelConfigs.find(item => item.id === MODEL_ID)
  if (value === undefined) throw new TypeError("Expected model fixture.")
  return value
}

function credential(): ResolvedCredential {
  const value = parseResolvedCredential({
    schemaVersion: 2,
    keyId: KEY_ID,
    provider: "openai-compatible",
    kind: "api-key",
    audience: "https://llm.example/v1/chat/completions",
    revision: "revision",
    updatedAt: 1,
    secret: { apiKey: "test-secret" },
  })
  if (value === null) throw new TypeError("Expected credential fixture.")
  return value
}

describe("LlmClient model resolution", () => {
  const settings = catalog()
  const selectedModel = model(settings)
  const response = {
    provider: "openai-compatible" as const,
    model: "openai-test",
    text: "OK",
    finishReason: "stop",
  }
  const stream = vi.fn()
  const provider: LlmProvider = { complete: vi.fn().mockResolvedValue(response), stream }
  const providers = { for: vi.fn().mockReturnValue(provider) }
  const settingsReader = { load: vi.fn().mockResolvedValue(settings) }
  const resolver = { resolveCredential: vi.fn().mockResolvedValue(credential()) }
  const getRuntimeInfo = vi.fn().mockResolvedValue({ platform: "tauri" })
  let client: LlmClient

  beforeEach(() => {
    vi.clearAllMocks()
    client = new LlmClient({ settings: settingsReader, credentials: resolver, providers, getRuntimeInfo })
  })

  it("resolves the linked credential through the exact manager binding", async () => {
    await expect(client.complete(
      { messages: [{ role: "user", content: "hello" }] },
      { modelConfigId: selectedModel.id },
    )).resolves.toEqual(response)

    expect(resolver.resolveCredential).toHaveBeenCalledWith(KEY_ID, {
      provider: "openai-compatible",
      kind: "api-key",
      authMode: "bearer",
      audience: "https://llm.example/v1/chat/completions",
    })
    expect(provider.complete).toHaveBeenCalledWith(expect.objectContaining({
      model: selectedModel,
      credential: { revision: "revision", secret: { apiKey: "test-secret" } },
    }))
  })

  it("bypasses credential resolution for a no-auth model", async () => {
    const local = settings.savedModelConfigs.find(item => item.id === LOCAL_MODEL_ID)
    if (local === undefined) throw new TypeError("Expected local model fixture.")

    await expect(client.complete(
      { messages: [{ role: "user", content: "hello" }] },
      { modelConfigId: local.id },
    )).resolves.toEqual(response)

    expect(resolver.resolveCredential).not.toHaveBeenCalled()
    expect(provider.complete).toHaveBeenCalledWith(expect.objectContaining({ credential: null }))
  })

  it("translates manager credential failures to the public LLM error", async () => {
    resolver.resolveCredential.mockRejectedValueOnce(new AiServiceError("CREDENTIAL_MISSING", "The saved-key secret is missing."))

    await expect(client.complete(
      { messages: [{ role: "user", content: "hello" }] },
      { modelConfigId: selectedModel.id },
    )).rejects.toMatchObject({ code: "CREDENTIAL_MISSING", provider: "openai-compatible" })

    expect(provider.complete).not.toHaveBeenCalled()
  })

  it("streams the resolved model and credential only when streaming is enabled", async () => {
    const streamingModel = { ...selectedModel, flags: ["hasStreaming"] }
    settingsReader.load.mockResolvedValueOnce({ ...settings, savedModelConfigs: [streamingModel] })
    async function* events() {
      yield { type: "part" as const, part: { type: "text" as const, text: "OK" } }
      yield { type: "finish" as const, finishReason: "stop" }
    }
    stream.mockReturnValueOnce(events())
    const received: LlmStreamEvent[] = []

    for await (const event of client.stream(
      { messages: [{ role: "user", content: "hello" }] },
      { modelConfigId: selectedModel.id },
    )) received.push(event)

    expect(received).toEqual([
      { type: "part", part: { type: "text", text: "OK" } },
      { type: "finish", finishReason: "stop" },
    ])
    expect(stream).toHaveBeenCalledWith(expect.objectContaining({
      model: streamingModel,
      credential: { revision: "revision", secret: { apiKey: "test-secret" } },
    }))
  })

  it("executes a supplied manager-resolved connection-test pair without loading settings", async () => {
    await expect(client.testConnection(selectedModel, credential())).resolves.toEqual(response)

    expect(settingsReader.load).not.toHaveBeenCalled()
    expect(provider.complete).toHaveBeenCalledWith(expect.objectContaining({
      model: selectedModel,
      request: { messages: [{ role: "user", content: "Reply with OK." }] },
    }))
  })

  it("resolves a migrated model-only catalog", async () => {
    const migrated = migrateLegacyCatalog(legacyDefaultSettings(), {
      legacyCredentials: [{
        schemaVersion: 1,
        slot: "google-ai-studio",
        audience: "https://generativelanguage.googleapis.com",
        revision: "legacy-revision",
        updatedAt: 1,
        secret: { apiKey: "legacy-secret" },
      }],
      generateId: vi.fn()
        .mockReturnValueOnce("44444444-4444-4444-8444-444444444444")
        .mockReturnValueOnce("cccccccc-cccc-4ccc-8ccc-cccccccccccc")
        .mockReturnValueOnce("dddddddd-dddd-4ddd-8ddd-dddddddddddd")
        .mockReturnValueOnce("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee")
        .mockReturnValueOnce("ffffffff-ffff-4fff-8fff-ffffffffffff"),
    })
    const migratedModel = migrated.settings.savedModelConfigs.find(item => item.provider === "google-ai-studio")
    const migratedCredential = migrated.legacyCatalog.credentials[0]
    if (migratedModel === undefined || migratedCredential === undefined) throw new TypeError("Expected migrated pair.")
    const migratedClient = new LlmClient({
      settings: { load: vi.fn().mockResolvedValue(migrated.settings) },
      credentials: { resolveCredential: vi.fn().mockResolvedValue(migratedCredential) },
      providers,
      getRuntimeInfo,
    })

    await expect(migratedClient.complete(
      { messages: [{ role: "user", content: "hello" }] },
      { modelConfigId: migratedModel.id },
    )).resolves.toEqual(response)
  })

  it("uses the dedicated DeepSeek adapter without changing provider requests", async () => {
    let request: HttpRequest | undefined
    const transport: HttpTransport = {
      async request(next) {
        request = next
        return { ok: true, status: 200, headers: new Headers(), bodyText: JSON.stringify({ choices: [{ message: { content: "OK" } }] }) }
      },
      async stream() { throw new TypeError("Streaming transport must not be called.") },
    }
    const deepSeekSettings = parseStoredSettings({
      schemaVersion: 2,
      savedModelConfigs: [{
        ...selectedModel,
        provider: "deepseek",
        authMode: "bearer",
        baseUrl: "https://api.deepseek.com",
        reasoning: { provider: "deepseek", enabled: false },
      }],
      selectedModelConfigId: selectedModel.id,
      defaultModelConfigId: selectedModel.id,
    })
    const deepSeekCredential = parseResolvedCredential({
      ...credential(),
      provider: "deepseek",
      audience: "https://api.deepseek.com/chat/completions",
    })
    if (deepSeekCredential === null) throw new TypeError("Expected DeepSeek credential.")
    const unused: LlmProvider = { complete: vi.fn(), stream: vi.fn() }
    client = new LlmClient({
      settings: { load: vi.fn().mockResolvedValue(deepSeekSettings) },
      credentials: { resolveCredential: vi.fn().mockResolvedValue(deepSeekCredential) },
      providers: new ProviderRegistry({
        "google-ai-studio": unused,
        "google-vertex": unused,
        "openai-compatible": unused,
        ollama: unused,
        deepseek: new DeepSeekProvider(transport),
      }),
      getRuntimeInfo,
    })

    await client.complete({ messages: [{ role: "user", content: "hello" }] }, { modelConfigId: selectedModel.id })

    expect(request).toMatchObject({
      url: "https://api.deepseek.com/chat/completions",
      headers: { Authorization: "Bearer test-secret" },
      networkRoute: "auto",
    })
  })

  it("rejects missing model IDs before credential or provider execution", async () => {
    settingsReader.load.mockResolvedValueOnce({ ...settings, savedModelConfigs: [] })

    await expect(client.complete(
      { messages: [{ role: "user", content: "hello" }] },
      { modelConfigId: selectedModel.id },
    )).rejects.toMatchObject({ code: "MODEL_CONFIG_MISSING" })

    expect(resolver.resolveCredential).not.toHaveBeenCalled()
    expect(providers.for).not.toHaveBeenCalled()
  })

  it("rejects local endpoints in hosted web before provider execution", async () => {
    const localSettings = parseStoredSettings({
      ...settings,
      savedModelConfigs: [{ ...selectedModel, baseUrl: "http://127.0.0.1:11434/v1" }],
    })
    client = new LlmClient({
      settings: { load: vi.fn().mockResolvedValue(localSettings) },
      credentials: { resolveCredential: vi.fn().mockResolvedValue({ ...credential(), audience: "http://127.0.0.1:11434/v1/chat/completions" }) },
      providers,
      getRuntimeInfo: vi.fn().mockResolvedValue({ platform: "web" }),
    })

    await expect(client.complete(
      { messages: [{ role: "user", content: "hello" }] },
      { modelConfigId: selectedModel.id },
    )).rejects.toMatchObject({ code: "UNSUPPORTED_RUNTIME", provider: "openai-compatible" })

    expect(providers.for).not.toHaveBeenCalled()
  })
})
