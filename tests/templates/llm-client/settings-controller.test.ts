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
