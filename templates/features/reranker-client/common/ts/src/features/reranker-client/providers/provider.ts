import type { RetrievalProviderId } from "../../ai-services"
import type { RerankResult, RerankerConfig, ResolvedRerankRequest } from "../core/types"

export type RerankerExecution = {
  readonly config: RerankerConfig
  readonly apiKey: string
  readonly request: ResolvedRerankRequest
  readonly signal?: AbortSignal
  readonly timeoutMs: number
}

export interface RerankerProvider {
  readonly id: RetrievalProviderId
  rerank(execution: RerankerExecution): Promise<RerankResult>
}
