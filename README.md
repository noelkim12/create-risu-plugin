# create-risu-plugin

Create a TypeScript Risuai API v3 plugin scaffold for vanilla DOM or Svelte. The generated project uses Vite, renders inside the plugin iframe, and stores plugin data through `risuai.pluginStorage`.

## What You Get

- TypeScript-only templates for vanilla and Svelte.
- Risuai API v3 metadata, including `//@api 3.0` in the built plugin file.
- Iframe-local settings UI opened with `risuai.showContainer` and closed with `risuai.hideContainer`.
- Scoped storage helpers built on `pluginStorage`.
- Read-only current character and chat context helpers.
- Vite watch and build scripts for manual Risuai import and file-based hot reload.

## Quick Start

```bash
npx create-risu-plugin
cd my-plugin
npm run dev
```

The CLI asks for a project name, description, package-name check, and framework. Framework choices are `vanilla` and `svelte`. TypeScript is always used.

## Risuai v3 Development Flow

1. Run `npm run dev` to start Vite watch mode, or run `npm run build` for a one-time build.
2. Open Risuai v3 plugin import or file-based hot reload.
3. Select the built `dist/<plugin-name>.js` file.
4. In Risuai, click the generated action button. If the button location is hidden by your layout, open the generated settings entry as a fallback.
5. Confirm the iframe-local panel opens, the open count updates, and the current character or chat context appears when available.

The generated project doesn't run a separate development server. Risuai reads the built JavaScript file you select.

## Generated Project Shape

```text
my-plugin/
├── dist/
│   └── my-plugin.js
├── src/
│   ├── main.ts
│   ├── App.svelte or ui/panel.ts
│   ├── constants/
│   │   └── plugin.ts
│   ├── helpers/
│   │   ├── chat-context.ts
│   │   └── plugin-storage.ts
│   └── types/risuai.d.ts
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## Commands

```bash
npm run dev       # build dist/<plugin-name>.js in watch mode
npm run build     # build once for manual import
npm run typecheck # check TypeScript
```

## Template Notes

### Vanilla

The vanilla template registers a visible action button with `registerButton`, keeps a settings entry as a fallback, opens the Risuai plugin iframe, and renders a small DOM panel into the iframe document.

### Svelte

The Svelte template registers the same visible action button and settings fallback, mounts `App.svelte` after either entry opens, then unmounts it when Risuai unloads the plugin.

## Optional Update URL

The default build omits `//@update-url`. If you publish a stable JavaScript file and want Risuai to know where it lives, add the metadata line in `vite.config.ts` yourself:

```ts
//@update-url https://example.com/my-plugin.js
```

Treat this as an advanced publishing choice. It isn't needed for local file import or file-based hot reload.

## Links

- [Quickstart](docs/QUICKSTART.md)
- [Publishing guide](docs/HOW_TO_PUBLISH.md)
- [Optional hosted file guide](docs/HOW_TO_CDN.md)
