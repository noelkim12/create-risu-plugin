import { defineConfig } from "vite"

export default defineConfig({
  server: { host: "127.0.0.1" },
  plugins: [{
    name: "mock-host-reload",
    handleHotUpdate({ server }) {
      server.ws.send({ type: "full-reload", path: "*" })
      return []
    },
  }],
})
