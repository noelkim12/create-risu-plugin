# Mock development

Run `npm install`, then `npm run mock`. Vite opens `/dev/` in the BF Legend mock layout: a dark sidebar, scrolling conversation, bottom action row and message input. Registered settings in the sidebar open your actual `src/main.ts` UI inside a separate iframe. Both `risuai` and `Risuai` refer to the mock API. Closing the panel returns to the conversation. On mobile, the bottom menu button opens the sidebar.

Source edits fully reload the host and plugin so setting registrations and handlers do not accumulate. The mock configuration is separate from `vite.config.ts`; `npm run dev` remains the plugin build watcher and `npm run build` remains the production build. No mock code is imported by the production entry point.

## Fixtures and controls

- `dev/fixtures.ts`: sample character, chat, lorebooks, plugin arguments and deterministic reply function.
- `dev/runtime.ts`: async API implementations and explicit errors for unsupported APIs.
- `dev/storage.ts`: JSON storage adapter with plugin-specific namespaces.
- `dev/host.ts` and `dev/index.html`: setting buttons, chat composer, reload and reset controls.
- `vite.mock.config.ts`: preview server and framework integration.

Add `?delay=100` to `/dev/` to simulate API latency (milliseconds, capped at 2000). The host binds to `127.0.0.1` by default; pass `npm run mock -- --host 0.0.0.0` when you need access from another device. Vite chooses the next available port if its default is busy.

Plugin storage and local plugin storage survive reloads in this browser origin. They are separate and scoped by `PLUGIN_NAME`. The sidebar's **개발 도구** section contains plugin reload and storage reset controls. Mock chats start from the fixture on every reload; **채팅 초기화** resets only the conversation. The sidebar shows the last processed request after sending a message. **기본 Alert 열기** previews the host modal layer under the plugin iframe. Use sample credentials only: mock storage uses browser localStorage.

## Supported API subset

- `registerSetting`, `registerButton`, `unregisterUIPart`, `showContainer`, `hideContainer`, `onUnload`.
- `getCharacter`, `getCharacterFromIndex`, current character/chat indices, `getChatFromIndex`, `setChatToIndex`, `getCurrentLorebookEntries`. Only character 0 and chat 0 exist; reads and writes copy their data.
- `pluginStorage` and `getLocalPluginStorage`: `getItem`, `setItem`, `removeItem`, `clear`, `keys`, `key`, `length`.
- `getArgument`, `getRuntimeInfo`.
- `sendChat`, script handlers (`input`, `process`, `output`, `display`), and the `beforeRequest` replacer. Replies come from fixtures, never an AI service. This is a simplified pipeline, not a complete host simulation.

Optional AI Services settings can be opened and edited using mock local storage. `nativeFetch` rejects with an explicit mock error: connection tests and real model requests require RisuAI or a response fixture you implement locally. Permissions return false; unsupported APIs (including SafeDOM/getRootDocument, providers, other replacers and database access) fail explicitly. The mock does not emulate RisuAI permission dialogs, sanitization, IPC isolation, streaming or remote networking.

Always validate the built `dist/<plugin-name>.js` in RisuAI before release. A working browser preview verifies UI and the implemented call flow, not full host compatibility.

## UI entry points

Settings appear under **플러그인 설정** in the sidebar. Action buttons (the default) and chat buttons appear beside the bottom input; hamburger buttons appear in the sidebar's expandable **메뉴**. The layout preserves BF Legend's mock host styling. The mock validates `iconType` and button `icon`, but renders names only, without HTML or image icons.

```typescript
const button = await risuai.registerButton({
  name: "Open my plugin",
  icon: "",
  iconType: "none",
  location: "chat",
  id: "my-plugin-open",
}, () => { void openPanel() })

// Remove this entry when it is no longer needed.
await risuai.unregisterUIPart(button.id)
```

`registerSetting` and `registerButton` return `{ id }`. If an ID is omitted or empty, a fresh UUID is generated, even when the name matches an existing entry. Re-registering a button with the same ID updates its name and callback while preserving its original location and position; a new `location` is ignored. Settings replace only settings, and buttons replace only buttons. `unregisterUIPart(id)` removes matching entries from both stores; an unknown ID is a no-op. Unload clears all registered entries. Invalid names, icon types, button icons and new button locations reject asynchronously.

These rules follow the matching implementations in PocketRisu and risuai-pork (`src/ts/plugins/apiV3/v3.svelte.ts`). `setChatPanel` and SafeDOM remain outside this entry-point mock.
