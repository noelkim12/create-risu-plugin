import {
  AiServiceError,
} from "../../ai-services"
import type { CredentialId, CredentialSummary } from "../../credential-manager"
import { requiresBearerCredential } from "../core/credential-binding"
import { isEmbeddingConfigId, type EmbeddingConfigDraft, type EmbeddingConfigId, type EmbeddingSettings, type SavedEmbeddingConfig } from "../core/types"

export type EmbeddingConfigStatus = "not-required" | "linked" | "unlinked" | "missing" | "stale"

export type EmbeddingConfigSummary = {
  readonly id: EmbeddingConfigId
  readonly name: string
  readonly provider: SavedEmbeddingConfig["provider"]
  readonly modelId: string
  readonly endpoint: string | null
  readonly credentialId: CredentialId | null
  readonly credentialName: string | null
  readonly credentialStatus: EmbeddingConfigStatus
}

export function newEmbeddingConfigId(): EmbeddingConfigId {
  const value = crypto.randomUUID()
  if (!isEmbeddingConfigId(value)) {
    throw new AiServiceError("CONFIG_INVALID", "Unable to create an embedding configuration identifier.")
  }
  return value
}

export function defaultEmbeddingConfigDraft(): EmbeddingConfigDraft {
  return {
    provider: "voyage",
    name: "",
    modelId: "",
    timeoutMs: 60_000,
    credentialId: null,
    inputType: null,
    truncation: true,
    outputDimension: null,
    outputDtype: "float",
    encodingFormat: "float",
    endpoint: "",
    authMode: "none",
    dimensions: null,
  }
}

export function draftFromConfig(config: SavedEmbeddingConfig): EmbeddingConfigDraft {
  return {
    provider: config.provider,
    name: config.name,
    modelId: config.modelId,
    timeoutMs: config.timeoutMs,
    credentialId: config.credentialId,
    inputType: config.provider === "voyage" ? config.inputType : null,
    truncation: config.provider === "voyage" ? config.truncation : true,
    outputDimension: config.provider === "voyage" ? config.outputDimension : null,
    outputDtype: config.provider === "voyage" ? config.outputDtype : "float",
    encodingFormat: config.encodingFormat,
    endpoint: config.provider === "openai-compatible" ? config.endpoint : "",
    authMode: config.provider === "voyage" ? "bearer" : config.authMode,
    dimensions: config.provider === "openai-compatible" ? config.dimensions : null,
  }
}

export function summarize(
  settings: EmbeddingSettings,
  credentials: readonly CredentialSummary[],
): readonly EmbeddingConfigSummary[] {
  return settings.configs.map(config => {
    const linked = config.credentialId === null
      ? null
      : credentials.find(credential => credential.id === config.credentialId) ?? null
    let credentialStatus: EmbeddingConfigStatus
    let credentialName: string | null = null
    if (!requiresBearerCredential(config)) {
      credentialStatus = "not-required"
    } else if (linked === null) {
      credentialStatus = "unlinked"
    } else {
      credentialName = linked.name
      credentialStatus = linked.status === "stored" ? "linked" : linked.status === "stale" ? "stale" : "missing"
    }
    return {
      id: config.id,
      name: config.name,
      provider: config.provider,
      modelId: config.modelId,
      endpoint: config.provider === "openai-compatible" ? config.endpoint : null,
      credentialId: config.credentialId,
      credentialName,
      credentialStatus,
    }
  })
}
