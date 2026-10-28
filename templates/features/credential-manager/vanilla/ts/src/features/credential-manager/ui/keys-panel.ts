// allow: SIZE_OK — imperative DOM editor for api-key and service-account credentials; single responsibility (Keys section UI).
import { AiServiceError, parseVertexServiceAccountJson } from "../../ai-services"
import type { AiServiceSectionCleanup } from "../../ai-services"
import type {
  ApiKeySecret,
  CredentialControllerState,
  CredentialDraft,
  CredentialId,
  CredentialKind,
  CredentialProviderId,
  CredentialSummary,
  ResolvedCredential,
  VertexServiceAccountSecret,
} from "../core/types"
import type { CredentialManagerController } from "../settings/credential-manager-controller"
import "./keys-panel.css"

const PROVIDER_LABELS: Readonly<Record<CredentialProviderId, string>> = {
  "google-ai-studio": "Google AI Studio",
  "google-vertex": "Google Vertex",
  "openai-compatible": "OpenAI-compatible",
  ollama: "Ollama",
  deepseek: "DeepSeek",
  voyage: "Voyage",
}

const KIND_LABELS: Readonly<Record<CredentialKind, string>> = {
  "api-key": "API key",
  "vertex-service-account": "Service Account JSON",
  none: "No authentication",
}

const API_KEY_AUTH_LABELS: Readonly<Record<"api-key" | "bearer", string>> = {
  "api-key": "API key header",
  bearer: "Bearer token",
}

const LOCKED_OPERATIONS: readonly CredentialControllerState["operation"][] = [
  "loading", "saving", "revealing", "deleting",
]

function isProviderId(value: string): value is CredentialProviderId {
  return value in PROVIDER_LABELS
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
  control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
): HTMLDivElement {
  const wrapper = document.createElement("div")
  wrapper.className = "ai-keys-field"
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
  if (className !== "") element.className = className
  return element
}

function help(text: string): HTMLParagraphElement {
  const element = document.createElement("p")
  element.className = "ai-keys-help"
  element.textContent = text
  return element
}

function statusLabel(summary: CredentialSummary): string {
  if (summary.status === "not-required") return "No key required"
  if (summary.status === "stored") return "Stored locally"
  if (summary.status === "stale") return "Stale credential"
  return "Key missing"
}

function formatRevealed(value: ResolvedCredential): string {
  if (value.kind === "api-key") return value.secret.apiKey
  return JSON.stringify({
    type: "service_account",
    project_id: value.secret.projectId,
    ...(value.secret.privateKeyId === undefined ? {} : { private_key_id: value.secret.privateKeyId }),
    private_key: value.secret.privateKey,
    client_email: value.secret.clientEmail,
    token_uri: "https://oauth2.googleapis.com/token",
    location: value.secret.location,
  }, null, 2)
}

export function mountKeysPanel(
  target: HTMLElement,
  controller: CredentialManagerController,
): AiServiceSectionCleanup {
  let state: CredentialControllerState | null = null
  let draft: CredentialDraft | null = null
  let editingId: CredentialId | null = null
  // Transient secret inputs and reveal output live only in this closure; they
  // never enter controller state and cleanup clears them.
  let apiKey = ""
  let serviceAccountJson = ""
  let revealed: ResolvedCredential | null = null
  let hideReveal = false
  let editorError = ""

  const root = document.createElement("section")
  root.className = "ai-keys"
  root.setAttribute("aria-labelledby", "ai-keys-heading")

  // The save button's enabled state tracks local draft edits without a full
  // re-render, so typing never steals input focus.
  let saveButton: HTMLButtonElement | null = null
  const refreshSave = (): void => {
    if (saveButton !== null) saveButton.disabled = isLocked() || !canSave()
  }

  const isLocked = (): boolean => state === null
    || !state.loaded
    || LOCKED_OPERATIONS.includes(state.operation)

  const editingSummary = (): CredentialSummary | null => editingId === null
    || state === null
    ? null
    : state.credentials.find(summary => summary.id === editingId) ?? null

  const canSave = (): boolean => {
    const value = draft
    if (value === null || value.name.trim() === "") return false
    if (value.kind === "none") return true
    if (value.kind === "api-key") {
      return value.audience.trim() !== "" && (editingId !== null || apiKey.trim() !== "")
    }
    return editingId !== null || serviceAccountJson.trim() !== ""
  }

  const clearEditorSecrets = (): void => {
    apiKey = ""
    serviceAccountJson = ""
    revealed = null
    hideReveal = false
    editorError = ""
  }

  const closeEditor = (): void => {
    draft = null
    editingId = null
    clearEditorSecrets()
  }

  const startCreate = (): void => {
    if (isLocked()) return
    draft = controller.beginCreate()
    editingId = null
    clearEditorSecrets()
    render()
  }

  const startEdit = (summary: CredentialSummary): void => {
    if (isLocked()) return
    const next = controller.beginEdit(summary.id)
    if (next === null) return
    draft = next
    editingId = summary.id
    clearEditorSecrets()
    render()
  }

  const setProvider = (value: string): void => {
    if (draft === null || !isProviderId(value)) return
    // Plain form defaults: Vertex binds service accounts, AI Studio uses its header, others use bearer.
    draft = value === "google-vertex"
      ? { name: draft.name, provider: value, kind: "vertex-service-account", authMode: "service-account", audience: "unbound" }
      : {
        name: draft.name,
        provider: value,
        kind: "api-key",
        authMode: value === "google-ai-studio" ? "api-key" : "bearer",
        audience: "unbound",
      }
    render()
  }

  const vertexSecretFromInput = (): { readonly secret: VertexServiceAccountSecret } | { readonly error: string } => {
    try {
      const parsed = parseVertexServiceAccountJson(serviceAccountJson, null)
      return {
        secret: {
          projectId: parsed.projectId,
          location: parsed.location,
          clientEmail: parsed.clientEmail,
          privateKey: parsed.privateKey,
          ...(parsed.privateKeyId === undefined ? {} : { privateKeyId: parsed.privateKeyId }),
        },
      }
    } catch (error) {
      if (error instanceof AiServiceError) return { error: error.message }
      return { error: "Service Account JSON could not be parsed." }
    }
  }

  const submit = (): void => {
    if (isLocked() || draft === null || !canSave()) return
    const current = draft
    if (current.kind === "vertex-service-account") {
      if (serviceAccountJson.trim() === "") {
        if (editingId !== null) void controller.update(editingId, { ...current }).then(closeEditor, () => undefined)
        return
      }
      const parsed = vertexSecretFromInput()
      if ("error" in parsed) {
        editorError = parsed.error
        render()
        return
      }
      const input = {
        ...current,
        audience: `vertex:${parsed.secret.projectId}:${parsed.secret.location}`,
        secret: parsed.secret,
      }
      if (editingId === null) void controller.create(input).then(closeEditor, () => undefined)
      else void controller.update(editingId, input).then(closeEditor, () => undefined)
      return
    }
    if (current.kind === "api-key") {
      const secret: ApiKeySecret | null = apiKey.trim() === "" ? null : { apiKey }
      if (editingId === null) {
        if (secret === null) return
        void controller.create({ ...current, secret }).then(closeEditor, () => undefined)
      } else {
        void controller
          .update(editingId, secret === null ? { ...current } : { ...current, secret })
          .then(closeEditor, () => undefined)
      }
      return
    }
    if (editingId === null) void controller.create({ ...current, secret: null }).then(closeEditor, () => undefined)
    else void controller.update(editingId, { ...current }).then(closeEditor, () => undefined)
  }

  const revealCredential = (): void => {
    if (isLocked() || editingId === null) return
    if (revealed !== null && revealed.keyId === editingId) {
      hideReveal = false
      render()
      return
    }
    void controller.reveal(editingId).then(value => {
      revealed = value
      hideReveal = false
      render()
    }, () => undefined)
  }

  const clearStoredSecret = (): void => {
    if (isLocked() || editingId === null || draft === null) return
    const keyId = editingId
    const draftValue = draft
    clearEditorSecrets()
    controller.clearSecret(keyId, draftValue).catch(() => undefined)
    render()
  }

  const renderList = (value: CredentialControllerState): void => {
    const list = document.createElement("ul")
    list.className = "ai-keys-list"
    list.setAttribute("aria-label", "Saved credentials")
    if (value.credentials.length === 0) {
      const empty = document.createElement("li")
      empty.className = "ai-keys-empty"
      empty.textContent = "No credentials saved yet."
      list.append(empty)
    }
    for (const summary of value.credentials) {
      const row = document.createElement("li")
      row.className = "ai-keys-row"
      const meta = document.createElement("div")
      meta.className = "ai-keys-meta"
      const name = document.createElement("span")
      name.className = "ai-keys-name"
      name.textContent = summary.name
      const detail = document.createElement("span")
      detail.className = "ai-keys-detail"
      detail.textContent = `${PROVIDER_LABELS[summary.provider]} · ${KIND_LABELS[summary.kind]} · ${statusLabel(summary)}`
      const mask = document.createElement("span")
      mask.className = "ai-keys-mask"
      mask.textContent = summary.maskedSecret ?? "—"
      const audience = document.createElement("span")
      audience.className = "ai-keys-audience"
      audience.textContent = summary.audience
      meta.append(name, detail, mask, audience)

      if (value.pendingDeleteId === summary.id) {
        const confirm = document.createElement("div")
        confirm.className = "ai-keys-confirm"
        confirm.setAttribute("role", "group")
        confirm.setAttribute("aria-label", `Confirm deleting ${summary.name}`)
        const question = document.createElement("span")
        question.textContent = "Delete this credential? Referencing configurations keep their other settings."
        const confirmDelete = button("Confirm delete", "ai-keys-danger")
        confirmDelete.disabled = isLocked()
        confirmDelete.onclick = () => { controller.confirmDelete().catch(() => undefined) }
        const cancelDelete = button("Cancel")
        cancelDelete.disabled = isLocked()
        cancelDelete.onclick = () => { controller.cancelDelete() }
        confirm.append(question, confirmDelete, cancelDelete)
        row.append(meta, confirm)
      } else {
        const rowActions = document.createElement("div")
        rowActions.className = "ai-keys-row-actions"
        const edit = button("Edit")
        edit.setAttribute("aria-label", `Edit credential ${summary.name}`)
        edit.disabled = isLocked()
        edit.onclick = () => { startEdit(summary) }
        const del = button("Delete", "ai-keys-danger")
        del.setAttribute("aria-label", `Delete credential ${summary.name}`)
        del.disabled = isLocked()
        del.onclick = () => { controller.requestDelete(summary.id) }
        rowActions.append(edit, del)
        row.append(meta, rowActions)
      }
      list.append(row)
    }
    root.append(list)
  }

  const appendAudienceField = (editor: HTMLFormElement): void => {
    const value = draft
    if (value === null) return
    const audienceInput = document.createElement("input")
    audienceInput.type = "text"
    audienceInput.autocomplete = "off"
    audienceInput.placeholder = "unbound or exact endpoint URL"
    audienceInput.value = value.audience
    audienceInput.disabled = isLocked()
    audienceInput.addEventListener("input", () => {
      if (draft !== null) draft = { ...draft, audience: audienceInput.value }
      refreshSave()
    })
    editor.append(field("ai-keys-audience", "Audience", audienceInput))
    if (value.kind === "api-key") {
      editor.append(help("Use unbound for provider-wide keys, or the exact URL a configuration binds to."))
    }
  }

  const renderEditor = (): void => {
    const value = draft
    saveButton = null
    if (value === null) {
      const create = button("Add credential", "ai-keys-primary")
      create.disabled = isLocked()
      create.onclick = startCreate
      root.append(create)
      return
    }

    const editor = document.createElement("form")
    editor.className = "ai-keys-editor"
    editor.noValidate = true
    editor.addEventListener("submit", (event) => {
      event.preventDefault()
      submit()
    })

    const heading = document.createElement("h3")
    heading.textContent = editingId === null ? "Add credential" : "Edit credential"
    editor.append(heading)

    const providerSelect = document.createElement("select")
    for (const [providerValue, label] of Object.entries(PROVIDER_LABELS)) {
      providerSelect.append(option(providerValue, label))
    }
    providerSelect.value = value.provider
    providerSelect.disabled = isLocked() || editingId !== null
    providerSelect.addEventListener("change", () => { setProvider(providerSelect.value) })
    editor.append(field("ai-keys-provider", "Provider", providerSelect))

    const nameInput = document.createElement("input")
    nameInput.type = "text"
    nameInput.autocomplete = "off"
    nameInput.value = value.name
    nameInput.disabled = isLocked()
    nameInput.addEventListener("input", () => {
      if (draft !== null) draft = { ...draft, name: nameInput.value }
      refreshSave()
    })
    editor.append(field("ai-keys-name", "Name", nameInput))

    const stored = editingSummary()
    if (value.kind === "api-key") {
      const authSelect = document.createElement("select")
      for (const [authValue, label] of Object.entries(API_KEY_AUTH_LABELS)) {
        authSelect.append(option(authValue, label))
      }
      authSelect.value = value.authMode
      authSelect.disabled = isLocked()
      authSelect.addEventListener("change", () => {
        if (draft === null || draft.kind !== "api-key") return
        if (authSelect.value === "api-key" || authSelect.value === "bearer") {
          draft = { ...draft, authMode: authSelect.value }
        }
        refreshSave()
      })
      editor.append(field("ai-keys-auth", "Authentication", authSelect))

      appendAudienceField(editor)

      const keyInput = document.createElement("input")
      keyInput.type = "password"
      keyInput.autocomplete = "new-password"
      keyInput.value = apiKey
      keyInput.disabled = isLocked()
      keyInput.addEventListener("input", () => {
        apiKey = keyInput.value
        refreshSave()
      })
      editor.append(field("ai-keys-api-key", "API key", keyInput))
      editor.append(help(stored?.status === "stored"
        ? `Stored key: ${stored.maskedSecret ?? "***"}. Leave blank to keep it.`
        : "No API key is stored yet. Enter one to save it."))
    } else if (value.kind === "vertex-service-account") {
      const authLine = document.createElement("p")
      authLine.className = "ai-keys-stored"
      authLine.textContent = "Authentication: Service Account JSON"
      const audienceLine = document.createElement("p")
      audienceLine.className = "ai-keys-stored"
      audienceLine.textContent = `Audience: ${value.audience} (derived from the Service Account JSON as vertex:project:location)`
      editor.append(authLine, audienceLine)

      const jsonInput = document.createElement("textarea")
      jsonInput.rows = 5
      jsonInput.autocomplete = "off"
      jsonInput.value = serviceAccountJson
      jsonInput.disabled = isLocked()
      jsonInput.addEventListener("input", () => {
        serviceAccountJson = jsonInput.value
        refreshSave()
      })
      const jsonField = field("ai-keys-service-account-json", "Service Account JSON", jsonInput)
      jsonField.classList.add("ai-keys-field-wide")
      editor.append(jsonField)
      editor.append(help(stored?.status === "stored"
        ? "Stored Service Account JSON: ***. Leave blank to keep it."
        : "Paste the Google Service Account JSON to store it."))
    } else {
      const authLine = document.createElement("p")
      authLine.className = "ai-keys-stored"
      authLine.textContent = "Authentication: No authentication"
      editor.append(authLine)
      appendAudienceField(editor)
    }

    if (editingId !== null && (stored?.status === "stored" || stored?.status === "stale")) {
      const revealGroup = document.createElement("div")
      revealGroup.className = "ai-keys-btn-group"
      revealGroup.setAttribute("role", "group")
      revealGroup.setAttribute("aria-label", "Reveal stored credential")
      const reveal = button("Reveal key")
      reveal.disabled = isLocked() || stored?.status !== "stored"
      reveal.onclick = revealCredential
      const hide = button("Hide key")
      hide.disabled = revealed === null || hideReveal
      hide.onclick = () => {
        hideReveal = true
        render()
      }
      revealGroup.append(reveal, hide)
      editor.append(revealGroup)

      if (revealed !== null && !hideReveal && revealed.keyId === editingId) {
        const pre = document.createElement("pre")
        pre.className = "ai-keys-stored ai-keys-revealed"
        pre.setAttribute("role", "status")
        pre.textContent = `Revealed locally:\n${formatRevealed(revealed)}`
        editor.append(pre)
      }
    }

    if (editorError !== "") {
      const error = document.createElement("p")
      error.className = "ai-keys-error"
      error.setAttribute("role", "alert")
      error.textContent = editorError
      editor.append(error)
    }

    const actions = document.createElement("div")
    actions.className = "ai-keys-actions"
    const save = button(editingId === null ? "Save credential" : "Save changes", "ai-keys-primary")
    save.disabled = isLocked() || !canSave()
    save.onclick = submit
    saveButton = save
    actions.append(save)
    if (editingId !== null && (stored?.status === "stored" || stored?.status === "stale")) {
      const clear = button("Clear stored key", "ai-keys-danger")
      clear.disabled = isLocked()
      clear.onclick = clearStoredSecret
      actions.append(clear)
    }
    const close = button("Close editor")
    close.disabled = isLocked()
    close.onclick = () => {
      if (!isLocked()) {
        closeEditor()
        render()
      }
    }
    actions.append(close)
    editor.append(actions)
    root.append(editor)
  }

  const render = (): void => {
    const value = state
    root.replaceChildren()
    if (value === null) {
      const loading = document.createElement("p")
      loading.className = "ai-keys-loading"
      loading.textContent = "Loading credentials…"
      root.append(loading)
      return
    }

    const heading = document.createElement("h2")
    heading.id = "ai-keys-heading"
    heading.textContent = "Keys"
    const intro = document.createElement("p")
    intro.className = "ai-keys-intro"
    intro.textContent = "Saved credentials for every AI service. A credential serves configurations whose provider, authentication, and audience match it exactly."
    const warning = document.createElement("p")
    warning.className = "ai-keys-warning"
    warning.textContent = "Credentials use device-local storage that is shared between plugins and is not encrypted or an OS credential vault."
    root.append(heading, intro, warning)

    renderList(value)
    renderEditor()

    const status = document.createElement("p")
    status.className = value.operation === "error" ? "ai-keys-status ai-keys-error" : "ai-keys-status"
    status.setAttribute("role", value.operation === "error" ? "alert" : "status")
    status.setAttribute("aria-live", "polite")
    status.textContent = value.statusMessage
    root.append(status)
  }

  const unsubscribe = controller.subscribe(next => {
    state = next
    if (next.loaded && editingId !== null && !next.credentials.some(summary => summary.id === editingId)) {
      closeEditor()
    }
    render()
  })
  target.replaceChildren(root)
  controller.load().catch(() => undefined)

  return () => {
    unsubscribe()
    closeEditor()
    state = null
    target.replaceChildren()
  }
}
