import { isLocalNetworkUrl } from "../network/url-policy"
import type { LlmProvider } from "../providers/provider"
import { LlmError } from "./errors"
import type {
  LlmCallOptions,
  LlmRequest,
  LlmResponse,
  LlmSettings,
  ProviderConfig,
  StoredCredential,
} from "./types"
import {
  assertValidCallOptions,
  assertValidProviderConfig,
  assertValidRequest,
} from "./validation"

export interface LlmClientDependencies {
  readonly settings: { load(): Promise<LlmSettings> }
  readonly credentials: { load(config: ProviderConfig): Promise<StoredCredential | null> }
  readonly providers: { for(config: ProviderConfig): LlmProvider }
  readonly getRuntimeInfo: () => Promise<{ readonly platform: string }>
}

export class LlmClient {
  constructor(private readonly dependencies: LlmClientDependencies) {}

  async complete(request: LlmRequest, options: LlmCallOptions = {}): Promise<LlmResponse> {
    assertValidRequest(request)
    assertValidCallOptions(options)
    const settings = await this.dependencies.settings.load()
    const provider = options.provider ?? settings.activeProvider
    const config = settings.providers[provider]
    assertValidProviderConfig(config)
    const credential = await this.dependencies.credentials.load(config)
    return this.execute(config, credential, request, options)
  }

  async testConnection(
    config: ProviderConfig,
    credential: StoredCredential | null,
    signal?: AbortSignal,
  ): Promise<LlmResponse> {
    assertValidProviderConfig(config)
    return this.execute(
      config,
      credential,
      {
        messages: [{ role: "user", content: "Reply with OK." }],
        maxOutputTokens: 8,
      },
      { signal },
    )
  }

  private async execute(
    config: ProviderConfig,
    credential: StoredCredential | null,
    request: LlmRequest,
    options: LlmCallOptions,
  ): Promise<LlmResponse> {
    if (
      (config.provider === "openai-compatible" || config.provider === "ollama")
      && isLocalNetworkUrl(config.baseUrl)
    ) {
      const { platform } = await this.dependencies.getRuntimeInfo()
      if (platform !== "tauri" && platform !== "node") {
        throw new LlmError(
          "UNSUPPORTED_RUNTIME",
          "This local endpoint requires Risu desktop/Tauri or a self-hosted Node runtime.",
          config.provider,
        )
      }
    }
    return this.dependencies.providers.for(config).complete({ config, credential, request, options })
  }
}
