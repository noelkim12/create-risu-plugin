// allow: SIZE_OK - imperative DOM editor for two provider variants; single responsibility (embedding section UI).
import type { AiServiceSectionCleanup, RetrievalProviderAuthMode } from "../../ai-services"
import { isCredentialId, type CredentialSummary } from "../../credential-manager"
import type {
  EmbeddingConfigDraft,
  EmbeddingConfigId,
  EmbeddingEncoding,
  EmbeddingInputType,
  EmbeddingProviderId,
  VoyageOutputDtype,
} from "../core/types"
import type { EmbeddingConfigSummary } from "../settings/config-drafts"
import type {
  EmbeddingControllerState,
  EmbeddingSettingsController,
} from "../settings/embedding-controller"
import "./embedding-panel.css"

const PROVIDER_LABELS: Readonly<Record<EmbeddingProviderId, string>> = {
  voyage: "Voyage",
  "openai-compatible": "OpenAI-compatible",
}

const AUTH_MODE_LABELS: Readonly<Record<RetrievalProviderAuthMode, string>> = {
  bearer: "API key (Bearer)",
  none: "No authentication",
}

const INPUT_TYPE_OPTIONS: readonly { readonly value: string; readonly label: string }[] = [
  { value: "", label: "Not set" },
  { value: "query", label: "Query" },
  { value: "document", label: "Document" },
]

const DTYPE_OPTIONS: readonly { readonly value: VoyageOutputDtype; readonly label: string }[] = [
  { value: "float", label: "float (32-bit)" },
  { value: "int8", label: "int8" },
  { value: "uint8", label: "uint8" },
  { value: "binary", label: "binary" },
  { value: "ubinary", label: "ubinary" },
]

const ENCODING_OPTIONS: readonly { readonly value: EmbeddingEncoding; readonly label: string }[] = [
  { value: "float", label: "float (number arrays)" },
  { value: "base64", label: "base64 (encoded strings)" },
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
  wrapper.className = "ai-embedding-field"
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

function statusLabel(summary: EmbeddingConfigSummary): string {
  if (summary.credentialStatus === "not-required") return "No key required"
  if (summary.credentialStatus === "linked") return `Key: ${summary.credentialName ?? "stored"}`
  if (summary.credentialStatus === "stale") return "Stale credential"
  if (summary.credentialStatus === "missing") return `Key missing: ${summary.credentialName ?? "linked"}`
  return "Credential required"
}

function compatibleCredentials(
  draft: EmbeddingConfigDraft,
  credentials: readonly CredentialSummary[],
): readonly CredentialSummary[] {
  return credentials.filter(credential => {
    if (draft.provider === "voyage") {
      return credential.provider === "voyage" && credential.authMode === "bearer"
    }
    return credential.provider === "openai-compatible"
      && credential.authMode === draft.authMode
      && credential.authMode === "bearer"
      ? credential.audience === draft.endpoint.trim()
      : false
  })
}

export function mountEmbeddingPanel(
  target: HTMLElement,
  controller: EmbeddingSettingsController,
): AiServiceSectionCleanup {
  let state: EmbeddingControllerState | null = null
  let draft: EmbeddingConfigDraft | null = null
  let editingId: EmbeddingConfigId | null = null
  // Advanced disclosure survives full re-renders; its open state is tracked here.
  let advancedOpen = false

  const root = document.createElement("div")
  root.className = "ai-embedding"

  const isLocked = (): boolean => state === null
    || !state.loaded
    || state.operation === "loading"
    || state.operation === "saving"
    || state.operation === "deleting"
    || state.operation === "testing"

  const canTest = (summary: EmbeddingConfigSummary): boolean => !isLocked()
    && summary.credentialStatus !== "unlinked"
    && summary.credentialStatus !== "missing"
    && summary.credentialStatus !== "stale"

  const authRequired = (): boolean => draft !== null
    && (draft.provider === "voyage" || draft.authMode === "bearer")

  const canSave = (): boolean => draft !== null
    && draft.name.trim() !== ""
    && draft.modelId.trim() !== ""
    && (draft.provider === "voyage" || draft.endpoint.trim() !== "")
    && (!authRequired() || draft.credentialId !== null)

  const startCreate = (): void => {
    if (isLocked()) return
    draft = controller.beginCreate()
    editingId = null
    render()
  }

  const startEdit = (summary: EmbeddingConfigSummary): void => {
    if (isLocked()) return
    const next = controller.beginEdit(summary.id)
    if (next === null) return
    draft = next
    editingId = summary.id
    render()
  }

  const cancelEditor = (): void => {
    draft = null
    editingId = null
    render()
  }

  const submit = (): void => {
    if (isLocked() || draft === null || !canSave()) return
    const submitted = draft
    const session = { editingId }
    controller.saveDraft(submitted, session).then(() => {
      draft = null
      editingId = null
      render()
    }, () => undefined)
  }

  const remove = (summary: EmbeddingConfigSummary): void => {
    if (isLocked()) return
    if (window.confirm(`Delete embedding configuration ${summary.name}?`)) {
      controller.deleteConfig(summary.id).catch(() => undefined)
    }
  }

  const numberInputValue = (value: number | null, input: HTMLInputElement): void => {
    input.type = "number"
    input.value = value === null ? "" : String(value)
  }

  const advancedDetails = (): HTMLDetailsElement => {
    const details = document.createElement("details")
    details.className = "ai-embedding-disclosure"
    details.open = advancedOpen
    details.addEventListener("toggle", () => { advancedOpen = details.open })
    const summary = document.createElement("summary")
    summary.textContent = "Advanced settings"
    details.append(summary)
    return details
  }

  const renderCredentialSelect = (section: HTMLElement, value: EmbeddingConfigDraft): void => {
    const select = document.createElement("select")
    select.append(option("", "None (link later)"))
    for (const credential of compatibleCredentials(value, state?.credentials ?? [])) {
      select.append(option(credential.id, `${credential.name} (${credential.audience})`))
    }
    select.value = value.credentialId === null ? "" : value.credentialId
    select.disabled = isLocked()
    select.addEventListener("change", () => {
      if (draft === null) return
      draft = {
        ...draft,
        credentialId: isCredentialId(select.value) ? select.value : null,
      }
      render()
    })
    section.append(field("ai-embedding-credential", "API key linkage", select))
  }

  const renderEditor = (section: HTMLElement): void => {
    const value = draft
    if (value === null) {
      const create = button("New embedding configuration", "ai-btn-primary")
      create.disabled = isLocked()
      create.onclick = startCreate
      section.append(create)
      return
    }

    const editor = document.createElement("form")
    editor.className = "ai-embedding-editor"
    editor.noValidate = true

    const heading = document.createElement("h3")
    heading.textContent = editingId === null ? "Add embedding configuration" : "Edit embedding configuration"
    editor.append(heading)

    const providerSelect = document.createElement("select")
    for (const [providerValue, label] of Object.entries(PROVIDER_LABELS)) {
      providerSelect.append(option(providerValue, label))
    }
    providerSelect.value = value.provider
    providerSelect.disabled = isLocked() || editingId !== null
    providerSelect.addEventListener("change", () => {
      if (providerSelect.value !== "voyage" && providerSelect.value !== "openai-compatible") return
      draft = {
        ...value,
        provider: providerSelect.value,
        authMode: providerSelect.value === "voyage" ? "bearer" : "none",
        credentialId: null,
        encodingFormat: "float",
      }
      render()
    })
    editor.append(field("ai-embedding-provider", "Provider", providerSelect))

    const nameInput = document.createElement("input")
    nameInput.type = "text"
    nameInput.autocomplete = "off"
    nameInput.value = value.name
    nameInput.disabled = isLocked()
    nameInput.addEventListener("input", () => { if (draft !== null) draft = { ...draft, name: nameInput.value } })
    editor.append(field("ai-embedding-name", "Name", nameInput))

    const modelInput = document.createElement("input")
    modelInput.type = "text"
    modelInput.autocomplete = "off"
    modelInput.value = value.modelId
    modelInput.disabled = isLocked()
    modelInput.addEventListener("input", () => { if (draft !== null) draft = { ...draft, modelId: modelInput.value } })
    editor.append(field("ai-embedding-model", "Model ID", modelInput))

    if (value.provider !== "voyage") {
      const endpointInput = document.createElement("input")
      endpointInput.type = "text"
      endpointInput.autocomplete = "off"
      endpointInput.placeholder = "https://example.com/v1/embeddings"
      endpointInput.value = value.endpoint
      endpointInput.disabled = isLocked() || editingId !== null
      endpointInput.addEventListener("input", () => {
        if (draft !== null) draft = { ...draft, endpoint: endpointInput.value, credentialId: null }
      })
      editor.append(field("ai-embedding-endpoint", "Exact endpoint URL", endpointInput))

      const authSelect = document.createElement("select")
      for (const [authValue, label] of Object.entries(AUTH_MODE_LABELS)) {
        authSelect.append(option(authValue, label))
      }
      authSelect.value = value.authMode
      authSelect.disabled = isLocked()
      authSelect.addEventListener("change", () => {
        if (draft === null) return
        if (authSelect.value === "bearer" || authSelect.value === "none") {
          draft = { ...draft, authMode: authSelect.value, credentialId: authSelect.value === "none" ? null : draft.credentialId }
          render()
        }
      })
      editor.append(field("ai-embedding-auth", "Authentication", authSelect))
    }

    if (authRequired()) {
      renderCredentialSelect(editor, value)
      const keyNote = document.createElement("p")
      keyNote.className = "ai-embedding-key-note"
      keyNote.textContent = "Manage keys in AI Services Keys, then select a compatible key."
      editor.append(keyNote)
    }

    const advanced = advancedDetails()

    if (value.provider === "voyage") {
      const inputTypeSelect = document.createElement("select")
      for (const entry of INPUT_TYPE_OPTIONS) inputTypeSelect.append(option(entry.value, entry.label))
      inputTypeSelect.value = value.inputType ?? ""
      inputTypeSelect.disabled = isLocked()
      inputTypeSelect.addEventListener("change", () => {
        if (draft === null) return
        const nextType = inputTypeSelect.value === "query" || inputTypeSelect.value === "document"
          ? inputTypeSelect.value
          : null
        draft = { ...draft, inputType: nextType }
      })
      advanced.append(field("ai-embedding-input-type", "Default input type", inputTypeSelect))

      const truncationInput = document.createElement("input")
      truncationInput.type = "checkbox"
      truncationInput.checked = value.truncation
      truncationInput.disabled = isLocked()
      truncationInput.addEventListener("change", () => {
        if (draft !== null) draft = { ...draft, truncation: truncationInput.checked }
      })
      advanced.append(field("ai-embedding-truncation", "Truncate long inputs", truncationInput))

      const dimensionInput = document.createElement("input")
      numberInputValue(value.outputDimension, dimensionInput)
      dimensionInput.min = "1"
      dimensionInput.disabled = isLocked()
      dimensionInput.addEventListener("input", () => {
        if (draft === null) return
        const parsed = Number(dimensionInput.value)
        draft = { ...draft, outputDimension: dimensionInput.value === "" || !Number.isFinite(parsed) ? null : parsed }
      })
      advanced.append(field("ai-embedding-dimension", "Output dimension (optional)", dimensionInput))

      const dtypeSelect = document.createElement("select")
      for (const entry of DTYPE_OPTIONS) dtypeSelect.append(option(entry.value, entry.label))
      dtypeSelect.value = value.outputDtype
      dtypeSelect.disabled = isLocked()
      dtypeSelect.addEventListener("change", () => {
        if (draft === null) return
        const next = DTYPE_OPTIONS.find(entry => entry.value === dtypeSelect.value)
        if (next !== undefined) draft = { ...draft, outputDtype: next.value }
      })
      advanced.append(field("ai-embedding-dtype", "Output dtype", dtypeSelect))
    } else {
      const dimensionsInput = document.createElement("input")
      numberInputValue(value.dimensions, dimensionsInput)
      dimensionsInput.min = "1"
      dimensionsInput.disabled = isLocked()
      dimensionsInput.addEventListener("input", () => {
        if (draft === null) return
        const parsed = Number(dimensionsInput.value)
        draft = { ...draft, dimensions: dimensionsInput.value === "" || !Number.isFinite(parsed) ? null : parsed }
      })
      advanced.append(field("ai-embedding-dimensions", "Dimensions (optional)", dimensionsInput))
    }

    const encodingSelect = document.createElement("select")
    for (const entry of ENCODING_OPTIONS) encodingSelect.append(option(entry.value, entry.label))
    encodingSelect.value = value.encodingFormat
    encodingSelect.disabled = isLocked()
    encodingSelect.addEventListener("change", () => {
      if (draft === null) return
      const next = ENCODING_OPTIONS.find(entry => entry.value === encodingSelect.value)
      if (next !== undefined) draft = { ...draft, encodingFormat: next.value }
    })
    advanced.append(field("ai-embedding-encoding", "Embedding encoding", encodingSelect))

    const timeoutInput = document.createElement("input")
    timeoutInput.type = "number"
    timeoutInput.min = "1"
    timeoutInput.max = "3600000"
    timeoutInput.value = String(value.timeoutMs)
    timeoutInput.disabled = isLocked()
    timeoutInput.addEventListener("input", () => {
      if (draft === null) return
      const parsed = Number(timeoutInput.value)
      draft = { ...draft, timeoutMs: Number.isFinite(parsed) ? parsed : 0 }
    })
    advanced.append(field("ai-embedding-timeout", "Timeout (ms)", timeoutInput))

    editor.append(advanced)

    const actions = document.createElement("div")
    actions.className = "ai-embedding-actions"
    const save = button(editingId === null ? "Save configuration" : "Save changes", "ai-btn-primary")
    save.disabled = isLocked() || !canSave()
    save.onclick = submit
    actions.append(save)
    const cancel = button("Cancel")
    cancel.disabled = isLocked()
    cancel.onclick = cancelEditor
    actions.append(cancel)
    editor.append(actions)
    section.append(editor)
  }

  const renderList = (section: HTMLElement, value: EmbeddingControllerState): void => {
    const list = document.createElement("ul")
    list.className = "ai-embedding-list"
    list.setAttribute("aria-label", "Embedding configurations")
    if (value.configs.length === 0) {
      const empty = document.createElement("li")
      empty.className = "ai-embedding-empty"
      empty.textContent = "No embedding configurations saved yet."
      list.append(empty)
    }
    for (const summary of value.configs) {
      const row = document.createElement("li")
      row.className = "ai-embedding-row"
      const meta = document.createElement("div")
      meta.className = "ai-embedding-meta"
      const name = document.createElement("span")
      name.className = "ai-embedding-name"
      name.textContent = summary.name
      const detail = document.createElement("span")
      detail.className = "ai-embedding-detail"
      detail.textContent = `${PROVIDER_LABELS[summary.provider]} · ${summary.modelId} · ${statusLabel(summary)}`
      meta.append(name, detail)
      if (summary.endpoint !== null) {
        const endpoint = document.createElement("span")
        endpoint.className = "ai-embedding-endpoint"
        endpoint.textContent = summary.endpoint
        meta.append(endpoint)
      }
      const rowActions = document.createElement("div")
      rowActions.className = "ai-embedding-row-actions"
      const test = button("Test connection")
      test.setAttribute("aria-label", `Test connection for ${summary.name}`)
      test.disabled = !canTest(summary)
      test.onclick = () => {
        if (!isLocked()) void controller.testConnection(summary.id)
      }
      const edit = button("Edit")
      edit.disabled = isLocked()
      edit.onclick = () => startEdit(summary)
      const del = button("Delete", "ai-btn-danger")
      del.setAttribute("aria-label", `Delete embedding configuration ${summary.name}`)
      del.disabled = isLocked()
      del.onclick = () => remove(summary)
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
    heading.textContent = "Embedding"
    const intro = document.createElement("p")
    intro.className = "ai-embedding-intro"
    intro.textContent = "Saved text embedding configurations. Voyage uses its fixed embeddings endpoint; OpenAI-compatible configurations call the exact endpoint URL you save."
    root.append(heading, intro)

    renderList(root, value)
    renderEditor(root)

    if (value.operation === "testing") {
      const testActions = document.createElement("div")
      testActions.className = "ai-embedding-actions"
      const cancelTest = button("Cancel test")
      cancelTest.onclick = () => controller.cancelTest()
      testActions.append(cancelTest)
      root.append(testActions)
    }

    const status = document.createElement("p")
    status.className = "ai-embedding-status"
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

  return () => {
    unsubscribe()
    draft = null
    editingId = null
    advancedOpen = false
    state = null
    target.replaceChildren()
  }
}
