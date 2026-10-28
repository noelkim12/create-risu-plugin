// allow: SIZE_OK - one settings section with list, one editor form, and status.
import {
  createRerankerConfigDraft,
  isLinkedCredentialId,
  type RerankerConfig,
  type RerankerConfigSummary,
  type RerankerSettingsController,
  type RerankerSettingsState,
} from "../index"
import type { AiServiceSectionCleanup } from "../../ai-services"
import "./reranker-section.css"

type SectionDraft = {
  name: string
  model: string
  credentialId: string
  timeoutMs: string
  topK: string
  returnDocuments: boolean
  truncation: boolean
}

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
  wrapper.className = "ai-reranker-field"
  const label = document.createElement("label")
  label.htmlFor = id
  label.textContent = labelText
  control.id = id
  wrapper.append(label, control)
  return wrapper
}

function checkboxField(
  id: string,
  labelText: string,
  checked: boolean,
  disabled: boolean,
  onChange: (checked: boolean) => void,
): HTMLDivElement {
  const wrapper = document.createElement("div")
  wrapper.className = "ai-reranker-field ai-reranker-field-checkbox"
  const input = document.createElement("input")
  input.type = "checkbox"
  input.id = id
  input.checked = checked
  input.disabled = disabled
  input.addEventListener("change", () => { onChange(input.checked) })
  const label = document.createElement("label")
  label.htmlFor = id
  label.textContent = labelText
  wrapper.append(input, label)
  return wrapper
}

function button(label: string, className = ""): HTMLButtonElement {
  const element = document.createElement("button")
  element.type = "button"
  element.textContent = label
  if (className) element.className = className
  return element
}

function credentialStatusLabel(status: RerankerConfigSummary["credentialStatus"]): string {
  if (status === "none") return "No credential linked"
  if (status === "stored") return "Stored locally"
  if (status === "stale") return "Stale credential"
  return "Key missing"
}

function draftFor(config: RerankerConfig): SectionDraft {
  return {
    name: config.name,
    model: config.model,
    credentialId: config.credentialId ?? "",
    timeoutMs: String(config.timeoutMs),
    topK: config.defaults.topK === null ? "" : String(config.defaults.topK),
    returnDocuments: config.defaults.returnDocuments,
    truncation: config.defaults.truncation,
  }
}

export function mountRerankerSettingsSection(
  target: HTMLElement,
  controller: RerankerSettingsController,
): AiServiceSectionCleanup {
  let state: RerankerSettingsState | null = null
  let editTargetId: RerankerConfig["id"] | null = null
  let activeId: RerankerConfig["id"] = createRerankerConfigDraft().id
  let draft: SectionDraft = draftFor(createRerankerConfigDraft())
  // Advanced disclosure survives full re-renders; its open state is tracked here.
  let advancedOpen = false

  const root = document.createElement("div")
  root.className = "ai-reranker"

  const isLocked = (value: RerankerSettingsState | null = state): boolean => value === null
    || !value.loaded
    || value.operation === "loading"
    || value.operation === "saving"
    || value.operation === "deleting"
    || value.operation === "testing"

  const canTest = (summary: RerankerConfigSummary, value: RerankerSettingsState | null = state): boolean =>
    !isLocked(value)
    && summary.credentialStatus !== "none"
    && summary.credentialStatus !== "missing"
    && summary.credentialStatus !== "stale"

  const parsedTimeout = (): number => Number.parseInt(draft.timeoutMs, 10)
  const parsedTopK = (): number | null => {
    if (draft.topK.trim() === "") return null
    return Number.parseInt(draft.topK, 10)
  }

  const canSave = (): boolean => {
    const timeoutMs = parsedTimeout()
    const topK = parsedTopK()
    return draft.name.trim() !== ""
      && draft.model.trim() !== ""
      && Number.isInteger(timeoutMs)
      && timeoutMs >= 1
      && (topK === null || (Number.isInteger(topK) && topK >= 1))
  }

  const resetEditor = (): void => {
    const fresh = createRerankerConfigDraft()
    editTargetId = null
    activeId = fresh.id
    draft = draftFor(fresh)
  }

  const submit = (): void => {
    if (isLocked() || !canSave()) return
    const credentialId = draft.credentialId === "" ? null : draft.credentialId
    const config: RerankerConfig = {
      id: editTargetId ?? activeId,
      name: draft.name,
      provider: "voyage",
      model: draft.model,
      credentialId: credentialId !== null && isLinkedCredentialId(credentialId) ? credentialId : null,
      timeoutMs: parsedTimeout(),
      defaults: {
        topK: parsedTopK(),
        returnDocuments: draft.returnDocuments,
        truncation: draft.truncation,
      },
    }
    // The controller publishes a sanitized status message on either outcome.
    controller.saveConfig(config).then(() => {
      resetEditor()
      render()
    }, () => undefined)
  }

  const startEdit = (summary: RerankerConfigSummary): void => {
    if (isLocked()) return
    editTargetId = summary.id
    activeId = summary.id
    draft = draftFor(summary)
    render()
  }

  const remove = (summary: RerankerConfigSummary): void => {
    if (isLocked()) return
    if (window.confirm(`Delete reranker configuration ${summary.name}?`)) {
      if (editTargetId === summary.id) resetEditor()
      controller.deleteConfig(summary.id).then(() => render(), () => undefined)
    }
  }

  const renderList = (section: HTMLElement, value: RerankerSettingsState): void => {
    const list = document.createElement("ul")
    list.className = "ai-reranker-list"
    list.setAttribute("aria-label", "Reranker configurations")
    if (value.configs.length === 0) {
      const empty = document.createElement("li")
      empty.className = "ai-reranker-empty"
      empty.textContent = "No reranker configurations saved yet."
      list.append(empty)
    }
    for (const summary of value.configs) {
      const row = document.createElement("li")
      row.className = "ai-reranker-row"
      const meta = document.createElement("div")
      meta.className = "ai-reranker-meta"
      const name = document.createElement("span")
      name.className = "ai-reranker-name"
      name.textContent = summary.name
      const model = document.createElement("span")
      model.className = "ai-reranker-model"
      model.textContent = `${summary.provider === "voyage" ? "Voyage" : summary.provider} · ${summary.model}`
      const detail = document.createElement("span")
      detail.className = "ai-reranker-detail"
      const topKLabel = summary.defaults.topK === null ? "all documents" : `top ${summary.defaults.topK}`
      detail.textContent = `${topKLabel} · documents ${summary.defaults.returnDocuments ? "on" : "off"} · truncation ${summary.defaults.truncation ? "on" : "off"}`
      const credential = document.createElement("span")
      credential.className = "ai-reranker-credential"
      credential.textContent = summary.credentialName === null
        ? credentialStatusLabel(summary.credentialStatus)
        : `${summary.credentialName} · ${credentialStatusLabel(summary.credentialStatus)}`
      meta.append(name, model, detail, credential)
      const rowActions = document.createElement("div")
      rowActions.className = "ai-reranker-row-actions"
      const test = button("Test connection")
      test.setAttribute("aria-label", `Test connection for ${summary.name}`)
      test.disabled = !canTest(summary, value)
      test.onclick = () => {
        if (!isLocked(value)) void controller.testConnection(summary.id)
      }
      const edit = button("Edit")
      edit.disabled = isLocked(value)
      edit.onclick = () => startEdit(summary)
      const del = button("Delete", "ai-btn-danger")
      del.setAttribute("aria-label", `Delete reranker configuration ${summary.name}`)
      del.disabled = isLocked(value)
      del.onclick = () => remove(summary)
      rowActions.append(test, edit, del)
      row.append(meta, rowActions)
      list.append(row)
    }
    section.append(list)
  }

  const renderEditor = (section: HTMLElement): void => {
    const editor = document.createElement("form")
    editor.className = "ai-reranker-editor"
    editor.noValidate = true

    const heading = document.createElement("h3")
    heading.textContent = editTargetId === null ? "Add reranker configuration" : "Edit reranker configuration"
    editor.append(heading)

    const nameInput = document.createElement("input")
    nameInput.type = "text"
    nameInput.autocomplete = "off"
    nameInput.value = draft.name
    nameInput.disabled = isLocked()
    nameInput.addEventListener("input", () => { draft.name = nameInput.value })
    editor.append(field("ai-reranker-name", "Name", nameInput))

    const modelInput = document.createElement("input")
    modelInput.type = "text"
    modelInput.autocomplete = "off"
    modelInput.placeholder = "rerank-2.5"
    modelInput.value = draft.model
    modelInput.disabled = isLocked()
    modelInput.addEventListener("input", () => { draft.model = modelInput.value })
    editor.append(field("ai-reranker-model", "Voyage model", modelInput))

    const credentialSelect = document.createElement("select")
    credentialSelect.append(option("", "No credential linked"))
    for (const summary of state?.credentials ?? []) {
      credentialSelect.append(option(summary.id, `${summary.name} · ${credentialStatusLabel(summary.status === "not-required" ? "none" : summary.status)}`))
    }
    credentialSelect.value = draft.credentialId
    credentialSelect.disabled = isLocked()
    credentialSelect.addEventListener("change", () => { draft.credentialId = credentialSelect.value })
    editor.append(field("ai-reranker-credential", "Voyage credential", credentialSelect))

    const advanced = document.createElement("details")
    advanced.className = "ai-reranker-disclosure"
    advanced.open = advancedOpen
    advanced.addEventListener("toggle", () => { advancedOpen = advanced.open })
    const advancedSummary = document.createElement("summary")
    advancedSummary.textContent = "Advanced settings"
    advanced.append(advancedSummary)

    const timeoutInput = document.createElement("input")
    timeoutInput.type = "number"
    timeoutInput.min = "1"
    timeoutInput.step = "1"
    timeoutInput.autocomplete = "off"
    timeoutInput.value = draft.timeoutMs
    timeoutInput.disabled = isLocked()
    timeoutInput.addEventListener("input", () => { draft.timeoutMs = timeoutInput.value })
    advanced.append(field("ai-reranker-timeout", "Timeout (ms)", timeoutInput))

    const topKInput = document.createElement("input")
    topKInput.type = "number"
    topKInput.min = "1"
    topKInput.step = "1"
    topKInput.autocomplete = "off"
    topKInput.placeholder = "All documents"
    topKInput.value = draft.topK
    topKInput.disabled = isLocked()
    topKInput.addEventListener("input", () => { draft.topK = topKInput.value })
    advanced.append(field("ai-reranker-topk", "Default top K", topKInput))

    advanced.append(checkboxField(
      "ai-reranker-return-documents",
      "Return documents by default",
      draft.returnDocuments,
      isLocked(),
      checked => { draft.returnDocuments = checked },
    ))
    advanced.append(checkboxField(
      "ai-reranker-truncation",
      "Truncate inputs to the context limit by default",
      draft.truncation,
      isLocked(),
      checked => { draft.truncation = checked },
    ))
    editor.append(advanced)

    const actions = document.createElement("div")
    actions.className = "ai-reranker-actions"
    const save = button("Save configuration", "ai-btn-primary")
    save.disabled = isLocked() || !canSave()
    save.onclick = submit
    actions.append(save)
    if (editTargetId !== null) {
      const cancel = button("Cancel")
      cancel.disabled = isLocked()
      cancel.onclick = () => { resetEditor(); render() }
      actions.append(cancel)
    }
    editor.append(actions)
    section.append(editor)
  }

  const render = (): void => {
    const value = state
    root.replaceChildren()
    if (value === null) return

    const heading = document.createElement("h2")
    heading.textContent = "Reranker"
    const intro = document.createElement("p")
    intro.className = "ai-reranker-intro"
    intro.textContent = "Voyage rerank scoring configurations. Each configuration selects a Voyage model, a shared Voyage credential, and defaults for top K, returned documents, and truncation."
    root.append(heading, intro)

    renderList(root, value)
    renderEditor(root)

    if (value.operation === "testing") {
      const testActions = document.createElement("div")
      testActions.className = "ai-reranker-actions"
      const cancelTest = button("Cancel test")
      cancelTest.onclick = () => controller.cancelTest()
      testActions.append(cancelTest)
      root.append(testActions)
    }

    const status = document.createElement("p")
    status.className = "ai-reranker-status"
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
    draft = draftFor(createRerankerConfigDraft())
    advancedOpen = false
    editTargetId = null
    state = null
    target.replaceChildren()
  }
}
