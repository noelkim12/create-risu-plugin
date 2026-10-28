# ${프로젝트명}

Vanilla TypeScript scaffold for a Risuai API v3 plugin. It builds one JavaScript file with Vite and registers a Risuai settings entry that opens a small iframe-local panel.

## Scripts

```bash
npm run dev
npm run build
npm run typecheck
npm run mock
```

- `npm run dev` runs Vite watch mode and rebuilds `dist/${파일명}.js` after source changes.
- `npm run build` creates the plugin file once.
- `npm run typecheck` checks the TypeScript source.

## Risuai Import And File-Based Hot Reload

1. Run `npm run dev` while editing, or `npm run build` before a manual import.
2. In Risuai v3, open plugin import or file-based hot reload.
3. Select `dist/${파일명}.js`.
4. Open the generated settings entry to show the iframe-local panel.

`npm run dev` rebuilds the selected file for Risuai. For a standalone browser preview, use `npm run mock`.

## Mock Preview

`npm run mock` starts a local Vite server and opens `/dev/`. Click a registered settings button to open the actual plugin UI in an iframe. Source edits reload the preview. `npm run dev` and `npm run build` still produce only the Risuai plugin bundle.

Edit `dev/fixtures.ts` for sample character, chat, arguments and deterministic replies; extend `dev/runtime.ts` for additional APIs. See [Mock development](docs/mock.md) for supported APIs and limitations.

## Runtime Shape

- `src/main.ts` registers the settings item with `risuai.registerSetting`.
- Clicking the entry calls `risuai.showContainer("fullscreen")`.
- `src/ui/panel.ts` renders into this plugin iframe only.
- The panel increments a global `openCount` through `src/helpers/plugin-storage.ts` and `risuai.pluginStorage`.
- Current character and chat data are resolved read-only through `src/helpers/chat-context.ts`.
- The close button calls `risuai.hideContainer()`.

## Files

- `src/main.ts`: plugin entry and settings registration.
- `src/styles.css`: global iframe-local panel styles imported by `src/main.ts`.
- `src/ui/panel.ts`: iframe-local DOM panel.
- `src/constants/plugin.ts`: generated plugin constants.
- `src/helpers/plugin-storage.ts`: scoped `pluginStorage` helper.
- `src/helpers/chat-context.ts`: read-only current chat context helper.
- `src/types/risuai.d.ts`: vendored Risuai API v3 declaration snapshot.

## Optional Update URL

The build output includes `//@api 3.0` and other plugin metadata. Add `//@update-url` in `vite.config.ts` only if you publish a stable hosted plugin file. Local import and file-based hot reload don't need it.

When an AI service consumer is selected, generated README composition adds an
AI Services section. Register credentials in its Keys section before configuring
an authenticated consumer.
