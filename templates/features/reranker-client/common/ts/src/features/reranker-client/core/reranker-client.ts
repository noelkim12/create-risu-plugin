import {
  AiServiceError,
  type RetrievalProviderRegistry,
} from "../../ai-services"
import { isCredentialId, type CredentialBinding, type CredentialResolver } from "../../credential-manager"
import type { RerankerProviderRegistry } from "../providers/registry"
import { assertTopKInRange, validateRerankRequest } from "./validation"
import type {
  RerankCallOptions,
  RerankRequest,
  RerankResult,
  RerankerConfig,
  RerankerSettings,
  ResolvedRerankRequest,
} from "./types"

export interface RerankerSettingsPort {
  load(): Promise<RerankerSettings>
}

export type RerankerClientPorts = {
  readonly settings: RerankerSettingsPort
  readonly credentials: CredentialResolver
  readonly providers: RetrievalProviderRegistry
  readonly rerankers: RerankerProviderRegistry
}

const RERANKER_CREDENTIAL_BINDING: CredentialBinding = {
  provider: "voyage",
  kind: "api-key",
  authMode: "bearer",
  audience: "https://api.voyageai.com",
}

async function resolveApiKey(
  config: RerankerConfig,
  credentials: CredentialResolver,
): Promise<string> {
  if (config.credentialId === null) {
    throw new AiServiceError("CREDENTIAL_MISSING", "A Voyage credential is required.", {
      provider: config.provider,
      capability: "reranker",
    })
  }
  if (!isCredentialId(config.credentialId)) {
    throw new AiServiceError("CREDENTIAL_MISSING", "The linked Voyage credential no longer exists.", {
      provider: config.provider,
      capability: "reranker",
    })
  }
  const credential = await credentials.resolveCredential(config.credentialId, RERANKER_CREDENTIAL_BINDING)
  if (credential.kind !== "api-key") {
    throw new AiServiceError("CONFIG_INVALID", "The linked Voyage credential must be an API key.", {
      provider: config.provider,
      capability: "reranker",
    })
  }
  if (/[\r\n]/.test(credential.secret.apiKey)) {
    throw new AiServiceError("CONFIG_INVALID", "The stored API key contains an invalid line break.", {
      provider: config.provider,
    })
  }
  return credential.secret.apiKey
}

function resolveEffectiveRequest(request: RerankRequest, config: RerankerConfig): ResolvedRerankRequest {
  const topK = request.topK ?? config.defaults.topK
  if (topK !== null) assertTopKInRange(topK, request.documents.length)
  return {
    query: request.query,
    documents: request.documents,
    topK,
    returnDocuments: request.returnDocuments ?? config.defaults.returnDocuments,
    truncation: request.truncation ?? config.defaults.truncation,
  }
}

export class RerankerClient {
  constructor(private readonly ports: RerankerClientPorts) {}

  async rerank(request: RerankRequest, options: RerankCallOptions): Promise<RerankResult> {
    validateRerankRequest(request)
    const settings = await this.ports.settings.load()
    const config = settings.configs.find(candidate => candidate.id === options.configId)
    if (config === undefined) {
      throw new AiServiceError("CONFIG_INVALID", "The saved reranker configuration was not found.")
    }
    this.ports.providers.assertSupports(config.provider, "reranker")
    const apiKey = await resolveApiKey(config, this.ports.credentials)
    const provider = this.ports.rerankers.get(config.provider)
    return provider.rerank({
      config,
      apiKey,
      request: resolveEffectiveRequest(request, config),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      timeoutMs: options.timeoutMs ?? config.timeoutMs,
    })
  }
}
