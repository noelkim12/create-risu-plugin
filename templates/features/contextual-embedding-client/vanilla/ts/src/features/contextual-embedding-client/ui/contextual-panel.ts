// allow: SIZE_OK - one settings section with list, editor, and status.
import type {
  ContextualEmbeddingConfigDraft,
  ContextualEmbeddingOutputDtype,
} from "../core/types"
import { isLinkedCredentialId } from "../core/types"
import type {
  ContextualEmbeddingConfigSummary,
  ContextualEmbeddingSettingsController,
  ContextualEmbeddingSettingsState,
} from "../settings/settings-controller"

type MountedPanel = { readonly destroy: () => void }

const DTYPE_OPTIONS: readonly (readonly [ContextualEmbeddingOutputDtype, string])[] = [
  ["float", "Float numbers"],
  ["int8", "int8"],
  ["uint8", "uint8"],
  ["binary", "binary"],
  ["ubinary", "ubinary"],
]

const INPUT_TYPE_OPTIONS: readonly (readonly [string, string])[] = [
  ["", "Default (none)"],
  ["query", "Query"],
  ["document", "Document"],
]

const ENCODING_OPTIONS: readonly (readonly [string, string])[] = [
  ["", "Number array"],
  ["base64", "Base64 string"],
]

function option(value: string, label: string): HTMLOptionElement {
  const element = document.createElement("option")
  element.value = value
  element.textContent = label
  return element
}

function field(
  id: string,
  labelText: string,
  control: HTMLInputElement | HTMLSelectElement,
): HTMLDivElement {
  const wrapper = document.createElement("div")
  wrapper.className = "ai-contextual-field"
  const label = document.createElement("label")
  label.htmlFor = id
  label.textContent = labelText
  control.id = id
  wrapper.append(label, control)
  return wrapper
}

function button(label: string, className = ""): HTMLButtonElement {
  const element = document.createElement("button")
  element.type = "button"
  element.textContent = label
  if (className) element.className = className
  return element
}

function credentialLabel(summary: ContextualEmbeddingConfigSummary): string {
  if (summary.credentialName === null) return "No credential linked"
  const status = summary.credentialStatus === "stored" ? "" : " (key needs attention)"
  return `${summary.credentialName}${status}`
}

export function mountContextualEmbeddingPanel(
  target: HTMLElement,
  controller: ContextualEmbeddingSettingsController,
): MountedPanel {
  let state: ContextualEmbeddingSettingsState | null = null
  // Advanced disclosure survives full re-renders; its open state is tracked here.
  let advancedOpen = false

  const root = document.createElement("div")
  root.className = "ai-contextual"

  const isLocked = (value: ContextualEmbeddingSettingsState | null = state): boolean => value === null
    || !value.loaded
    || value.operation === "loading"
    || value.operation === "saving"
    || value.operation === "deleting"
    || value.operation === "testing"

  const canTest = (summary: ContextualEmbeddingConfigSummary, value: ContextualEmbeddingSettingsState | null = state): boolean =>
    !isLocked(value)
    && summary.credentialStatus !== null
    && summary.credentialStatus !== "missing"
    && summary.credentialStatus !== "stale"

  const isDraftValid = (draft: ContextualEmbeddingConfigDraft | null): boolean => {
    if (draft === null) return false
    const dimensionOk = draft.outputDimension === null
      || (Number.isInteger(draft.outputDimension) && draft.outputDimension > 0)
    return draft.name.trim() !== ""
      && draft.model.trim() !== ""
      && Number.isInteger(draft.timeoutMs)
      && draft.timeoutMs > 0
      && dimensionOk
  }

  const editDraft = (change: (draft: ContextualEmbeddingConfigDraft) => ContextualEmbeddingConfigDraft): void => {
    if (isLocked() || state === null) return
    const draft = state.draft
    if (draft === null) return
    controller.updateDraft(change(draft))
  }

  const textInput = (
    id: string,
    label: string,
    value: string,
    placeholder: string,
    onInput: (value: string) => void,
  ): HTMLDivElement => {
    const input = document.createElement("input")
    input.type = "text"
    input.autocomplete = "off"
    input.placeholder = placeholder
    input.value = value
    input.disabled = isLocked()
    input.addEventListener("input", () => onInput(input.value))
    return field(id, label, input)
  }

  const numberInput = (
    id: string,
    label: string,
    value: number | null,
    placeholder: string,
    onInput: (value: number | null) => void,
  ): HTMLDivElement => {
    const input = document.createElement("input")
    input.type = "number"
    input.min = "1"
    input.step = "1"
    input.autocomplete = "off"
    input.placeholder = placeholder
    input.value = value === null ? "" : String(value)
    input.disabled = isLocked()
    input.addEventListener("input", () => {
      const parsed = Number.parseInt(input.value, 10)
      onInput(input.value.trim() === "" || Number.isNaN(parsed) ? null : parsed)
    })
    return field(id, label, input)
  }

  const selectInput = (
    id: string,
    label: string,
    value: string,
    options: readonly (readonly [string, string])[],
    onChange: (value: string) => void,
  ): HTMLDivElement => {
    const select = document.createElement("select")
    for (const [optionValue, optionLabel] of options) {
      select.append(option(optionValue, optionLabel))
    }
    select.value = value
    select.disabled = isLocked()
    select.addEventListener("change", () => onChange(select.value))
    return field(id, label, select)
  }

  const advancedDetails = (): HTMLDetailsElement => {
    const details = document.createElement("details")
    details.className = "ai-contextual-disclosure"
    details.open = advancedOpen
    details.addEventListener("toggle", () => { advancedOpen = details.open })
    const summary = document.createElement("summary")
    summary.textContent = "Advanced settings"
    details.append(summary)
    return details
  }

  const renderEditor = (section: HTMLElement, value: ContextualEmbeddingSettingsState): void => {
    const draft = value.draft
    if (draft === null) {
      const create = button("New configuration", "ai-btn-primary")
      create.disabled = isLocked(value)
      create.onclick = () => controller.startCreate()
      const actions = document.createElement("div")
      actions.className = "ai-contextual-actions"
      actions.append(create)
      section.append(actions)
      return
    }

    const editor = document.createElement("form")
    editor.className = "ai-contextual-editor"
    editor.noValidate = true

    const heading = document.createElement("h3")
    heading.textContent = value.editingId === null ? "New configuration" : "Edit configuration"
    editor.append(heading)

    editor.append(textInput("ai-contextual-name", "Name", draft.name, "Production retrieval", name => {
      editDraft(current => ({ ...current, name }))
    }))
    editor.append(textInput("ai-contextual-model", "Model", draft.model, "voyage-context-4", model => {
      editDraft(current => ({ ...current, model }))
    }))

    const credentialSelect = document.createElement("select")
    credentialSelect.disabled = isLocked(value)
    credentialSelect.append(option("", "No credential linked"))
    for (const credential of value.voyageCredentials.filter(entry => entry.provider === "voyage")) {
      credentialSelect.append(option(credential.id, credential.name))
    }
    credentialSelect.value = draft.credentialId ?? ""
    credentialSelect.addEventListener("change", () => {
      editDraft(current => ({
        ...current,
        credentialId: isLinkedCredentialId(credentialSelect.value) ? credentialSelect.value : null,
      }))
    })
    editor.append(field("ai-contextual-credential", "Voyage credential", credentialSelect))

    const advanced = advancedDetails()
    advanced.append(numberInput("ai-contextual-timeout", "Timeout (ms)", draft.timeoutMs, "60000", timeoutMs => {
      editDraft(current => ({ ...current, timeoutMs: timeoutMs ?? 0 }))
    }))
    advanced.append(selectInput(
      "ai-contextual-input-type",
      "Input type",
      draft.inputType ?? "",
      INPUT_TYPE_OPTIONS,
      inputType => {
        editDraft(current => ({
          ...current,
          inputType: inputType === "query" || inputType === "document" ? inputType : null,
        }))
      },
    ))
    advanced.append(numberInput("ai-contextual-dimension", "Output dimension", draft.outputDimension, "Model default", outputDimension => {
      editDraft(current => ({ ...current, outputDimension }))
    }))
    advanced.append(selectInput("ai-contextual-dtype", "Output dtype", draft.outputDtype, DTYPE_OPTIONS, outputDtype => {
      if (outputDtype === "float" || outputDtype === "int8" || outputDtype === "uint8"
        || outputDtype === "binary" || outputDtype === "ubinary") {
        editDraft(current => ({ ...current, outputDtype }))
      }
    }))
    advanced.append(selectInput("ai-contextual-encoding", "Embedding encoding", draft.base64 ? "base64" : "", ENCODING_OPTIONS, encoding => {
      editDraft(current => ({ ...current, base64: encoding === "base64" }))
    }))
    editor.append(advanced)

    const actions = document.createElement("div")
    actions.className = "ai-contextual-actions"
    const save = button(value.editingId === null ? "Save configuration" : "Update configuration", "ai-btn-primary")
    save.disabled = isLocked(value) || !isDraftValid(draft)
    save.onclick = () => {
      controller.save().catch(() => undefined)
    }
    const cancel = button("Cancel")
    cancel.disabled = isLocked(value)
    cancel.onclick = () => controller.cancelEdit()
    actions.append(save, cancel)
    editor.append(actions)
    section.append(editor)
  }

  const renderList = (section: HTMLElement, value: ContextualEmbeddingSettingsState): void => {
    const list = document.createElement("ul")
    list.className = "ai-contextual-list"
    list.setAttribute("aria-label", "Contextual embedding configurations")
    if (value.configs.length === 0) {
      const empty = document.createElement("li")
      empty.className = "ai-contextual-empty"
      empty.textContent = "No contextual embedding configurations saved yet."
      list.append(empty)
    }
    for (const summary of value.configs) {
      const row = document.createElement("li")
      row.className = "ai-contextual-row"
      const meta = document.createElement("div")
      meta.className = "ai-contextual-meta"
      const name = document.createElement("span")
      name.className = "ai-contextual-name"
      name.textContent = summary.name
      const detail = document.createElement("span")
      detail.className = "ai-contextual-detail"
      detail.textContent = `Voyage · ${credentialLabel(summary)}`
      const model = document.createElement("span")
      model.className = "ai-contextual-model"
      model.textContent = `${summary.model} · ${summary.outputDtype}${summary.outputDimension === null ? "" : ` · ${summary.outputDimension}d`}${summary.base64 ? " · base64" : ""}`
      meta.append(name, detail, model)
      const rowActions = document.createElement("div")
      rowActions.className = "ai-contextual-row-actions"
      const test = button("Test connection")
      test.setAttribute("aria-label", `Test connection for ${summary.name}`)
      test.disabled = !canTest(summary, value)
      test.onclick = () => {
        if (!isLocked(value)) void controller.testConnection(summary.id)
      }
      const edit = button("Edit")
      edit.disabled = isLocked(value)
      edit.onclick = () => controller.startEdit(summary.id)
      const del = button("Delete", "ai-btn-danger")
      del.setAttribute("aria-label", `Delete configuration ${summary.name}`)
      del.disabled = isLocked(value)
      del.onclick = () => {
        if (window.confirm(`Delete configuration ${summary.name}?`)) {
          controller.delete(summary.id).catch(() => undefined)
        }
      }
      rowActions.append(test, edit, del)
      row.append(meta, rowActions)
      list.append(row)
    }
    section.append(list)
  }

  const render = (): void => {
    const value = state
    root.replaceChildren()
    if (value === null) return

    const heading = document.createElement("h2")
    heading.textContent = "Contextual Embedding"
    const intro = document.createElement("p")
    intro.className = "ai-contextual-intro"
    intro.textContent = "Saved Voyage configurations for contextualized chunk embeddings. Calls send ordered groups of pre-chunked texts; each group's chunk order is preserved in the result."
    root.append(heading, intro)

    const note = document.createElement("p")
    note.className = "ai-contextual-note"
    note.textContent = "Link a Voyage credential in AI Services Keys; one key can serve embedding, contextual embedding, and reranker configurations. Chunking and token budgets stay your responsibility and the API's."
    root.append(note)

    renderList(root, value)
    renderEditor(root, value)

    if (value.operation === "testing") {
      const testActions = document.createElement("div")
      testActions.className = "ai-contextual-actions"
      const cancelTest = button("Cancel test")
      cancelTest.onclick = () => controller.cancelTest()
      testActions.append(cancelTest)
      root.append(testActions)
    }

    const status = document.createElement("p")
    status.className = "ai-contextual-status"
    status.setAttribute("role", "status")
    status.textContent = value.statusMessage
    root.append(status)
  }

  const unsubscribe = controller.subscribe(next => {
    state = next
    render()
  })
  target.replaceChildren(root)
  controller.load().catch(() => undefined)

  return {
    destroy: () => {
      unsubscribe()
      advancedOpen = false
      state = null
      target.replaceChildren()
    },
  }
}
