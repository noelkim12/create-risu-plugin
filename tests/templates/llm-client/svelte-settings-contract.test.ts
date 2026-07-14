import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(path.join(
  process.cwd(),
  "templates/features/llm-client/svelte/ts/src/features/llm-client/ui/LlmSettingsPanel.svelte",
), "utf8")
const registerSource = readFileSync(path.join(
  process.cwd(),
  "templates/features/llm-client/svelte/ts/src/features/llm-client/register.ts",
), "utf8")

describe("Svelte LLM settings contract", () => {
  it.each([
    "LLM Provider Settings",
    "Provider",
    "Model",
    "Timeout (ms)",
    "API key",
    "API key (optional)",
    "Service Account JSON",
    "Base URL",
    "Custom headers JSON",
    "Save",
    "Test connection",
    "Cancel test",
    "Clear credential",
    "Reset provider",
    "Close",
  ])("contains %s", label => expect(source).toContain(label))

  it.each([
    "Google AI Studio",
    "Google Vertex",
    "OpenAI-compatible",
    "Ollama",
    "API Key",
    "Service Account",
  ])("contains the exact option label %s", label => expect(source).toContain(label))

  it.each([
    "controller.selectProvider",
    "controller.updateConfig",
    "controller.setSecretDraft",
    "controller.save",
    "controller.testConnection",
    "controller.cancelTest",
    "controller.clearCredential",
    "controller.resetActiveProvider",
    "controller.dispose",
  ])("uses %s", call => expect(source).toContain(call))

  it("matches the finalized lifecycle and operation-locking contract", () => {
    expect(source).toContain("controller.subscribe")
    expect(source).toContain("controller.load")
    expect(source).toContain("unsubscribe?.()")
    expect(source).toContain('"loading", "saving", "clearing", "resetting", "testing"')
    expect(source).toContain('state.operation === "testing"')
    expect(source).toContain('state.operation !== "testing"')
  })

  it("keeps secrets transient and presents the local-storage disclosure", () => {
    expect(source).toContain("Leave blank to preserve the stored key.")
    expect(source).toContain("Leave blank to preserve the stored Service Account credential.")
    expect(source).toContain('Leave blank to preserve stored headers; enter {"{}"} to remove them.')
    expect(source).toContain("device-local storage")
    expect(source).toContain("shared between plugins")
    expect(source).toContain("not encrypted or an OS credential vault")
    expect(source).not.toMatch(/value=\{state\.(?:apiKey|serviceAccountJson|customHeadersJson)/)
  })

  it("contains responsive, accessible, and local-routing invariants", () => {
    expect(source).toContain("@media (max-width: 680px)")
    expect(source).toContain("min-height: 44px")
    expect(source).toContain(":focus-visible")
    expect(source).toContain("isLocalNetworkUrl")
    expect(source).toContain("Hosted web cannot reach this local endpoint")
    expect(source).toContain("Hosted web cannot reach local Ollama")
    expect(source).not.toMatch(/innerHTML|insertAdjacentHTML|https?:\/\/[^\s<]+\.(?:js|css)/)
  })

  it("mounts through ContainerHost and returns Svelte teardown", () => {
    expect(registerSource).toContain("host.open")
    expect(registerSource).toContain("mount(LlmSettingsPanel")
    expect(registerSource).toContain("props: { controller: llmSettingsController, onClose: close }")
    expect(registerSource).toContain("return () => unmount(component)")
    expect(registerSource).not.toContain("document.createElement")
  })
})
