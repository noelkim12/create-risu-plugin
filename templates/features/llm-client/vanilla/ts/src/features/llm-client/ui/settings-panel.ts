import type { ProviderConfig, ProviderId } from "../core/types"
import { isLocalNetworkUrl } from "../network/url-policy"
import type { LlmSettingsController, SettingsState } from "../settings/settings-controller"

export interface MountedLlmSettingsPanel {
  destroy(): void
}

const PROVIDER_LABELS: Readonly<Record<ProviderId, string>> = {
  "google-ai-studio": "Google AI Studio",
  "google-vertex": "Google Vertex",
  "openai-compatible": "OpenAI-compatible",
  ollama: "Ollama",
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
  error = "",
): HTMLDivElement {
  const wrapper = document.createElement("div")
  wrapper.className = "llm-field"
  const label = document.createElement("label")
  label.htmlFor = id
  label.textContent = labelText
  const errorElement = document.createElement("p")
  errorElement.id = `${id}-error`
  errorElement.className = "llm-error"
  errorElement.textContent = error
  control.id = id
  control.setAttribute("aria-describedby", errorElement.id)
  control.setAttribute("aria-invalid", String(error !== ""))
  wrapper.append(label, control, errorElement)
  return wrapper
}

function textInput(
  id: string,
  label: string,
  value: string,
  onInput: (value: string) => void,
  error = "",
  type: "text" | "password" | "number" = "text",
  disabled = false,
): HTMLDivElement {
  const input = document.createElement("input")
  input.type = type
  input.value = value
  input.autocomplete = type === "password" ? "new-password" : "off"
  input.disabled = disabled
  input.addEventListener("input", () => onInput(input.value))
  return field(id, label, input, error)
}

function textareaField(
  id: string,
  label: string,
  value: string,
  onInput: (value: string) => void,
  error = "",
  disabled = false,
): HTMLDivElement {
  const textarea = document.createElement("textarea")
  textarea.rows = 7
  textarea.value = value
  textarea.autocomplete = "off"
  textarea.disabled = disabled
  textarea.addEventListener("input", () => onInput(textarea.value))
  return field(id, label, textarea, error)
}

function selectField(
  id: string,
  label: string,
  value: string,
  entries: readonly (readonly [string, string])[],
  onChange: (value: string) => void,
  error = "",
  disabled = false,
): HTMLDivElement {
  const select = document.createElement("select")
  for (const [entryValue, entryLabel] of entries) {
    select.append(option(entryValue, entryLabel))
  }
  select.value = value
  select.disabled = disabled
  select.addEventListener("change", () => onChange(select.value))
  return field(id, label, select, error)
}

function info(text: string, className = ""): HTMLParagraphElement {
  const element = document.createElement("p")
  element.className = className
  element.textContent = text
  return element
}

interface FocusSnapshot {
  readonly id: string
  readonly selectionDirection?: "backward" | "forward" | "none"
  readonly selectionEnd?: number
  readonly selectionStart?: number
}

function captureFocus(target: HTMLElement): FocusSnapshot | null {
  const active = document.activeElement
  if (!(active instanceof HTMLElement) || !target.contains(active) || active.id === "") return null
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    return {
      id: active.id,
      selectionDirection: active.selectionDirection ?? "none",
      selectionEnd: active.selectionEnd ?? undefined,
      selectionStart: active.selectionStart ?? undefined,
    }
  }
  return { id: active.id }
}

function restoreFocus(target: HTMLElement, snapshot: FocusSnapshot | null): void {
  if (snapshot === null) return
  const next = [...target.querySelectorAll<HTMLElement>("[id]")]
    .find(element => element.id === snapshot.id)
  if (!next || next.hidden || ("disabled" in next && next.disabled === true)) return
  next.focus()
  if (
    (next instanceof HTMLInputElement || next instanceof HTMLTextAreaElement)
    && snapshot.selectionStart !== undefined
    && snapshot.selectionEnd !== undefined
  ) {
    const length = next.value.length
    next.setSelectionRange(
      Math.min(snapshot.selectionStart, length),
      Math.min(snapshot.selectionEnd, length),
      snapshot.selectionDirection,
    )
  }
}

export function mountLlmSettingsPanel(
  target: HTMLElement,
  controller: LlmSettingsController,
  onClose: () => Promise<void>,
): MountedLlmSettingsPanel {
  let state: SettingsState | null = null
  const drafts = {
    apiKey: "",
    serviceAccountJson: "",
    customHeadersJson: "",
  }

  const clearDrafts = (): void => {
    drafts.apiKey = ""
    drafts.serviceAccountJson = ""
    drafts.customHeadersJson = ""
  }

  const isLocked = (value = state): boolean => value === null
    || !value.loaded
    || ["loading", "saving", "clearing", "resetting", "testing"].includes(value.operation)

  const setConfig = (config: ProviderConfig): void => {
    if (!isLocked()) controller.updateConfig(config)
  }

  const appendCommonFields = (grid: HTMLDivElement, value: SettingsState): void => {
    const config = value.activeConfig
    grid.append(selectField(
      "llm-provider",
      "Provider",
      config.provider,
      Object.entries(PROVIDER_LABELS),
      next => {
        if (isLocked()) return
        clearDrafts()
        controller.selectProvider(next as ProviderId)
      },
      "",
      isLocked(value),
    ))
    grid.append(textInput(
      "llm-model",
      "Model",
      config.model,
      model => setConfig({ ...config, model } as ProviderConfig),
      value.fieldErrors.model,
      "text",
      isLocked(value),
    ))
    grid.append(textInput(
      "llm-timeout",
      "Timeout (ms)",
      String(config.timeoutMs),
      timeout => setConfig({ ...config, timeoutMs: Number(timeout) } as ProviderConfig),
      value.fieldErrors.timeoutMs,
      "number",
      isLocked(value),
    ))
  }

  const appendApiKey = (grid: HTMLElement, optional = false): void => {
    grid.append(textInput(
      "llm-api-key",
      optional ? "API key (optional)" : "API key",
      drafts.apiKey,
      apiKey => {
        if (isLocked()) return
        drafts.apiKey = apiKey
        controller.setSecretDraft({ apiKey })
      },
      "",
      "password",
      isLocked(),
    ))
    grid.append(info("Leave blank to preserve the stored key.", "llm-help"))
  }

  const appendVertexFields = (grid: HTMLDivElement, value: SettingsState): void => {
    const config = value.activeConfig
    if (config.provider !== "google-vertex") return
    const fieldset = document.createElement("fieldset")
    fieldset.className = "llm-field llm-auth-tabs"
    const legend = document.createElement("legend")
    legend.textContent = "Authentication"
    const tabs = document.createElement("div")
    tabs.setAttribute("role", "tablist")
    tabs.setAttribute("aria-label", "Vertex authentication")
    const panel = document.createElement("div")
    panel.id = `llm-vertex-${config.authMode}-panel`
    panel.setAttribute("role", "tabpanel")

    const modes = ["api-key", "service-account"] as const
    for (const [index, mode] of modes.entries()) {
      const tab = document.createElement("button")
      tab.type = "button"
      tab.id = `llm-vertex-${mode}-tab`
      tab.textContent = mode === "api-key" ? "API Key" : "Service Account"
      tab.setAttribute("role", "tab")
      tab.setAttribute("aria-selected", String(config.authMode === mode))
      tab.setAttribute("aria-controls", `llm-vertex-${mode}-panel`)
      tab.tabIndex = config.authMode === mode ? 0 : -1
      tab.disabled = isLocked(value)
      const activate = (): void => {
        if (isLocked()) return
        drafts.apiKey = ""
        drafts.serviceAccountJson = ""
        setConfig({ ...config, authMode: mode })
        queueMicrotask(() => document.getElementById(`llm-vertex-${mode}-tab`)?.focus())
      }
      tab.addEventListener("click", activate)
      tab.addEventListener("keydown", event => {
        const keys = ["ArrowLeft", "ArrowRight", "Home", "End"]
        if (!keys.includes(event.key) || isLocked()) return
        event.preventDefault()
        const nextIndex = event.key === "Home"
          ? 0
          : event.key === "End"
            ? modes.length - 1
            : (index + (event.key === "ArrowRight" ? 1 : -1) + modes.length) % modes.length
        const nextMode = modes[nextIndex]
        if (nextMode) {
          drafts.apiKey = ""
          drafts.serviceAccountJson = ""
          setConfig({ ...config, authMode: nextMode })
          queueMicrotask(() => document.getElementById(`llm-vertex-${nextMode}-tab`)?.focus())
        }
      })
      tabs.append(tab)
    }
    panel.setAttribute("aria-labelledby", `llm-vertex-${config.authMode}-tab`)
    if (config.authMode === "api-key") {
      appendApiKey(panel)
    } else {
      panel.append(textInput(
        "llm-project-id",
        "Project ID",
        config.projectId,
        projectId => setConfig({ ...config, projectId }),
        value.fieldErrors.projectId,
        "text",
        isLocked(value),
      ))
      panel.append(textInput(
        "llm-location",
        "Location",
        config.location,
        location => setConfig({ ...config, location }),
        value.fieldErrors.location,
        "text",
        isLocked(value),
      ))
      panel.append(textareaField(
        "llm-service-account-json",
        "Service Account JSON",
        drafts.serviceAccountJson,
        serviceAccountJson => {
          if (isLocked()) return
          drafts.serviceAccountJson = serviceAccountJson
          controller.setSecretDraft({ serviceAccountJson })
        },
        "",
        isLocked(value),
      ))
      panel.append(info("Leave blank to preserve the stored Service Account credential.", "llm-help"))
    }
    fieldset.append(legend, tabs, panel)
    grid.append(fieldset)
  }

  const appendProviderFields = (grid: HTMLDivElement, value: SettingsState): void => {
    const config = value.activeConfig
    switch (config.provider) {
      case "google-ai-studio":
        grid.append(info("Endpoint: https://generativelanguage.googleapis.com", "llm-help"))
        appendApiKey(grid)
        return
      case "google-vertex":
        appendVertexFields(grid, value)
        return
      case "openai-compatible":
        grid.append(textInput(
          "llm-base-url",
          "Base URL",
          config.baseUrl,
          baseUrl => setConfig({ ...config, baseUrl }),
          value.fieldErrors.baseUrl,
          "text",
          isLocked(value),
        ))
        grid.append(selectField(
          "llm-authentication",
          "Authentication",
          config.authMode,
          [["bearer", "Bearer"], ["none", "None"]],
          authMode => setConfig({ ...config, authMode: authMode as "bearer" | "none" }),
          "",
          isLocked(value),
        ))
        appendApiKey(grid, config.authMode === "none")
        grid.append(textareaField(
          "llm-custom-headers",
          "Custom headers JSON",
          drafts.customHeadersJson,
          customHeadersJson => {
            if (isLocked()) return
            drafts.customHeadersJson = customHeadersJson
            controller.setSecretDraft({ customHeadersJson })
          },
          value.fieldErrors.customHeaderNames,
          isLocked(value),
        ))
        grid.append(info(
          "Leave blank to preserve stored headers; enter {} to remove them. Reserved headers are rejected.",
          "llm-help",
        ))
        if (config.customHeaderNames.length > 0) {
          grid.append(info(`Stored header names: ${config.customHeaderNames.join(", ")}`, "llm-stored"))
        }
        if (value.runtimePlatform === "web" && isLocalNetworkUrl(config.baseUrl)) {
          grid.append(info(
            "Hosted web cannot reach this local endpoint. Use Risu desktop/Tauri or self-hosted Node.",
            "llm-error",
          ))
        }
        return
      case "ollama":
        grid.append(textInput(
          "llm-base-url",
          "Base URL",
          config.baseUrl,
          baseUrl => setConfig({ ...config, baseUrl }),
          value.fieldErrors.baseUrl,
          "text",
          isLocked(value),
        ))
        grid.append(selectField(
          "llm-authentication",
          "Authentication",
          config.authMode,
          [["none", "None"], ["bearer", "Bearer"]],
          authMode => setConfig({ ...config, authMode: authMode as "none" | "bearer" }),
          "",
          isLocked(value),
        ))
        appendApiKey(grid, config.authMode === "none")
        if (value.runtimePlatform === "web" && isLocalNetworkUrl(config.baseUrl)) {
          grid.append(info(
            "Hosted web cannot reach local Ollama. Use Risu desktop/Tauri or self-hosted Node.",
            "llm-error",
          ))
        } else {
          grid.append(info("This runtime can route this Ollama endpoint.", "llm-help"))
        }
    }
  }

  const appendActions = (form: HTMLFormElement, value: SettingsState): void => {
    const actions = document.createElement("div")
    actions.className = "llm-actions"
    const button = (label: string): HTMLButtonElement => {
      const element = document.createElement("button")
      element.type = "button"
      element.textContent = label
      return element
    }
    const saveButton = button("Save")
    saveButton.disabled = isLocked(value)
    saveButton.onclick = () => { if (!isLocked()) void controller.save() }
    const testButton = button("Test connection")
    testButton.disabled = isLocked(value)
    testButton.onclick = () => { if (!isLocked()) void controller.testConnection() }
    const cancelButton = button("Cancel test")
    cancelButton.hidden = value.operation !== "testing"
    cancelButton.disabled = value.operation !== "testing"
    cancelButton.onclick = () => { if (state?.operation === "testing") controller.cancelTest() }
    const clearButton = button("Clear credential")
    clearButton.disabled = isLocked(value)
    clearButton.onclick = () => { if (!isLocked()) void controller.clearCredential() }
    const resetButton = button("Reset provider")
    resetButton.disabled = isLocked(value)
    resetButton.onclick = () => {
      if (isLocked()) return
      if (window.confirm("Reset this provider and remove its stored credentials?")) {
        clearDrafts()
        void controller.resetActiveProvider()
      }
    }
    const closeButton = button("Close")
    closeButton.disabled = value.operation === "testing"
    closeButton.onclick = () => { if (state?.operation !== "testing") void onClose() }
    actions.append(saveButton, testButton, cancelButton, clearButton, resetButton, closeButton)
    form.append(actions)
  }

  const render = (): void => {
    if (state === null) return
    const focus = captureFocus(target)
    const main = document.createElement("main")
    main.className = "llm-settings-shell"
    main.setAttribute("aria-labelledby", "llm-settings-title")

    const card = document.createElement("section")
    card.className = "llm-settings-card"

    const title = document.createElement("h1")
    title.id = "llm-settings-title"
    title.textContent = "LLM Provider Settings"

    const storageWarning = info(
      "Settings and credentials use device-local storage that is shared between plugins and is not encrypted or an OS credential vault.",
      "llm-storage-warning",
    )

    const form = document.createElement("form")
    form.noValidate = true
    form.addEventListener("submit", event => {
      event.preventDefault()
      if (!isLocked()) void controller.save()
    })
    const grid = document.createElement("div")
    grid.className = "llm-field-grid"
    appendCommonFields(grid, state)
    appendProviderFields(grid, state)
    form.append(grid)
    appendActions(form, state)

    const credential = info(
      state.credentialState === "stored"
        ? "Stored locally"
        : state.credentialState === "stale"
          ? "Stored credential does not match the current endpoint or auth settings."
          : "No credential stored",
      state.credentialState === "stored" ? "llm-stored" : "llm-help",
    )

    const status = document.createElement("p")
    status.className = "llm-settings-status"
    status.textContent = state.statusMessage
    status.setAttribute("aria-live", "polite")
    status.setAttribute("role", state.operation === "error" ? "alert" : "status")

    card.append(title, storageWarning, form, credential, status)
    main.append(card)
    target.replaceChildren(main)
    restoreFocus(target, focus)
  }

  const unsubscribe = controller.subscribe(next => {
    state = next
    if (
      next.statusMessage === "Saved locally."
      || next.statusMessage === "Credential removed."
      || next.statusMessage === "Provider reset."
    ) {
      clearDrafts()
    }
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
