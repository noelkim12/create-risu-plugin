import { PLUGIN_DISPLAY_NAME, PLUGIN_NAME } from "../../constants/plugin"
import type { ContainerHost } from "../../ui/container-host"

export async function registerLlmClientFeature(host: ContainerHost): Promise<void> {
  await risuai.registerSetting(
    `${PLUGIN_DISPLAY_NAME} LLM Settings`,
    () => host.open(({ target, close }) => {
      const panel = document.createElement("main")
      panel.className = "risu-panel"
      panel.setAttribute("aria-labelledby", "llm-settings-title")

      const title = document.createElement("h1")
      title.id = "llm-settings-title"
      title.textContent = "LLM Settings"

      const description = document.createElement("p")
      description.textContent = "Configure direct provider calls for this plugin."

      const closeButton = document.createElement("button")
      closeButton.type = "button"
      closeButton.textContent = "Close"
      closeButton.addEventListener("click", () => void close())

      panel.append(title, description, closeButton)
      target.replaceChildren(panel)
    }),
    '<span aria-hidden="true">LLM</span>',
    "html",
    `${PLUGIN_NAME}-llm-settings`,
  )
}
