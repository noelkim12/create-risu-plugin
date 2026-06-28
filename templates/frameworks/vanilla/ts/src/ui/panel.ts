import { PLUGIN_DISPLAY_NAME, PLUGIN_VERSION } from "../constants/plugin"
import type { ResolvedChatContext } from "../helpers/chat-context"

export type PanelState = {
  readonly openCount: number
  readonly context: ResolvedChatContext
}

const textOrFallback = (value: string | number | null | undefined): string =>
  value === null || value === undefined || value === "" ? "Not available" : String(value)

const appendText = (parent: HTMLElement, tagName: keyof HTMLElementTagNameMap, text: string): HTMLElement => {
  const element = document.createElement(tagName)
  element.textContent = text
  parent.append(element)
  return element
}

const appendRow = (parent: HTMLElement, label: string, value: string | number | null | undefined): void => {
  const row = document.createElement("div")
  row.className = "risu-row"

  const labelElement = appendText(row, "div", label)
  labelElement.className = "risu-label"

  const valueElement = appendText(row, "div", textOrFallback(value))
  valueElement.className = "risu-value"

  parent.append(row)
}

export function renderPanel(target: HTMLElement, state: PanelState, onClose: () => void): void {
  const shell = document.createElement("main")
  shell.className = "risu-panel"

  const card = document.createElement("section")
  card.className = "risu-card"
  card.setAttribute("aria-labelledby", "risu-panel-title")

  const header = document.createElement("div")
  header.className = "risu-header"

  const headingGroup = document.createElement("div")
  const title = appendText(headingGroup, "h1", PLUGIN_DISPLAY_NAME)
  title.id = "risu-panel-title"
  title.className = "risu-title"

  const subtitle = appendText(headingGroup, "p", `Version ${PLUGIN_VERSION}`)
  subtitle.className = "risu-subtitle"

  const closeButton = document.createElement("button")
  closeButton.className = "risu-button"
  closeButton.type = "button"
  closeButton.textContent = "Close"
  closeButton.addEventListener("click", onClose)

  header.append(headingGroup, closeButton)

  const details = document.createElement("dl")
  details.className = "risu-grid"
  appendRow(details, "Open count", state.openCount)
  appendRow(details, "Character index", state.context.characterIndex)
  appendRow(details, "Character id", state.context.characterId)
  appendRow(details, "Character name", state.context.characterName)
  appendRow(details, "Chat index", state.context.chatIndex)
  appendRow(details, "Chat id", state.context.chatId)
  appendRow(details, "Chat name", state.context.chatName)

  card.append(header, details)
  shell.append(card)
  target.replaceChildren(shell)
}

export function renderErrorPanel(target: HTMLElement, message: string, onClose: () => void): void {
  const shell = document.createElement("main")
  shell.className = "risu-panel"

  const card = document.createElement("section")
  card.className = "risu-card risu-error"
  card.setAttribute("aria-labelledby", "risu-error-title")

  const header = document.createElement("div")
  header.className = "risu-header"

  const headingGroup = document.createElement("div")
  const title = appendText(headingGroup, "h1", `${PLUGIN_DISPLAY_NAME} could not open`)
  title.id = "risu-error-title"
  title.className = "risu-title"

  const subtitle = appendText(headingGroup, "p", "The plugin panel hit an error while loading.")
  subtitle.className = "risu-subtitle"

  const closeButton = document.createElement("button")
  closeButton.className = "risu-button"
  closeButton.type = "button"
  closeButton.textContent = "Close"
  closeButton.addEventListener("click", onClose)

  header.append(headingGroup, closeButton)

  const errorMessage = appendText(card, "p", message)
  errorMessage.className = "risu-error-message"

  card.prepend(header)
  shell.append(card)
  target.replaceChildren(shell)
}
