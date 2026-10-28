import { retrievalEndpointFor } from "../../ai-services"
import type { CredentialBinding } from "../../credential-manager"
import type { SavedEmbeddingConfig } from "./types"

export function embeddingCredentialBindingFor(config: SavedEmbeddingConfig): CredentialBinding {
  if (config.provider === "voyage") {
    return {
      provider: "voyage",
      kind: "api-key",
      authMode: "bearer",
      audience: retrievalEndpointFor({ provider: "voyage" }),
    }
  }
  return {
    provider: "openai-compatible",
    kind: "api-key",
    authMode: "bearer",
    audience: retrievalEndpointFor({ provider: "openai-compatible", endpoint: config.endpoint }),
  }
}

export function requiresBearerCredential(config: SavedEmbeddingConfig): boolean {
  return config.provider === "voyage" || config.authMode === "bearer"
}
