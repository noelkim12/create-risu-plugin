# CLAUDE.md - maintainer guide

This guide is for AI assistants and maintainers working on `create-risu-plugin`.
The current package is a Risuai API v3 scaffold generator. It creates TypeScript projects only, with Vite as the bundler and `vanilla` or `svelte` as the framework choice.

## Current architecture

The CLI entrypoint stays small:

1. `bin/index.js` starts the package command.
2. `lib/createProject.js` collects the project name, description, registry check choice, and framework.
3. `ProjectConfig` stores v3-only generation settings.
4. `ProjectGenerator` runs template copy, file processing, package mutation, config mutation, and install.

The generated plugin output is a single JavaScript file built by Vite. The bundle banner declares Risuai metadata, including `//@api 3.0`. Generated code uses iframe-local UI and verified v3 APIs such as `registerSetting`, `showContainer`, `hideContainer`, `pluginStorage`, and current character or chat helpers.

## Supported template surface

Only these template roots are default product surface:

```text
templates/frameworks/vanilla/ts/
templates/frameworks/svelte/ts/
templates/bundlers/vite/ts/
templates/dependencies/
```

Do not add a user-facing language prompt. TypeScript is implicit. Do not add another framework option unless the matching TypeScript template, dependency fragment, Vite config, docs, and smoke checks are updated in the same change.

## Template change workflow

When changing generated project behavior, edit the template first, then verify the generator output.

1. Update the selected framework template under `templates/frameworks/<framework>/ts/`.
2. Update `templates/bundlers/vite/ts/vite.config.<framework>.ts` if build output or metadata changes.
3. Update dependency fragments only when the generated package truly needs a new package.
4. Update `ConfigFileUpdater` only for placeholders that exist in current template files.
5. Generate both vanilla and Svelte smoke projects and run their builds.
6. Check generated source and `dist` output for required v3 metadata and forbidden legacy terms.

Keep generated projects iframe-safe. Don't add main app DOM access, dynamic runtime script loading, storage fallbacks, or broad SDK layers unless a separate plan explicitly asks for them.

## Metadata policy

Package metadata should describe the current v3 TypeScript, Vite, vanilla, and Svelte scaffold. Keep the published package version unchanged unless the release task explicitly asks for a version bump.

Do not change these fields during maintainer-guide updates:

- `version`
- `bin.create-risu-plugin`
- `files`
- `publishConfig`
- `repository`
- `author`
- `license`

## Verification checklist

Before claiming a maintainer or template change is done, record evidence for:

- Package version and bin path stayed unchanged.
- `files` still includes `bin/`, `lib/`, and `templates/`.
- Package metadata names Risuai API v3, TypeScript, and Vite.
- Maintainer guides describe the v3-only template workflow.
- Generated-project docs, if touched, still explain Risuai v3 file import or file-based reload through the Risuai app.

## Out of scope by default

These are not part of the current scaffold and shouldn't reappear in default docs or metadata:

- Extra UI framework defaults.
- Non-TypeScript template variants.
- Legacy API wrappers.
- Custom socket reload clients.
- Runtime updater UI or updater modules.
- Alternate bundlers.
- Reverse proxy setup docs.
