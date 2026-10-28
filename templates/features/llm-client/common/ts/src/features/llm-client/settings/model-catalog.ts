import type { CredentialManagerRuntime } from "../../credential-manager/contracts"
import type { CredentialId, CredentialSummary, ResolvedCredential } from "../../credential-manager/core/types"
import { credentialBindingFor } from "../core/credential-binding"
import { DEEPSEEK_API_BASE_URL } from "../core/deepseek-config"
import { LlmError } from "../core/errors"
import type { LlmSettings, ProviderId, SavedModelConfig, SavedModelConfigId } from "../core/types"
import { parseStoredSettings, type FieldErrors } from "../core/validation"

export type SettingsOperation = "idle" | "loading" | "saving" | "deleting" | "testing" | "success" | "error"

export type ModelSummary = {
  readonly id: SavedModelConfigId
  readonly name: string
  readonly provider: ProviderId
  readonly model: string
  readonly keyId: CredentialId | null
  readonly reasoning: SavedModelConfig["reasoning"]
}

export interface SettingsState {
  readonly operation: SettingsOperation
  readonly loaded: boolean
  readonly modelSummaries: readonly ModelSummary[]
  readonly compatibleKeys: readonly CredentialSummary[]
  readonly selectedModelConfigId: SavedModelConfigId | null
  readonly modelDraft: SavedModelConfig | null
  readonly dirty: boolean
  readonly fieldErrors: FieldErrors
  readonly statusMessage: string
  readonly runtimePlatform: "web" | "tauri" | "node"
}

export interface SettingsRepositoryPort {
  load(): Promise<LlmSettings>
  save(settings: LlmSettings): Promise<void>
}

export type CredentialSelectionPort = Pick<CredentialManagerRuntime, "listCompatible" | "resolveCredential">

export interface ConnectionTestPort {
  testConnection(
    model: SavedModelConfig,
    credential: ResolvedCredential | null,
    signal?: AbortSignal,
  ): Promise<{ readonly provider: ProviderId; readonly model: string }>
}

export function clone<T>(value: T): T {
  return structuredClone(value)
}

export function modelSummaries(settings: LlmSettings): readonly ModelSummary[] {
  return settings.savedModelConfigs.map(model => ({
    id: model.id,
    name: model.name,
    provider: model.provider,
    model: model.modelId,
    keyId: model.keyId,
    reasoning: clone(model.reasoning),
  }))
}

export function createModelDraft(provider: ProviderId): SavedModelConfig {
  const base = {
    id: crypto.randomUUID(), name: "New model", modelId: "", keyId: null, timeoutMs: 60_000,
    maxTokens: 1024, temperature: 1, topP: 0.95, flags: [], additionalJson: "",
  }
  const document = (() => {
    switch (provider) {
      case "google-ai-studio": return { ...base, provider, authMode: "api-key", topK: 40, reasoning: { provider, level: null } }
      case "google-vertex": return { ...base, provider, authMode: "service-account", projectId: "", location: "global", topK: 40, reasoning: { provider, level: null } }
      case "openai-compatible": return { ...base, provider, authMode: "bearer", baseUrl: "", reasoning: { provider, effort: null } }
      case "ollama": return { ...base, provider, authMode: "none", baseUrl: "http://localhost:11434", reasoning: { provider, enabled: false } }
      case "deepseek": return { ...base, provider, authMode: "bearer", baseUrl: DEEPSEEK_API_BASE_URL, reasoning: { provider, enabled: false } }
    }
  })()
  const model = parseStoredSettings({
    schemaVersion: 2,
    savedModelConfigs: [document],
    selectedModelConfigId: document.id,
    defaultModelConfigId: document.id,
  }).savedModelConfigs[0]
  if (model === undefined) throw new LlmError("CONFIG_INVALID", "Saved model configuration is missing.")
  return model
}

export function mergeModelDraft(
  settings: LlmSettings,
  draft: SavedModelConfig | null,
  selected: SavedModelConfigId | null,
): LlmSettings {
  const models = draft === null
    ? settings.savedModelConfigs
    : settings.savedModelConfigs.some(model => model.id === draft.id)
      ? settings.savedModelConfigs.map(model => model.id === draft.id ? clone(draft) : model)
      : [...settings.savedModelConfigs, clone(draft)]
  return {
    ...settings,
    savedModelConfigs: models,
    selectedModelConfigId: models.some(model => model.id === selected) ? selected : settings.selectedModelConfigId,
    defaultModelConfigId: settings.defaultModelConfigId === null || models.some(model => model.id === settings.defaultModelConfigId)
      ? settings.defaultModelConfigId
      : null,
  }
}

export async function listCompatibleKeys(
  model: SavedModelConfig | null,
  credentials: CredentialSelectionPort,
): Promise<readonly CredentialSummary[]> {
  if (model === null) return []
  try {
    const binding = credentialBindingFor(model)
    return binding === null ? [] : clone(await credentials.listCompatible(binding))
  } catch (error) {
    if (error instanceof LlmError) return []
    throw error
  }
}
