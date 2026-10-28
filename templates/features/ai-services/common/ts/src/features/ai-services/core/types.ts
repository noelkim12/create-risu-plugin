export const RETRIEVAL_CAPABILITY_IDS = [
  "embedding",
  "contextual-embedding",
  "reranker",
] as const

export const RETRIEVAL_PROVIDER_IDS = ["voyage", "openai-compatible"] as const

export const AI_SERVICE_SECTION_IDS = [
  "keys",
  "llm",
  ...RETRIEVAL_CAPABILITY_IDS,
] as const

export type RetrievalCapabilityId = (typeof RETRIEVAL_CAPABILITY_IDS)[number]
export type RetrievalProviderId = (typeof RETRIEVAL_PROVIDER_IDS)[number]
export type AiServiceSectionId = (typeof AI_SERVICE_SECTION_IDS)[number]
export type RetrievalProviderAuthMode = "bearer" | "none"

export function isRetrievalProviderId(value: unknown): value is RetrievalProviderId {
  return value === "voyage" || value === "openai-compatible"
}

export function isRetrievalProviderAuthMode(value: unknown): value is RetrievalProviderAuthMode {
  return value === "bearer" || value === "none"
}
