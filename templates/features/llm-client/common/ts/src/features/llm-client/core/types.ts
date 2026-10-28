// allow: SIZE_OK - catalog contract declarations are a pure type table.
import type { CredentialId } from "../../credential-manager/core/types"

export const PROVIDER_IDS = [
  "google-ai-studio",
  "google-vertex",
  "openai-compatible",
  "ollama",
  "deepseek",
] as const

export const MODEL_FLAGS = [
  "hasImageInput",
  "hasImageOutput",
  "hasAudioInput",
  "hasAudioOutput",
  "hasPrefill",
  "hasCache",
  "hasFullSystemPrompt",
  "hasFirstSystemPrompt",
  "hasStreaming",
  "requiresAlternateRole",
  "mustStartWithUserInput",
  "hasVideoInput",
  "OAICompletionTokens",
  "DeveloperRole",
  "geminiThinking",
  "geminiBlockOff",
  "deepSeekPrefix",
  "deepSeekThinkingInput",
  "deepSeekThinkingOutput",
] as const

export type ProviderId = (typeof PROVIDER_IDS)[number]
export type ModelFlag = (typeof MODEL_FLAGS)[number]
export type VertexAuthMode = "service-account"
export type ApiKeyAuthMode = "none" | "bearer"

declare const savedModelConfigIdBrand: unique symbol

export type SavedModelConfigId = string & {
  readonly [savedModelConfigIdBrand]: "SavedModelConfigId"
}

export type ReasoningEffort = "minimal" | "low" | "medium" | "high"
export type GeminiThinkingLevel = ReasoningEffort

export type ProviderReasoning =
  | {
      readonly provider: "google-ai-studio"
      readonly level: GeminiThinkingLevel | null
    }
  | {
      readonly provider: "google-vertex"
      readonly level: GeminiThinkingLevel | null
    }
  | {
      readonly provider: "openai-compatible"
      readonly effort: ReasoningEffort | null
    }
  | {
      readonly provider: "ollama"
      readonly enabled: boolean
    }
  | {
      readonly provider: "deepseek"
      readonly enabled: boolean
    }

type SavedModelConfigBase = {
  readonly id: SavedModelConfigId
  readonly name: string
  readonly modelId: string
  readonly keyId: CredentialId | null
  readonly timeoutMs: number
  readonly maxTokens?: number
  readonly temperature?: number
  readonly topP?: number
  readonly topK?: number
  readonly thinkingTokens?: number
  readonly flags: readonly string[]
  readonly additionalJson: string
}

export type GoogleAiStudioModelConfig = SavedModelConfigBase & {
  readonly provider: "google-ai-studio"
  readonly authMode: "api-key"
  readonly reasoning: Extract<ProviderReasoning, { readonly provider: "google-ai-studio" }>
}

export type GoogleVertexModelConfig = SavedModelConfigBase & {
  readonly provider: "google-vertex"
  readonly authMode: VertexAuthMode
  readonly projectId: string
  readonly location: string
  readonly reasoning: Extract<ProviderReasoning, { readonly provider: "google-vertex" }>
}

export type OpenAiCompatibleModelConfig = SavedModelConfigBase & {
  readonly provider: "openai-compatible"
  readonly authMode: ApiKeyAuthMode
  readonly baseUrl: string
  readonly reasoning: Extract<ProviderReasoning, { readonly provider: "openai-compatible" }>
}

export type OllamaModelConfig = SavedModelConfigBase & {
  readonly provider: "ollama"
  readonly authMode: ApiKeyAuthMode
  readonly baseUrl: string
  readonly reasoning: Extract<ProviderReasoning, { readonly provider: "ollama" }>
}

export type DeepSeekModelConfig = SavedModelConfigBase & {
  readonly provider: "deepseek"
  readonly authMode: "bearer"
  readonly baseUrl: string
  readonly reasoning: Extract<ProviderReasoning, { readonly provider: "deepseek" }>
}

export type SavedModelConfig =
  | GoogleAiStudioModelConfig
  | GoogleVertexModelConfig
  | OpenAiCompatibleModelConfig
  | OllamaModelConfig
  | DeepSeekModelConfig

export type LlmSettings = {
  readonly schemaVersion: 2
  readonly savedModelConfigs: readonly SavedModelConfig[]
  readonly selectedModelConfigId: SavedModelConfigId | null
  readonly defaultModelConfigId: SavedModelConfigId | null
}

export type LlmRole = "system" | "developer" | "user" | "assistant"

export type LlmTextPart = {
  readonly type: "text"
  readonly text: string
}

export type LlmImagePart = {
  readonly type: "image"
  readonly base64: string
  readonly mimeType: string
}

export type LlmAudioPart = {
  readonly type: "audio"
  readonly base64: string
  readonly mimeType: string
}

export type LlmVideoPart = {
  readonly type: "video"
  readonly base64: string
  readonly mimeType: string
}

export type LlmContentPart = LlmTextPart | LlmImagePart | LlmAudioPart | LlmVideoPart

export type LlmMessage = {
  readonly role: LlmRole
  readonly content: string | readonly LlmContentPart[]
  readonly reasoning?: string
}

export type LlmAssistantPrefill = {
  readonly role: "assistant"
  readonly content: string
}

export type LlmCacheReference = {
  readonly id: string
}

export type LlmRequest = {
  readonly messages: readonly LlmMessage[]
  readonly prefill?: LlmAssistantPrefill
  readonly cache?: LlmCacheReference
  readonly temperature?: number
  readonly topP?: number
  readonly maxOutputTokens?: number
}

export type LlmCallOptions = {
  readonly modelConfigId: SavedModelConfigId
  readonly signal?: AbortSignal
  readonly timeoutMs?: number
}

export type LlmUsage = {
  readonly inputTokens?: number
  readonly outputTokens?: number
  readonly reasoningTokens?: number
  readonly totalTokens?: number
}

export type LlmResponsePart = LlmContentPart

export type LlmResponse = {
  readonly provider: ProviderId
  readonly model: string
  readonly text: string
  readonly parts?: readonly LlmResponsePart[]
  readonly reasoning?: string
  readonly finishReason: string | null
  readonly usage?: LlmUsage
}

export type LlmStreamEvent =
  | { readonly type: "part"; readonly part: LlmResponsePart }
  | { readonly type: "reasoning"; readonly text: string }
  | { readonly type: "usage"; readonly usage: LlmUsage }
  | { readonly type: "finish"; readonly finishReason: string | null }

export type LlmStream = AsyncIterable<LlmStreamEvent>

export interface GoogleAiStudioConfig {
  readonly provider: "google-ai-studio"
  readonly model: string
  readonly timeoutMs: number
}

export interface GoogleVertexConfig {
  readonly provider: "google-vertex"
  readonly authMode: VertexAuthMode
  readonly projectId: string
  readonly location: string
  readonly model: string
  readonly timeoutMs: number
}

export interface OpenAiCompatibleConfig {
  readonly provider: "openai-compatible"
  readonly baseUrl: string
  readonly authMode: ApiKeyAuthMode
  readonly customHeaderNames: readonly string[]
  readonly model: string
  readonly timeoutMs: number
}

export interface OllamaConfig {
  readonly provider: "ollama"
  readonly baseUrl: string
  readonly authMode: ApiKeyAuthMode
  readonly model: string
  readonly timeoutMs: number
}

export type ProviderConfig =
  | GoogleAiStudioConfig
  | GoogleVertexConfig
  | OpenAiCompatibleConfig
  | OllamaConfig

export type LlmSettingsV1 = {
  readonly schemaVersion: 1
  readonly activeProvider: ProviderConfig["provider"]
  readonly providers: {
    readonly "google-ai-studio": GoogleAiStudioConfig
    readonly "google-vertex": GoogleVertexConfig
    readonly "openai-compatible": OpenAiCompatibleConfig
    readonly ollama: OllamaConfig
  }
}

export type CredentialSlot =
  | "google-ai-studio"
  | "google-vertex-service-account"
  | "openai-compatible"
  | "ollama"
  | "deepseek"
