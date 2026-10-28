import { afterEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => { vi.stubGlobal("risuai", {}) })

import type { RerankerConfig, RerankerConfigId, RerankerConfigSummary } from "../../../templates/features/reranker-client/common/ts/src/features/reranker-client/core/types"
import type {
  RerankerSettingsController,
  RerankerSettingsState,
} from "../../../templates/features/reranker-client/common/ts/src/features/reranker-client/settings/settings-controller"
import { mountRerankerSettingsSection } from "../../../templates/features/reranker-client/vanilla/ts/src/features/reranker-client/ui/reranker-section"

const CONFIG_ID_VALUE = "33333333-3333-4333-8333-333333333333"
const CONFIG_ID = CONFIG_ID_VALUE as RerankerConfigId

function configSummary(patch: Partial<RerankerConfigSummary> = {}): RerankerConfigSummary {
  const base: RerankerConfig = {
    id: CONFIG_ID,
    name: "Night shift",
    provider: "voyage",
    model: "rerank-2.5",
    credentialId: null,
    timeoutMs: 60_000,
    defaults: { topK: null, returnDocuments: false, truncation: true },
  }
  return {
    ...base,
    credentialName: "Voyage key",
    credentialStatus: "stored",
    ...patch,
  }
}

function state(patch: Partial<RerankerSettingsState> = {}): RerankerSettingsState {
  return {
    loaded: true,
    operation: "idle",
    configs: [configSummary()],
    credentials: [],
    statusMessage: "",
    ...patch,
  }
}

function fakeController(initial = state()) {
  let current = initial
  let listener: ((value: RerankerSettingsState) => void) | undefined
  const unsubscribe = vi.fn(() => { listener = undefined })
  const methods = {
    subscribe: vi.fn((next: (value: RerankerSettingsState) => void) => {
      listener = next
      next(current)
      return unsubscribe
    }),
    load: vi.fn().mockResolvedValue(undefined),
    saveConfig: vi.fn().mockResolvedValue(undefined),
    deleteConfig: vi.fn().mockResolvedValue(undefined),
    testConnection: vi.fn().mockResolvedValue(undefined),
    cancelTest: vi.fn(),
  }
  return {
    controller: methods as unknown as RerankerSettingsController,
    methods,
    publish(patch: Partial<RerankerSettingsState>) {
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

describe("Vanilla reranker section progressive disclosure", () => {
  afterEach(() => {
    document.body.replaceChildren()
    vi.unstubAllGlobals()
  })

  it("keeps advanced controls inside a closed details and essentials outside it", () => {
    const target = document.createElement("div")
    document.body.append(target)
    const fake = fakeController()
    mountRerankerSettingsSection(target, fake.controller)

    const details = target.querySelector("details.ai-reranker-disclosure")
    expect(details).toBeTruthy()
    expect(details?.querySelector("summary")?.textContent).toBe("Advanced settings")
    expect(details?.open).toBe(false)

    expect(details?.contains(target.querySelector("#ai-reranker-timeout"))).toBe(true)
    expect(details?.contains(target.querySelector("#ai-reranker-topk"))).toBe(true)
    expect(details?.contains(target.querySelector("#ai-reranker-return-documents"))).toBe(true)
    expect(details?.contains(target.querySelector("#ai-reranker-truncation"))).toBe(true)
    expect(details?.contains(target.querySelector("#ai-reranker-name"))).toBe(false)
    expect(details?.contains(target.querySelector("#ai-reranker-model"))).toBe(false)
    expect(details?.contains(target.querySelector("#ai-reranker-credential"))).toBe(false)
  })

  it("preserves the disclosure open state across re-renders", () => {
    const target = document.createElement("div")
    document.body.append(target)
    const fake = fakeController()
    mountRerankerSettingsSection(target, fake.controller)

    const details = target.querySelector<HTMLDetailsElement>("details.ai-reranker-disclosure")
    if (!details) throw new Error("Missing details")
    details.open = true
    details.dispatchEvent(new Event("toggle"))

    fake.publish({ statusMessage: "refreshed" })

    expect(target.querySelector<HTMLDetailsElement>("details.ai-reranker-disclosure")?.open).toBe(true)
  })

  it("wires per-row Test connection and a single Cancel test through the controller", () => {
    const target = document.createElement("div")
    document.body.append(target)
    const fake = fakeController()
    mountRerankerSettingsSection(target, fake.controller)

    expect(() => button(target, "Cancel test")).toThrow()

    button(target, "Test connection for Night shift").click()
    expect(fake.methods.testConnection).toHaveBeenCalledWith(CONFIG_ID)

    fake.publish({ operation: "testing", statusMessage: "Testing connection…" })
    expect(button(target, "Test connection").disabled).toBe(true)
    expect(button(target, "Edit").disabled).toBe(true)
    expect(button(target, "Delete").disabled).toBe(true)
    expect(button(target, "Save configuration").disabled).toBe(true)
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
    mountRerankerSettingsSection(target, fake.controller)

    fake.publish({ configs: [configSummary({ credentialStatus: "none", credentialName: null })] })
    expect(button(target, "Test connection").disabled).toBe(true)

    fake.publish({ configs: [configSummary({ credentialStatus: "stale" })] })
    expect(button(target, "Test connection").disabled).toBe(true)

    fake.publish({ configs: [configSummary({ credentialStatus: "missing" })] })
    expect(button(target, "Test connection").disabled).toBe(true)

    fake.publish({ configs: [configSummary({ credentialStatus: "stored" })] })
    expect(button(target, "Test connection").disabled).toBe(false)
  })
})
