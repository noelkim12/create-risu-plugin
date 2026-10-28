import type { CredentialBinding } from "../../credential-manager/core/types"
import { buildChatCompletionsUrl } from "../network/url-policy"
import type { SavedModelConfig } from "./types"

export function credentialBindingFor(model: SavedModelConfig): CredentialBinding | null {
  switch (model.provider) {
    case "google-ai-studio":
      return {
        provider: model.provider,
        kind: "api-key",
        authMode: "api-key",
        audience: "https://generativelanguage.googleapis.com",
      }
    case "google-vertex":
      return {
        provider: model.provider,
        kind: "vertex-service-account",
        authMode: "service-account",
        audience: `vertex:${model.projectId.trim()}:${model.location.trim()}`,
      }
    case "openai-compatible":
    case "ollama":
      return model.authMode === "none"
        ? null
        : {
            provider: model.provider,
            kind: "api-key",
            authMode: "bearer",
            audience: buildChatCompletionsUrl(model.baseUrl),
          }
    case "deepseek":
      return {
        provider: model.provider,
        kind: "api-key",
        authMode: "bearer",
        audience: buildChatCompletionsUrl(model.baseUrl),
      }
  }
}
