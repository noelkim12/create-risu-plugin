import type { RetrievalProviderAuthMode } from "../../ai-services"
import type { CredentialId } from "../../credential-manager"

export const EMBEDDING_PROVIDER_IDS = ["voyage", "openai-compatible"] as const

export type EmbeddingProviderId = (typeof EMBEDDING_PROVIDER_IDS)[number]

export type EmbeddingInputType = "query" | "document"

// Representation of returned vectors. "float" covers number arrays (including
// quantized integer arrays); "base64" covers Base64 strings. Never decoded implicitly.
export type EmbeddingEncoding = "float" | "base64"

export type VoyageOutputDtype = "float" | "int8" | "uint8" | "binary" | "ubinary"

declare const embeddingConfigIdBrand: unique symbol

export type EmbeddingConfigId = string & {
  readonly [embeddingConfigIdBrand]: "EmbeddingConfigId"
}

export function isEmbeddingConfigId(value: unknown): value is EmbeddingConfigId {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export type EmbeddingRequest = {
  readonly input: string | readonly string[]
  readonly inputType?: EmbeddingInputType | null
}

export type EmbeddingCallOptions = {
  readonly configId: EmbeddingConfigId
  readonly signal?: AbortSignal
  readonly timeoutMs?: number
}

export type EmbeddingVector = readonly number[] | string

export type EmbeddingResultItem = {
  readonly index: number
  readonly embedding: EmbeddingVector
}

export type EmbeddingUsage = {
  readonly inputTokens?: number
  readonly totalTokens?: number
}

export type EmbeddingResult = {
  readonly provider: EmbeddingProviderId
  readonly model: string
  readonly encoding: EmbeddingEncoding
  readonly items: readonly EmbeddingResultItem[]
  readonly usage?: EmbeddingUsage
}

type SavedEmbeddingConfigBase = {
  readonly id: EmbeddingConfigId
  readonly name: string
  readonly modelId: string
  readonly credentialId: CredentialId | null
  readonly timeoutMs: number
}

export type VoyageEmbeddingConfig = SavedEmbeddingConfigBase & {
  readonly provider: "voyage"
  readonly inputType: EmbeddingInputType | null
  readonly truncation: boolean
  readonly outputDimension: number | null
  readonly outputDtype: VoyageOutputDtype
  readonly encodingFormat: EmbeddingEncoding
}

export type OpenAiCompatibleEmbeddingConfig = SavedEmbeddingConfigBase & {
  readonly provider: "openai-compatible"
  readonly endpoint: string
  readonly authMode: RetrievalProviderAuthMode
  readonly dimensions: number | null
  readonly encodingFormat: EmbeddingEncoding
}

export type SavedEmbeddingConfig = VoyageEmbeddingConfig | OpenAiCompatibleEmbeddingConfig

export type EmbeddingSettings = {
  readonly schemaVersion: 1
  readonly configs: readonly SavedEmbeddingConfig[]
}

export type NormalizedEmbeddingRequest = {
  readonly input: string | readonly string[]
  readonly inputType: EmbeddingInputType | null
  readonly count: number
}

// Editor draft carrying both provider variants' fields; config conversion keeps
// only the selected provider's fields.
export type EmbeddingConfigDraft = {
  readonly provider: EmbeddingProviderId
  readonly name: string
  readonly modelId: string
  readonly timeoutMs: number
  readonly credentialId: CredentialId | null
  readonly inputType: EmbeddingInputType | null
  readonly truncation: boolean
  readonly outputDimension: number | null
  readonly outputDtype: VoyageOutputDtype
  readonly encodingFormat: EmbeddingEncoding
  readonly endpoint: string
  readonly authMode: RetrievalProviderAuthMode
  readonly dimensions: number | null
}
