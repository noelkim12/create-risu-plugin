import type { RetrievalHttpTransport, RetrievalProviderId } from "../../ai-services"
import { RerankerError } from "../core/errors"
import type { RerankResult, RerankScoredDocument, RerankUsage, ResolvedRerankRequest } from "../core/types"
import type { RerankerExecution, RerankerProvider } from "./provider"

export const VOYAGE_RERANK_ENDPOINT = "https://api.voyageai.com/v1/rerank"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function invalidResult(message: string): RerankerError {
  return new RerankerError("INVALID_RESPONSE", message, "voyage")
}

function httpError(status: number): RerankerError {
  const code = status === 401 || status === 403
    ? "AUTH_FAILED"
    : status === 429
      ? "RATE_LIMITED"
      : "HTTP_ERROR"
  return new RerankerError(code, `Voyage rerank request failed with HTTP ${status}.`, "voyage", status)
}

function parseUsage(value: unknown): RerankUsage | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) throw invalidResult("Voyage rerank returned invalid usage data.")
  const inputTokens = value["input_tokens"]
  const totalTokens = value["total_tokens"]
  if (
    (inputTokens !== undefined && (typeof inputTokens !== "number" || !Number.isFinite(inputTokens)))
    || (totalTokens !== undefined && (typeof totalTokens !== "number" || !Number.isFinite(totalTokens)))
  ) {
    throw invalidResult("Voyage rerank returned invalid usage data.")
  }
  return {
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(totalTokens === undefined ? {} : { totalTokens }),
  }
}

export function parseVoyageRerankResponse(
  bodyText: string,
  ok: boolean,
  status: number,
  request: ResolvedRerankRequest,
): RerankResult {
  if (!ok) throw httpError(status)
  let parsed: unknown
  try {
    parsed = JSON.parse(bodyText) as unknown
  } catch {
    throw new RerankerError("INVALID_RESPONSE", "Voyage rerank returned malformed JSON.", "voyage")
  }
  if (!isRecord(parsed) || !Array.isArray(parsed["data"])) {
    throw invalidResult("Voyage rerank returned an invalid result shape.")
  }
  const model = parsed["model"]
  if (typeof model !== "string" || model.trim().length === 0) {
    throw invalidResult("Voyage rerank returned an invalid result shape.")
  }
  const seenIndexes = new Set<number>()
  const results: RerankScoredDocument[] = []
  for (const entry of parsed["data"]) {
    if (!isRecord(entry)) throw invalidResult("Voyage rerank returned an invalid result shape.")
    const index = entry["index"]
    const score = entry["relevance_score"]
    const document = entry["document"]
    if (
      typeof index !== "number"
      || !Number.isInteger(index)
      || index < 0
      || index >= request.documents.length
    ) {
      throw invalidResult("Voyage rerank returned an out-of-range document index.")
    }
    if (seenIndexes.has(index)) {
      throw invalidResult("Voyage rerank returned a duplicate document index.")
    }
    seenIndexes.add(index)
    if (typeof score !== "number" || !Number.isFinite(score)) {
      throw invalidResult("Voyage rerank returned an invalid relevance score.")
    }
    if (document !== undefined && typeof document !== "string") {
      throw invalidResult("Voyage rerank returned an invalid document.")
    }
    if (request.returnDocuments && document === undefined) {
      throw invalidResult("Voyage rerank did not return the requested documents.")
    }
    results.push(document === undefined ? { index, score } : { index, score, document })
  }
  const usage = parseUsage(parsed["usage"])
  return {
    provider: "voyage",
    model,
    results,
    ...(usage === undefined ? {} : { usage }),
  }
}

export class VoyageRerankerProvider implements RerankerProvider {
  readonly id: RetrievalProviderId = "voyage"

  constructor(private readonly transport: RetrievalHttpTransport) {}

  async rerank(execution: RerankerExecution): Promise<RerankResult> {
    const { config, request } = execution
    const payload = {
      query: request.query,
      documents: request.documents,
      model: config.model,
      ...(request.topK === null ? {} : { top_k: request.topK }),
      return_documents: request.returnDocuments,
      truncation: request.truncation,
    }
    const response = await this.transport.request({
      url: VOYAGE_RERANK_ENDPOINT,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${execution.apiKey}`,
      },
      body: JSON.stringify(payload),
      ...(execution.signal === undefined ? {} : { signal: execution.signal }),
      timeoutMs: execution.timeoutMs,
      networkRoute: "auto",
    })
    return parseVoyageRerankResponse(response.bodyText, response.ok, response.status, request)
  }
}
