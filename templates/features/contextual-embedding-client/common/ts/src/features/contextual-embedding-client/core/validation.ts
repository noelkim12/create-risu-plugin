import { AiServiceError } from "../../ai-services"
import type {
  ContextualEmbeddingConfigDraft,
  ContextualEmbeddingInput,
  ContextualEmbeddingInputType,
} from "./types"

// Documented structural limits that require no tokenization. Token budgets stay
// a Voyage API responsibility.
export const MAX_CONTEXTUAL_EMBEDDING_GROUPS = 1_000
export const MAX_CONTEXTUAL_EMBEDDING_CHUNKS = 16_000

export function assertContextualEmbeddingInputs(
  inputs: ContextualEmbeddingInput,
  inputType: ContextualEmbeddingInputType | null | undefined,
): void {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw new AiServiceError("CONFIG_INVALID", "Contextual embedding inputs must be a non-empty list of text groups.")
  }
  if (inputs.length > MAX_CONTEXTUAL_EMBEDDING_GROUPS) {
    throw new AiServiceError("CONFIG_INVALID", `Contextual embedding inputs must not exceed ${MAX_CONTEXTUAL_EMBEDDING_GROUPS} groups.`)
  }
  let totalChunks = 0
  for (const group of inputs) {
    if (!Array.isArray(group) || group.length === 0) {
      throw new AiServiceError("CONFIG_INVALID", "Each contextual embedding input group must be a non-empty list of texts.")
    }
    if (inputType === "query" && group.length !== 1) {
      throw new AiServiceError("CONFIG_INVALID", "Query inputs must contain exactly one text per group.")
    }
    totalChunks += group.length
    for (const text of group) {
      if (typeof text !== "string" || text.length === 0) {
        throw new AiServiceError("CONFIG_INVALID", "Each contextual embedding input text must be a non-empty string.")
      }
    }
  }
  if (totalChunks > MAX_CONTEXTUAL_EMBEDDING_CHUNKS) {
    throw new AiServiceError("CONFIG_INVALID", `Contextual embedding inputs must not exceed ${MAX_CONTEXTUAL_EMBEDDING_CHUNKS} total chunks.`)
  }
}

export function validateContextualEmbeddingDraft(draft: ContextualEmbeddingConfigDraft): ContextualEmbeddingConfigDraft {
  if (draft.name.trim().length === 0) {
    throw new AiServiceError("CONFIG_INVALID", "A configuration name is required.")
  }
  if (draft.model.trim().length === 0) {
    throw new AiServiceError("CONFIG_INVALID", "A model identifier is required.")
  }
  if (!Number.isInteger(draft.timeoutMs) || draft.timeoutMs <= 0) {
    throw new AiServiceError("CONFIG_INVALID", "The timeout must be a positive number of milliseconds.")
  }
  if (draft.outputDimension !== null && (!Number.isInteger(draft.outputDimension) || draft.outputDimension <= 0)) {
    throw new AiServiceError("CONFIG_INVALID", "The output dimension must be a positive integer or empty.")
  }
  return { ...draft, name: draft.name.trim(), model: draft.model.trim() }
}
