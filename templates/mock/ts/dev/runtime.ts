import { argumentsFixture, character, createChat, reply, type MockChat } from "./fixtures"
import { createMockStorage } from "./storage"
import { createUiParts, type UiPart } from "./ui-parts"

type Handler = (text: string) => string | null | undefined | Promise<string | null | undefined>
type RequestMessage = { role: string; content: string }
type Replacer = (messages: RequestMessage[], type: string) => unknown | Promise<unknown>

interface Options {
  readonly storage: Storage
  readonly namespace: string
  readonly onUiParts: (parts: readonly UiPart[]) => void
  readonly onContainer: (visible: boolean) => void
  readonly onChat: (chat: MockChat) => void
  readonly onRequest?: (messages: readonly RequestMessage[]) => void
  readonly delay?: number
}

export function createMockRuntime(options: Options) {
  let chat = createChat()
  const unloaders: (() => void | Promise<void>)[] = []
  const handlers = new Map<string, Set<Handler>>()
  const replacers = new Map<string, Set<Replacer>>()
  const prefix = `risu-mock:${options.namespace}:`
  const pluginStorage = createMockStorage(options.storage, `${prefix}plugin:`, options.delay ?? 1)
  const localStorage = createMockStorage(options.storage, `${prefix}local:`, options.delay ?? 1)
  const uiParts = createUiParts(options.onUiParts)
  const hop = async <T>(run: () => T | Promise<T>): Promise<T> => {
    await new Promise<void>(resolve => setTimeout(resolve, options.delay ?? 1))
    return run()
  }
  const checkIndex = (characterIndex: number, chatIndex = 0): void => {
    if (characterIndex !== 0 || chatIndex !== 0) throw new RangeError("Mock supports character 0, chat 0 only")
  }
  const notify = (): void => options.onChat(structuredClone(chat))
  const runHandlers = async (mode: string, input: string): Promise<string> => {
    let text = input
    for (const handler of handlers.get(mode) ?? []) text = await handler(text) ?? text
    return text
  }
  const add = <T>(map: Map<string, Set<T>>, key: string, value: T): void => {
    const entries = map.get(key) ?? new Set<T>()
    entries.add(value)
    map.set(key, entries)
  }

  const methods = {
    registerSetting: (...args: Parameters<typeof uiParts.registerSetting>) => hop(() => uiParts.registerSetting(...args)),
    registerButton: (...args: Parameters<typeof uiParts.registerButton>) => hop(() => uiParts.registerButton(...args)),
    unregisterUIPart: (id: string) => hop(() => uiParts.unregisterUIPart(id)),
    showContainer: (_mode?: string) => hop(() => options.onContainer(true)),
    hideContainer: () => hop(() => options.onContainer(false)),
    getCharacter: () => hop(() => structuredClone({ ...character, chatPage: 0, chats: [chat] })),
    getCurrentCharacterIndex: () => hop(() => 0),
    getCurrentChatIndex: () => hop(() => 0),
    getCharacterFromIndex: (index: number) => hop(() => {
      checkIndex(index)
      return structuredClone({ ...character, chatPage: 0, chats: [chat] })
    }),
    getChatFromIndex: (characterIndex: number, chatIndex: number) => hop(() => {
      checkIndex(characterIndex, chatIndex)
      return structuredClone(chat)
    }),
    setChatToIndex: (characterIndex: number, chatIndex: number, next: MockChat) => hop(() => {
      checkIndex(characterIndex, chatIndex)
      chat = { ...structuredClone(next), isStreaming: chat.isStreaming }
      notify()
    }),
    getCurrentLorebookEntries: () => hop(() => structuredClone([...character.globalLore, ...chat.localLore])),
    getArgument: (key: string) => hop(() => argumentsFixture[key]),
    getRuntimeInfo: () => hop(() => ({ apiVersion: "3.0", platform: "mock", saveMethod: "localStorage" })),
    requestPluginPermission: (_permission: string) => hop(() => false),
    nativeFetch: (_url: string, _init?: RequestInit): Promise<Response> => hop(() => {
      throw new Error("nativeFetch is disabled in mock mode. Add a response fixture in dev/runtime.ts or test in RisuAI.")
    }),
    pluginStorage,
    getLocalPluginStorage: () => hop(() => localStorage),
    addRisuScriptHandler: (mode: string, handler: Handler) => hop(() => add(handlers, mode, handler)),
    removeRisuScriptHandler: (mode: string, handler: Handler) => hop(() => { handlers.get(mode)?.delete(handler) }),
    addRisuReplacer: (type: string, replacer: Replacer) => hop(() => {
      if (type !== "beforeRequest") throw new Error(`Mock replacer ${type} is not implemented`)
      add(replacers, type, replacer)
    }),
    removeRisuReplacer: (type: string, replacer: Replacer) => hop(() => { replacers.get(type)?.delete(replacer) }),
    sendChat: (message: string) => hop(async () => {
      if (chat.isStreaming) throw new Error("Mock generation is already running")
      chat.isStreaming = true
      try {
        if (message) chat.message.push({ role: "user", data: await runHandlers("input", message) })
        notify()
        let request: RequestMessage[] = []
        for (const item of chat.message) {
          request.push({ role: item.role === "char" ? "assistant" : "user", content: await runHandlers("process", item.data) })
        }
        for (const replacer of replacers.get("beforeRequest") ?? []) {
          const result = await replacer(request, "model")
          if (Array.isArray(result)) request = result
        }
        options.onRequest?.(structuredClone(request))
        const response = await runHandlers("output", reply(request.at(-1)?.content ?? ""))
        chat.message.push({ role: "char", data: response })
      } finally {
        chat.isStreaming = false
        notify()
      }
    }),
    onUnload: (run: () => void | Promise<void>) => hop(() => { unloaders.push(run) }),
  }

  const api = new Proxy(methods, {
    get(target, property, receiver) {
      if (Reflect.has(target, property)) return Reflect.get(target, property, receiver)
      if (typeof property !== "string" || property === "then") return undefined
      return () => hop(() => { throw new Error(`risuai.${property} is not implemented in mock mode (dev/runtime.ts)`) })
    },
  })

  return {
    api,
    render: notify,
    resetChat: () => hop(() => {
      if (chat.isStreaming) throw new Error("모의 응답이 끝난 뒤 초기화해 주세요.")
      chat = createChat()
      notify()
    }),
    async resetStorage(): Promise<void> {
      await pluginStorage.clear()
      await localStorage.clear()
    },
    displayText: (text: string) => runHandlers("display", text),
    async dispose(): Promise<void> {
      try {
        const results = await Promise.allSettled(unloaders.splice(0).map(run => Promise.resolve().then(run)))
        const failed = results.find(result => result.status === "rejected")
        if (failed?.status === "rejected") throw failed.reason
      } finally {
        handlers.clear()
        replacers.clear()
        uiParts.clear()
        options.onContainer(false)
      }
    },
  }
}
