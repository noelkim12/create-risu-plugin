<!-- llm-client-readme -->
## LLM Client

This project includes the optional direct LLM client. Open **LLM Settings** in Risu, configure a provider, and run **Test Connection** before making requests.

From `src/main.ts` or another file under `src/`:

```ts
import { llmClient } from "./features/llm-client"

const response = await llmClient.complete({
  messages: [{ role: "user", content: "Reply briefly." }],
})

console.log(response.text)
console.log(response.provider, response.model, response.usage)
```

The client supports Google AI Studio, Google Vertex, OpenAI-compatible endpoints, and Ollama. It is text-only and non-streaming. Provider credentials are stored unencrypted in Risu's device-local plugin storage, so use restricted credentials and avoid shared devices. See [the detailed LLM client guide](docs/llm-client.md) for authentication, runtime, and network details.
