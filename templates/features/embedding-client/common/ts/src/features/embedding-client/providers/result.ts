import { EmbeddingError } from "../core/errors"
import type {
  EmbeddingProviderId,
  EmbeddingResult,
  EmbeddingResultItem,
  EmbeddingUsage,
  NormalizedEmbeddingRequest,
  SavedEmbeddingConfig,
} from "../core/types"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function invalidResult(provider: EmbeddingProviderId): never {
  throw new EmbeddingError(
    "INVALID_RESPONSE",
    "The embedding provider returned an invalid result.",
    { provider, capability: "embedding" },
  )
}

function parseResultItem(
  entry: unknown,
  encoding: SavedEmbeddingConfig["encodingFormat"],
  provider: EmbeddingProviderId,
): EmbeddingResultItem {
  if (!isRecord(entry)) invalidResult(provider)
  const index = entry["index"]
  if (typeof index !== "number" || !Number.isInteger(index) || index < 0) invalidResult(provider)
  const embedding = entry["embedding"]
  if (encoding === "base64") {
    if (typeof embedding !== "string" || embedding.length === 0) invalidResult(provider)
  } else if (
    !Array.isArray(embedding)
    || embedding.length === 0
    || embedding.some(value => typeof value !== "number" || !Number.isFinite(value))
  ) {
    invalidResult(provider)
  }
  return { index, embedding }
}

function parseUsage(value: unknown, provider: EmbeddingProviderId): EmbeddingUsage | null {
  if (value === undefined || value === null) return null
  if (!isRecord(value)) invalidResult(provider)
  const usage: { inputTokens?: number; totalTokens?: number } = {}
  const inputTokens = value["prompt_tokens"]
  const totalTokens = value["total_tokens"]
  if (typeof inputTokens === "number" && Number.isFinite(inputTokens)) usage.inputTokens = inputTokens
  if (typeof totalTokens === "number" && Number.isFinite(totalTokens)) usage.totalTokens = totalTokens
  return usage.inputTokens === undefined && usage.totalTokens === undefined ? null : usage
}

// Normalizes the documented response shape: ordered indexed vectors, model, and
// optional usage. Rejects missing, duplicate, or out-of-range indexes and any
// representation that does not match the configuration's requested encoding.
export function toEmbeddingResult(
  json: unknown,
  config: SavedEmbeddingConfig,
  request: NormalizedEmbeddingRequest,
): EmbeddingResult {
  const provider = config.provider
  const encoding = config.encodingFormat
  if (!isRecord(json)) invalidResult(provider)
  const data = json["data"]
  if (!Array.isArray(data) || data.length !== request.count) invalidResult(provider)
  const items = data.map(entry => parseResultItem(entry, encoding, provider))
  const seen = new Set<number>()
  for (const item of items) {
    if (item.index >= request.count || seen.has(item.index)) invalidResult(provider)
    seen.add(item.index)
  }
  const model = json["model"]
  if (typeof model !== "string" || model.length === 0) invalidResult(provider)
  const usage = parseUsage(json["usage"], provider)
  return {
    provider,
    model,
    encoding,
    items: [...items].sort((left, right) => left.index - right.index),
    ...(usage === null ? {} : { usage }),
  }
}
