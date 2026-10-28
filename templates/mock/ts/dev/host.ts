import { PLUGIN_NAME } from "../src/constants/plugin"
import { createMockRuntime } from "./runtime"
import { renderUiParts } from "./ui-controls"
import type { MockChat } from "./fixtures"

const element = <T extends HTMLElement>(id: string, constructor: { new(): T }): T => {
  const found = document.getElementById(id)
  if (!(found instanceof constructor)) throw new Error(`Missing mock element: ${id}`)
  return found
}
const frame = element("plugin-frame", HTMLIFrameElement)
const controls = {
  settings: element("settings", HTMLElement),
  action: element("action-buttons", HTMLElement),
  chat: element("chat-buttons", HTMLElement),
  hamburger: element("hamburger-buttons", HTMLElement),
}
const status = element("status", HTMLElement)
const messages = element("messages", HTMLElement)
const input = element("message", HTMLTextAreaElement)
const request = element("request", HTMLElement)
const sidebar = element("sidebar", HTMLElement)
const sidebarToggle = element("sidebar-toggle", HTMLButtonElement)
const modal = element("modal", HTMLElement)
const modalOpen = element("modal-open", HTMLButtonElement)
const modalClose = element("modal-close", HTMLButtonElement)
const setSidebarOpen = (open: boolean): void => {
  sidebar.toggleAttribute("data-open", open)
  sidebarToggle.setAttribute("aria-expanded", String(open))
}
const reportError = (error: unknown): void => {
  status.textContent = error instanceof Error ? error.message : String(error)
  status.setAttribute("data-error", "")
  element("reload", HTMLButtonElement).closest("details")?.setAttribute("open", "")
  setSidebarOpen(true)
  console.error(error)
}
let renderVersion = 0
const renderChat = async (chat: MockChat): Promise<void> => {
  const version = ++renderVersion
  const rows = await Promise.all(chat.message.map(async message => {
    const row = document.createElement("p")
    row.dataset["role"] = message.role
    row.textContent = await runtime.displayText(message.data)
    return row
  }))
  if (version === renderVersion) {
    messages.replaceChildren(...rows)
    messages.scrollTop = messages.scrollHeight
  }
}
const delayParam = Number(new URLSearchParams(location.search).get("delay") ?? 1)
const runtime = createMockRuntime({
  storage: localStorage,
  namespace: PLUGIN_NAME,
  delay: Number.isFinite(delayParam) ? Math.min(2000, Math.max(0, delayParam)) : 1,
  onUiParts: parts => renderUiParts(controls, parts, reportError),
  onContainer: visible => {
    frame.hidden = !visible
    if (visible) setSidebarOpen(false)
  },
  onChat: chat => { void renderChat(chat).catch(reportError) },
  onRequest: value => { request.textContent = JSON.stringify(value, null, 2) },
})
Object.defineProperty(window, "__risuMock", { value: {
  api: runtime.api,
  ready: () => { status.textContent = "플러그인 준비 완료" },
  error: reportError,
} })
window.addEventListener("error", event => reportError(event.error ?? event.message))
window.addEventListener("unhandledrejection", event => reportError(event.reason))
element("composer", HTMLFormElement).onsubmit = event => {
  event.preventDefault()
  const text = input.value
  input.value = ""
  void runtime.api.sendChat(text).catch(reportError)
}
element("reload", HTMLButtonElement).onclick = () => {
  void runtime.dispose().then(() => location.reload()).catch(reportError)
}
element("reset", HTMLButtonElement).onclick = () => {
  void runtime.dispose().then(() => runtime.resetStorage()).then(() => location.reload()).catch(reportError)
}
element("chat-reset", HTMLButtonElement).onclick = () => {
  void runtime.resetChat().then(() => { request.textContent = "(없음)" }).catch(reportError)
}
sidebarToggle.onclick = () => setSidebarOpen(!sidebar.hasAttribute("data-open"))
element("sidebar-close", HTMLButtonElement).onclick = () => {
  setSidebarOpen(false)
  sidebarToggle.focus()
}
modalOpen.onclick = () => {
  modal.hidden = false
  modalClose.focus()
}
const closeModal = (): void => {
  modal.hidden = true
  modalOpen.focus()
}
modalClose.onclick = closeModal
modal.onclick = event => { if (event.target === modal) closeModal() }
window.addEventListener("keydown", event => {
  if (event.key === "Escape" && !modal.hidden) closeModal()
})
runtime.render()
frame.src = "./plugin.html"
