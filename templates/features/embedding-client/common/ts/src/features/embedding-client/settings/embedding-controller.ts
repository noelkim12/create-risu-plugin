import {
  AiServiceError,
} from "../../ai-services"
import type { CredentialSummary } from "../../credential-manager"
import { EmbeddingError } from "../core/errors"
import type {
  EmbeddingConfigDraft,
  EmbeddingConfigId,
  EmbeddingProviderId,
  EmbeddingSettings,
  SavedEmbeddingConfig,
} from "../core/types"
import { configFromDraft } from "../core/validation"
import {
  draftFromConfig,
  defaultEmbeddingConfigDraft,
  newEmbeddingConfigId,
  summarize,
  type EmbeddingConfigSummary,
} from "./config-drafts"

export type EmbeddingControllerOperation = "idle" | "loading" | "saving" | "deleting" | "testing" | "success" | "error"

export type EmbeddingControllerState = {
  readonly loaded: boolean
  readonly operation: EmbeddingControllerOperation
  readonly configs: readonly EmbeddingConfigSummary[]
  readonly credentials: readonly CredentialSummary[]
  readonly statusMessage: string
}

export interface EmbeddingSettingsRepositoryPort {
  load(): Promise<EmbeddingSettings>
  save(settings: EmbeddingSettings): Promise<void>
}

export interface EmbeddingConnectionTestPort {
  testConnection(
    configId: EmbeddingConfigId,
    signal: AbortSignal,
  ): Promise<{ readonly provider: EmbeddingProviderId; readonly model: string }>
}

export type EmbeddingDraftSession = {
  readonly editingId: EmbeddingConfigId | null
}

export interface EmbeddingCredentialPort {
  list(): Promise<readonly CredentialSummary[]>
}

type Listener = (state: EmbeddingControllerState) => void

export class EmbeddingSettingsController {
  private readonly listeners = new Set<Listener>()
  private generation = 0
  private testAbort: AbortController | null = null
  private settings: EmbeddingSettings = { schemaVersion: 1, configs: [] }
  private state: EmbeddingControllerState = {
    loaded: false,
    operation: "idle",
    configs: [],
    credentials: [],
    statusMessage: "",
  }

  constructor(private readonly dependencies: {
    readonly settings: EmbeddingSettingsRepositoryPort
    readonly credentials: EmbeddingCredentialPort
    readonly connectionTest: EmbeddingConnectionTestPort
  }) {}

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.snapshot())
    return () => this.listeners.delete(listener)
  }

  snapshot(): EmbeddingControllerState {
    return structuredClone(this.state)
  }

  private publish(patch: Partial<EmbeddingControllerState>): void {
    this.state = structuredClone({ ...this.state, ...patch })
    for (const listener of this.listeners) listener(this.snapshot())
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

  private safeMessage(error: unknown, fallback: string): string {
    return error instanceof EmbeddingError || error instanceof AiServiceError ? error.message : fallback
  }

  async load(): Promise<void> {
    if (this.mutationBusy()) return
    const generation = this.beginMutation()
    this.publish({ operation: "loading", statusMessage: "Loading embedding settings." })
    try {
      const [settings, credentials] = await Promise.all([
        this.dependencies.settings.load(),
        this.dependencies.credentials.list(),
      ])
      if (this.generation !== generation) return
      this.settings = settings
      this.publish({
        loaded: true,
        operation: "idle",
        statusMessage: "",
        configs: summarize(settings, credentials),
        credentials,
      })
    } catch {
      if (this.generation !== generation) return
      this.publish({ operation: "error", statusMessage: "Embedding settings failed to load." })
    }
  }

  beginCreate(): EmbeddingConfigDraft {
    return defaultEmbeddingConfigDraft()
  }

  beginEdit(id: EmbeddingConfigId): EmbeddingConfigDraft | null {
    const config = this.settings.configs.find(item => item.id === id)
    return config === undefined ? null : draftFromConfig(config)
  }

  async saveDraft(draft: EmbeddingConfigDraft, session: EmbeddingDraftSession): Promise<void> {
    if (!this.state.loaded || this.mutationBusy()) return
    const generation = this.beginMutation()
    this.publish({ operation: "saving", statusMessage: "Saving embedding configuration." })
    try {
      const id = session.editingId ?? newEmbeddingConfigId()
      const config = configFromDraft(draft, id)
      const stored = await this.dependencies.settings.load()
      let configs: readonly SavedEmbeddingConfig[]
      if (session.editingId === null) {
        configs = [...stored.configs, config]
      } else {
        if (!stored.configs.some(item => item.id === session.editingId)) {
          throw new AiServiceError("CONFIG_INVALID", "The embedding configuration no longer exists.")
        }
        configs = stored.configs.map(item => item.id === session.editingId ? config : item)
      }
      const saved: EmbeddingSettings = { schemaVersion: 1, configs }
      await this.dependencies.settings.save(saved)
      if (this.generation !== generation) return
      this.settings = saved
      const credentials = await this.dependencies.credentials.list()
      this.publish({
        operation: "success",
        statusMessage: "Embedding configuration saved.",
        configs: summarize(saved, credentials),
        credentials,
      })
    } catch (error) {
      if (this.generation !== generation) return
      this.publish({
        operation: "error",
        statusMessage: this.safeMessage(error, "Embedding configuration could not be saved."),
      })
      throw error
    }
  }

  async deleteConfig(id: EmbeddingConfigId): Promise<void> {
    if (!this.state.loaded || this.mutationBusy()) return
    if (!this.settings.configs.some(config => config.id === id)) return
    const generation = this.beginMutation()
    this.publish({ operation: "deleting", statusMessage: "Deleting embedding configuration." })
    try {
      const saved: EmbeddingSettings = {
        schemaVersion: 1,
        configs: this.settings.configs.filter(config => config.id !== id),
      }
      await this.dependencies.settings.save(saved)
      if (this.generation !== generation) return
      this.settings = saved
      const credentials = await this.dependencies.credentials.list()
      this.publish({
        operation: "success",
        statusMessage: "Embedding configuration deleted.",
        configs: summarize(saved, credentials),
        credentials,
      })
    } catch {
      if (this.generation !== generation) return
      this.publish({ operation: "error", statusMessage: "Embedding configuration could not be deleted." })
    }
  }

  async testConnection(configId: EmbeddingConfigId): Promise<void> {
    if (!this.state.loaded || this.busy()) return
    if (!this.settings.configs.some(config => config.id === configId)) return
    const generation = this.beginMutation()
    const abort = new AbortController()
    this.testAbort = abort
    this.publish({ operation: "testing", statusMessage: "Testing connection…" })
    try {
      const result = await this.dependencies.connectionTest.testConnection(configId, abort.signal)
      if (this.generation !== generation || this.testAbort !== abort) return
      this.testAbort = null
      this.publish({ operation: "success", statusMessage: `Connected to ${result.provider} / ${result.model}.` })
    } catch (error) {
      if (this.generation !== generation || this.testAbort !== abort) return
      this.testAbort = null
      this.publish({
        operation: "error",
        statusMessage: this.safeMessage(error, "Embedding connection test failed."),
      })
    }
  }

  cancelTest(): void {
    if (this.testAbort === null) return
    this.beginMutation()
    this.publish({ operation: "idle", statusMessage: "Connection test cancelled." })
  }

}
