import { mount, unmount } from "svelte";
import App from "./App.svelte";
import { PLUGIN_DISPLAY_NAME, PLUGIN_NAME } from "./constants/plugin";
import ErrorPanel from "./ErrorPanel.svelte";
import { ChatContext, type ResolvedChatContext } from "./helpers/chat-context";
import { getGlobalStorage, setGlobalStorage } from "./helpers/plugin-storage";
import "./styles.css";

type AppProps = {
  readonly openCount: number;
  readonly context: ResolvedChatContext;
  readonly onClose: () => Promise<void>;
};

let mountedApp: ReturnType<typeof mount> | null = null;

const renderErrorPanel = (message: string): void => {
  document.body.replaceChildren();
  mountedApp = mount(ErrorPanel, {
    target: document.body,
    props: {
      message,
      onClose: closePanel,
    },
  });
};

const unmountCurrentApp = (): void => {
  if (mountedApp === null) {
    return;
  }

  unmount(mountedApp);
  mountedApp = null;
};

const closePanel = async (): Promise<void> => {
  unmountCurrentApp();
  await risuai.hideContainer();
};

const readNextOpenCount = async (): Promise<number> => {
  const storedCount = await getGlobalStorage<unknown>("openCount");
  const currentCount = typeof storedCount === "number" && Number.isInteger(storedCount) ? storedCount : 0;
  const openCount = currentCount + 1;
  await setGlobalStorage("openCount", openCount);
  return openCount;
};

const openPanel = async (): Promise<void> => {
  await risuai.showContainer("fullscreen");

  try {
    unmountCurrentApp();
    document.body.replaceChildren();

    const props: AppProps = {
      openCount: await readNextOpenCount(),
      context: await new ChatContext().resolve(),
      onClose: closePanel,
    };

    mountedApp = mount(App, {
      target: document.body,
      props,
    });
  } catch (error) {
    unmountCurrentApp();
    const message = error instanceof Error ? error.message : "Unknown plugin error";
    console.error(`${PLUGIN_DISPLAY_NAME} failed to open`, error);
    renderErrorPanel(message);
  }
};

const openPanelFromButton = (): void => {
  void openPanel();
};

await risuai.registerButton(
  {
    name: PLUGIN_DISPLAY_NAME,
    icon: '<span aria-hidden="true">R</span>',
    iconType: "html",
    location: "action",
    id: `${PLUGIN_NAME}-action`,
  },
  openPanelFromButton,
);

await risuai.registerSetting(
  `${PLUGIN_DISPLAY_NAME} Settings`,
  openPanel,
  '<span aria-hidden="true">R</span>',
  "html",
  `${PLUGIN_NAME}-settings`,
);

await risuai.onUnload(() => {
  unmountCurrentApp();
});
