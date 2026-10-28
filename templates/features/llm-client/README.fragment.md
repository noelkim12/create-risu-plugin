<!-- llm-client-readme -->
## LLM Client

This project includes the optional direct LLM client. In Risu, open the
**AI Services** settings entry and select the **Keys** section to manage
credentials. Then select the **LLM** section to create saved model
configurations and link every credential-requiring model to a compatible key.
You can keep multiple keys and models. Direct calls always select one saved model by its immutable
`modelConfigId`; the settings selection is not a call fallback.

From `src/main.ts` or another file under `src/`:

```ts
import {
  llmClient,
  type SavedModelConfigId,
} from "./features/llm-client"

export async function reply(modelConfigId: SavedModelConfigId): Promise<void> {
  const request = {
    messages: [{ role: "user" as const, content: "Reply briefly." }],
  }
  const response = await llmClient.complete(request, { modelConfigId })
  console.log(response.text, response.provider, response.model, response.usage)
}
```

Stream only from a model with `hasStreaming`, and abort it when the caller
cancels:

```ts
import {
  llmClient,
  type SavedModelConfigId,
} from "./features/llm-client"

export async function streamReply(modelConfigId: SavedModelConfigId): Promise<void> {
  const abort = new AbortController()
  const request = {
    messages: [{ role: "user" as const, content: "Stream a short reply." }],
  }

  try {
    for await (const event of llmClient.stream(request, { modelConfigId, signal: abort.signal })) {
      if (event.type === "part" && event.part.type === "text") console.log(event.part.text)
    }
  } finally {
    abort.abort()
  }
}
```

Supported saved providers are Google AI Studio, Google Vertex,
OpenAI-compatible endpoints, Ollama, and dedicated official-endpoint DeepSeek.
Calls use `risuai.nativeFetch` directly and do not register a Risu model
provider. Credential storage and key lifecycle rules are documented in the
top-level **AI Services** section of the generated README.

See [the detailed LLM client guide](docs/llm-client.md) for provider setup,
capability flags, reasoning/media/cache/prefill/role behavior, protected
additional JSON, network limits, errors, and manual Risu QA.
