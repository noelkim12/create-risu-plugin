# Create Risu Plugin scaffold architecture

`create-risu-plugin` is a v3-only Risuai plugin scaffold generator. It creates TypeScript projects with Vite, a single plugin bundle, and either a vanilla or Svelte iframe-local UI.

## Directory map

```text
lib/
├── createProject.js
├── core/
│   ├── ProjectConfig.js
│   └── ProjectGenerator.js
├── prompts/
│   ├── basePrompts.js
│   └── frameworkPrompts.js
├── processors/
│   ├── DependencyManager.js
│   ├── FileProcessor.js
│   └── TemplateComposer.js
├── updaters/
│   ├── ConfigFileUpdater.js
│   └── PackageJsonUpdater.js
└── utils/
    ├── messages.js
    └── validators.js

templates/
├── bundlers/vite/ts/
│   ├── vite.config.svelte.ts
│   └── vite.config.vanilla.ts
├── dependencies/
│   ├── package.common.json
│   ├── package.svelte.json
│   └── package.vite.json
└── frameworks/
    ├── svelte/ts/
    └── vanilla/ts/
```

## Generation flow

1. `createProject.js` collects project name, description, registry check choice, and framework.
2. `ProjectConfig` validates the v3-only config. Valid framework values are `vanilla` and `svelte`; bundler is Vite; source language is TypeScript.
3. `ProjectGenerator` validates the target directory and selected template.
4. `TemplateComposer` copies `templates/frameworks/<framework>/ts` and the matching Vite config to `vite.config.ts`.
5. `FileProcessor` renames `gitignore.template` to `.gitignore`.
6. `PackageJsonUpdater` applies generated package metadata and dependency fragments.
7. `ConfigFileUpdater` replaces placeholders in README and `src/constants/plugin.ts`.
8. `DependencyManager` runs install in the generated project.

## Generated project contract

Every generated project should include:

- `package.json`, `tsconfig.json`, `vite.config.ts`, `README.md`, and `.gitignore`.
- `src/main.ts`, `src/constants/plugin.ts`, `src/helpers/plugin-storage.ts`, `src/helpers/chat-context.ts`, and `src/types/risuai.d.ts`.
- A single built plugin file in `dist/<package-name>.js`.
- A metadata banner with `//@api 3.0` and the usual plugin identity fields.
- A default UI that runs inside the plugin iframe and opens through `registerSetting` plus `showContainer`.

Svelte templates also include `src/App.svelte`; vanilla templates include `src/ui/panel.ts`.

## Template change workflow

Treat the template tree as the source of truth for generated project behavior.

1. Change `templates/frameworks/<framework>/ts` first.
2. Change `templates/bundlers/vite/ts` when output format, metadata, or framework build behavior changes.
3. Change `templates/dependencies` only when the generated project needs a package at install time.
4. Keep placeholder names aligned with `ConfigFileUpdater`.
5. Generate vanilla and Svelte projects in a temporary directory.
6. Run `npm run build` in both generated projects.
7. Inspect each `dist/<package-name>.js` for `//@api 3.0` and a single JavaScript bundle.
8. Run static checks over active templates and generated projects for removed legacy terms.

## Dependency policy

Vanilla projects should stay minimal: Vite, TypeScript, and Node types. Svelte projects add Svelte and the Svelte Vite plugin. Avoid adding style frameworks, icon packs, utility libraries, storage libraries, or release tooling unless a plan says they are part of the product surface.

## Docs policy

Generated READMEs should teach the current Risuai API v3 workflow:

- Build with Vite.
- Import or select the built `dist/<plugin>.js` file in Risuai.
- Use the Risuai v3 file-based reload flow when iterating locally.
- Add `//@update-url` only for a hosted plugin file with a stable URL.

Maintainer docs must not link to deleted files. If a guide is removed, update every reference in the same change.

## Guardrails

Default scaffold code should not include:

- Extra UI framework defaults.
- Non-TypeScript variants.
- Legacy API wrappers.
- Custom socket reload code.
- Runtime updater modules.
- Alternate bundler defaults.
- Reverse proxy setup references.
- IndexedDB or browser storage fallback helpers.
- Main Risuai app DOM access.

If one of those topics is needed for historical context, keep it outside the default workflow and mark it as historical. Prefer removing stale references entirely.
