import { AiServiceError } from "../../ai-services/core/errors"
import type { CredentialResolver } from "../../credential-manager/contracts"
import type { ResolvedCredential } from "../../credential-manager/core/types"
import { isLocalNetworkUrl } from "../network/url-policy"
import type { LlmProvider, ProviderExecution } from "../providers/provider"
import { credentialBindingFor } from "./credential-binding"
import { LlmError } from "./errors"
import type {
  LlmCallOptions,
  LlmRequest,
  LlmResponse,
  LlmStream,
  LlmStreamEvent,
  LlmSettings,
  SavedModelConfig,
} from "./types"
import {
  assertValidCallOptions,
  assertValidRequest,
  assertValidStreamRequest,
  parseStoredSettings,
} from "./validation"

export interface LlmClientDependencies {
  readonly settings: { load(): Promise<LlmSettings> }
  readonly credentials: CredentialResolver
  readonly providers: { for(model: SavedModelConfig): LlmProvider }
  readonly getRuntimeInfo: () => Promise<{ readonly platform: string }>
}

type ResolvedLlmCall = {
  readonly model: SavedModelConfig
  readonly credential: ResolvedCredential | null
}

function credentialError(error: unknown, model: SavedModelConfig): never {
  if (error instanceof AiServiceError) {
    throw new LlmError(
      error.code === "CREDENTIAL_MISSING" ? "CREDENTIAL_MISSING" : "CONFIG_INVALID",
      error.message,
      model.provider,
    )
  }
  throw error
}

function providerCredential(credential: ResolvedCredential | null): ProviderExecution["credential"] {
  return credential === null
    ? null
    : { revision: credential.revision, secret: { ...credential.secret } }
}

export class LlmClient {
  constructor(private readonly dependencies: LlmClientDependencies) {}

  async complete(request: LlmRequest, options: LlmCallOptions): Promise<LlmResponse> {
    assertValidCallOptions(options)
    const resolved = await this.resolve(options)
    assertValidRequest(request, resolved.model)
    return this.execute(resolved, request, options)
  }

  stream(request: LlmRequest, options: LlmCallOptions): LlmStream {
    return this.streamExecution(request, options)
  }

  async testConnection(
    model: SavedModelConfig,
    credential: ResolvedCredential | null,
    signal?: AbortSignal,
  ): Promise<LlmResponse> {
    const settings = parseStoredSettings({
      schemaVersion: 2,
      savedModelConfigs: [model],
      selectedModelConfigId: model.id,
      defaultModelConfigId: model.id,
    })
    const resolvedModel = settings.savedModelConfigs[0]
    if (resolvedModel === undefined) throw new LlmError("CONFIG_INVALID", "Saved model configuration is invalid.")
    const binding = credentialBindingFor(resolvedModel)
    if (binding === null) {
      if (resolvedModel.keyId !== null || credential !== null) {
        throw new LlmError("CONFIG_INVALID", "The model credential configuration is inconsistent.", resolvedModel.provider)
      }
    } else if (resolvedModel.keyId === null || credential === null) {
      throw new LlmError("CREDENTIAL_MISSING", "A valid linked credential is required.", resolvedModel.provider)
    } else if (credential.keyId !== resolvedModel.keyId) {
      throw new LlmError("CONFIG_INVALID", "The stored credential is incompatible with the model configuration.", resolvedModel.provider)
    }
    const request = { messages: [{ role: "user" as const, content: "Reply with OK." }] }
    assertValidRequest(request, resolvedModel)
    return this.execute({ model: resolvedModel, credential }, request, {
      modelConfigId: resolvedModel.id,
      ...(signal === undefined ? {} : { signal }),
    })
  }

  private async resolve(options: LlmCallOptions): Promise<ResolvedLlmCall> {
    const stored = await this.dependencies.settings.load()
    if (!stored.savedModelConfigs.some(item => item.id === options.modelConfigId)) {
      throw new LlmError("MODEL_CONFIG_MISSING", "The requested saved model configuration does not exist.")
    }
    const settings = parseStoredSettings(stored)
    const model = settings.savedModelConfigs.find(item => item.id === options.modelConfigId)
    if (model === undefined) {
      throw new LlmError("MODEL_CONFIG_MISSING", "The requested saved model configuration does not exist.")
    }
    const binding = credentialBindingFor(model)
    if (binding === null) {
      if (model.keyId !== null) {
        throw new LlmError("CONFIG_INVALID", "The model credential configuration is inconsistent.", model.provider)
      }
      return { model, credential: null }
    }
    if (model.keyId === null) {
      throw new LlmError("CREDENTIAL_MISSING", "A valid linked credential is required.", model.provider)
    }
    try {
      return {
        model,
        credential: await this.dependencies.credentials.resolveCredential(model.keyId, binding),
      }
    } catch (error) {
      return credentialError(error, model)
    }
  }

  private async execute(
    resolved: ResolvedLlmCall,
    request: LlmRequest,
    options: LlmCallOptions,
  ): Promise<LlmResponse> {
    await this.assertRuntime(resolved.model)
    return this.dependencies.providers.for(resolved.model).complete({
      model: resolved.model,
      credential: providerCredential(resolved.credential),
      request,
      options,
    })
  }

  private async *streamExecution(
    request: LlmRequest,
    options: LlmCallOptions,
  ): AsyncIterable<LlmStreamEvent> {
    assertValidCallOptions(options)
    const resolved = await this.resolve(options)
    assertValidStreamRequest(request, resolved.model)
    await this.assertRuntime(resolved.model)
    yield* this.dependencies.providers.for(resolved.model).stream({
      model: resolved.model,
      credential: providerCredential(resolved.credential),
      request,
      options,
    })
  }

  private async assertRuntime(model: SavedModelConfig): Promise<void> {
    const localEndpoint = model.provider === "openai-compatible"
      || model.provider === "ollama"
      || model.provider === "deepseek"
        ? isLocalNetworkUrl(model.baseUrl)
        : false
    if (localEndpoint) {
      const { platform } = await this.dependencies.getRuntimeInfo()
      if (platform !== "tauri" && platform !== "node") {
        throw new LlmError(
          "UNSUPPORTED_RUNTIME",
          "This local endpoint requires Risu desktop/Tauri or a self-hosted Node runtime.",
          model.provider,
        )
      }
    }
  }
}
