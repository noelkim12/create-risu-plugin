# create-risu-plugin

Create a TypeScript Risuai API v3 plugin scaffold for vanilla DOM or Svelte. The generated project uses Vite, renders inside the plugin iframe, and stores plugin data through `risuai.pluginStorage`.

## What You Get

- TypeScript-only templates for vanilla and Svelte.
- Risuai API v3 metadata, including `//@api 3.0` in the built plugin file.
- Iframe-local settings UI opened with `risuai.showContainer` and closed with `risuai.hideContainer`.
- Scoped storage helpers built on `pluginStorage`.
- Read-only current character and chat context helpers.
- Vite watch and build scripts for manual Risuai import and file-based hot reload.
- Built-in `npm run mock` browser preview for both frameworks, with sample chat and persistent mock storage.

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

When enabled, the generated project contains `src/features/llm-client/`, shared AI Services settings, `src/features/generated.ts`, and `docs/llm-client.md`. **AI Services** owns the **Keys** section for every selected credential consumer. The **LLM** section manages model configurations only. Each direct call explicitly selects its saved model with `modelConfigId`. The feature calls Google AI Studio, Google Vertex, OpenAI-compatible APIs, Ollama, and dedicated official-endpoint DeepSeek directly through `risuai.nativeFetch`; it does not register a Risu model provider. Projects generated with the checkbox clear contain no LLM-client source.

## Risuai v3 Development Flow

1. Run `npm run dev` to start Vite watch mode, or run `npm run build` for a one-time build.
2. Open Risuai v3 plugin import or file-based hot reload.
3. Select the built `dist/<plugin-name>.js` file.
4. In Risuai, open the generated settings entry.
5. Confirm the iframe-local panel opens, the open count updates, and the current character or chat context appears when available.

`npm run dev` watches the built JavaScript file for Risuai. To preview the plugin without Risuai, run `npm run mock`: it opens a local mock host at `/dev/`, with settings buttons that launch the actual plugin UI in an iframe. Edit `dev/fixtures.ts` to customize sample data. The generated `docs/mock.md` documents the supported API subset; real network calls and unsupported host APIs fail explicitly. Mock files are excluded from the production bundle.

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

The vanilla template registers a settings entry, opens the Risuai plugin iframe, and renders a small DOM panel into the iframe document.

### Svelte

The Svelte template registers the settings entry, mounts `App.svelte` after it opens, then unmounts it when Risuai unloads the plugin.

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
