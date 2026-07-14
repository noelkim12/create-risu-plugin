import { afterEach, describe, expect, it, vi } from "vitest"

import type { ProviderId } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/core/types"
import { createDefaultSettings } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/core/validation"
import type {
  LlmSettingsController,
  SettingsState,
} from "../../../templates/features/llm-client/common/ts/src/features/llm-client/settings/settings-controller"
import { mountLlmSettingsPanel } from "../../../templates/features/llm-client/vanilla/ts/src/features/llm-client/ui/settings-panel"

function state(patch: Partial<SettingsState> = {}): SettingsState {
  const settings = createDefaultSettings()
  const activeConfig = { ...settings.providers["google-ai-studio"], model: "gemini-test" }
  return {
    operation: "idle",
    settings: {
      ...settings,
      providers: { ...settings.providers, "google-ai-studio": activeConfig },
    },
    activeConfig,
    credentialState: "stored",
    dirty: false,
    fieldErrors: {},
    statusMessage: "",
    runtimePlatform: "web",
    ...patch,
  }
}

function providerState(provider: ProviderId, patch: Partial<SettingsState> = {}): SettingsState {
  const settings = createDefaultSettings()
  const activeConfig = { ...settings.providers[provider], model: `${provider}-model` }
  return state({
    settings: {
      ...settings,
      activeProvider: provider,
      providers: { ...settings.providers, [provider]: activeConfig },
    },
    activeConfig,
    ...patch,
  })
}

function fakeController(initial = state()) {
  let current = initial
  let listener: ((value: SettingsState) => void) | undefined
  const unsubscribe = vi.fn(() => { listener = undefined })
  const controller = {
    subscribe: vi.fn((next: (value: SettingsState) => void) => {
      listener = next
      next(current)
      return unsubscribe
    }),
    load: vi.fn().mockResolvedValue(undefined),
    selectProvider: vi.fn(),
    updateConfig: vi.fn(),
    setSecretDraft: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
    testConnection: vi.fn().mockResolvedValue(undefined),
    cancelTest: vi.fn(),
    clearCredential: vi.fn().mockResolvedValue(undefined),
    resetActiveProvider: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
  }
  return {
    controller: controller as unknown as LlmSettingsController,
    methods: controller,
    publish(patch: Partial<SettingsState>) {
      current = { ...current, ...patch }
      listener?.(current)
    },
    unsubscribe,
  }
}

function labeled<T extends HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
  target: HTMLElement,
  labelText: string,
): T {
  const label = [...target.querySelectorAll("label")]
    .find(element => element.textContent === labelText)
  const control = label?.htmlFor ? target.querySelector(`#${label.htmlFor}`) : null
  if (!control) throw new Error(`Missing control labelled ${labelText}`)
  return control as T
}

function button(target: HTMLElement, label: string): HTMLButtonElement {
  const result = [...target.querySelectorAll("button")]
    .find(element => element.textContent === label)
  if (!result) throw new Error(`Missing button ${label}`)
  return result
}

describe("Vanilla LLM settings panel", () => {
  afterEach(() => {
    document.body.replaceChildren()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("renders accessible controls without hydrating stored secrets", () => {
    const target = document.createElement("div")
    document.body.append(target)
    const fake = fakeController()
    mountLlmSettingsPanel(target, fake.controller, vi.fn().mockResolvedValue(undefined))

    expect(target.querySelector("h1")?.textContent).toBe("LLM Provider Settings")
    expect(labeled(target, "Provider")).toBeTruthy()
    expect(button(target, "Save")).toBeTruthy()
    expect(button(target, "Test connection")).toBeTruthy()
    expect(button(target, "Clear credential")).toBeTruthy()
    expect(button(target, "Reset provider")).toBeTruthy()
    expect(labeled<HTMLInputElement>(target, "API key").value).toBe("")
    expect(target.textContent).toContain("Leave blank to preserve the stored key.")
    expect(target.textContent).toContain("Stored locally")
    expect(target.textContent).toContain("device-local")
    expect(target.textContent).toContain("shared between plugins")
    expect(target.textContent).toContain("not encrypted")
  })

  it("offers all four providers with the exact public labels", () => {
    const target = document.createElement("div")
    const fake = fakeController()
    mountLlmSettingsPanel(target, fake.controller, vi.fn().mockResolvedValue(undefined))

    const provider = labeled<HTMLSelectElement>(target, "Provider")
    expect([...provider.options].map(option => [option.value, option.textContent])).toEqual([
      ["google-ai-studio", "Google AI Studio"],
      ["google-vertex", "Google Vertex"],
      ["openai-compatible", "OpenAI-compatible"],
      ["ollama", "Ollama"],
    ])
    provider.value = "ollama"
    provider.dispatchEvent(new Event("change"))
    expect(fake.methods.selectProvider).toHaveBeenCalledWith("ollama")
  })

  it("renders both exact Vertex authentication labels and their secret-safe fields", () => {
    const target = document.createElement("div")
    const fake = fakeController(providerState("google-vertex"))
    mountLlmSettingsPanel(target, fake.controller, vi.fn().mockResolvedValue(undefined))

    expect(button(target, "API Key").getAttribute("aria-selected")).toBe("true")
    expect(button(target, "Service Account").getAttribute("aria-selected")).toBe("false")
    expect(labeled<HTMLInputElement>(target, "API key").value).toBe("")

    fake.publish({
      activeConfig: {
        ...providerState("google-vertex").activeConfig,
        provider: "google-vertex",
        authMode: "service-account",
        projectId: "project",
        location: "global",
      },
    })
    expect(labeled(target, "Project ID")).toBeTruthy()
    expect(labeled(target, "Location")).toBeTruthy()
    expect(labeled<HTMLTextAreaElement>(target, "Service Account JSON").value).toBe("")
  })

  it("renders provider errors as text rather than markup", () => {
    const target = document.createElement("div")
    const fake = fakeController()
    mountLlmSettingsPanel(target, fake.controller, vi.fn().mockResolvedValue(undefined))
    const malicious = "<img src=x onerror=alert(1)>"
    fake.publish({ operation: "error", statusMessage: malicious })
    expect(target.textContent).toContain(malicious)
    expect(target.querySelector("img")).toBeNull()
  })

  it("routes edits and every action to the controller", () => {
    const target = document.createElement("div")
    const fake = fakeController()
    const onClose = vi.fn().mockResolvedValue(undefined)
    mountLlmSettingsPanel(target, fake.controller, onClose)

    const model = labeled<HTMLInputElement>(target, "Model")
    model.value = "gemini-new"
    model.dispatchEvent(new Event("input"))
    const apiKey = labeled<HTMLInputElement>(target, "API key")
    apiKey.value = "draft"
    apiKey.dispatchEvent(new Event("input"))
    button(target, "Save").click()
    button(target, "Test connection").click()
    button(target, "Cancel test").click()
    button(target, "Clear credential").click()
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true))
    button(target, "Reset provider").click()
    button(target, "Close").click()

    expect(fake.methods.updateConfig).toHaveBeenCalledWith(expect.objectContaining({ model: "gemini-new" }))
    expect(fake.methods.setSecretDraft).toHaveBeenCalledWith({ apiKey: "draft" })
    expect(fake.methods.save).toHaveBeenCalledOnce()
    expect(fake.methods.testConnection).toHaveBeenCalledOnce()
    expect(fake.methods.cancelTest).toHaveBeenCalledOnce()
    expect(fake.methods.clearCredential).toHaveBeenCalledOnce()
    expect(fake.methods.resetActiveProvider).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it("reflects saving and testing states without duplicating controller behavior", () => {
    const target = document.createElement("div")
    const fake = fakeController()
    mountLlmSettingsPanel(target, fake.controller, vi.fn().mockResolvedValue(undefined))

    expect(button(target, "Cancel test").hidden).toBe(true)
    fake.publish({ operation: "saving" })
    expect(button(target, "Save").disabled).toBe(true)
    fake.publish({ operation: "testing" })
    expect(button(target, "Test connection").disabled).toBe(true)
    expect(button(target, "Cancel test").hidden).toBe(false)
  })

  it("shows web-local routing warnings for compatible endpoints", () => {
    const target = document.createElement("div")
    const fake = fakeController(providerState("openai-compatible", {
      activeConfig: {
        ...createDefaultSettings().providers["openai-compatible"],
        baseUrl: "http://127.0.0.1:8080/v1",
        model: "local-model",
      },
    }))
    mountLlmSettingsPanel(target, fake.controller, vi.fn().mockResolvedValue(undefined))
    expect(target.textContent).toContain("Hosted web cannot reach this local endpoint")
  })

  it("unsubscribes, disposes, and clears the target", () => {
    const target = document.createElement("div")
    const fake = fakeController()
    const mounted = mountLlmSettingsPanel(
      target,
      fake.controller,
      vi.fn().mockResolvedValue(undefined),
    )
    mounted.destroy()
    expect(fake.unsubscribe).toHaveBeenCalledOnce()
    expect(fake.methods.dispose).toHaveBeenCalledOnce()
    expect(target.childElementCount).toBe(0)
  })
})
