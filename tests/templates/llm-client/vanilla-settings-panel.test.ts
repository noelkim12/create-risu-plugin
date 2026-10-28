import { afterEach, describe, expect, it, vi } from "vitest"

import { parseCredentialMetadata, parseResolvedCredential } from "../../../templates/features/credential-manager/common/ts/src/features/credential-manager/core/validation"
import type { CredentialSummary } from "../../../templates/features/credential-manager/common/ts/src/features/credential-manager/core/types"
import type { LlmSettings } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/core/types"
import { parseStoredSettings } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/core/validation"
import { LlmSettingsController } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/settings/settings-controller"
import { mountLlmSettingsPanel } from "../../../templates/features/llm-client/vanilla/ts/src/features/llm-client/ui/settings-panel"

const KEY_ID = "11111111-1111-4111-8111-111111111111"
const MODEL_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

function settingsFixture(): LlmSettings {
  return parseStoredSettings({
    schemaVersion: 2,
    savedModelConfigs: [{
      id: MODEL_ID,
      name: "OpenAI model",
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
}

function credentialFixture(): { readonly summary: CredentialSummary; readonly resolved: NonNullable<ReturnType<typeof parseResolvedCredential>> } {
  const metadata = parseCredentialMetadata({
    id: KEY_ID, name: "OpenAI key", provider: "openai-compatible", kind: "api-key",
    authMode: "bearer", audience: "https://llm.example/v1/chat/completions", updatedAt: 1,
  })
  const resolved = parseResolvedCredential({
    schemaVersion: 2, keyId: KEY_ID, provider: "openai-compatible", kind: "api-key",
    audience: "https://llm.example/v1/chat/completions", revision: "revision", updatedAt: 1,
    secret: { apiKey: "test-secret" },
  })
  if (metadata === null || resolved === null) throw new TypeError("Expected credential fixtures.")
  return { summary: { ...metadata, status: "stored", credentialUpdatedAt: 1, maskedSecret: "tes…ret" }, resolved }
}

function harness() {
  let current = settingsFixture()
  const settings = {
    load: vi.fn(async () => structuredClone(current)),
    save: vi.fn(async (next: LlmSettings) => { current = structuredClone(next) }),
  }
  const credential = credentialFixture()
  const credentials = {
    listCompatible: vi.fn().mockResolvedValue([credential.summary]),
    resolveCredential: vi.fn().mockResolvedValue(credential.resolved),
  }
  const client = { testConnection: vi.fn().mockResolvedValue({ provider: "openai-compatible", model: "test-model" }) }
  const controller = new LlmSettingsController(settings, credentials, client)
  const target = document.createElement("div")
  document.body.append(target)
  const mounted = mountLlmSettingsPanel(target, controller)
  return { client, credentials, mounted, settings, target }
}

function labeled<T extends HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(target: HTMLElement, text: string): T {
  const label = [...target.querySelectorAll("label")].find(element => element.textContent === text)
  const control = label?.htmlFor === undefined ? null : target.querySelector(`#${label.htmlFor}`)
  if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) {
    throw new TypeError(`Missing control labelled ${text}.`)
  }
  return control as T
}

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe("Vanilla LLM model panel", () => {
  it("renders model-only settings without credential lifecycle controls", async () => {
    const value = harness()
    await vi.waitFor(() => expect(value.target.textContent).toContain("Model Configurations"))
    await vi.waitFor(() => expect(value.target.querySelector(".llm-catalog-row")?.textContent).toContain("OpenAI model"))

    expect(value.target.textContent).not.toContain("Reset catalog")
    expect(value.target.textContent).not.toContain("Reveal key")
    expect(value.target.querySelector('input[type="password"]')).toBeNull()
    expect(value.target.textContent).toContain("Manage saved credentials in AI Services Keys")
    expect(value.target.querySelector("h2#llm-models-heading")?.textContent).toBe("Model Configurations")
    expect(value.target.querySelector(".llm-catalog-select-active .llm-catalog-name")?.textContent).toContain("OpenAI model")
    expect(value.target.querySelector(".llm-catalog-meta")?.textContent).toBe("model: test-model")
    expect(value.target.querySelector(".llm-flags legend")?.textContent).toBe("Capability flags")
    value.mounted.destroy()
  })

  it("selects compatible manager keys and saves model-only settings", async () => {
    const value = harness()
    await vi.waitFor(() => expect(value.target.textContent).toContain("OpenAI key"))
    const key = labeled<HTMLSelectElement>(value.target, "Linked key")
    key.value = KEY_ID
    key.dispatchEvent(new Event("change"))
    const name = labeled<HTMLInputElement>(value.target, "Name")
    name.value = "Renamed model"
    name.dispatchEvent(new Event("input"))
    const save = [...value.target.querySelectorAll("button")].find(element => element.textContent === "Save model")
    if (save === undefined) throw new TypeError("Missing save button.")
    save.click()

    await vi.waitFor(() => expect(value.settings.save).toHaveBeenCalled())
    expect(value.settings.save).toHaveBeenCalledWith(expect.not.objectContaining({ savedKeys: expect.anything() }))
    value.mounted.destroy()
  })

  it("tests the selected model with a manager-resolved credential", async () => {
    const value = harness()
    await vi.waitFor(() => {
      const current = [...value.target.querySelectorAll("button")].find(element => element.textContent === "Test connection")
      expect(current?.disabled).toBe(false)
    })
    const test = [...value.target.querySelectorAll("button")].find(element => element.textContent === "Test connection")
    if (test === undefined) throw new TypeError("Missing connection-test button.")
    test.click()

    await vi.waitFor(() => expect(value.client.testConnection).toHaveBeenCalled())
    expect(value.credentials.resolveCredential).toHaveBeenCalledWith(KEY_ID, expect.objectContaining({ provider: "openai-compatible" }))
    value.mounted.destroy()
  })
})
