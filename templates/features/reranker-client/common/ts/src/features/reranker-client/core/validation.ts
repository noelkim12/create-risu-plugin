import { AiServiceError } from "../../ai-services"
import type { RerankRequest } from "./types"

export const MAX_RERANK_DOCUMENTS = 1000

export function assertTopKInRange(topK: number, documentCount: number): void {
  if (!Number.isInteger(topK) || topK < 1 || topK > documentCount) {
    throw new AiServiceError("CONFIG_INVALID", "topK must be an integer between 1 and the number of documents.")
  }
}

export function validateRerankRequest(request: RerankRequest): void {
  if (typeof request.query !== "string" || request.query.trim().length === 0) {
    throw new AiServiceError("CONFIG_INVALID", "A non-empty rerank query is required.")
  }
  if (!Array.isArray(request.documents) || request.documents.length === 0) {
    throw new AiServiceError("CONFIG_INVALID", "At least one document is required.")
  }
  if (request.documents.length > MAX_RERANK_DOCUMENTS) {
    throw new AiServiceError("CONFIG_INVALID", `Reranking supports at most ${MAX_RERANK_DOCUMENTS} documents.`)
  }
  if (request.documents.some(document => typeof document !== "string" || document.trim().length === 0)) {
    throw new AiServiceError("CONFIG_INVALID", "Documents must be non-empty strings.")
  }
  if (request.topK !== undefined) {
    assertTopKInRange(request.topK, request.documents.length)
  }
}
