import "./styles.css"
import { PLUGIN_DISPLAY_NAME, PLUGIN_NAME } from "./constants/plugin"
import { registerFeatures } from "./features/generated"
import { ChatContext } from "./helpers/chat-context"
import { getGlobalStorage, setGlobalStorage } from "./helpers/plugin-storage"
import { containerHost } from "./ui/container-host"
import { renderErrorPanel, renderPanel } from "./ui/panel"

const OPEN_COUNT_KEY = "openCount"

const readOpenCount = async (): Promise<number> => {
  const storedOpenCount = await getGlobalStorage<unknown>(OPEN_COUNT_KEY)
  return typeof storedOpenCount === "number" && Number.isInteger(storedOpenCount)
    ? storedOpenCount
    : 0
}

const openPanel = async (): Promise<void> => {
  await containerHost.open(async ({ target, close }) => {
    const closePanel = (): void => {
      void close()
    }

    try {
      const openCount = (await readOpenCount()) + 1
      await setGlobalStorage(OPEN_COUNT_KEY, openCount)
      const context = await new ChatContext().resolve()
      renderPanel(target, { openCount, context }, closePanel)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown plugin error"
      console.error(`${PLUGIN_DISPLAY_NAME} failed to open`, error)
      renderErrorPanel(target, message, closePanel)
    }
  })
}

await risuai.registerButton(
  {
    name: PLUGIN_DISPLAY_NAME,
    icon: '<span aria-hidden="true">R</span>',
    iconType: "html",
    location: "action",
    id: `${PLUGIN_NAME}-action`,
  },
  () => void openPanel(),
)

await risuai.registerSetting(
  `${PLUGIN_DISPLAY_NAME} Settings`,
  openPanel,
  '<span aria-hidden="true">R</span>',
  "html",
  `${PLUGIN_NAME}-settings`,
)

await registerFeatures(containerHost)

await risuai.onUnload(() => containerHost.dispose())
