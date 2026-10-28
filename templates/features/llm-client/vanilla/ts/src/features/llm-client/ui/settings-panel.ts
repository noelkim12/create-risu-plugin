// allow: SIZE_OK - the framework renderer keeps the complete model editor in one DOM lifecycle.
import { isCredentialId } from "../../credential-manager/core/validation"
import { MODEL_FLAGS } from "../core/types"
import type { ProviderId, ReasoningEffort, SavedModelConfig } from "../core/types"
import { isLocalNetworkUrl } from "../network/url-policy"
import type { LlmSettingsController, SettingsOperation, SettingsState } from "../settings/settings-controller"

export interface MountedLlmSettingsPanel {
  destroy(): void
}

const PROVIDER_LABELS: Readonly<Record<ProviderId, string>> = {
  "google-ai-studio": "Google AI Studio",
  "google-vertex": "Google Vertex",
  "openai-compatible": "OpenAI-compatible",
  ollama: "Ollama",
  deepseek: "DeepSeek",
}
const LOCKED_OPERATIONS: readonly SettingsOperation[] = ["loading", "saving", "deleting", "testing"]
const REASONING_LEVELS: readonly ReasoningEffort[] = ["minimal", "low", "medium", "high"]

function button(label: string, className = ""): HTMLButtonElement {
  const element = document.createElement("button")
  element.type = "button"
  element.textContent = label
  element.className = className
  return element
}

function info(text: string, className = ""): HTMLParagraphElement {
  const element = document.createElement("p")
  element.textContent = text
  element.className = className
  return element
}

function field(labelText: string, control: HTMLElement, error = ""): HTMLDivElement {
  const wrapper = document.createElement("div")
  wrapper.className = "llm-field"
  const label = document.createElement("label")
  label.textContent = labelText
  if (control.id !== "") label.htmlFor = control.id
  wrapper.append(label, control)
  if (error !== "") wrapper.append(info(error, "llm-error"))
  return wrapper
}

function inputField(
  id: string,
  label: string,
  value: string,
  onInput: (value: string) => void,
  type: "text" | "number" = "text",
  disabled = false,
  error = "",
): HTMLDivElement {
  const input = document.createElement("input")
  input.id = id
  input.type = type
  input.value = value
  input.disabled = disabled
  input.addEventListener("input", () => onInput(input.value))
  return field(label, input, error)
}

function selectField(
  id: string,
  label: string,
  value: string,
  options: readonly (readonly [string, string])[],
  onChange: (value: string) => void,
  disabled = false,
): HTMLDivElement {
  const select = document.createElement("select")
  select.id = id
  for (const [optionValue, optionLabel] of options) {
    const option = document.createElement("option")
    option.value = optionValue
    option.textContent = optionLabel
    select.append(option)
  }
  select.value = value
  select.disabled = disabled
  select.addEventListener("change", () => onChange(select.value))
  return field(label, select)
}

function textareaField(
  id: string,
  label: string,
  value: string,
  onInput: (value: string) => void,
  disabled: boolean,
): HTMLDivElement {
  const textarea = document.createElement("textarea")
  textarea.id = id
  textarea.rows = 5
  textarea.value = value
  textarea.disabled = disabled
  textarea.addEventListener("input", () => onInput(textarea.value))
  const wrapper = field(label, textarea)
  wrapper.classList.add("llm-field-wide")
  return wrapper
}

function numberOrUndefined(value: string): number | undefined {
  const trimmed = value.trim()
  if (trimmed === "") return undefined
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

function reasoningSummary(reasoning: SavedModelConfig["reasoning"]): string {
  if (reasoning.provider === "google-ai-studio" || reasoning.provider === "google-vertex") {
    return reasoning.level === null ? "thinking off" : `thinking ${reasoning.level}`
  }
  if (reasoning.provider === "openai-compatible") return reasoning.effort === null ? "effort none" : `effort ${reasoning.effort}`
  return reasoning.enabled ? "reasoning on" : "reasoning off"
}

export function mountLlmSettingsPanel(
  target: HTMLElement,
  controller: LlmSettingsController,
): MountedLlmSettingsPanel {
  let state: SettingsState | null = null
  let modelProvider: ProviderId = "google-ai-studio"

  const isLocked = (value: SettingsState | null = state): boolean => value === null
    || !value.loaded
    || LOCKED_OPERATIONS.includes(value.operation)

  const updateModel = (patch: Readonly<Record<string, unknown>>): void => {
    if (state?.modelDraft === null || state?.modelDraft === undefined || isLocked()) return
    controller.updateModelDraft({ ...state.modelDraft, ...patch } as SavedModelConfig)
  }

  const renderModelRows = (section: HTMLElement, value: SettingsState): void => {
    const list = document.createElement("ul")
    list.className = "llm-catalog-list"
    if (value.modelSummaries.length === 0) {
      const empty = document.createElement("li")
      empty.className = "llm-catalog-empty"
      empty.textContent = "No model configurations saved yet."
      list.append(empty)
    }
    for (const summary of value.modelSummaries) {
      const row = document.createElement("li")
      row.className = "llm-catalog-row"
      const select = document.createElement("button")
      select.type = "button"
      select.className = "llm-catalog-select"
      select.classList.toggle("llm-catalog-select-active", value.selectedModelConfigId === summary.id)
      select.setAttribute("aria-current", String(value.selectedModelConfigId === summary.id))
      const name = document.createElement("span")
      name.className = "llm-catalog-name"
      name.textContent = `${PROVIDER_LABELS[summary.provider]} · ${summary.name}`
      const meta = document.createElement("span")
      meta.className = "llm-catalog-meta"
      meta.textContent = `model: ${summary.model}`
      const mask = document.createElement("span")
      mask.className = "llm-catalog-mask"
      mask.textContent = reasoningSummary(summary.reasoning)
      select.append(name, meta, mask)
      select.disabled = isLocked(value)
      select.onclick = () => controller.selectModelConfig(summary.id)
      const remove = button("Delete", "llm-btn-danger")
      remove.disabled = isLocked(value)
      remove.onclick = () => {
        if (window.confirm(`Delete saved model ${summary.name}?`)) void controller.deleteModel(summary.id, true)
      }
      row.append(select, remove)
      list.append(row)
    }
    section.append(list)
  }

  const renderReasoning = (editor: HTMLElement, value: SettingsState, draft: SavedModelConfig): void => {
    const reasoning = draft.reasoning
    if (reasoning.provider === "google-ai-studio" || reasoning.provider === "google-vertex") {
      editor.append(selectField("llm-model-reasoning", "Reasoning", reasoning.level ?? "null", [
        ["null", "off"], ...REASONING_LEVELS.map(level => [level, level] as const),
      ], next => updateModel({ reasoning: { ...reasoning, level: next === "null" ? null : next as ReasoningEffort } }), isLocked(value)))
    } else if (reasoning.provider === "openai-compatible") {
      editor.append(selectField("llm-model-reasoning", "Reasoning", reasoning.effort ?? "null", [
        ["null", "off"], ...REASONING_LEVELS.map(level => [level, level] as const),
      ], next => updateModel({ reasoning: { ...reasoning, effort: next === "null" ? null : next as ReasoningEffort } }), isLocked(value)))
    } else {
      editor.append(selectField("llm-model-reasoning", "Reasoning", reasoning.enabled ? "enabled" : "disabled", [
        ["disabled", "disabled"], ["enabled", "enabled"],
      ], next => updateModel({ reasoning: { ...reasoning, enabled: next === "enabled" } }), isLocked(value)))
    }
  }

  const renderEditor = (section: HTMLElement, value: SettingsState): void => {
    const draft = value.modelDraft
    if (draft === null) return
    const locked = isLocked(value)
    const editor = document.createElement("form")
    editor.className = "llm-editor"
    editor.addEventListener("submit", event => { event.preventDefault(); if (!locked) void controller.saveModel() })
    const editorTitle = document.createElement("h3")
    editorTitle.textContent = value.modelSummaries.some(summary => summary.id === draft.id) ? "Edit model" : "Add model"
    editor.append(editorTitle)
    if (!value.modelSummaries.some(summary => summary.id === draft.id)) {
      editor.append(selectField("llm-new-model-provider", "Provider", draft.provider, Object.entries(PROVIDER_LABELS), next => {
        modelProvider = next as ProviderId
        controller.createModel(modelProvider)
      }, locked))
    }
    editor.append(inputField("llm-model-name", "Name", draft.name, next => updateModel({ name: next }), "text", locked, value.fieldErrors["name"]))
    editor.append(inputField("llm-model-id", "Model ID", draft.modelId, next => updateModel({ modelId: next }), "text", locked, value.fieldErrors["modelId"]))
    if (draft.provider === "openai-compatible" || draft.provider === "ollama" || draft.provider === "deepseek") {
      editor.append(inputField("llm-model-base-url", "Base URL", draft.baseUrl, next => updateModel({ baseUrl: next }), "text", locked || draft.provider === "deepseek", value.fieldErrors["baseUrl"]))
      if (draft.provider === "openai-compatible" || draft.provider === "ollama") {
        editor.append(selectField("llm-model-auth-mode", "Authentication", draft.authMode, [["bearer", "Bearer"], ["none", "None"]], next => updateModel({ authMode: next, keyId: null }), locked))
      }
      if (draft.provider !== "deepseek" && value.runtimePlatform === "web" && isLocalNetworkUrl(draft.baseUrl)) {
        editor.append(info("Hosted web cannot reach this local endpoint. Use Risu desktop/Tauri or self-hosted Node.", "llm-error"))
      }
    }
    editor.append(selectField("llm-model-key", "Linked key", draft.keyId ?? "none", [
      ["none", "(none)"], ...value.compatibleKeys.map(key => [key.id, key.name] as const),
    ], next => {
      if (next === "none" || isCredentialId(next)) void controller.linkModelKey(next === "none" ? null : next)
    }, locked))
    if (draft.provider === "google-vertex") editor.append(info("Project ID and location come from the linked Service Account key.", "llm-help"))
    editor.append(inputField("llm-model-timeout", "Timeout (ms)", String(draft.timeoutMs), next => updateModel({ timeoutMs: Number(next) || 0 }), "number", locked))
    for (const parameter of ["maxTokens", "temperature", "topP", "topK", "thinkingTokens"] as const) {
      editor.append(inputField(`llm-model-${parameter}`, parameter, draft[parameter] === undefined ? "" : String(draft[parameter]), next => updateModel({ [parameter]: numberOrUndefined(next) }), "number", locked))
    }
    renderReasoning(editor, value, draft)
    const flags = document.createElement("fieldset")
    flags.className = "llm-flags"
    const legend = document.createElement("legend")
    legend.textContent = "Capability flags"
    flags.append(legend)
    for (const flag of MODEL_FLAGS) {
      const checkboxRow = document.createElement("div")
      checkboxRow.className = "llm-field-checkbox"
      const label = document.createElement("label")
      const checkbox = document.createElement("input")
      checkbox.type = "checkbox"
      checkbox.checked = draft.flags.includes(flag)
      checkbox.disabled = locked
      checkbox.onchange = () => updateModel({ flags: checkbox.checked ? [...draft.flags, flag] : draft.flags.filter(item => item !== flag) })
      label.append(checkbox, flag)
      checkboxRow.append(label)
      flags.append(checkboxRow)
    }
    editor.append(flags)
    editor.append(textareaField("llm-model-additional-json", "Additional JSON", draft.additionalJson, next => updateModel({ additionalJson: next }), locked))
    const actions = document.createElement("div")
    actions.className = "llm-editor-actions"
    const save = button("Save model", "llm-btn-primary")
    save.disabled = locked
    save.onclick = () => { void controller.saveModel() }
    const close = button("Close editor")
    close.disabled = locked
    close.onclick = () => controller.closeEditor()
    actions.append(save, close)
    editor.append(actions)
    section.append(editor)
  }

  const render = (): void => {
    if (state === null) return
    const value = state
    const root = document.createElement("div")
    root.className = "llm-section"
    root.append(info("Manage saved credentials in AI Services Keys. LLM settings store model configurations only.", "llm-storage-warning"))
    const section = document.createElement("section")
    section.className = "llm-catalog-section"
    section.setAttribute("aria-labelledby", "llm-models-heading")
    const header = document.createElement("header")
    header.className = "llm-catalog-header"
    const heading = document.createElement("h2")
    heading.id = "llm-models-heading"
    heading.textContent = "Model Configurations"
    header.append(heading)
    const add = button("Add model", "llm-btn-primary")
    add.disabled = isLocked(value)
    add.onclick = () => controller.createModel(modelProvider)
    header.append(add)
    section.append(header)
    renderModelRows(section, value)
    renderEditor(section, value)
    root.append(section)
    const actions = document.createElement("div")
    actions.className = "llm-actions"
    const test = button("Test connection")
    test.disabled = isLocked(value) || value.selectedModelConfigId === null
    test.onclick = () => { void controller.testConnection() }
    const cancel = button("Cancel test")
    cancel.hidden = value.operation !== "testing"
    cancel.disabled = value.operation !== "testing"
    cancel.onclick = () => controller.cancelTest()
    actions.append(test, cancel)
    root.append(actions, info(value.statusMessage, value.operation === "error" ? "llm-error" : "llm-settings-status"))
    target.replaceChildren(root)
  }

  const unsubscribe = controller.subscribe(next => {
    state = next
    render()
  })
  void controller.load()

  return {
    destroy() {
      unsubscribe()
      controller.dispose()
      target.replaceChildren()
    },
  }
}
