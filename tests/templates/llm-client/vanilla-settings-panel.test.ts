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
    loaded: true,
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
    button(target, "Clear credential").click()
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true))
    button(target, "Reset provider").click()
    button(target, "Close").click()
    fake.publish({ operation: "testing" })
    button(target, "Cancel test").click()

    expect(fake.methods.updateConfig).toHaveBeenCalledWith(expect.objectContaining({ model: "gemini-new" }))
    expect(fake.methods.setSecretDraft).toHaveBeenCalledWith({ apiKey: "draft" })
    expect(fake.methods.save).toHaveBeenCalledOnce()
    expect(fake.methods.testConnection).toHaveBeenCalledOnce()
    expect(fake.methods.cancelTest).toHaveBeenCalledOnce()
    expect(fake.methods.clearCredential).toHaveBeenCalledOnce()
    expect(fake.methods.resetActiveProvider).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it("preserves focus and caret while typing multiple config and secret characters", () => {
    const target = document.createElement("div")
    document.body.append(target)
    const fake = fakeController(providerState("openai-compatible"))
    fake.methods.updateConfig.mockImplementation(config => {
      fake.publish({ activeConfig: config, dirty: true })
    })
    fake.methods.setSecretDraft.mockImplementation(() => {
      fake.publish({ dirty: true })
    })
    mountLlmSettingsPanel(target, fake.controller, vi.fn().mockResolvedValue(undefined))

    const type = (label: string, text: string): void => {
      for (const character of text) {
        const input = labeled<HTMLInputElement | HTMLTextAreaElement>(target, label)
        input.focus()
        input.setSelectionRange(input.value.length, input.value.length)
        input.value = `${input.value}${character}`
        input.dispatchEvent(new Event("input"))
        const current = labeled<HTMLInputElement | HTMLTextAreaElement>(target, label)
        expect(document.activeElement).toBe(current)
        expect(current.selectionStart).toBe(current.value.length)
        expect(current.selectionEnd).toBe(current.value.length)
      }
    }

    labeled<HTMLInputElement>(target, "Model").value = ""
    type("Model", "nova")
    type("API key", "secret")
    type("Custom headers JSON", "{}")
    const authentication = labeled<HTMLSelectElement>(target, "Authentication")
    authentication.focus()
    authentication.value = "none"
    authentication.dispatchEvent(new Event("change"))
    expect(document.activeElement).toBe(labeled(target, "Authentication"))

    expect(fake.methods.updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({ model: "nova" }),
    )
    expect(fake.methods.setSecretDraft).toHaveBeenCalledWith({ apiKey: "secret" })
    expect(fake.methods.setSecretDraft).toHaveBeenLastCalledWith({ customHeadersJson: "{}" })
    expect(labeled<HTMLInputElement>(target, "API key (optional)").value).toBe("secret")
    expect(labeled<HTMLTextAreaElement>(target, "Custom headers JSON").value).toBe("{}")
  })

  it.each(["loading", "saving", "clearing", "resetting"] as const)(
    "locks edits and conflicting actions while %s",
    operation => {
      const target = document.createElement("div")
      const fake = fakeController(state({ operation, loaded: operation !== "loading" }))
      const onClose = vi.fn().mockResolvedValue(undefined)
      mountLlmSettingsPanel(target, fake.controller, onClose)

      const model = labeled<HTMLInputElement>(target, "Model")
      const provider = labeled<HTMLSelectElement>(target, "Provider")
      expect(model.disabled).toBe(true)
      expect(provider.disabled).toBe(true)
      for (const label of ["Save", "Test connection", "Clear credential", "Reset provider"]) {
        expect(button(target, label).disabled).toBe(true)
        button(target, label).click()
      }
      model.value = "blocked"
      model.dispatchEvent(new Event("input"))
      provider.value = "ollama"
      provider.dispatchEvent(new Event("change"))

      expect(fake.methods.updateConfig).not.toHaveBeenCalled()
      expect(fake.methods.selectProvider).not.toHaveBeenCalled()
      expect(fake.methods.save).not.toHaveBeenCalled()
      expect(fake.methods.testConnection).not.toHaveBeenCalled()
      expect(fake.methods.clearCredential).not.toHaveBeenCalled()
      expect(fake.methods.resetActiveProvider).not.toHaveBeenCalled()
    },
  )

  it("keeps only Cancel test active while testing", () => {
    const target = document.createElement("div")
    const fake = fakeController(state({ operation: "testing" }))
    const onClose = vi.fn().mockResolvedValue(undefined)
    mountLlmSettingsPanel(target, fake.controller, onClose)

    for (const element of target.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      "input, select, textarea",
    )) expect(element.disabled).toBe(true)
    for (const label of ["Save", "Test connection", "Clear credential", "Reset provider", "Close"]) {
      expect(button(target, label).disabled).toBe(true)
      button(target, label).click()
    }
    const cancel = button(target, "Cancel test")
    expect(cancel.hidden).toBe(false)
    expect(cancel.disabled).toBe(false)
    cancel.click()

    expect(fake.methods.cancelTest).toHaveBeenCalledOnce()
    expect(fake.methods.save).not.toHaveBeenCalled()
    expect(fake.methods.testConnection).not.toHaveBeenCalled()
    expect(fake.methods.clearCredential).not.toHaveBeenCalled()
    expect(fake.methods.resetActiveProvider).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
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

  it("shows the Ollama hosted-web warning only for local endpoints", () => {
    const target = document.createElement("div")
    const local = providerState("ollama", {
      activeConfig: {
        ...createDefaultSettings().providers.ollama,
        baseUrl: "http://192.168.1.20:11434",
        model: "local-model",
      },
    })
    const fake = fakeController(local)
    mountLlmSettingsPanel(target, fake.controller, vi.fn().mockResolvedValue(undefined))
    expect(target.textContent).toContain("Hosted web cannot reach local Ollama")

    fake.publish({
      activeConfig: { ...local.activeConfig, baseUrl: "https://ollama.example.com" },
    })
    expect(target.textContent).not.toContain("Hosted web cannot reach local Ollama")
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
