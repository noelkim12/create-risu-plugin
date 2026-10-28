import { isCredentialId, type CredentialId } from "../../credential-manager"

declare const contextualEmbeddingConfigIdBrand: unique symbol

export type ContextualEmbeddingConfigId = string & {
  readonly [contextualEmbeddingConfigIdBrand]: "ContextualEmbeddingConfigId"
}

export type ContextualEmbeddingProviderId = "voyage"

export type ContextualEmbeddingInput = readonly (readonly string[])[]

export type ContextualEmbeddingInputType = "query" | "document"

export type ContextualEmbeddingOutputDtype = "float" | "int8" | "uint8" | "binary" | "ubinary"

export type ContextualEmbeddingRequest = {
  readonly inputs: ContextualEmbeddingInput
  readonly inputType?: ContextualEmbeddingInputType
}

export type ContextualEmbeddingCallOptions = {
  readonly configId: ContextualEmbeddingConfigId
  readonly signal?: AbortSignal
  readonly timeoutMs?: number
}

// Number vectors stay number arrays; Base64 payloads stay encoded strings.
export type ContextualEmbeddingVector = readonly number[] | string

export type ContextualEmbeddingChunkResult = {
  readonly index: number
  readonly embedding: ContextualEmbeddingVector
  readonly text?: string
}

export type ContextualEmbeddingGroupResult = {
  readonly index: number
  readonly chunks: readonly ContextualEmbeddingChunkResult[]
}

// The response carries no encoding field, so the result encoding is derived
// from the request/config that produced it.
export type ContextualEmbeddingEncoding = {
  readonly outputDtype: ContextualEmbeddingOutputDtype
  readonly base64: boolean
}

export type ContextualEmbeddingUsage = {
  readonly totalTokens?: number
}

export type ContextualEmbeddingResult = {
  readonly provider: ContextualEmbeddingProviderId
  readonly model: string
  readonly encoding: ContextualEmbeddingEncoding
  readonly groups: readonly ContextualEmbeddingGroupResult[]
  readonly usage?: ContextualEmbeddingUsage
  readonly chunkerVersion?: string
}

export const DEFAULT_CONTEXTUAL_EMBEDDING_MODEL = "voyage-context-4"
export const DEFAULT_CONTEXTUAL_EMBEDDING_TIMEOUT_MS = 60_000

export type VoyageContextualEmbeddingConfig = {
  readonly id: ContextualEmbeddingConfigId
  readonly name: string
  readonly provider: "voyage"
  readonly model: string
  readonly credentialId: CredentialId | null
  readonly timeoutMs: number
  readonly inputType: ContextualEmbeddingInputType | null
  readonly outputDimension: number | null
  readonly outputDtype: ContextualEmbeddingOutputDtype
  readonly base64: boolean
  readonly updatedAt: number
}

// Persisted union stays provider-neutral in shape; Voyage is the only member today.
export type ContextualEmbeddingConfig = VoyageContextualEmbeddingConfig

export type ContextualEmbeddingConfigDraft = {
  readonly name: string
  readonly model: string
  readonly credentialId: CredentialId | null
  readonly timeoutMs: number
  readonly inputType: ContextualEmbeddingInputType | null
  readonly outputDimension: number | null
  readonly outputDtype: ContextualEmbeddingOutputDtype
  readonly base64: boolean
}

export type ContextualEmbeddingSettings = {
  readonly schemaVersion: 1
  readonly configs: readonly ContextualEmbeddingConfig[]
}

export function isContextualEmbeddingConfigId(value: unknown): value is ContextualEmbeddingConfigId {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

// The shared ai-services module keeps its credential-id guard internal, so linked
// credential ids are validated locally against the same UUID shape.
export function isLinkedCredentialId(value: unknown): value is CredentialId {
  return isCredentialId(value)
}

export function isContextualEmbeddingInputType(value: unknown): value is ContextualEmbeddingInputType {
  return value === "query" || value === "document"
}

export function isContextualEmbeddingOutputDtype(value: unknown): value is ContextualEmbeddingOutputDtype {
  return value === "float" || value === "int8" || value === "uint8" || value === "binary" || value === "ubinary"
}

export function defaultContextualEmbeddingDraft(): ContextualEmbeddingConfigDraft {
  return {
    name: "",
    model: DEFAULT_CONTEXTUAL_EMBEDDING_MODEL,
    credentialId: null,
    timeoutMs: DEFAULT_CONTEXTUAL_EMBEDDING_TIMEOUT_MS,
    inputType: null,
    outputDimension: null,
    outputDtype: "float",
    base64: false,
  }
}
