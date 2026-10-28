import { afterEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => { vi.stubGlobal("risuai", {}) })

import type { ContextualEmbeddingConfigId } from "../../../templates/features/contextual-embedding-client/common/ts/src/features/contextual-embedding-client/core/types"
import { defaultContextualEmbeddingDraft } from "../../../templates/features/contextual-embedding-client/common/ts/src/features/contextual-embedding-client/core/types"
import type {
  ContextualEmbeddingConfigSummary,
  ContextualEmbeddingSettingsController,
  ContextualEmbeddingSettingsState,
} from "../../../templates/features/contextual-embedding-client/common/ts/src/features/contextual-embedding-client/settings/settings-controller"
import { mountContextualEmbeddingPanel } from "../../../templates/features/contextual-embedding-client/vanilla/ts/src/features/contextual-embedding-client/ui/contextual-panel"

const CONFIG_ID_VALUE = "22222222-2222-4222-8222-222222222222"
const CONFIG_ID = CONFIG_ID_VALUE as ContextualEmbeddingConfigId

function configSummary(patch: Partial<ContextualEmbeddingConfigSummary> = {}): ContextualEmbeddingConfigSummary {
  return {
    id: CONFIG_ID,
    name: "Production retrieval",
    provider: "voyage",
    model: "voyage-context-4",
    credentialId: null,
    timeoutMs: 60_000,
    inputType: null,
    outputDimension: null,
    outputDtype: "float",
    base64: false,
    credentialName: "Voyage key",
    credentialStatus: "stored",
    ...patch,
  }
}

function state(patch: Partial<ContextualEmbeddingSettingsState> = {}): ContextualEmbeddingSettingsState {
  return {
    loaded: true,
    operation: "idle",
    configs: [configSummary()],
    voyageCredentials: [],
    editingId: null,
    draft: null,
    statusMessage: "",
    ...patch,
  }
}

function fakeController(initial = state()) {
  let current = initial
  let listener: ((value: ContextualEmbeddingSettingsState) => void) | undefined
  const unsubscribe = vi.fn(() => { listener = undefined })
  const methods = {
    subscribe: vi.fn((next: (value: ContextualEmbeddingSettingsState) => void) => {
      listener = next
      next(current)
      return unsubscribe
    }),
    load: vi.fn().mockResolvedValue(undefined),
    startCreate: vi.fn(() => {
      current = { ...current, editingId: null, draft: defaultContextualEmbeddingDraft() }
      listener?.(current)
    }),
    startEdit: vi.fn(),
    updateDraft: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
    cancelEdit: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
    testConnection: vi.fn().mockResolvedValue(undefined),
    cancelTest: vi.fn(),
  }
  return {
    controller: methods as unknown as ContextualEmbeddingSettingsController,
    methods,
    publish(patch: Partial<ContextualEmbeddingSettingsState>) {
      current = { ...current, ...patch }
      listener?.(current)
    },
  }
}

function button(target: HTMLElement, label: string): HTMLButtonElement {
  const result = [...target.querySelectorAll("button")].find(element =>
    element.textContent === label || element.getAttribute("aria-label") === label)
  if (!result) throw new Error(`Missing button ${label}`)
  return result
}

describe("Vanilla contextual embedding panel progressive disclosure", () => {
  afterEach(() => {
    document.body.replaceChildren()
    vi.unstubAllGlobals()
  })

  it("keeps advanced controls inside a closed details and essentials outside it", () => {
    const target = document.createElement("div")
    document.body.append(target)
    const fake = fakeController()
    mountContextualEmbeddingPanel(target, fake.controller)
    button(target, "New configuration").click()

    const details = target.querySelector("details.ai-contextual-disclosure")
    expect(details).toBeTruthy()
    expect(details?.querySelector("summary")?.textContent).toBe("Advanced settings")
    expect(details?.open).toBe(false)

    expect(details?.contains(target.querySelector("#ai-contextual-timeout"))).toBe(true)
    expect(details?.contains(target.querySelector("#ai-contextual-input-type"))).toBe(true)
    expect(details?.contains(target.querySelector("#ai-contextual-dimension"))).toBe(true)
    expect(details?.contains(target.querySelector("#ai-contextual-dtype"))).toBe(true)
    expect(details?.contains(target.querySelector("#ai-contextual-encoding"))).toBe(true)
    expect(details?.contains(target.querySelector("#ai-contextual-name"))).toBe(false)
    expect(details?.contains(target.querySelector("#ai-contextual-model"))).toBe(false)
    expect(details?.contains(target.querySelector("#ai-contextual-credential"))).toBe(false)
  })

  it("preserves the disclosure open state across draft-driven re-renders", () => {
    const target = document.createElement("div")
    document.body.append(target)
    const fake = fakeController()
    mountContextualEmbeddingPanel(target, fake.controller)
    button(target, "New configuration").click()

    const details = target.querySelector<HTMLDetailsElement>("details.ai-contextual-disclosure")
    if (!details) throw new Error("Missing details")
    details.open = true
    details.dispatchEvent(new Event("toggle"))

    const name = target.querySelector<HTMLInputElement>("#ai-contextual-name")
    if (!name) throw new Error("Missing name input")
    name.value = "Renamed"
    name.dispatchEvent(new Event("input"))

    const nextDetails = target.querySelector<HTMLDetailsElement>("details.ai-contextual-disclosure")
    expect(nextDetails?.open).toBe(true)
    expect(fake.methods.updateDraft).toHaveBeenCalled()
  })

  it("wires per-row Test connection and a single Cancel test through the controller", () => {
    const target = document.createElement("div")
    document.body.append(target)
    const fake = fakeController()
    mountContextualEmbeddingPanel(target, fake.controller)

    expect(() => button(target, "Cancel test")).toThrow()

    button(target, "Test connection for Production retrieval").click()
    expect(fake.methods.testConnection).toHaveBeenCalledWith(CONFIG_ID)

    fake.publish({ operation: "testing", statusMessage: "Testing connection…" })
    expect(button(target, "Test connection").disabled).toBe(true)
    expect(button(target, "Edit").disabled).toBe(true)
    expect(button(target, "Delete").disabled).toBe(true)
    const cancel = button(target, "Cancel test")
    expect(cancel.disabled).toBe(false)
    expect(target.querySelector('[role="status"]')?.textContent).toBe("Testing connection…")

    cancel.click()
    expect(fake.methods.cancelTest).toHaveBeenCalledTimes(1)
  })

  it("disables Test connection when no key is linked or the linked key needs attention", () => {
    const target = document.createElement("div")
    document.body.append(target)
    const fake = fakeController()
    mountContextualEmbeddingPanel(target, fake.controller)

    fake.publish({ configs: [configSummary({ credentialStatus: null, credentialName: null })] })
    expect(button(target, "Test connection").disabled).toBe(true)

    fake.publish({ configs: [configSummary({ credentialStatus: "stale" })] })
    expect(button(target, "Test connection").disabled).toBe(true)

    fake.publish({ configs: [configSummary({ credentialStatus: "missing" })] })
    expect(button(target, "Test connection").disabled).toBe(true)

    fake.publish({ configs: [configSummary({ credentialStatus: "stored" })] })
    expect(button(target, "Test connection").disabled).toBe(false)
  })
})
