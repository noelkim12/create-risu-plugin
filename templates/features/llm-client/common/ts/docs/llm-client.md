# Direct LLM Client

The optional `llm-client` feature calls external LLM APIs directly through
`risuai.nativeFetch`. It does not register a Risu model provider. The public
entry points are `llmClient`, `createLlmClient`, `LlmClient`, `LlmError`, and
the exported request, response, stream, provider, and saved-ID types.

## Configure a catalog

Open **AI Services** in Risu. Manage shared credentials in the **Keys** section,
then configure models in the **LLM** section. The LLM feature stores model
configurations only, so several consumers can use the same compatible key.

1. Create a key in AI Services Keys with a name and provider, then save its API
   key or Vertex service-account JSON. Google Vertex always uses Service Account JSON.
2. Create a model configuration in LLM, set its provider-specific fields and
   capabilities, and select a compatible saved key when its authentication mode
   requires one.
3. Save the model configuration and select it when editing or testing it.

Each model-to-key link is stored by the saved key's immutable ID, not its
display name. Renaming a key therefore does not break a model link. A model
that needs credentials must link to a key with the same provider and expected
kind. Models using `authMode: "none"` must have no key link. Edit and save a
model to change its link. Create, rename, edit, and delete keys and model
configurations independently.

Deleting a key from AI Services Keys automatically runs unlink fan-out across
all registered consumers, then removes secret records, then removes catalog
metadata. If unlinking fails, secret and metadata remain and the failure is
reported.
Use **Test Connection** on the selected model before making a production call;
it performs a real minimal provider request and can incur provider charges.

The settings selection is for the editor only. A direct call never infers a
provider or model from that selection: every call requires the exact saved
model configuration ID.

## Key masking and storage

Key lists expose metadata and a mask, not the raw secret. Edit fields begin
blank; leaving a secret field blank while saving preserves the stored value.
Use **Reveal** only for the selected key when necessary. The revealed value is
shown only in the local settings lifecycle and is cleared when selection,
save, error, cancellation, close, or disposal changes that lifecycle. Hide it
again promptly.

Credentials live in Risu's device-local plugin storage. That storage is
unencrypted and is not an OS credential vault. Treat it according to the
device and account threat model: avoid shared or untrusted devices, use
dedicated least-privilege and revocable credentials, and remove credentials
that are no longer needed. Masking and lifecycle clearing reduce accidental UI
exposure; they do not encrypt a stored secret.

### Vertex authentication

Google Vertex accepts **Service Account JSON (OAuth 2.0)** only. Project ID and
Location are read from the linked credential. Use a dedicated service account
with only the permissions needed for Vertex calls. Access tokens remain in
memory and are refreshed before expiry.

## Call a selected model

Persist the chosen `SavedModelConfigId` in your feature's own typed state or
configuration. Do not substitute a provider name or a key ID. The client
resolves that exact saved model and its compatible linked credential before it
makes a request.

```ts
import {
  llmClient,
  type SavedModelConfigId,
} from "./features/llm-client"

export async function completeText(modelConfigId: SavedModelConfigId): Promise<string> {
  const request = {
    messages: [{ role: "user" as const, content: "Reply briefly." }],
  }
  const response = await llmClient.complete(request, { modelConfigId })
  return response.text
}
```

`complete()` returns the final normalized response. It can include `parts` for
permitted image or audio output, `reasoning` when the selected DeepSeek model
permits and returns it, `finishReason`, and normalized `usage`. Pass an
optional `signal` and/or `timeoutMs` in the same options object when a buffered
call needs cancellation or a per-call timeout.

Streaming is available only when the selected model has the `hasStreaming`
capability. It returns an async iterable of `part`, `reasoning`, `usage`, and
`finish` events. Keep the abort controller owned by the caller and abort it
when the user cancels or leaves the operation.

```ts
import {
  llmClient,
  type SavedModelConfigId,
} from "./features/llm-client"

export async function streamText(modelConfigId: SavedModelConfigId): Promise<void> {
  const abort = new AbortController()
  const cancel = (): void => abort.abort()
  const request = {
    messages: [{ role: "user" as const, content: "Stream a short reply." }],
  }

  try {
    for await (const event of llmClient.stream(request, { modelConfigId, signal: abort.signal })) {
      if (event.type === "part" && event.part.type === "text") {
        console.log(event.part.text)
      }
      if (event.type === "reasoning") console.log(event.text)
      if (event.type === "usage") console.log(event.usage)
      if (event.type === "finish") console.log(event.finishReason)
    }
  } finally {
    cancel()
  }
}
```

Aborting stops the request and stream reader and surfaces `LlmError` code
`ABORTED`. The caller may call `cancel()` from its own UI cancellation path;
the `finally` block also releases an unfinished stream.

## Providers and runtime

| Saved provider | Authentication and endpoint behavior |
| --- | --- |
| Google AI Studio | API key for Gemini's Google AI Studio endpoint. |
| Google Vertex | Vertex service-account OAuth with project and location. |
| OpenAI-compatible | A configured compatible base URL with bearer or no authentication. |
| Ollama | A configured OpenAI-compatible Ollama base URL with bearer or no authentication. The default is `http://localhost:11434`. |
| DeepSeek | A dedicated bearer adapter for the official `https://api.deepseek.com` chat-completions endpoint. It is not a generic OpenAI-compatible configuration. |

All calls, including streams, call `risuai.nativeFetch` directly with
`logFetch: false`, so Risu fetch logging is disabled for LLM traffic. The
feature does not call `risuai.addProvider()` or otherwise register a Risu model
provider. OpenAI-compatible and Ollama private or localhost endpoints use
Risu's local-network route. They require Risu desktop/Tauri or a self-hosted
Node runtime that can reach the host; hosted web Risu cannot reach the user's
localhost or private network.

## Capabilities, media, roles, and reasoning

Capabilities are saved per model configuration. Enable only flags the exact
provider/model supports; a flag does not add a missing upstream capability.
Known flags that are incompatible with a provider fail configuration validation.

| Flags | Effect and provider restriction |
| --- | --- |
| `hasImageInput`, `hasAudioInput`, `hasVideoInput` | Permit typed base64 input parts with a matching MIME type. Image input is available for every configured provider except DeepSeek; audio is available for Gemini and OpenAI-compatible; video is Gemini-only. Gemini encodes media as inline data, while the OpenAI-compatible path uses image data URLs and input audio. OpenAI-compatible, Ollama, and DeepSeek reject video serialization explicitly. |
| `hasImageOutput`, `hasAudioOutput` | Permit normalized image or audio response parts for Gemini and OpenAI-compatible models. Video output is always rejected. Unsupported or malformed provider media is never silently discarded. |
| `hasPrefill` | Permits an assistant prefill for OpenAI-compatible, Ollama, or DeepSeek. Gemini rejects prefill. DeepSeek additionally requires `deepSeekPrefix`. |
| `hasCache` | Permits a cache ID only for Gemini, where it is sent as `cachedContent`; other adapters return an explicit unsupported error. |
| `hasFullSystemPrompt`, `hasFirstSystemPrompt` | Allow system messages anywhere, or exactly one first system message, respectively. They are mutually exclusive. |
| `requiresAlternateRole`, `mustStartWithUserInput`, `DeveloperRole` | Enforce alternating user/assistant turns, an initial user turn, and developer messages. `DeveloperRole` is OpenAI-compatible-only and converts system messages to developer messages. |
| `hasStreaming` | Enables `stream()` for that model. Without it, streaming fails before any provider request. |
| `OAICompletionTokens` | Uses `max_completion_tokens` rather than `max_tokens` for OpenAI-compatible models. |
| `geminiThinking`, `geminiBlockOff` | Gemini-only. The first enables thinking level/budget; the second sends the supported Gemini safety categories with `OFF` thresholds. |
| `deepSeekPrefix`, `deepSeekThinkingInput`, `deepSeekThinkingOutput` | DeepSeek-only. They enable assistant prefix prefill, assistant `reasoning` input, and DeepSeek reasoning/reasoning-token output. |

Use typed content parts for media instead of arbitrary URLs: `{ type: "image" | "audio" | "video", base64, mimeType }`.
Text remains valid as a string. Requests with unsupported media, cache, prefill,
role, reasoning, or streaming combinations throw `LlmError` with
`UNSUPPORTED_FEATURE` or `CONFIG_INVALID`; they are not downgraded silently.

Reasoning follows the selected provider's protocol:

- Google AI Studio and Vertex send Gemini `thinkingLevel` and `thinkingBudget`
  only when `geminiThinking` is enabled.
- OpenAI-compatible models send `reasoning_effort` when their configured effort
  is non-null.
- Ollama reasoning is not implemented by this adapter and fails explicitly when
  enabled.
- DeepSeek always sends its selected `thinking` state. Enabling it requires
  `deepSeekThinkingOutput`; with that flag, returned `reasoning_content` and
  reasoning-token usage become normalized response data. Assistant reasoning
  input requires `deepSeekThinkingInput`, and DeepSeek prefill requires
  `deepSeekPrefix`.

## Additional JSON

`additionalJson` is an escape hatch for a small, provider-specific allowlist,
not a second request builder. It must be a JSON object containing only string,
finite number, boolean, or nested-object values. Arrays and `null` are rejected.
Duplicate keys at every object depth and prototype-pollution keys
(`__proto__`, `prototype`, `constructor`) are rejected.

| Provider | Allowed top-level fields |
| --- | --- |
| Google AI Studio / Google Vertex | `toolConfig` |
| OpenAI-compatible | `response_format`, `logit_bias`, `seed`, `logprobs`, `top_logprobs`, `n`, `user`, `metadata`, `store` |
| Ollama | `response_format`, `seed`, `logprobs`, `top_logprobs` |
| DeepSeek | `response_format`, `logprobs`, `top_logprobs`, `tool_choice` |

Never put a secret, API key, token, authorization value, client secret, private
key, password, credential, or custom header in `additionalJson`. Credential
aliases are normalized by case and separators before rejection, so spelling a
key as `api-key`, `api_key`, or similar does not bypass this rule.

Core model and request fields are protected: model/messages/content, stream,
cache, generation/thinking, sampling/token limits, reasoning, and transport
URL/route/headers/auth/timeout/signal fields cannot be added. A collision is
rejected rather than merged. Accepted allowlisted values are copied first, then
the normalized saved-model and per-call fields are applied, so canonical fields
remain authoritative.

## Manual Risu checklist

Run this checklist in Risu after importing the generated `dist/<plugin>.js`.
It is manual validation, not a result claimed by the generator smoke test.

1. Open **AI Services**, create two keys in **Keys**, then create at least two
   model configurations in **LLM** and link each credential-requiring model to
   the intended compatible key.
2. Confirm the list shows masks only; reveal one selected key, hide it, switch
   selection, save, cancel a connection test, and close the editor to confirm
   raw text clears from the UI lifecycle.
3. Delete a linked key from AI Services Keys and verify unlink fan-out runs
   before secret and metadata removal. Force or observe an unlink failure and
   verify the credential and secret are retained and the failure is reported.
4. Select a model, run **Test Connection**, and call `complete()` with that
   model's `modelConfigId` for a text response.
5. For a provider/model that advertises the needed flags, test Gemini thinking
   or DeepSeek reasoning, a valid base64 image/audio input or permitted output,
   and a stream. Cancel the stream with `AbortController` and confirm no later
   event is consumed.
6. If a provider rejects a payload, report only the `LlmError` code, provider,
   status when present, selected model configuration ID, runtime, and a minimal
   non-secret error excerpt. Do not include keys, authorization headers,
   service-account JSON, or request bodies in logs or bug reports.
