# ${프로젝트명}

Svelte 5 and TypeScript scaffold for a Risuai API v3 plugin. It builds one JavaScript file with Vite and registers a visible Risuai action button that mounts the Svelte panel inside the plugin iframe. A settings entry is also registered as a fallback entry point.

## Scripts

```bash
npm run dev
npm run build
npm run typecheck
```

- `npm run dev` runs Vite watch mode and rebuilds `dist/${파일명}.js` after source changes.
- `npm run build` creates the plugin file once.
- `npm run typecheck` checks the TypeScript source.

## Risuai Import And File-Based Hot Reload

1. Run `npm run dev` while editing, or `npm run build` before a manual import.
2. In Risuai v3, open plugin import or file-based hot reload.
3. Select `dist/${파일명}.js`.
4. Click the generated action button, or open the generated settings entry, to mount the iframe-local Svelte panel.

The template doesn't open a network connection for development. Risuai reloads the built file you select.

## Runtime Shape

- `src/main.ts` registers a visible action button with `risuai.registerButton` and a fallback settings item with `risuai.registerSetting`.
- Clicking either entry calls `risuai.showContainer("fullscreen")`.
- `src/App.svelte` renders inside this plugin iframe only.
- The panel increments a global `openCount` through `src/helpers/plugin-storage.ts` and `risuai.pluginStorage`.
- Current character and chat data are resolved read-only through `src/helpers/chat-context.ts`.
- The close button calls `risuai.hideContainer()`.
- Risuai unload unmounts the Svelte app instance.

## Files

- `src/main.ts`: action button registration, settings registration, and Svelte mount lifecycle.
- `src/styles.css`: global iframe-local panel styles imported by `src/main.ts`.
- `src/App.svelte`: iframe-local panel.
- `src/ErrorPanel.svelte`: iframe-local error panel.
- `src/constants/plugin.ts`: generated plugin constants.
- `src/helpers/plugin-storage.ts`: scoped `pluginStorage` helper.
- `src/helpers/chat-context.ts`: read-only current chat context helper.
- `src/types/risuai.d.ts`: vendored Risuai API v3 declaration snapshot.

## Optional Update URL

The build output includes `//@api 3.0` and other plugin metadata. Add `//@update-url` in `vite.config.ts` only if you publish a stable hosted plugin file. Local import and file-based hot reload don't need it.
