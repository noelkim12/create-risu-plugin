import type {
  ContextualEmbeddingConfig,
  ContextualEmbeddingInput,
  ContextualEmbeddingInputType,
  ContextualEmbeddingProviderId,
  ContextualEmbeddingResult,
} from "../core/types"

export type ContextualEmbeddingProviderCall = {
  readonly config: ContextualEmbeddingConfig
  readonly inputs: ContextualEmbeddingInput
  readonly inputType: ContextualEmbeddingInputType | null
  readonly apiKey: string
  readonly signal?: AbortSignal
  readonly timeoutMs: number
}

export interface ContextualEmbeddingProvider {
  readonly id: ContextualEmbeddingProviderId
  embed(call: ContextualEmbeddingProviderCall): Promise<ContextualEmbeddingResult>
}
