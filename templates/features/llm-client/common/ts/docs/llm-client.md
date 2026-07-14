# Direct LLM Client

This project includes the optional `llm-client` feature. It calls external providers directly through `risuai.nativeFetch` and does not register a Risu model provider.

From a file under `src/`:

```ts
import { llmClient } from "./features/llm-client"

const response = await llmClient.complete({
  messages: [{ role: "user", content: "Reply briefly." }],
})

console.log(response.text)
```

Open **LLM Settings** in Risu to configure one of the four supported providers: Google AI Studio, Google Vertex, an OpenAI-compatible endpoint, or Ollama. Test Connection performs a real minimal generation request and may incur provider charges.

## Credential storage

Settings and credentials are stored unencrypted in Risu's device-local plugin storage. This storage is not synchronized with Risu save data, is shared between plugins under a common namespace, and is not encrypted or an OS credential vault. Avoid shared devices and use restricted, least-privilege credentials. Secret values are not shown again after saving.

Leaving a secret field blank when saving preserves the stored credential. Use **Clear credential** to explicitly remove the active credential slot. **Reset provider** restores that provider's default settings and removes only that provider's stored credential slots; unrelated plugin storage is preserved.

## Vertex authentication

- **API Key** uses Vertex Express Mode and does not require Project ID or Location.
- **Service Account JSON (OAuth 2.0)** requires Project ID and Location. Use a dedicated service account with only the permissions needed for Vertex calls. Access tokens remain in memory and are refreshed before expiry.

## Network and runtime support

All provider calls use `risuai.nativeFetch` with Risu fetch logging disabled. Local endpoints use Risu's `local_network` route.

The default Ollama URL is `http://127.0.0.1:11434/v1`. Local Ollama and other private endpoints are supported from Risu desktop/Tauri and from a self-hosted Node runtime that can reach the configured host. Hosted web runtimes cannot route to the user's localhost or private network; use desktop/self-hosted Risu or a deliberately exposed HTTPS endpoint.

## v1 limits

The wrapper is text-only and non-streaming. Streaming, tools, multimodal input, model discovery, automatic retries, named profiles, and user OAuth are not included.
