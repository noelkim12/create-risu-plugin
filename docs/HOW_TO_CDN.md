# Optional Hosted Plugin File

The default Risuai API v3 workflow is manual file import or file-based hot reload. Build the plugin, then select `dist/<plugin-name>.js` in Risuai.

Hosting the built file is optional. Use it only when you want a stable URL for a released plugin file.

## Build First

```bash
npm run build
```

Upload the generated `dist/<plugin-name>.js` to your chosen static host.

## Add Update Metadata Manually

If you want the built file to advertise its hosted location, add `//@update-url` in `vite.config.ts`:

```ts
//@update-url https://example.com/my-plugin.js
```

Keep this out of local-only builds unless you have a real hosted file. The generated scaffold works without it.

## Check The Hosted File

1. Download or open the hosted JavaScript file.
2. Confirm the first metadata lines include `//@api 3.0`.
3. In Risuai v3, import the same built file manually before relying on the hosted copy.
4. Confirm the iframe-local UI, `pluginStorage` open count, and current chat context still work.
