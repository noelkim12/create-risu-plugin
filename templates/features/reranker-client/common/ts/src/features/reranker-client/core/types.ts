import type { RetrievalProviderId } from "../../ai-services"
import { isCredentialId, type CredentialId } from "../../credential-manager"

declare const rerankerConfigIdBrand: unique symbol

export type RerankerConfigId = string & {
  readonly [rerankerConfigIdBrand]: "RerankerConfigId"
}

export function isRerankerConfigId(value: unknown): value is RerankerConfigId {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

// The shared ai-services module keeps its credential-id guard internal, so linked
// credential ids are validated locally against the same UUID shape.
export function isLinkedCredentialId(value: unknown): value is CredentialId {
  return isCredentialId(value)
}

export type RerankRequest = {
  readonly query: string
  readonly documents: readonly string[]
  readonly topK?: number
  readonly returnDocuments?: boolean
  readonly truncation?: boolean
}

export type RerankCallOptions = {
  readonly configId: RerankerConfigId
  readonly signal?: AbortSignal
  readonly timeoutMs?: number
}

export type ResolvedRerankRequest = {
  readonly query: string
  readonly documents: readonly string[]
  readonly topK: number | null
  readonly returnDocuments: boolean
  readonly truncation: boolean
}

export type RerankScoredDocument = {
  readonly index: number
  readonly score: number
  readonly document?: string
}

export type RerankUsage = {
  readonly inputTokens?: number
  readonly totalTokens?: number
}

export type RerankResult = {
  readonly provider: RetrievalProviderId
  readonly model: string
  readonly results: readonly RerankScoredDocument[]
  readonly usage?: RerankUsage
}

export type RerankerConfigDefaults = {
  readonly topK: number | null
  readonly returnDocuments: boolean
  readonly truncation: boolean
}

export type VoyageRerankerConfig = {
  readonly id: RerankerConfigId
  readonly name: string
  readonly provider: "voyage"
  readonly model: string
  readonly credentialId: CredentialId | null
  readonly timeoutMs: number
  readonly defaults: RerankerConfigDefaults
}

export type RerankerConfig = VoyageRerankerConfig

export type RerankerSettings = {
  readonly schemaVersion: 1
  readonly configs: readonly RerankerConfig[]
}
