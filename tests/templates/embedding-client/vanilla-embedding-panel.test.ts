import { afterEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => { vi.stubGlobal("risuai", {}) })

import type { EmbeddingConfigId } from "../../../templates/features/embedding-client/common/ts/src/features/embedding-client/core/types"
import { isEmbeddingConfigId } from "../../../templates/features/embedding-client/common/ts/src/features/embedding-client/core/types"
import {
  defaultEmbeddingConfigDraft,
  type EmbeddingConfigSummary,
} from "../../../templates/features/embedding-client/common/ts/src/features/embedding-client/settings/config-drafts"
import type {
  EmbeddingControllerState,
  EmbeddingSettingsController,
} from "../../../templates/features/embedding-client/common/ts/src/features/embedding-client/settings/embedding-controller"
import { mountEmbeddingPanel } from "../../../templates/features/embedding-client/vanilla/ts/src/features/embedding-client/ui/embedding-panel"

const CONFIG_ID_VALUE = "11111111-1111-4111-8111-111111111111"
if (!isEmbeddingConfigId(CONFIG_ID_VALUE)) throw new TypeError("Invalid embedding test configuration id.")
const CONFIG_ID = CONFIG_ID_VALUE as EmbeddingConfigId

function configSummary(patch: Partial<EmbeddingConfigSummary> = {}): EmbeddingConfigSummary {
  return {
    id: CONFIG_ID,
    name: "Production",
    provider: "voyage",
    modelId: "voyage-3-large",
    endpoint: null,
    credentialId: null,
    credentialName: "Voyage key",
    credentialStatus: "linked",
    ...patch,
  }
}

function state(patch: Partial<EmbeddingControllerState> = {}): EmbeddingControllerState {
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
  let listener: ((value: EmbeddingControllerState) => void) | undefined
  const unsubscribe = vi.fn(() => { listener = undefined })
  const methods = {
    subscribe: vi.fn((next: (value: EmbeddingControllerState) => void) => {
      listener = next
      next(current)
      return unsubscribe
    }),
    load: vi.fn().mockResolvedValue(undefined),
    beginCreate: vi.fn(() => defaultEmbeddingConfigDraft()),
    beginEdit: vi.fn(() => defaultEmbeddingConfigDraft()),
    saveDraft: vi.fn().mockResolvedValue(undefined),
    deleteConfig: vi.fn().mockResolvedValue(undefined),
    testConnection: vi.fn().mockResolvedValue(undefined),
    cancelTest: vi.fn(),
  }
  return {
    controller: methods as unknown as EmbeddingSettingsController,
    methods,
    publish(patch: Partial<EmbeddingControllerState>) {
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

function openEditor(target: HTMLElement): void {
  button(target, "New embedding configuration").click()
}

describe("Vanilla embedding panel progressive disclosure", () => {
  afterEach(() => {
    document.body.replaceChildren()
    vi.unstubAllGlobals()
  })

  it("keeps advanced controls inside a closed details and essentials outside it", () => {
    const target = document.createElement("div")
    document.body.append(target)
    const fake = fakeController()
    mountEmbeddingPanel(target, fake.controller)
    openEditor(target)

    const details = target.querySelector<HTMLDetailsElement>("details.ai-embedding-disclosure")
    expect(details).toBeTruthy()
    expect(details?.querySelector("summary")?.textContent).toBe("Advanced settings")
    expect(details?.open).toBe(false)

    expect(details?.contains(target.querySelector("#ai-embedding-timeout"))).toBe(true)
    expect(details?.contains(target.querySelector("#ai-embedding-encoding"))).toBe(true)
    expect(details?.contains(target.querySelector("#ai-embedding-input-type"))).toBe(true)
    expect(details?.contains(target.querySelector("#ai-embedding-dtype"))).toBe(true)
    expect(details?.contains(target.querySelector("#ai-embedding-dimension"))).toBe(true)
    expect(details?.contains(target.querySelector("#ai-embedding-truncation"))).toBe(true)
    expect(details?.contains(target.querySelector("#ai-embedding-name"))).toBe(false)
    expect(details?.contains(target.querySelector("#ai-embedding-model"))).toBe(false)
    expect(details?.contains(target.querySelector("#ai-embedding-provider"))).toBe(false)
    expect(details?.contains(target.querySelector("#ai-embedding-credential"))).toBe(false)
    expect(target.querySelector("#ai-embedding-key")).toBeNull()
    expect(target.textContent).toContain("AI Services Keys")
  })

  it("shows only endpoint and authentication essentials for OpenAI-compatible providers", () => {
    const target = document.createElement("div")
    document.body.append(target)
    const fake = fakeController()
    mountEmbeddingPanel(target, fake.controller)
    openEditor(target)

    const provider = target.querySelector<HTMLSelectElement>("#ai-embedding-provider")
    if (!provider) throw new Error("Missing provider select")
    provider.value = "openai-compatible"
    provider.dispatchEvent(new Event("change"))

    const details = target.querySelector("details.ai-embedding-disclosure")
    expect(target.querySelector("#ai-embedding-endpoint")).toBeTruthy()
    expect(target.querySelector("#ai-embedding-auth")).toBeTruthy()
    expect(details?.contains(target.querySelector("#ai-embedding-endpoint"))).toBe(false)
    expect(details?.contains(target.querySelector("#ai-embedding-auth"))).toBe(false)
    expect(details?.contains(target.querySelector("#ai-embedding-dimensions"))).toBe(true)
    expect(details?.contains(target.querySelector("#ai-embedding-input-type"))).toBe(false)
    expect(target.querySelector("#ai-embedding-credential")).toBeNull()
  })

  it("preserves advanced draft values and disclosure state across re-renders", () => {
    const target = document.createElement("div")
    document.body.append(target)
    const fake = fakeController()
    mountEmbeddingPanel(target, fake.controller)
    openEditor(target)

    const timeout = target.querySelector<HTMLInputElement>("#ai-embedding-timeout")
    if (!timeout) throw new Error("Missing timeout input")
    timeout.value = "45000"
    timeout.dispatchEvent(new Event("input"))

    const details = target.querySelector<HTMLDetailsElement>("details.ai-embedding-disclosure")
    if (!details) throw new Error("Missing details")
    details.open = true
    details.dispatchEvent(new Event("toggle"))

    fake.publish({ statusMessage: "refreshed" })

    const nextTimeout = target.querySelector<HTMLInputElement>("#ai-embedding-timeout")
    const nextDetails = target.querySelector<HTMLDetailsElement>("details.ai-embedding-disclosure")
    expect(nextTimeout?.value).toBe("45000")
    expect(nextDetails?.open).toBe(true)
  })

  it("wires per-row Test connection and a single Cancel test through the controller", () => {
    const target = document.createElement("div")
    document.body.append(target)
    const fake = fakeController()
    mountEmbeddingPanel(target, fake.controller)

    expect(() => button(target, "Cancel test")).toThrow()

    button(target, "Test connection for Production").click()
    expect(fake.methods.testConnection).toHaveBeenCalledWith(CONFIG_ID)

    fake.publish({ operation: "testing", statusMessage: "Testing connection…" })
    expect(button(target, "Test connection").disabled).toBe(true)
    expect(button(target, "Edit").disabled).toBe(true)
    expect(button(target, "Delete").disabled).toBe(true)
    const cancel = button(target, "Cancel test")
    expect(cancel.disabled).toBe(false)
    const status = target.querySelector('[role="status"]')
    expect(status?.textContent).toBe("Testing connection…")

    cancel.click()
    expect(fake.methods.cancelTest).toHaveBeenCalledTimes(1)
  })

  it("disables Test connection when the linked key is unlinked, missing, or stale", () => {
    const target = document.createElement("div")
    document.body.append(target)
    const fake = fakeController()
    mountEmbeddingPanel(target, fake.controller)

    fake.publish({ configs: [configSummary({ credentialStatus: "stale" })] })
    expect(button(target, "Test connection").disabled).toBe(true)

    fake.publish({ configs: [configSummary({ credentialStatus: "missing" })] })
    expect(button(target, "Test connection").disabled).toBe(true)

    fake.publish({ configs: [configSummary({ credentialStatus: "unlinked" })] })
    expect(button(target, "Test connection").disabled).toBe(true)

    fake.publish({ configs: [configSummary({ credentialStatus: "not-required" })] })
    expect(button(target, "Test connection").disabled).toBe(false)
  })
})
