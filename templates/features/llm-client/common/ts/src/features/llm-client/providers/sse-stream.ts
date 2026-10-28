import { LlmError } from "../core/errors"
import type { ProviderId } from "../core/types"

const MAX_SSE_EVENT_SIZE = 64 * 1024

function aborted(provider: ProviderId): never {
  throw new LlmError("ABORTED", "LLM request was cancelled.", provider)
}

function assertActive(signal: AbortSignal | undefined, provider: ProviderId): void {
  if (signal?.aborted) aborted(provider)
}

function invalid(provider: ProviderId, message: string): never {
  throw new LlmError("INVALID_RESPONSE", message, provider)
}

export async function* parseSseJson(
  source: AsyncIterable<Uint8Array>,
  provider: ProviderId,
  signal?: AbortSignal,
): AsyncIterable<unknown> {
  const decoder = new TextDecoder()
  let buffer = ""
  let dataLines: string[] = []
  let dataLength = 0
  let done = false

  const dispatch = (): unknown | null => {
    if (dataLines.length === 0) return null
    const data = dataLines.join("\n")
    dataLines = []
    dataLength = 0
    if (data === "[DONE]") {
      done = true
      return null
    }
    if (done) return invalid(provider, "Provider emitted SSE data after completion.")
    try {
      return JSON.parse(data)
    } catch (error) {
      if (error instanceof SyntaxError) {
        return invalid(provider, "Provider returned malformed SSE JSON.")
      }
      throw error
    }
  }

  for await (const chunk of source) {
    assertActive(signal, provider)
    buffer += decoder.decode(chunk, { stream: true })
    if (buffer.length + dataLength > MAX_SSE_EVENT_SIZE) {
      invalid(provider, "Provider SSE event exceeded the maximum size.")
    }
    while (true) {
      const newline = buffer.indexOf("\n")
      if (newline === -1) break
      const rawLine = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine
      if (line === "") {
        const value = dispatch()
        if (value !== null) {
          assertActive(signal, provider)
          yield value
        }
        continue
      }
      if (line.startsWith(":")) continue
      if (!line.startsWith("data:")) {
        invalid(provider, "Provider returned malformed SSE framing.")
      }
      const data = line.slice(5).replace(/^ /, "")
      dataLines.push(data)
      dataLength += data.length
      if (dataLength > MAX_SSE_EVENT_SIZE) {
        invalid(provider, "Provider SSE event exceeded the maximum size.")
      }
    }
  }
  buffer += decoder.decode()
  if (buffer !== "" || dataLines.length > 0) {
    invalid(provider, "Provider SSE stream ended with an incomplete event.")
  }
  assertActive(signal, provider)
}
