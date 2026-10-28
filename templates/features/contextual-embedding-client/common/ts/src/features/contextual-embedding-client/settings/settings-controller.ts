import { AiServiceError } from "../../ai-services"
import type { CredentialSummary } from "../../credential-manager"
import type {
  ContextualEmbeddingConfig,
  ContextualEmbeddingConfigDraft,
  ContextualEmbeddingConfigId,
} from "../core/types"
import { defaultContextualEmbeddingDraft } from "../core/types"
import { validateContextualEmbeddingDraft } from "../core/validation"
import { ContextualEmbeddingError } from "../core/errors"

export type ContextualEmbeddingSettingsOperation = "idle" | "loading" | "saving" | "deleting" | "testing" | "success" | "error"

export type ContextualEmbeddingConfigSummary = ContextualEmbeddingConfig & {
  readonly credentialName: string | null
  readonly credentialStatus: CredentialSummary["status"] | null
}

export type ContextualEmbeddingSettingsState = {
  readonly loaded: boolean
  readonly operation: ContextualEmbeddingSettingsOperation
  readonly configs: readonly ContextualEmbeddingConfigSummary[]
  readonly voyageCredentials: readonly CredentialSummary[]
  readonly editingId: ContextualEmbeddingConfigId | null
  readonly draft: ContextualEmbeddingConfigDraft | null
  readonly statusMessage: string
}

export interface ContextualEmbeddingConfigEditingPort {
  list(): Promise<readonly ContextualEmbeddingConfig[]>
  create(draft: ContextualEmbeddingConfigDraft): Promise<ContextualEmbeddingConfig>
  update(id: ContextualEmbeddingConfigId, draft: ContextualEmbeddingConfigDraft): Promise<ContextualEmbeddingConfig>
  delete(id: ContextualEmbeddingConfigId): Promise<void>
}

export interface ContextualEmbeddingCredentialListingPort {
  list(): Promise<readonly CredentialSummary[]>
}

export interface ContextualEmbeddingConnectionTestPort {
  testConnection(
    configId: ContextualEmbeddingConfigId,
    signal: AbortSignal,
  ): Promise<{ readonly provider: ContextualEmbeddingConfig["provider"]; readonly model: string }>
}

type Listener = (state: ContextualEmbeddingSettingsState) => void

function cloneState(state: ContextualEmbeddingSettingsState): ContextualEmbeddingSettingsState {
  return structuredClone(state)
}

export class ContextualEmbeddingSettingsController {
  private readonly listeners = new Set<Listener>()
  private generation = 0
  private testAbort: AbortController | null = null
  private state: ContextualEmbeddingSettingsState = {
    loaded: false,
    operation: "idle",
    configs: [],
    voyageCredentials: [],
    editingId: null,
    draft: null,
    statusMessage: "",
  }

  constructor(
    private readonly configs: ContextualEmbeddingConfigEditingPort,
    private readonly credentials: ContextualEmbeddingCredentialListingPort,
    private readonly connectionTest: ContextualEmbeddingConnectionTestPort,
  ) {}

  snapshot(): ContextualEmbeddingSettingsState {
    return cloneState(this.state)
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.snapshot())
    return () => this.listeners.delete(listener)
  }

  async load(): Promise<void> {
    await this.run("loading", "", async () => {
      const [configs, credentials] = await Promise.all([this.configs.list(), this.credentials.list()])
      this.publish({ loaded: true, configs: summaries(configs, credentials), voyageCredentials: credentials })
    })
  }

  startCreate(): void {
    if (this.busy()) return
    this.publish({ operation: "idle", editingId: null, draft: defaultContextualEmbeddingDraft(), statusMessage: "" })
  }

  startEdit(id: ContextualEmbeddingConfigId): void {
    if (this.busy()) return
    const config = this.state.configs.find(entry => entry.id === id)
    if (config === undefined) return
    this.publish({
      operation: "idle",
      editingId: id,
      draft: {
        name: config.name,
        model: config.model,
        credentialId: config.credentialId,
        timeoutMs: config.timeoutMs,
        inputType: config.inputType,
        outputDimension: config.outputDimension,
        outputDtype: config.outputDtype,
        base64: config.base64,
      },
      statusMessage: "",
    })
  }

  updateDraft(draft: ContextualEmbeddingConfigDraft): void {
    if (this.busy()) return
    this.publish({ draft: structuredClone(draft), statusMessage: "" })
  }

  cancelEdit(): void {
    if (this.busy()) return
    this.publish({ editingId: null, draft: null, statusMessage: "" })
  }

  async save(): Promise<void> {
    const editingId = this.state.editingId
    const draft = this.state.draft
    if (draft === null) return
    await this.run("saving", "Configuration saved.", async () => {
      const validated = validateContextualEmbeddingDraft(draft)
      await (editingId === null ? this.configs.create(validated) : this.configs.update(editingId, validated))
      const [configs, credentials] = await Promise.all([this.configs.list(), this.credentials.list()])
      this.publish({
        loaded: true,
        configs: summaries(configs, credentials),
        voyageCredentials: credentials,
        editingId: null,
        draft: null,
      })
    })
  }

  async delete(id: ContextualEmbeddingConfigId): Promise<void> {
    await this.run("deleting", "Configuration deleted.", async () => {
      await this.configs.delete(id)
      const [configs, credentials] = await Promise.all([this.configs.list(), this.credentials.list()])
      const editingCleared = this.state.editingId === id
      this.publish({
        loaded: true,
        configs: summaries(configs, credentials),
        voyageCredentials: credentials,
        ...(editingCleared ? { editingId: null, draft: null } : {}),
      })
    })
  }

  async testConnection(configId: ContextualEmbeddingConfigId): Promise<void> {
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
      const message = error instanceof AiServiceError || error instanceof ContextualEmbeddingError
        ? error.message
        : "Contextual embedding connection test failed."
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
    operation: Exclude<ContextualEmbeddingSettingsOperation, "idle" | "success" | "error">,
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
      this.publish({ operation: "error", statusMessage: "Configuration operation failed." })
      throw error
    }
  }

  private publish(patch: Partial<ContextualEmbeddingSettingsState>): void {
    this.state = cloneState({ ...this.state, ...patch })
    for (const listener of this.listeners) listener(this.snapshot())
  }
}

function summaries(
  configs: readonly ContextualEmbeddingConfig[],
  credentials: readonly CredentialSummary[],
): readonly ContextualEmbeddingConfigSummary[] {
  return configs.map(config => {
    const credential = config.credentialId === null
      ? undefined
      : credentials.find(entry => entry.id === config.credentialId)
    return {
      ...config,
      credentialName: credential?.name ?? null,
      credentialStatus: credential?.status ?? null,
    }
  })
}
