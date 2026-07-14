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

## Non-interactive mode

Pass the project name as a positional argument to skip all prompts (used by tools such as risuai-workbench):

```bash
npx create-risu-plugin my-plugin --framework svelte --description "My plugin" --out ./my-plugin --skip-install
```

| Flag | Default | Description |
| --- | --- | --- |
| `--framework` | `vanilla` | `vanilla` or `svelte` |
| `--description` | `<Name> for RISU AI` | package.json description |
| `--out` | `./<name>` | output directory (must not exist) |
| `--skip-install` | off | skip `npm install` after scaffolding |

The name must be kebab-case (`my-risu-plugin`). On success the last stdout line is `created: <absolute path>`. Exit code is non-zero on failure.

## Optional features

After choosing Vanilla or Svelte, the CLI shows an optional-feature checkbox. Features are OFF by default; press Space to toggle **LLM client — call external LLM APIs directly**, then Enter to continue.

When enabled, the generated project contains `src/features/llm-client/`, a framework-specific settings screen, `src/features/generated.ts`, and `docs/llm-client.md`. The feature calls Google AI Studio, Google Vertex, OpenAI-compatible APIs, and Ollama directly; it does not register a Risu model provider. Projects generated with the checkbox clear contain no LLM-client source.

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
