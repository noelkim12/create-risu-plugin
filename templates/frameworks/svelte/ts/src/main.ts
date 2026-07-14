import { mount, unmount } from "svelte"
import App from "./App.svelte"
import { PLUGIN_DISPLAY_NAME, PLUGIN_NAME } from "./constants/plugin"
import ErrorPanel from "./ErrorPanel.svelte"
import { registerFeatures } from "./features/generated"
import { ChatContext, type ResolvedChatContext } from "./helpers/chat-context"
import { getGlobalStorage, setGlobalStorage } from "./helpers/plugin-storage"
import { containerHost } from "./ui/container-host"
import "./styles.css"

type AppProps = {
  readonly openCount: number
  readonly context: ResolvedChatContext
  readonly onClose: () => Promise<void>
}

const readNextOpenCount = async (): Promise<number> => {
  const storedCount = await getGlobalStorage<unknown>("openCount")
  const currentCount = typeof storedCount === "number" && Number.isInteger(storedCount)
    ? storedCount
    : 0
  const openCount = currentCount + 1
  await setGlobalStorage("openCount", openCount)
  return openCount
}

const openPanel = async (): Promise<void> => {
  await containerHost.open(async ({ target, close }) => {
    try {
      const props: AppProps = {
        openCount: await readNextOpenCount(),
        context: await new ChatContext().resolve(),
        onClose: close,
      }
      const app = mount(App, { target, props })
      return () => unmount(app)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown plugin error"
      console.error(`${PLUGIN_DISPLAY_NAME} failed to open`, error)
      const errorPanel = mount(ErrorPanel, {
        target,
        props: { message, onClose: close },
      })
      return () => unmount(errorPanel)
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
