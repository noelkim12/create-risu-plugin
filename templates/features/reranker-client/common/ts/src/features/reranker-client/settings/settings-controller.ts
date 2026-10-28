import { AiServiceError, type RetrievalProviderId } from "../../ai-services"
import type { CredentialSummary } from "../../credential-manager"
import { RerankerError } from "../core/errors"
import { isRerankerConfigId, type RerankerConfig, type RerankerSettings } from "../core/types"

export type RerankerOperation = "idle" | "loading" | "saving" | "deleting" | "testing" | "success" | "error"

export type RerankerConfigSummary = RerankerConfig & {
  readonly credentialName: string | null
  readonly credentialStatus: CredentialSummary["status"] | "none"
}

export type RerankerSettingsState = {
  readonly loaded: boolean
  readonly operation: RerankerOperation
  readonly configs: readonly RerankerConfigSummary[]
  readonly credentials: readonly CredentialSummary[]
  readonly statusMessage: string
}

export interface RerankerSettingsRepositoryPort {
  load(): Promise<RerankerSettings>
  save(settings: RerankerSettings): Promise<void>
}

export interface RerankerCredentialOptionsPort {
  list(): Promise<readonly CredentialSummary[]>
}

export interface RerankerConnectionTestPort {
  testConnection(
    configId: RerankerConfig["id"],
    signal: AbortSignal,
  ): Promise<{ readonly provider: RetrievalProviderId; readonly model: string }>
}

type Listener = (state: RerankerSettingsState) => void

function cloneState(state: RerankerSettingsState): RerankerSettingsState {
  return structuredClone(state)
}

function createConfigId(): RerankerConfig["id"] {
  const value = crypto.randomUUID()
  if (!isRerankerConfigId(value)) {
    throw new AiServiceError("CONFIG_INVALID", "Unable to create a reranker configuration identifier.")
  }
  return value
}

export function createRerankerConfigDraft(): RerankerConfig {
  return {
    id: createConfigId(),
    name: "New reranker",
    provider: "voyage",
    model: "",
    credentialId: null,
    timeoutMs: 60_000,
    defaults: { topK: null, returnDocuments: false, truncation: true },
  }
}

function validateConfig(config: RerankerConfig): void {
  if (config.name.trim().length === 0) {
    throw new AiServiceError("CONFIG_INVALID", "A reranker configuration name is required.")
  }
  if (config.provider !== "voyage" || config.model.trim().length === 0) {
    throw new AiServiceError("CONFIG_INVALID", "A Voyage rerank model is required.", { provider: "voyage" })
  }
  if (!Number.isInteger(config.timeoutMs) || config.timeoutMs < 1) {
    throw new AiServiceError("CONFIG_INVALID", "Timeout must be a positive whole number of milliseconds.")
  }
  if (config.defaults.topK !== null && (!Number.isInteger(config.defaults.topK) || config.defaults.topK < 1)) {
    throw new AiServiceError("CONFIG_INVALID", "Default top K must be a whole number of at least 1.")
  }
}

function summarize(
  configs: readonly RerankerConfig[],
  credentials: readonly CredentialSummary[],
): readonly RerankerConfigSummary[] {
  return configs.map(config => {
    const credential = config.credentialId === null
      ? undefined
      : credentials.find(candidate => candidate.id === config.credentialId)
    return {
      ...config,
      credentialName: credential?.name ?? null,
      credentialStatus: credential === undefined ? "none" : credential.status,
    }
  })
}

export class RerankerSettingsController {
  private readonly listeners = new Set<Listener>()
  private generation = 0
  private testAbort: AbortController | null = null
  private state: RerankerSettingsState = {
    loaded: false,
    operation: "idle",
    configs: [],
    credentials: [],
    statusMessage: "",
  }

  constructor(
    private readonly repository: RerankerSettingsRepositoryPort,
    private readonly credentialOptions: RerankerCredentialOptionsPort,
    private readonly connectionTest: RerankerConnectionTestPort,
  ) {}

  snapshot(): RerankerSettingsState {
    return cloneState(this.state)
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.snapshot())
    return () => this.listeners.delete(listener)
  }

  async load(): Promise<void> {
    await this.run("loading", "", async () => {
      const [settings, credentials] = await Promise.all([
        this.repository.load(),
        this.credentialOptions.list(),
      ])
      const voyageCredentials = credentials.filter(credential => credential.provider === "voyage")
      this.publish({
        loaded: true,
        configs: summarize(settings.configs, voyageCredentials),
        credentials: voyageCredentials,
      })
    })
  }

  async saveConfig(config: RerankerConfig): Promise<void> {
    await this.run("saving", "Reranker configuration saved.", async () => {
      validateConfig(config)
      const settings = await this.repository.load()
      const exists = settings.configs.some(candidate => candidate.id === config.id)
      const configs = exists
        ? settings.configs.map(candidate => (candidate.id === config.id ? config : candidate))
        : [...settings.configs, config]
      await this.repository.save({ schemaVersion: 1, configs })
      this.publish({ loaded: true, configs: summarize(configs, this.state.credentials) })
    })
  }

  async deleteConfig(configId: RerankerConfig["id"]): Promise<void> {
    await this.run("deleting", "Reranker configuration deleted.", async () => {
      const settings = await this.repository.load()
      const configs = settings.configs.filter(candidate => candidate.id !== configId)
      await this.repository.save({ schemaVersion: 1, configs })
      this.publish({ loaded: true, configs: summarize(configs, this.state.credentials) })
    })
  }

  async testConnection(configId: RerankerConfig["id"]): Promise<void> {
    if (!this.state.loaded || this.busy()) return
    if (!this.state.configs.some(config => config.id === configId)) return
    const generation = this.beginMutation()
    const abort = new AbortController()
    this.testAbort = abort
    this.publish({ operation: "testing", statusMessage: "Testing connection…" })
    try {
      const result = await this.connectionTest.testConnection(configId, abort.signal)
      if (this.generation !== generation || this.testAbort !== abort) return
      this.testAbort = null
      this.publish({ operation: "success", statusMessage: `Connected to ${result.provider} / ${result.model}.` })
    } catch (error) {
      if (this.generation !== generation || this.testAbort !== abort) return
      this.testAbort = null
      const message = error instanceof AiServiceError || error instanceof RerankerError
        ? error.message
        : "Reranker connection test failed."
      this.publish({ operation: "error", statusMessage: message })
    }
  }

  cancelTest(): void {
    if (this.testAbort === null) return
    this.beginMutation()
    this.publish({ operation: "idle", statusMessage: "Connection test cancelled." })
  }

  private busy(): boolean {
    return this.state.operation === "loading"
      || this.state.operation === "saving"
      || this.state.operation === "deleting"
      || this.state.operation === "testing"
  }

  private mutationBusy(): boolean {
    return this.state.operation === "loading"
      || this.state.operation === "saving"
      || this.state.operation === "deleting"
  }

  private beginMutation(): number {
    this.generation += 1
    this.testAbort?.abort()
    this.testAbort = null
    return this.generation
  }

  private async run(
    operation: Exclude<RerankerOperation, "idle" | "success" | "error">,
    successMessage: string,
    action: () => Promise<void>,
  ): Promise<void> {
    if (this.mutationBusy()) return
    const generation = this.beginMutation()
    this.publish({ operation, statusMessage: "" })
    try {
      await action()
      if (this.generation !== generation) return
      this.publish({ operation: "success", statusMessage: successMessage })
    } catch (error) {
      if (this.generation !== generation) return
      const message = error instanceof AiServiceError ? error.message : ""
      this.publish({ operation: "error", statusMessage: message === "" ? "Reranker operation failed." : message })
      throw error
    }
  }

  private publish(patch: Partial<RerankerSettingsState>): void {
    this.state = cloneState({ ...this.state, ...patch })
    for (const listener of this.listeners) listener(this.snapshot())
  }
}
