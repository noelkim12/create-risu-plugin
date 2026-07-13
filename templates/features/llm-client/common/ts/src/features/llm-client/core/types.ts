export const PROVIDER_IDS = [
  "google-ai-studio",
  "google-vertex",
  "openai-compatible",
  "ollama",
] as const

export type ProviderId = (typeof PROVIDER_IDS)[number]
export type VertexAuthMode = "api-key" | "service-account"
export type ApiKeyAuthMode = "none" | "bearer"
export type LlmRole = "system" | "user" | "assistant"

export interface LlmMessage {
  readonly role: LlmRole
  readonly content: string
}

export interface LlmRequest {
  readonly messages: readonly LlmMessage[]
  readonly temperature?: number
  readonly topP?: number
  readonly maxOutputTokens?: number
}

export interface LlmCallOptions {
  readonly provider?: ProviderId
  readonly signal?: AbortSignal
  readonly timeoutMs?: number
}

export interface LlmUsage {
  readonly inputTokens?: number
  readonly outputTokens?: number
  readonly totalTokens?: number
}

export interface LlmResponse {
  readonly provider: ProviderId
  readonly model: string
  readonly text: string
  readonly finishReason: string | null
  readonly usage?: LlmUsage
}

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

export interface LlmSettings {
  readonly schemaVersion: 1
  readonly activeProvider: ProviderId
  readonly providers: {
    readonly "google-ai-studio": GoogleAiStudioConfig
    readonly "google-vertex": GoogleVertexConfig
    readonly "openai-compatible": OpenAiCompatibleConfig
    readonly ollama: OllamaConfig
  }
}

export type CredentialSlot =
  | "google-ai-studio"
  | "google-vertex-api-key"
  | "google-vertex-service-account"
  | "openai-compatible"
  | "ollama"

export interface GoogleServiceAccountSecret {
  readonly projectId: string
  readonly clientEmail: string
  readonly privateKey: string
  readonly privateKeyId?: string
}

export interface StoredCredential {
  readonly schemaVersion: 1
  readonly slot: CredentialSlot
  readonly audience: string
  readonly revision: string
  readonly updatedAt: number
  readonly secret: Readonly<Record<string, string>>
}

export interface CredentialDraft {
  readonly apiKey?: string
  readonly serviceAccountJson?: string
  readonly customHeadersJson?: string
}
