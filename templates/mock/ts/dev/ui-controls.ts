import type { UiLocation, UiPart } from "./ui-parts"

export function renderUiParts(
  containers: Readonly<Record<UiLocation, HTMLElement>>,
  parts: readonly UiPart[],
  onError: (error: unknown) => void,
): void {
  for (const location of ["settings", "action", "chat", "hamburger"] as const) {
    const container = containers[location]
    const existing = new Map([...container.querySelectorAll<HTMLButtonElement>("button")].map(button => [button.dataset["partId"], button]))
    const buttons = parts.filter(part => part.location === location).map(part => {
      const button = existing.get(part.id) ?? document.createElement("button")
      button.type = "button"
      button.dataset["partId"] = part.id
      button.textContent = part.name
      button.onclick = () => { void Promise.resolve().then(part.action).catch(onError) }
      return button
    })
    container.replaceChildren(...buttons)
  }
}
