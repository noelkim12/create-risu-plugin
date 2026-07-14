# Publishing Guide

This guide covers publishing the `create-risu-plugin` CLI package itself and checking the generated Risuai API v3 workflow before release.

## Before Publishing The CLI

Run these checks from the `create-risu-plugin` package root:

```bash
node bin/index.js
npm pack --dry-run
```

When testing the generated project, choose `vanilla` or `svelte`, then run:

```bash
npm run build
```

The generated plugin should produce `dist/<plugin-name>.js` with `//@api 3.0` near the top of the file.

## Manual Risuai v3 Check

1. Build the generated project with `npm run build`.
2. Open Risuai v3 plugin import.
3. Select `dist/<plugin-name>.js`.
4. Click the generated action button, or open the plugin settings entry as a fallback.
5. Confirm the iframe-local UI opens and closes.
6. Confirm the open count uses `pluginStorage`.
7. Confirm current character or chat context appears when available.

Run the same flow with `npm run dev` when checking file-based hot reload. Keep Vite watch running, select the built file in Risuai, edit source, and confirm Risuai reloads the selected file.

## npm Publish Steps

```bash
npm login
npm whoami
npm pack --dry-run
npm publish
```

For a scoped package, use:

```bash
npm publish --access public
```

## Package Fields To Keep

- `bin.create-risu-plugin` must point to `./bin/index.js`.
- `files` must include `bin/`, `lib/`, and `templates/`.
- The package version should change only as part of an approved release.
- Generated templates should stay TypeScript-only and Risuai API v3-only.

## Optional Update URL

Generated plugin builds omit `//@update-url` by default. Add it only for a hosted plugin file with a stable URL. Manual Risuai import and file-based hot reload don't need it.

## LLM client release gate

1. Run `npm run test:all` and require all unit tests plus Vanilla/Svelte OFF/ON smoke builds to pass.
2. Run `npm pack --dry-run` and verify that every `templates/features/llm-client` file is present while tests, temporary fixtures, `.omo/`, and credentials are absent.
3. Record the Risu version used for manual compatibility testing in the release notes.
4. Do not publish if a manual fetch-log or console inspection exposes an API key, Authorization header, JWT assertion, OAuth access token, or private key.
