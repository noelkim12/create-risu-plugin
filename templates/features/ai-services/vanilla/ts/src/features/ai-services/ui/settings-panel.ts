import type { AiServiceSection, AiServiceSectionCleanup } from "../settings/section-registry"
import "./settings-panel.css"

export interface MountedAiServicesPanel {
  destroy(): void
}

export function mountAiServicesSettingsPanel(
  target: HTMLElement,
  sections: readonly AiServiceSection[],
  onClose: () => Promise<void>,
): MountedAiServicesPanel {
  const main = document.createElement("main")
  main.className = "ai-services-shell"
  main.setAttribute("aria-labelledby", "ai-services-title")

  const card = document.createElement("section")
  card.className = "ai-services-card"

  const header = document.createElement("header")
  header.className = "ai-services-header"
  const title = document.createElement("h1")
  title.id = "ai-services-title"
  title.textContent = "AI Services"
  const closeButton = document.createElement("button")
  closeButton.type = "button"
  closeButton.className = "ai-close-button"
  closeButton.setAttribute("aria-label", "Close")
  closeButton.title = "Close"
  closeButton.textContent = "×"
  closeButton.onclick = () => { void onClose() }
  header.append(title, closeButton)

  const workspace = document.createElement("div")
  workspace.className = "ai-services-workspace"

  const sidebar = document.createElement("aside")
  sidebar.className = "ai-services-sidebar"
  const eyebrow = document.createElement("p")
  eyebrow.className = "ai-sidebar-eyebrow"
  eyebrow.textContent = "Configuration"
  const nav = document.createElement("nav")
  nav.className = "ai-services-nav"
  nav.setAttribute("aria-label", "AI Services sections")
  sidebar.append(eyebrow, nav)

  const content = document.createElement("div")
  content.className = "ai-services-content"
  workspace.append(sidebar, content)
  card.append(header, workspace)
  main.append(card)
  target.replaceChildren(main)

  let activeCleanup: AiServiceSectionCleanup | null = null
  let activeButton: HTMLButtonElement | null = null

  // One disposal path for section switches, close, and unload.
  const disposeActiveSection = (): void => {
    activeCleanup?.()
    activeCleanup = null
    content.replaceChildren()
  }

  const activate = (section: AiServiceSection, button: HTMLButtonElement): void => {
    if (activeButton === button) return
    disposeActiveSection()
    activeButton?.classList.remove("ai-nav-button-active")
    activeButton?.removeAttribute("aria-current")
    activeButton = button
    button.classList.add("ai-nav-button-active")
    button.setAttribute("aria-current", "true")
    activeCleanup = section.mount({ target: content, close: onClose })
  }

  const navButtons = sections.map(section => {
    const button = document.createElement("button")
    button.type = "button"
    button.className = "ai-nav-button"
    button.textContent = section.label
    button.onclick = () => activate(section, button)
    return button
  })
  nav.append(...navButtons)

  const [firstSection] = sections
  const [firstButton] = navButtons
  if (firstSection !== undefined && firstButton !== undefined) activate(firstSection, firstButton)

  let destroyed = false
  return {
    destroy() {
      if (destroyed) return
      destroyed = true
      disposeActiveSection()
      activeButton = null
      closeButton.onclick = null
      target.replaceChildren()
    },
  }
}
