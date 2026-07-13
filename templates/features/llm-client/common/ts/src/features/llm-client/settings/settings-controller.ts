import { LlmError } from "../core/errors"
import type {
  CredentialDraft,
  LlmSettings,
  ProviderConfig,
  ProviderId,
  StoredCredential,
} from "../core/types"
import {
  assertValidProviderConfig,
  createDefaultSettings,
  validateCustomHeaderNames,
  validateProviderConfig,
  type FieldErrors,
} from "../core/validation"
import {
  createCredentialRecord,
  parseServiceAccountJson,
} from "../storage/local-credential-repository"

export type SettingsOperation = "idle" | "loading" | "saving" | "testing" | "success" | "error"
export type CredentialState = "missing" | "stored" | "stale"

export interface SettingsState {
  readonly operation: SettingsOperation
  readonly settings: LlmSettings
  readonly activeConfig: ProviderConfig
  readonly credentialState: CredentialState
  readonly dirty: boolean
  readonly fieldErrors: FieldErrors
  readonly statusMessage: string
  readonly runtimePlatform: "web" | "tauri" | "node"
}

type Listener = (state: SettingsState) => void

export function parseCustomHeaders(value: string): Record<string, string> {
  if (value.trim() === "") return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new LlmError("CONFIG_INVALID", "Custom headers must be valid JSON.")
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new LlmError("CONFIG_INVALID", "Custom headers must be a JSON object.")
  }

  const entries = Object.entries(parsed)
  const error = validateCustomHeaderNames(entries.map(([name]) => name.trim()))
  if (error) throw new LlmError("CONFIG_INVALID", error)
  const result: Record<string, string> = {}
  for (const [rawName, rawValue] of entries) {
    const name = rawName.trim()
    if (typeof rawValue !== "string") {
      throw new LlmError("CONFIG_INVALID", `Custom header ${name} must have a string value.`)
    }
    if (/[\r\n]/.test(rawValue)) {
      throw new LlmError("CONFIG_INVALID", `Custom header ${name} cannot contain a line break.`)
    }
    result[name] = rawValue
  }
  return result
}

export interface SettingsRepositoryPort {
  load(): Promise<LlmSettings>
  save(settings: LlmSettings): Promise<void>
}

export interface CredentialRepositoryPort {
  load(config: ProviderConfig): Promise<StoredCredential | null>
  status(config: ProviderConfig): Promise<CredentialState>
  saveApiKey(
    config: ProviderConfig,
    apiKey: string,
    customHeaders: Readonly<Record<string, string>>,
  ): Promise<void>
  saveServiceAccountJson(config: Extract<ProviderConfig, { provider: "google-vertex" }>, value: string): Promise<void>
  clear(config: ProviderConfig): Promise<void>
  clearProvider(provider: ProviderId): Promise<void>
}

export interface ConnectionTestPort {
  testConnection(
    config: ProviderConfig,
    credential: StoredCredential | null,
    signal?: AbortSignal,
  ): Promise<{ readonly provider: ProviderId; readonly model: string }>
}

function withProviderConfig(settings: LlmSettings, config: ProviderConfig): LlmSettings {
  switch (config.provider) {
    case "google-ai-studio":
      return { ...settings, providers: { ...settings.providers, "google-ai-studio": config } }
    case "google-vertex":
      return { ...settings, providers: { ...settings.providers, "google-vertex": config } }
    case "openai-compatible":
      return { ...settings, providers: { ...settings.providers, "openai-compatible": config } }
    case "ollama":
      return { ...settings, providers: { ...settings.providers, ollama: config } }
  }
}

function cloneProviderConfig(config: ProviderConfig): ProviderConfig {
  return config.provider === "openai-compatible"
    ? { ...config, customHeaderNames: [...config.customHeaderNames] }
    : { ...config }
}

function cloneSettings(settings: LlmSettings): LlmSettings {
  return {
    ...settings,
    providers: {
      "google-ai-studio": cloneProviderConfig(settings.providers["google-ai-studio"]),
      "google-vertex": cloneProviderConfig(settings.providers["google-vertex"]),
      "openai-compatible": cloneProviderConfig(settings.providers["openai-compatible"]),
      ollama: cloneProviderConfig(settings.providers.ollama),
    },
  }
}

function cloneState(state: SettingsState): SettingsState {
  return {
    ...state,
    settings: cloneSettings(state.settings),
    activeConfig: cloneProviderConfig(state.activeConfig),
    fieldErrors: { ...state.fieldErrors },
  }
}

export class LlmSettingsController {
  private readonly listeners = new Set<Listener>()
  private generation = 0
  private secretDraft: CredentialDraft = {}
  private testAbort: AbortController | null = null
  private state: SettingsState = {
    operation: "idle",
    settings: createDefaultSettings(),
    activeConfig: createDefaultSettings().providers["google-ai-studio"],
    credentialState: "missing",
    dirty: false,
    fieldErrors: {},
    statusMessage: "",
    runtimePlatform: "web",
  }

  constructor(
    private readonly settingsRepository: SettingsRepositoryPort,
    private readonly credentialRepository: CredentialRepositoryPort,
    private readonly client: ConnectionTestPort,
    private readonly getRuntimeInfo: () => Promise<{ platform: string }> = () => risuai.getRuntimeInfo(),
    private readonly invalidateAuthCaches: () => void = () => undefined,
  ) {}

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(cloneState(this.state))
    return () => this.listeners.delete(listener)
  }

  private publish(patch: Partial<SettingsState>): void {
    this.state = cloneState({ ...this.state, ...patch })
    for (const listener of this.listeners) listener(cloneState(this.state))
  }

  private activeConfig(settings = this.state.settings): ProviderConfig {
    return settings.providers[settings.activeProvider]
  }

  private beginMutation(): number {
    this.generation += 1
    this.testAbort?.abort()
    this.testAbort = null
    return this.generation
  }

  private isCurrent(generation: number): boolean {
    return this.generation === generation
  }

  private refreshCredentialStatus(config: ProviderConfig, generation: number): void {
    void this.credentialRepository.status(config).then(credentialState => {
      if (this.isCurrent(generation)) this.publish({ credentialState })
    }).catch(error => {
      if (!this.isCurrent(generation)) return
      this.publish({
        operation: "error",
        statusMessage: this.safeMessage(error, "Credential status could not be checked."),
      })
    })
  }

  async load(): Promise<void> {
    const generation = this.beginMutation()
    this.publish({ operation: "loading", statusMessage: "Loading LLM settings…" })
    try {
      const [loadedSettings, runtime] = await Promise.all([
        this.settingsRepository.load(),
        this.getRuntimeInfo(),
      ])
      if (!this.isCurrent(generation)) return
      const settings = cloneSettings(loadedSettings)
      const activeConfig = this.activeConfig(settings)
      const credentialState = await this.credentialRepository.status(activeConfig)
      if (!this.isCurrent(generation)) return
      this.publish({
        operation: "idle",
        settings,
        activeConfig,
        credentialState,
        dirty: false,
        fieldErrors: validateProviderConfig(activeConfig),
        statusMessage: "",
        runtimePlatform: runtime.platform === "tauri"
          ? "tauri"
          : runtime.platform === "node"
            ? "node"
            : "web",
      })
    } catch (error) {
      if (!this.isCurrent(generation)) return
      this.publish({
        operation: "error",
        statusMessage: error instanceof LlmError ? error.message : "Settings failed to load.",
      })
    }
  }

  selectProvider(provider: ProviderId): void {
    const generation = this.beginMutation()
    const settings = cloneSettings({ ...this.state.settings, activeProvider: provider })
    const activeConfig = settings.providers[provider]
    this.secretDraft = {}
    this.publish({
      operation: "idle",
      settings,
      activeConfig,
      dirty: true,
      fieldErrors: validateProviderConfig(activeConfig),
      statusMessage: "",
    })
    this.refreshCredentialStatus(activeConfig, generation)
  }

  updateConfig(config: ProviderConfig): void {
    const generation = this.beginMutation()
    const configSnapshot = cloneProviderConfig(config)
    if (
      this.state.activeConfig.provider === "google-vertex"
      && configSnapshot.provider === "google-vertex"
      && this.state.activeConfig.authMode !== configSnapshot.authMode
    ) {
      this.secretDraft = {}
    }
    const settings = withProviderConfig(this.state.settings, configSnapshot)
    this.publish({
      operation: "idle",
      settings,
      activeConfig: configSnapshot,
      dirty: true,
      fieldErrors: validateProviderConfig(configSnapshot),
      statusMessage: "",
    })
    this.refreshCredentialStatus(configSnapshot, generation)
  }

  setSecretDraft(draft: CredentialDraft): void {
    this.beginMutation()
    this.secretDraft = { ...this.secretDraft, ...draft }
    this.publish({ operation: "idle", dirty: true, statusMessage: "" })
  }

  private safeMessage(error: unknown, fallback: string): string {
    return error instanceof LlmError ? error.message : fallback
  }

  private configWithDraftHeaders(config: ProviderConfig, draft: CredentialDraft): {
    readonly config: ProviderConfig
    readonly customHeaders: Record<string, string> | null
  } {
    if (
      config.provider !== "openai-compatible"
      || draft.customHeadersJson === undefined
      || draft.customHeadersJson.trim() === ""
    ) {
      return { config, customHeaders: null }
    }
    const customHeaders = parseCustomHeaders(draft.customHeadersJson)
    return {
      config: { ...config, customHeaderNames: Object.keys(customHeaders) },
      customHeaders,
    }
  }

  private async draftCredential(
    config: ProviderConfig,
    customHeaders: Record<string, string> | null,
    draft: CredentialDraft,
  ): Promise<StoredCredential | null> {
    const stored = await this.credentialRepository.load(config)
    const apiKey = draft.apiKey?.trim() ?? ""
    const serviceAccountJson = draft.serviceAccountJson?.trim() ?? ""

    if (config.provider === "google-vertex" && config.authMode === "service-account") {
      return serviceAccountJson === ""
        ? stored
        : createCredentialRecord(config, parseServiceAccountJson(serviceAccountJson, config))
    }
    if (config.provider === "openai-compatible" && (customHeaders !== null || apiKey !== "")) {
      const headers = customHeaders ?? Object.fromEntries(
        config.customHeaderNames
          .map(name => [name, stored?.secret[name]] as const)
          .filter((entry): entry is readonly [string, string] => typeof entry[1] === "string"),
      )
      return createCredentialRecord(config, {
        ...headers,
        apiKey: apiKey || stored?.secret.apiKey || "",
      })
    }
    if (apiKey !== "") {
      return createCredentialRecord(config, { apiKey })
    }
    return stored
  }

  async save(): Promise<void> {
    const generation = this.beginMutation()
    const settingsSnapshot = cloneSettings(this.state.settings)
    const configSnapshot = cloneProviderConfig(this.activeConfig(settingsSnapshot))
    const draft = { ...this.secretDraft }
    this.publish({ operation: "saving", statusMessage: "Saving locally…" })
    try {
      const { config, customHeaders } = this.configWithDraftHeaders(configSnapshot, draft)
      this.publish({ fieldErrors: validateProviderConfig(config) })
      assertValidProviderConfig(config)
      const settings = withProviderConfig(settingsSnapshot, config)
      await this.settingsRepository.save(cloneSettings(settings))
      if (!this.isCurrent(generation)) return

      const apiKey = draft.apiKey?.trim() ?? ""
      const serviceAccountJson = draft.serviceAccountJson?.trim() ?? ""
      if (config.provider === "google-vertex" && config.authMode === "service-account") {
        if (serviceAccountJson !== "") {
          await this.credentialRepository.saveServiceAccountJson(config, serviceAccountJson)
          if (!this.isCurrent(generation)) return
        }
      } else if (config.provider === "openai-compatible") {
        if (apiKey !== "" || customHeaders !== null) {
          const stored = await this.credentialRepository.load(config)
          if (!this.isCurrent(generation)) return
          const preservedHeaders = customHeaders ?? Object.fromEntries(
            config.customHeaderNames
              .map(name => [name, stored?.secret[name]] as const)
              .filter((entry): entry is readonly [string, string] => typeof entry[1] === "string"),
          )
          await this.credentialRepository.saveApiKey(
            config,
            apiKey || stored?.secret.apiKey || "",
            preservedHeaders,
          )
          if (!this.isCurrent(generation)) return
        }
      } else if (apiKey !== "") {
        await this.credentialRepository.saveApiKey(config, apiKey, {})
        if (!this.isCurrent(generation)) return
      }
      if (config.provider === "google-vertex") this.invalidateAuthCaches()

      const credentialState = await this.credentialRepository.status(config)
      if (!this.isCurrent(generation)) return
      this.secretDraft = {}
      this.publish({
        operation: "success",
        settings,
        activeConfig: config,
        credentialState,
        dirty: false,
        fieldErrors: {},
        statusMessage: "Saved locally.",
      })
    } catch (error) {
      if (!this.isCurrent(generation)) return
      this.publish({
        operation: "error",
        statusMessage: this.safeMessage(error, "LLM settings could not be saved."),
      })
    }
  }

  async testConnection(): Promise<void> {
    const generation = this.beginMutation()
    const configSnapshot = cloneProviderConfig(this.state.activeConfig)
    const draft = { ...this.secretDraft }
    const abort = new AbortController()
    this.testAbort = abort
    this.publish({ operation: "testing", statusMessage: "Testing connection…" })
    try {
      const { config, customHeaders } = this.configWithDraftHeaders(configSnapshot, draft)
      this.publish({ fieldErrors: validateProviderConfig(config) })
      assertValidProviderConfig(config)
      const credential = await this.draftCredential(config, customHeaders, draft)
      if (!this.isCurrent(generation) || this.testAbort !== abort || abort.signal.aborted) return
      const response = await this.client.testConnection(config, credential, abort.signal)
      if (!this.isCurrent(generation) || this.testAbort !== abort) return
      this.testAbort = null
      this.publish({
        operation: "success",
        statusMessage: `Connected to ${response.provider} / ${response.model}.`,
      })
    } catch (error) {
      if (!this.isCurrent(generation) || this.testAbort !== abort) return
      const cancelled = error instanceof LlmError && error.code === "ABORTED"
      this.testAbort = null
      this.publish({
        operation: cancelled ? "idle" : "error",
        statusMessage: cancelled
          ? "Connection test cancelled."
          : this.safeMessage(error, "Connection test failed."),
      })
    }
  }

  cancelTest(): void {
    const active = this.testAbort
    this.generation += 1
    active?.abort()
    this.testAbort = null
    if (active) this.publish({ operation: "idle", statusMessage: "Connection test cancelled." })
  }

  async clearCredential(): Promise<void> {
    const generation = this.beginMutation()
    const config = cloneProviderConfig(this.state.activeConfig)
    this.publish({ operation: "saving", statusMessage: "Removing credential…" })
    try {
      await this.credentialRepository.clear(config)
      if (config.provider === "google-vertex") this.invalidateAuthCaches()
      if (!this.isCurrent(generation)) return
      this.secretDraft = {}
      this.publish({
        operation: "success",
        credentialState: "missing",
        statusMessage: "Credential removed.",
      })
    } catch (error) {
      if (!this.isCurrent(generation)) return
      this.publish({
        operation: "error",
        statusMessage: this.safeMessage(error, "Credential could not be removed."),
      })
    }
  }

  async resetActiveProvider(): Promise<void> {
    const generation = this.beginMutation()
    const currentSettings = cloneSettings(this.state.settings)
    const provider = currentSettings.activeProvider
    const config = cloneProviderConfig(createDefaultSettings().providers[provider])
    const settings = withProviderConfig(currentSettings, config)
    this.publish({ operation: "saving", statusMessage: "Resetting provider…" })
    try {
      await this.credentialRepository.clearProvider(provider)
      if (provider === "google-vertex") this.invalidateAuthCaches()
      if (!this.isCurrent(generation)) return
      await this.settingsRepository.save(cloneSettings(settings))
      if (!this.isCurrent(generation)) return
      this.secretDraft = {}
      this.publish({
        operation: "success",
        settings,
        activeConfig: config,
        credentialState: "missing",
        dirty: false,
        fieldErrors: validateProviderConfig(config),
        statusMessage: "Provider reset.",
      })
    } catch (error) {
      if (!this.isCurrent(generation)) return
      this.publish({
        operation: "error",
        statusMessage: this.safeMessage(error, "Provider could not be reset."),
      })
    }
  }

  dispose(): void {
    this.beginMutation()
    this.secretDraft = {}
    this.listeners.clear()
  }
}
