import { beforeEach, describe, expect, it, vi } from "vitest"

import { LlmError } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/core/errors"
import type {
  LlmSettings,
  ProviderId,
  StoredCredential,
} from "../../../templates/features/llm-client/common/ts/src/features/llm-client/core/types"
import { createDefaultSettings } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/core/validation"
import {
  LlmSettingsController,
  parseCustomHeaders,
  type SettingsState,
} from "../../../templates/features/llm-client/common/ts/src/features/llm-client/settings/settings-controller"

function validSettings(activeProvider: ProviderId = "google-ai-studio"): LlmSettings {
  const defaults = createDefaultSettings()
  return {
    ...defaults,
    activeProvider,
    providers: {
      "google-ai-studio": { ...defaults.providers["google-ai-studio"], model: "gemini-test" },
      "google-vertex": { ...defaults.providers["google-vertex"], model: "gemini-test" },
      "openai-compatible": {
        ...defaults.providers["openai-compatible"],
        baseUrl: "https://llm.example/v1",
        model: "chat-test",
      },
      ollama: { ...defaults.providers.ollama, model: "llama-test" },
    },
  }
}

const storedCredential: StoredCredential = {
  schemaVersion: 1,
  slot: "google-ai-studio",
  audience: "https://generativelanguage.googleapis.com",
  revision: "revision-a",
  updatedAt: 1,
  secret: { apiKey: "stored-secret" },
}

function deferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined
  let reject: (reason?: unknown) => void = () => undefined
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function createHarness(settingsValue = validSettings()) {
  const settings = {
    load: vi.fn().mockResolvedValue(settingsValue),
    save: vi.fn().mockResolvedValue(undefined),
  }
  const credentials = {
    load: vi.fn().mockResolvedValue(storedCredential),
    status: vi.fn().mockResolvedValue("stored" as const),
    saveApiKey: vi.fn().mockResolvedValue(undefined),
    saveServiceAccountJson: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
    clearProvider: vi.fn().mockResolvedValue(undefined),
  }
  const client = {
    testConnection: vi.fn().mockResolvedValue({
      provider: settingsValue.activeProvider,
      model: settingsValue.providers[settingsValue.activeProvider].model,
    }),
  }
  const controller = new LlmSettingsController(
    settings,
    credentials,
    client,
    () => Promise.resolve({ platform: "web" }),
  )
  let latest: SettingsState | undefined
  controller.subscribe(value => { latest = value })
  const state = (): SettingsState => {
    if (!latest) throw new Error("Controller did not publish initial state")
    return latest
  }
  return { client, controller, credentials, settings, state }
}

describe("LlmSettingsController", () => {
  beforeEach(() => vi.clearAllMocks())

  it("loads, edits, and saves a replacement API key", async () => {
    const harness = createHarness()
    harness.credentials.status
      .mockResolvedValueOnce("missing")
      .mockResolvedValue("stored")
    await harness.controller.load()
    expect(harness.state()).toMatchObject({
      operation: "idle",
      credentialState: "missing",
      dirty: false,
      runtimePlatform: "web",
    })

    harness.controller.updateConfig({
      ...harness.state().activeConfig,
      model: "gemini-new",
    })
    harness.controller.setSecretDraft({ apiKey: "new-secret" })
    await harness.controller.save()

    expect(harness.settings.save).toHaveBeenCalledOnce()
    expect(harness.credentials.saveApiKey).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gemini-new" }),
      "new-secret",
      {},
    )
    expect(harness.state()).toMatchObject({ operation: "success", dirty: false })
  })

  it("preserves a stored credential when the secret draft is blank", async () => {
    const harness = createHarness()
    await harness.controller.load()
    harness.controller.setSecretDraft({ apiKey: "   " })
    await harness.controller.save()
    expect(harness.credentials.saveApiKey).not.toHaveBeenCalled()
    expect(harness.state().credentialState).toBe("stored")
  })

  it("marks an endpoint credential stale and never tests with it", async () => {
    const harness = createHarness(validSettings("openai-compatible"))
    harness.credentials.status
      .mockResolvedValueOnce("stored")
      .mockResolvedValueOnce("stale")
    harness.credentials.load.mockResolvedValueOnce(null)
    await harness.controller.load()
    harness.controller.updateConfig({
      ...harness.state().activeConfig,
      baseUrl: "https://other.example/v1",
    })
    await vi.waitFor(() => expect(harness.state().credentialState).toBe("stale"))
    await harness.controller.testConnection()
    expect(harness.client.testConnection).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "https://other.example/v1" }),
      null,
      expect.any(AbortSignal),
    )
  })

  it("tests a secret draft through an ephemeral credential without persisting it", async () => {
    const harness = createHarness()
    harness.credentials.load.mockResolvedValueOnce(null)
    await harness.controller.load()
    harness.controller.setSecretDraft({ apiKey: "draft-secret" })
    await harness.controller.testConnection()
    expect(harness.client.testConnection).toHaveBeenCalledWith(
      harness.state().activeConfig,
      expect.objectContaining({ secret: { apiKey: "draft-secret" } }),
      expect.any(AbortSignal),
    )
    expect(harness.credentials.saveApiKey).not.toHaveBeenCalled()
  })

  it("aborts the in-flight Test Connection signal", async () => {
    const harness = createHarness()
    await harness.controller.load()
    harness.client.testConnection.mockImplementation((_config, _credential, signal) => (
      new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          reject(new LlmError("ABORTED", "LLM request was cancelled."))
        }, { once: true })
      })
    ))
    const pending = harness.controller.testConnection()
    await vi.waitFor(() => expect(harness.client.testConnection).toHaveBeenCalledOnce())
    const signal = harness.client.testConnection.mock.calls[0]?.[2]
    harness.controller.cancelTest()
    await pending
    expect(signal?.aborted).toBe(true)
    expect(harness.state()).toMatchObject({
      operation: "idle",
      statusMessage: "Connection test cancelled.",
    })
  })

  it("cancels while the credential is loading without starting a client request", async () => {
    const harness = createHarness()
    await harness.controller.load()
    let finishCredentialLoad: ((value: StoredCredential | null) => void) | undefined
    harness.credentials.load.mockImplementationOnce(() => new Promise(resolve => {
      finishCredentialLoad = resolve
    }))

    const pending = harness.controller.testConnection()
    await vi.waitFor(() => expect(harness.state().operation).toBe("testing"))
    harness.controller.cancelTest()
    finishCredentialLoad?.(storedCredential)
    await pending

    expect(harness.client.testConnection).not.toHaveBeenCalled()
    expect(harness.state()).toMatchObject({
      operation: "idle",
      statusMessage: "Connection test cancelled.",
    })
  })

  it("does not let a cancelled test overwrite a newer test result", async () => {
    const harness = createHarness()
    await harness.controller.load()
    let rejectCancelled: (() => void) | undefined
    harness.client.testConnection
      .mockImplementationOnce((_config, _credential, signal) => new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          rejectCancelled = () => reject(new LlmError("ABORTED", "LLM request was cancelled."))
        }, { once: true })
      }))
      .mockResolvedValueOnce({ provider: "google-ai-studio", model: "new-result" })

    const first = harness.controller.testConnection()
    await vi.waitFor(() => expect(harness.client.testConnection).toHaveBeenCalledTimes(1))
    const second = harness.controller.testConnection()
    await second
    rejectCancelled?.()
    await first

    expect(harness.state()).toMatchObject({
      operation: "success",
      statusMessage: "Connected to google-ai-studio / new-result.",
    })
  })

  it("preserves safe LLM timeout errors and hides unknown connection errors", async () => {
    const harness = createHarness()
    await harness.controller.load()
    harness.client.testConnection.mockRejectedValueOnce(
      new LlmError("TIMEOUT", "LLM request timed out."),
    )
    await harness.controller.testConnection()
    expect(harness.state()).toMatchObject({
      operation: "error",
      statusMessage: "LLM request timed out.",
    })

    harness.client.testConnection.mockRejectedValueOnce(new Error("secret backend detail"))
    await harness.controller.testConnection()
    expect(harness.state()).toMatchObject({
      operation: "error",
      statusMessage: "Connection test failed.",
    })
  })

  it("does not save a newer provider draft through an older save", async () => {
    const harness = createHarness()
    await harness.controller.load()
    const settingsSave = deferred<void>()
    harness.settings.save.mockReturnValueOnce(settingsSave.promise)
    harness.controller.setSecretDraft({ apiKey: "studio-draft" })
    const staleSave = harness.controller.save()
    await vi.waitFor(() => expect(harness.settings.save).toHaveBeenCalledOnce())
    harness.controller.selectProvider("ollama")
    harness.controller.setSecretDraft({ apiKey: "ollama-draft" })
    settingsSave.resolve()
    await staleSave

    expect(harness.credentials.saveApiKey).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "google-ai-studio" }),
      "studio-draft",
      {},
    )
    expect(harness.state()).toMatchObject({
      activeConfig: { provider: "ollama" },
      dirty: true,
      operation: "idle",
      statusMessage: "",
    })

    await harness.controller.save()
    expect(harness.credentials.saveApiKey).toHaveBeenLastCalledWith(
      expect.objectContaining({ provider: "ollama" }),
      "ollama-draft",
      {},
    )
    expect(harness.credentials.saveApiKey).toHaveBeenCalledTimes(2)
  })

  it("serializes Save then Clear when the credential save finishes late", async () => {
    const harness = createHarness()
    await harness.controller.load()
    let credentialStored = true
    const credentialSave = deferred<void>()
    harness.credentials.saveApiKey.mockImplementationOnce(async () => {
      await credentialSave.promise
      credentialStored = true
    })
    harness.credentials.clear.mockImplementationOnce(async () => {
      credentialStored = false
    })
    harness.credentials.status.mockImplementation(async () => (
      credentialStored ? "stored" as const : "missing" as const
    ))

    harness.controller.setSecretDraft({ apiKey: "replacement" })
    const save = harness.controller.save()
    await vi.waitFor(() => expect(harness.credentials.saveApiKey).toHaveBeenCalledOnce())
    const clear = harness.controller.clearCredential()

    expect(harness.credentials.clear).not.toHaveBeenCalled()
    credentialSave.resolve()
    await Promise.all([save, clear])

    expect(credentialStored).toBe(false)
    expect(harness.state().credentialState).toBe("missing")
  })

  it("serializes Clear then Save when the credential clear finishes late", async () => {
    const harness = createHarness()
    await harness.controller.load()
    let credentialStored = true
    const credentialClear = deferred<void>()
    harness.credentials.clear.mockImplementationOnce(async () => {
      await credentialClear.promise
      credentialStored = false
    })
    harness.credentials.saveApiKey.mockImplementationOnce(async () => {
      credentialStored = true
    })
    harness.credentials.status.mockImplementation(async () => (
      credentialStored ? "stored" as const : "missing" as const
    ))

    const clear = harness.controller.clearCredential()
    await vi.waitFor(() => expect(harness.credentials.clear).toHaveBeenCalledOnce())
    harness.controller.setSecretDraft({ apiKey: "newer-secret" })
    const save = harness.controller.save()

    expect(harness.settings.save).not.toHaveBeenCalled()
    credentialClear.resolve()
    await Promise.all([clear, save])

    expect(credentialStored).toBe(true)
    expect(harness.state().credentialState).toBe("stored")
  })

  it("finishes a queued Reset before a newer Save", async () => {
    const harness = createHarness()
    await harness.controller.load()
    let credentialStored = true
    const providerClear = deferred<void>()
    harness.credentials.clearProvider.mockImplementationOnce(async () => {
      await providerClear.promise
      credentialStored = false
    })
    harness.credentials.saveApiKey.mockImplementationOnce(async () => {
      credentialStored = true
    })
    harness.credentials.status.mockImplementation(async () => (
      credentialStored ? "stored" as const : "missing" as const
    ))

    const reset = harness.controller.resetActiveProvider()
    await vi.waitFor(() => expect(harness.credentials.clearProvider).toHaveBeenCalledOnce())
    harness.controller.updateConfig({
      ...harness.state().activeConfig,
      model: "newer-model",
    })
    harness.controller.setSecretDraft({ apiKey: "newer-secret" })
    const save = harness.controller.save()

    expect(harness.settings.save).not.toHaveBeenCalled()
    providerClear.resolve()
    await Promise.all([reset, save])

    expect(harness.settings.save).toHaveBeenCalledTimes(2)
    expect(harness.settings.save.mock.calls[0]?.[0]).toMatchObject({
      providers: { "google-ai-studio": createDefaultSettings().providers["google-ai-studio"] },
    })
    expect(harness.settings.save.mock.calls[1]?.[0]).toMatchObject({
      providers: { "google-ai-studio": { model: "newer-model" } },
    })
    expect(credentialStored).toBe(true)
    expect(harness.state()).toMatchObject({
      activeConfig: { model: "newer-model" },
      credentialState: "stored",
      statusMessage: "Saved locally.",
    })
  })

  it("refreshes credential status after a stale destructive action finishes", async () => {
    const harness = createHarness()
    await harness.controller.load()
    let credentialStored = true
    const credentialClear = deferred<void>()
    harness.credentials.clear.mockImplementationOnce(async () => {
      await credentialClear.promise
      credentialStored = false
    })
    harness.credentials.status.mockImplementation(async () => (
      credentialStored ? "stored" as const : "missing" as const
    ))

    const clear = harness.controller.clearCredential()
    await vi.waitFor(() => expect(harness.credentials.clear).toHaveBeenCalledOnce())
    harness.controller.updateConfig({
      ...harness.state().activeConfig,
      model: "edited-while-clearing",
    })
    await vi.waitFor(() => expect(harness.state().credentialState).toBe("stored"))

    credentialClear.resolve()
    await clear
    await vi.waitFor(() => expect(harness.state().credentialState).toBe("missing"))
    expect(credentialStored).toBe(false)
    expect(harness.state()).toMatchObject({
      activeConfig: { model: "edited-while-clearing" },
      dirty: true,
      operation: "idle",
      statusMessage: "",
    })
  })

  it("does not test a newer audience or draft through an older credential load", async () => {
    const harness = createHarness(validSettings("openai-compatible"))
    await harness.controller.load()
    const credentialLoad = deferred<StoredCredential | null>()
    harness.credentials.load.mockReturnValueOnce(credentialLoad.promise)
    harness.controller.setSecretDraft({ apiKey: "old-draft" })

    const staleTest = harness.controller.testConnection()
    await vi.waitFor(() => expect(harness.credentials.load).toHaveBeenCalledOnce())
    harness.controller.updateConfig({
      ...harness.state().activeConfig,
      provider: "openai-compatible",
      baseUrl: "https://new.example/v1",
    })
    harness.controller.setSecretDraft({ apiKey: "new-draft" })
    credentialLoad.resolve(null)
    await staleTest

    expect(harness.client.testConnection).not.toHaveBeenCalled()
    expect(harness.state()).toMatchObject({ operation: "idle", dirty: true, statusMessage: "" })

    harness.credentials.load.mockResolvedValueOnce(null)
    await harness.controller.testConnection()
    expect(harness.client.testConnection).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "https://new.example/v1" }),
      expect.objectContaining({ secret: { apiKey: "new-draft" } }),
      expect.any(AbortSignal),
    )
  })

  it("ignores a stale client test completion after a newer draft edit", async () => {
    const harness = createHarness()
    await harness.controller.load()
    const clientTest = deferred<{ provider: ProviderId; model: string }>()
    harness.client.testConnection.mockReturnValueOnce(clientTest.promise)

    const staleTest = harness.controller.testConnection()
    await vi.waitFor(() => expect(harness.client.testConnection).toHaveBeenCalledOnce())
    harness.controller.setSecretDraft({ apiKey: "newer-draft" })
    clientTest.resolve({ provider: "google-ai-studio", model: "stale-result" })
    await staleTest

    expect(harness.state()).toMatchObject({ operation: "idle", dirty: true, statusMessage: "" })
  })

  it("ignores a stale load completion after a newer edit", async () => {
    const harness = createHarness()
    const settingsLoad = deferred<LlmSettings>()
    harness.settings.load.mockReturnValueOnce(settingsLoad.promise)

    const staleLoad = harness.controller.load()
    harness.controller.updateConfig({
      ...harness.state().activeConfig,
      model: "edited-while-loading",
    })
    settingsLoad.resolve(validSettings("ollama"))
    await staleLoad

    expect(harness.credentials.status).toHaveBeenCalledOnce()
    expect(harness.credentials.status).toHaveBeenCalledWith(
      expect.objectContaining({ model: "edited-while-loading" }),
    )
    expect(harness.state()).toMatchObject({
      activeConfig: { provider: "google-ai-studio", model: "edited-while-loading" },
      dirty: true,
      operation: "idle",
    })
  })

  it("ignores stale clear and reset completions after newer edits", async () => {
    const clearHarness = createHarness()
    await clearHarness.controller.load()
    const clear = deferred<void>()
    clearHarness.credentials.clear.mockReturnValueOnce(clear.promise)
    const staleClear = clearHarness.controller.clearCredential()
    clearHarness.controller.updateConfig({
      ...clearHarness.state().activeConfig,
      model: "edited-while-clearing",
    })
    clear.resolve()
    await staleClear
    expect(clearHarness.state()).toMatchObject({
      activeConfig: { model: "edited-while-clearing" },
      dirty: true,
      operation: "idle",
      statusMessage: "",
    })

    const resetHarness = createHarness()
    await resetHarness.controller.load()
    const clearProvider = deferred<void>()
    resetHarness.credentials.clearProvider.mockReturnValueOnce(clearProvider.promise)
    const staleReset = resetHarness.controller.resetActiveProvider()
    resetHarness.controller.updateConfig({
      ...resetHarness.state().activeConfig,
      model: "edited-while-resetting",
    })
    clearProvider.resolve()
    await staleReset
    expect(resetHarness.settings.save).toHaveBeenCalledWith(expect.objectContaining({
      providers: expect.objectContaining({
        "google-ai-studio": createDefaultSettings().providers["google-ai-studio"],
      }),
    }))
    expect(resetHarness.state()).toMatchObject({
      activeConfig: { model: "edited-while-resetting" },
      dirty: true,
      operation: "idle",
      statusMessage: "",
    })
  })

  it("orders A-B-A credential status checks by generation and handles rejection", async () => {
    const harness = createHarness()
    await harness.controller.load()
    const oldA = deferred<"missing" | "stored" | "stale">()
    const providerB = deferred<"missing" | "stored" | "stale">()
    const newA = deferred<"missing" | "stored" | "stale">()
    harness.credentials.status
      .mockReturnValueOnce(oldA.promise)
      .mockReturnValueOnce(providerB.promise)
      .mockReturnValueOnce(newA.promise)

    harness.controller.updateConfig({ ...harness.state().activeConfig, model: "provider-a" })
    harness.controller.selectProvider("ollama")
    harness.controller.selectProvider("google-ai-studio")
    newA.resolve("stored")
    await vi.waitFor(() => expect(harness.state().credentialState).toBe("stored"))
    oldA.resolve("stale")
    providerB.resolve("missing")
    await Promise.all([oldA.promise, providerB.promise])
    await Promise.resolve()
    expect(harness.state().credentialState).toBe("stored")

    const rejected = deferred<"missing" | "stored" | "stale">()
    harness.credentials.status.mockReturnValueOnce(rejected.promise)
    harness.controller.updateConfig({ ...harness.state().activeConfig, model: "status-error" })
    rejected.reject(new Error("private storage detail"))
    await vi.waitFor(() => expect(harness.state()).toMatchObject({
      operation: "error",
      statusMessage: "Credential status could not be checked.",
      dirty: true,
    }))
  })

  it("isolates subscriber snapshots and cloned updateConfig inputs", async () => {
    const harness = createHarness(validSettings("openai-compatible"))
    await harness.controller.load()
    const incomingHeaderNames = ["x-incoming"]
    harness.controller.updateConfig({
      ...harness.state().activeConfig,
      provider: "openai-compatible",
      customHeaderNames: incomingHeaderNames,
    })
    incomingHeaderNames.push("x-mutated-after-update")

    let secondSnapshot: SettingsState | undefined
    harness.controller.subscribe(snapshot => {
      const exposedSettings = snapshot.settings as unknown as {
        providers: { "openai-compatible": { customHeaderNames: string[] } }
      }
      const exposedConfig = snapshot.activeConfig as unknown as { customHeaderNames: string[] }
      exposedSettings.providers["openai-compatible"].customHeaderNames.push("x-subscriber-mutation")
      exposedConfig.customHeaderNames.push("x-active-config-mutation")
    })
    harness.controller.subscribe(snapshot => { secondSnapshot = snapshot })

    expect(secondSnapshot?.activeConfig).toMatchObject({
      provider: "openai-compatible",
      customHeaderNames: ["x-incoming"],
    })
    expect(secondSnapshot?.settings.providers["openai-compatible"].customHeaderNames)
      .toEqual(["x-incoming"])
  })

  it("clears only the active credential and leaves settings untouched", async () => {
    const harness = createHarness()
    await harness.controller.load()
    await harness.controller.clearCredential()
    expect(harness.credentials.clear).toHaveBeenCalledWith(harness.state().activeConfig)
    expect(harness.settings.save).not.toHaveBeenCalled()
    expect(harness.state().credentialState).toBe("missing")
  })

  it("resets one provider and all of that provider's credential slots", async () => {
    const harness = createHarness(validSettings("google-vertex"))
    await harness.controller.load()
    await harness.controller.resetActiveProvider()
    expect(harness.credentials.clearProvider).toHaveBeenCalledWith("google-vertex")
    expect(harness.settings.save).toHaveBeenCalledWith(expect.objectContaining({
      providers: expect.objectContaining({
        "google-vertex": createDefaultSettings().providers["google-vertex"],
      }),
    }))
    expect(harness.state()).toMatchObject({
      credentialState: "missing",
      dirty: false,
      statusMessage: "Provider reset.",
    })
  })
})

describe("parseCustomHeaders", () => {
  it("accepts an empty value and a string-valued object", () => {
    expect(parseCustomHeaders("")).toEqual({})
    expect(parseCustomHeaders('{"x-tenant":"tenant-a"}')).toEqual({ "x-tenant": "tenant-a" })
  })

  it.each([
    "[]",
    "null",
    '{"x-number":1}',
    '{"Authorization":"secret"}',
    '{"CONTENT-TYPE":"text/plain"}',
    '{"content-length":"1"}',
    '{"Host":"example.test"}',
    '{"connection":"keep-alive"}',
    '{"transfer-encoding":"chunked"}',
    '{"X-Goog-Api-Key":"secret"}',
    '{"apiKey":"collision"}',
    '{"__proto__":"collision"}',
    '{"x-line":"first\\nsecond"}',
  ])("rejects unsafe JSON %s", value => {
    expect(() => parseCustomHeaders(value)).toThrowError(LlmError)
  })
})
