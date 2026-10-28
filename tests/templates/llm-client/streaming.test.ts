import { describe, expect, it } from "vitest"

import { parseStoredSettings } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/core/validation"
import type { HttpRequest, HttpTransport } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/network/native-fetch-transport"
import { DeepSeekProvider } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/providers/deepseek"

const encoder = new TextEncoder()

function model(flags: readonly string[] = ["hasStreaming", "deepSeekThinkingOutput"]) {
  const settings = parseStoredSettings({
    schemaVersion: 2,
    savedKeys: [],
    savedModelConfigs: [{
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "DeepSeek stream",
      provider: "deepseek",
      authMode: "bearer",
      baseUrl: "https://api.deepseek.com",
      modelId: "deepseek-test",
      keyId: null,
      timeoutMs: 60_000,
      reasoning: { provider: "deepseek", enabled: flags.includes("deepSeekThinkingOutput") },
      flags,
      additionalJson: "",
    }],
    selectedModelConfigId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    defaultModelConfigId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  })
  const item = settings.savedModelConfigs[0]
  if (item?.provider !== "deepseek") throw new TypeError("Expected DeepSeek stream model.")
  return item
}

const credential = {
  schemaVersion: 2,
  keyId: "11111111-1111-4111-8111-111111111111",
  provider: "deepseek",
  kind: "api-key",
  audience: "https://api.deepseek.com/chat/completions",
  revision: "stream-revision",
  updatedAt: 1,
  secret: { apiKey: "stream-test-key" },
}

async function* chunks(values: readonly string[]): AsyncIterable<Uint8Array> {
  for (const value of values) yield encoder.encode(value)
}

async function collect(stream: AsyncIterable<unknown>): Promise<unknown[]> {
  const events: unknown[] = []
  for await (const event of stream) events.push(event)
  return events
}

describe("LLM provider streaming", () => {
  it("streams normalized text, DeepSeek reasoning, usage, and finish events from split SSE chunks", async () => {
    let captured: HttpRequest | undefined
    const transport: HttpTransport = {
      async request() {
        throw new TypeError("Final response transport must not be called.")
      },
      async stream(request) {
        captured = request
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          body: chunks([
            "data: {\"choices\":[{\"delta\":{\"content\":\"Hel",
            "lo\",\"reasoning_content\":\"because\"}}]}\n\n",
            "data: {\"choices\":[{\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":2,\"completion_tokens\":3,\"completion_tokens_details\":{\"reasoning_tokens\":1},\"total_tokens\":5}}\n\n",
            "data: [DONE]\n\n",
          ]),
        }
      },
    }
    const selected = model()

    await expect(collect(new DeepSeekProvider(transport).stream({
      model: selected,
      credential,
      request: { messages: [{ role: "user", content: "Hello" }] },
      options: { modelConfigId: selected.id },
    }))).resolves.toEqual([
      { type: "part", part: { type: "text", text: "Hello" } },
      { type: "reasoning", text: "because" },
      { type: "usage", usage: { inputTokens: 2, outputTokens: 3, reasoningTokens: 1, totalTokens: 5 } },
      { type: "finish", finishReason: "stop" },
    ])
    expect(JSON.parse(captured?.body ?? "")).toMatchObject({ stream: true })
    expect(captured?.headers).toMatchObject({ Accept: "text/event-stream" })
  })

  it("aborts a hanging stream, closes iteration, and emits no event after cancellation", async () => {
    const controller = new AbortController()
    let closed = false
    const transport: HttpTransport = {
      async request() {
        throw new TypeError("Final response transport must not be called.")
      },
      async stream(request) {
        async function* hanging(): AsyncIterable<Uint8Array> {
          try {
            yield encoder.encode("data: {\"choices\":[{\"delta\":{\"content\":\"first\"}}]}\n\n")
            if (request.signal?.aborted) return
            await new Promise<void>(resolve => request.signal?.addEventListener("abort", () => resolve(), { once: true }))
            yield encoder.encode("data: {\"choices\":[{\"delta\":{\"content\":\"late\"}}]}\n\n")
          } finally {
            closed = true
          }
        }
        return { ok: true, status: 200, headers: new Headers(), body: hanging() }
      },
    }
    const selected = model()
    const iterator = new DeepSeekProvider(transport).stream({
      model: selected,
      credential,
      request: { messages: [{ role: "user", content: "Hello" }] },
      options: { modelConfigId: selected.id, signal: controller.signal },
    })[Symbol.asyncIterator]()

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { type: "part", part: { type: "text", text: "first" } },
    })
    controller.abort()
    await expect(iterator.next()).rejects.toMatchObject({ code: "ABORTED" })
    expect(closed).toBe(true)
  })

  it("rejects malformed SSE JSON without yielding a misleading success event", async () => {
    const transport: HttpTransport = {
      async request() {
        throw new TypeError("Final response transport must not be called.")
      },
      async stream() {
        return { ok: true, status: 200, headers: new Headers(), body: chunks(["data: {not-json}\n\n"]) }
      },
    }
    const selected = model()

    await expect(collect(new DeepSeekProvider(transport).stream({
      model: selected,
      credential,
      request: { messages: [{ role: "user", content: "Hello" }] },
      options: { modelConfigId: selected.id },
    }))).rejects.toMatchObject({ code: "INVALID_RESPONSE" })
  })
})
