# Quickstart

Use `create-risu-plugin` to generate a TypeScript Risuai API v3 plugin for vanilla DOM or Svelte.

## Create A Plugin

```bash
npx create-risu-plugin
cd my-plugin
```

The CLI asks for project name, description, package-name check, and framework. Choose `vanilla` or `svelte`. TypeScript is the only source language.

### Choose optional features

The feature prompt is a checkbox: Space toggles the highlighted item and Enter accepts the selection. Nothing is selected by default. If you enable **LLM client**, install and build the generated project normally, load the bundle in Risu, then open your plugin's **LLM Settings** entry from Risu Settings. Provider secrets remain blank in the form after reload even when a credential is stored.

## Build For Risuai

```bash
npm run dev
```

`npm run dev` runs Vite watch mode and rebuilds `dist/<plugin-name>.js` after edits. For a one-time build, run:

```bash
npm run build
```

## Import Or Hot Reload In Risuai v3

1. Open Risuai v3 plugin import or file-based hot reload.
2. Select `dist/<plugin-name>.js` from the generated project.
3. Click the generated action button. If your Risuai layout hides that button location, open the generated settings entry as a fallback.
4. Confirm the iframe-local panel opens.
5. Confirm the open count changes through `pluginStorage`.
6. Confirm current character or chat context appears when Risuai has one selected.

No separate local server is required. Risuai works with the built JavaScript file.

## Optional Hosted File

Local development doesn't need `//@update-url`. Add it only when you publish a stable hosted plugin file and want the metadata to point to that file.

See [HOW_TO_CDN.md](./HOW_TO_CDN.md) for the non-default hosted-file workflow.
