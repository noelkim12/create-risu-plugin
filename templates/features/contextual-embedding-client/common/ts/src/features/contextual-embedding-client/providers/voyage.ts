import type { RetrievalHttpTransport } from "../../ai-services"
import { ContextualEmbeddingError } from "../core/errors"
import type {
  ContextualEmbeddingChunkResult,
  ContextualEmbeddingGroupResult,
  ContextualEmbeddingResult,
  ContextualEmbeddingVector,
} from "../core/types"
import type { ContextualEmbeddingProvider, ContextualEmbeddingProviderCall } from "./contract"

export const VOYAGE_CONTEXTUAL_EMBEDDINGS_URL = "https://api.voyageai.com/v1/contextualizedembeddings"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function malformed(detail: string): ContextualEmbeddingError {
  return new ContextualEmbeddingError("MALFORMED_RESPONSE", `Voyage returned a malformed contextualized embedding result: ${detail}`)
}

function requireIndex(value: unknown, scope: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw malformed(`${scope} index is missing or invalid.`)
  }
  return value
}

function parseEmbedding(value: unknown, base64: boolean): ContextualEmbeddingVector {
  if (base64) {
    if (typeof value !== "string" || value.length === 0) {
      throw malformed("a Base64 embedding is missing or not a string.")
    }
    return value
  }
  if (!Array.isArray(value) || value.length === 0) {
    throw malformed("an embedding vector is missing or empty.")
  }
  const numbers: number[] = []
  for (const entry of value) {
    if (typeof entry !== "number" || !Number.isFinite(entry)) {
      throw malformed("an embedding vector contains a non-finite number.")
    }
    numbers.push(entry)
  }
  return numbers
}

function parseChunks(
  rawChunks: unknown,
  expectedCount: number,
  base64: boolean,
): readonly ContextualEmbeddingChunkResult[] {
  if (!Array.isArray(rawChunks)) throw malformed("a group data list is missing.")
  const placed = new Map<number, ContextualEmbeddingChunkResult>()
  for (const raw of rawChunks) {
    if (!isRecord(raw)) throw malformed("a chunk entry is not an object.")
    const index = requireIndex(raw["index"], "chunk")
    if (index >= expectedCount) throw malformed("a chunk index is out of range.")
    if (placed.has(index)) throw malformed("a chunk index is duplicated.")
    const text = raw["text"]
    if (text !== undefined && typeof text !== "string") {
      throw malformed("a chunk text field is not a string.")
    }
    placed.set(index, {
      index,
      embedding: parseEmbedding(raw["embedding"], base64),
      ...(text === undefined ? {} : { text }),
    })
  }
  if (placed.size !== expectedCount) throw malformed("a chunk index is missing.")
  return [...placed.entries()].sort((left, right) => left[0] - right[0]).map(([, chunk]) => chunk)
}

function parseGroups(payload: Record<string, unknown>, call: ContextualEmbeddingProviderCall): readonly ContextualEmbeddingGroupResult[] {
  const rawGroups = payload["data"]
  if (!Array.isArray(rawGroups)) throw malformed("the grouped data list is missing.")
  const placed = new Map<number, ContextualEmbeddingGroupResult>()
  for (const raw of rawGroups) {
    if (!isRecord(raw)) throw malformed("a group entry is not an object.")
    const index = requireIndex(raw["index"], "group")
    const expectedGroup = call.inputs[index]
    if (expectedGroup === undefined) throw malformed("a group index is out of range.")
    if (placed.has(index)) throw malformed("a group index is duplicated.")
    placed.set(index, {
      index,
      chunks: parseChunks(raw["data"], expectedGroup.length, call.config.base64),
    })
  }
  if (placed.size !== call.inputs.length) throw malformed("a group index is missing.")
  return [...placed.entries()].sort((left, right) => left[0] - right[0]).map(([, group]) => group)
}

function parseResponse(payload: unknown, call: ContextualEmbeddingProviderCall): ContextualEmbeddingResult {
  if (!isRecord(payload)) throw malformed("the response body is not an object.")
  const model = payload["model"]
  if (typeof model !== "string" || model.length === 0) throw malformed("the model field is missing.")
  const rawUsage = payload["usage"]
  let usage: ContextualEmbeddingResult["usage"]
  if (rawUsage !== undefined) {
    if (!isRecord(rawUsage)) throw malformed("the usage field is not an object.")
    const totalTokens = rawUsage["total_tokens"]
    if (totalTokens !== undefined) {
      if (typeof totalTokens !== "number" || !Number.isInteger(totalTokens) || totalTokens < 0) {
        throw malformed("the usage total token count is invalid.")
      }
      usage = { totalTokens }
    }
  }
  const rawChunkerVersion = payload["chunker_version"]
  if (rawChunkerVersion !== undefined && typeof rawChunkerVersion !== "string") {
    throw malformed("the chunker version field is not a string.")
  }
  return {
    provider: "voyage",
    model,
    // The response carries no encoding field; derive it from the request config.
    encoding: { outputDtype: call.config.outputDtype, base64: call.config.base64 },
    groups: parseGroups(payload, call),
    ...(usage === undefined ? {} : { usage }),
    ...(rawChunkerVersion === undefined ? {} : { chunkerVersion: rawChunkerVersion }),
  }
}

export class VoyageContextualEmbeddingProvider implements ContextualEmbeddingProvider {
  readonly id = "voyage" as const

  constructor(private readonly transport: RetrievalHttpTransport) {}

  async embed(call: ContextualEmbeddingProviderCall): Promise<ContextualEmbeddingResult> {
    const body = JSON.stringify({
      inputs: call.inputs,
      model: call.config.model,
      ...(call.inputType === null ? {} : { input_type: call.inputType }),
      ...(call.config.outputDimension === null ? {} : { output_dimension: call.config.outputDimension }),
      output_dtype: call.config.outputDtype,
      ...(call.config.base64 ? { encoding_format: "base64" } : {}),
    })
    const response = await this.transport.request({
      url: VOYAGE_CONTEXTUAL_EMBEDDINGS_URL,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${call.apiKey}`,
      },
      body,
      ...(call.signal === undefined ? {} : { signal: call.signal }),
      timeoutMs: call.timeoutMs,
      // Fixed hosted HTTPS endpoint; local-network routing never applies.
      networkRoute: "auto",
    })
    if (!response.ok) {
      const code = response.status === 401 || response.status === 403
        ? "AUTH_FAILED"
        : response.status === 429
          ? "RATE_LIMITED"
          : "HTTP_ERROR"
      throw new ContextualEmbeddingError(
        code,
        `Voyage contextualized embedding request failed with HTTP ${response.status}.`,
        "voyage",
        response.status,
      )
    }
    let payload: unknown
    try {
      payload = JSON.parse(response.bodyText) as unknown
    } catch {
      throw new ContextualEmbeddingError("MALFORMED_RESPONSE", "Voyage returned malformed JSON.", "voyage", response.status)
    }
    return parseResponse(payload, call)
  }
}
