import { svelte } from "@sveltejs/vite-plugin-svelte"
import { defineConfig } from "vite"

export default defineConfig({
  server: { host: "127.0.0.1" },
  plugins: [svelte(), {
    name: "mock-host-reload",
    handleHotUpdate({ server }) {
      server.ws.send({ type: "full-reload", path: "*" })
      return []
    },
  }],
})
