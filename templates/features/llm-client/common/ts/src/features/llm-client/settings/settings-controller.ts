// allow: SIZE_OK - model editing and connection-test lifecycle remain one controller contract.
import { AiServiceError } from "../../ai-services/core/errors"
import type { CredentialId } from "../../credential-manager/core/types"
import { credentialBindingFor } from "../core/credential-binding"
import { LlmError } from "../core/errors"
import type { LlmSettings, ProviderId, SavedModelConfig, SavedModelConfigId } from "../core/types"
import { createDefaultSettings, parseStoredSettings } from "../core/validation"
import {
  clone,
  createModelDraft,
  listCompatibleKeys,
  mergeModelDraft,
  modelSummaries,
  type ConnectionTestPort,
  type CredentialSelectionPort,
  type SettingsRepositoryPort,
  type SettingsState,
} from "./model-catalog"
export type {
  ConnectionTestPort,
  CredentialSelectionPort,
  ModelSummary,
  SettingsOperation,
  SettingsRepositoryPort,
  SettingsState,
} from "./model-catalog"

type Listener = (state: SettingsState) => void

function noModel(): never {
  throw new LlmError("CONFIG_INVALID", "Saved model configuration is missing.")
}

function missingCredential(model: SavedModelConfig): never {
  throw new LlmError("CREDENTIAL_MISSING", "A valid linked credential is required.", model.provider)
}

export class LlmSettingsController {
  private readonly listeners = new Set<Listener>()
  private generation = 0
  private lifecycle = 0
  private persistenceTail: Promise<void> = Promise.resolve()
  private testAbort: AbortController | null = null
  private settings = createDefaultSettings()
  private state: SettingsState = {
    operation: "idle", loaded: false, modelSummaries: [], compatibleKeys: [], selectedModelConfigId: null,
    modelDraft: null, dirty: false, fieldErrors: {}, statusMessage: "", runtimePlatform: "web",
  }

  constructor(
    private readonly settingsRepository: SettingsRepositoryPort,
    private readonly credentials: CredentialSelectionPort,
    private readonly client: ConnectionTestPort,
    private readonly getRuntimeInfo: () => Promise<{ platform: string }> = () => Promise.resolve({ platform: "web" }),
  ) {}

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(clone(this.state))
    return () => this.listeners.delete(listener)
  }

  private publish(patch: Partial<SettingsState>): void {
    this.state = clone({ ...this.state, ...patch })
    for (const listener of this.listeners) listener(clone(this.state))
  }

  private beginMutation(): number {
    this.generation += 1
    this.testAbort?.abort()
    this.testAbort = null
    return this.generation
  }

  private isCurrent(generation: number, lifecycle = this.lifecycle): boolean {
    return this.generation === generation && this.lifecycle === lifecycle
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.persistenceTail.then(operation)
    this.persistenceTail = result.then(() => undefined, () => undefined)
    return result
  }

  private fail(generation: number, message: string): void {
    if (this.isCurrent(generation)) this.publish({ operation: "error", statusMessage: message, fieldErrors: {} })
  }

  private safeMessage(error: unknown, fallback: string): string {
    return error instanceof LlmError ? error.message : fallback
  }

  private candidate(): LlmSettings {
    return mergeModelDraft(this.settings, this.state.modelDraft, this.state.selectedModelConfigId)
  }

  private refreshCompatibleKeys(model: SavedModelConfig, generation: number, lifecycle: number): void {
    void listCompatibleKeys(model, this.credentials).then(keys => {
      if (this.isCurrent(generation, lifecycle) && this.state.modelDraft?.id === model.id) {
        this.publish({ compatibleKeys: keys })
      }
    })
  }

  async load(): Promise<void> {
    if (this.state.operation === "loading") return
    const generation = this.beginMutation()
    const lifecycle = this.lifecycle
    this.publish({ operation: "loading", loaded: false, statusMessage: "Loading LLM settings…" })
    try {
      const [settings, runtime] = await Promise.all([this.settingsRepository.load(), this.getRuntimeInfo()])
      const parsed = parseStoredSettings(settings)
      const selected = parsed.selectedModelConfigId
      const model = selected === null ? null : parsed.savedModelConfigs.find(item => item.id === selected) ?? null
      const keys = await listCompatibleKeys(model, this.credentials)
      if (!this.isCurrent(generation, lifecycle)) return
      this.settings = clone(parsed)
      this.publish({
        operation: "idle", loaded: true, modelSummaries: modelSummaries(parsed), compatibleKeys: keys,
        selectedModelConfigId: selected, modelDraft: model, dirty: false, fieldErrors: {}, statusMessage: "",
        runtimePlatform: runtime.platform === "tauri" ? "tauri" : runtime.platform === "node" ? "node" : "web",
      })
    } catch (_error) {
      this.fail(generation, "Settings failed to load.")
    }
  }

  createModel(provider: ProviderId): void {
    const draft = createModelDraft(provider)
    const generation = this.beginMutation()
    const lifecycle = this.lifecycle
    this.publish({ operation: "idle", selectedModelConfigId: draft.id, modelDraft: draft, compatibleKeys: [], dirty: true, statusMessage: "", fieldErrors: {} })
    this.refreshCompatibleKeys(draft, generation, lifecycle)
  }

  selectModelConfig(modelId: SavedModelConfigId): void {
    const generation = this.beginMutation()
    const lifecycle = this.lifecycle
    const model = this.settings.savedModelConfigs.find(item => item.id === modelId)
    if (model === undefined) {
      this.fail(generation, "Saved model configuration is no longer available.")
      return
    }
    this.publish({ operation: "idle", selectedModelConfigId: modelId, modelDraft: clone(model), compatibleKeys: [], dirty: false, statusMessage: "", fieldErrors: {} })
    this.refreshCompatibleKeys(model, generation, lifecycle)
  }

  updateModelDraft(draft: SavedModelConfig): void {
    if (this.state.selectedModelConfigId !== draft.id) return
    const generation = this.generation
    const lifecycle = this.lifecycle
    this.publish({ modelDraft: clone(draft), compatibleKeys: [], dirty: true, statusMessage: "", fieldErrors: {} })
    this.refreshCompatibleKeys(draft, generation, lifecycle)
  }

  renameSelectedModel(name: string): void {
    const draft = this.state.modelDraft
    if (draft !== null) this.updateModelDraft({ ...draft, name })
  }

  async linkModelKey(keyId: CredentialId | null): Promise<void> {
    const selected = this.state.modelDraft
    if (selected === null) return
    const generation = this.beginMutation()
    const lifecycle = this.lifecycle
    if (keyId === null) {
      this.updateModelDraft({ ...selected, keyId: null })
      return
    }
    try {
      const binding = credentialBindingFor(selected)
      if (binding === null) throw new LlmError("CONFIG_INVALID", "This model does not use a credential.", selected.provider)
      const compatible = await this.credentials.listCompatible(binding)
      if (!compatible.some(key => key.id === keyId)) {
        throw new LlmError("CONFIG_INVALID", "Saved key is incompatible with the model configuration.", selected.provider)
      }
      let project: { readonly projectId?: string; readonly location?: string } = {}
      if (selected.provider === "google-vertex") {
        const credential = await this.credentials.resolveCredential(keyId, binding)
        if (credential.kind === "vertex-service-account") {
          project = { projectId: credential.secret.projectId.trim(), location: credential.secret.location.trim() }
        }
      }
      if (!this.isCurrent(generation, lifecycle) || this.state.modelDraft?.id !== selected.id) return
      this.updateModelDraft({ ...selected, keyId, ...project })
    } catch (_error) {
      this.fail(generation, "Linked credential could not be loaded.")
    }
  }

  async saveModel(): Promise<void> {
    if (!this.state.loaded || this.state.modelDraft === null) return
    const generation = this.beginMutation()
    const lifecycle = this.lifecycle
    this.publish({ operation: "saving", statusMessage: "Saving model…" })
    try {
      const parsed = parseStoredSettings(this.candidate())
      const selected = this.state.selectedModelConfigId
      const model = selected === null ? undefined : parsed.savedModelConfigs.find(item => item.id === selected)
      if (model === undefined) throw new LlmError("CONFIG_INVALID", "Saved model configuration is no longer available.")
      const binding = credentialBindingFor(model)
      if (model.keyId !== null) {
        if (binding === null) throw new LlmError("CONFIG_INVALID", "This model does not use a credential.", model.provider)
        const compatible = await this.credentials.listCompatible(binding)
        if (!compatible.some(key => key.id === model.keyId)) {
          throw new LlmError("CONFIG_INVALID", "Saved key is incompatible with the model configuration.", model.provider)
        }
      }
      await this.enqueue(() => this.settingsRepository.save(clone(parsed)))
      if (!this.isCurrent(generation, lifecycle)) return
      this.settings = clone(parsed)
      this.publish({ operation: "success", modelSummaries: modelSummaries(parsed), modelDraft: model, dirty: false, fieldErrors: {}, statusMessage: "Model saved." })
    } catch (error) {
      this.fail(generation, this.safeMessage(error, "Model could not be saved."))
    }
  }

  async deleteModel(modelId: SavedModelConfigId, confirmed: boolean): Promise<void> {
    if (!this.state.loaded || !confirmed || this.settings.savedModelConfigs.every(model => model.id !== modelId)) return
    const generation = this.beginMutation()
    const lifecycle = this.lifecycle
    const models = this.settings.savedModelConfigs.filter(model => model.id !== modelId)
    const nextSelected = this.state.selectedModelConfigId === modelId ? (models[0]?.id ?? null) : this.state.selectedModelConfigId
    const candidate: LlmSettings = {
      ...this.settings,
      savedModelConfigs: models,
      selectedModelConfigId: nextSelected,
      defaultModelConfigId: this.settings.defaultModelConfigId === modelId ? (models[0]?.id ?? null) : this.settings.defaultModelConfigId,
    }
    this.publish({ operation: "deleting", statusMessage: "Deleting model…" })
    try {
      await this.enqueue(() => this.settingsRepository.save(candidate))
      if (!this.isCurrent(generation, lifecycle)) return
      this.settings = clone(candidate)
      const draft = nextSelected === null ? null : models.find(model => model.id === nextSelected) ?? null
      this.publish({ operation: "success", modelSummaries: modelSummaries(candidate), compatibleKeys: await listCompatibleKeys(draft, this.credentials), selectedModelConfigId: nextSelected, modelDraft: draft, dirty: false, fieldErrors: {}, statusMessage: "Model deleted." })
    } catch (_error) {
      this.fail(generation, "Model could not be deleted.")
    }
  }

  async deleteSelectedModel(confirmed: boolean): Promise<void> {
    const modelId = this.state.selectedModelConfigId
    if (modelId !== null) await this.deleteModel(modelId, confirmed)
  }

  async testConnection(): Promise<void> {
    if (!this.state.loaded) return
    const generation = this.beginMutation()
    const lifecycle = this.lifecycle
    const abort = new AbortController()
    this.testAbort = abort
    this.publish({ operation: "testing", statusMessage: "Testing connection…" })
    try {
      const settings = parseStoredSettings(this.candidate())
      const modelId = this.state.selectedModelConfigId
      const model = modelId === null ? undefined : settings.savedModelConfigs.find(item => item.id === modelId)
      if (model === undefined) throw new LlmError("CONFIG_INVALID", "Saved model configuration is no longer available.")
      const binding = credentialBindingFor(model)
      const credential = binding === null
        ? model.keyId === null ? null : noModel()
        : model.keyId === null
          ? missingCredential(model)
          : await this.credentials.resolveCredential(model.keyId, binding)
      if (!this.isCurrent(generation, lifecycle) || this.testAbort !== abort || abort.signal.aborted) return
      const response = await this.client.testConnection(clone(model), clone(credential), abort.signal)
      if (!this.isCurrent(generation, lifecycle) || this.testAbort !== abort) return
      this.testAbort = null
      this.publish({ operation: "success", statusMessage: `Connected to ${response.provider} / ${response.model}.` })
    } catch (error) {
      if (!this.isCurrent(generation, lifecycle) || this.testAbort !== abort) return
      this.testAbort = null
      const fallback = (error instanceof LlmError || error instanceof AiServiceError) && error.code === "CREDENTIAL_MISSING"
        ? error.message
        : "Connection test failed."
      this.fail(generation, fallback)
    }
  }

  cancelTest(): void {
    const active = this.testAbort
    this.beginMutation()
    if (active !== null) this.publish({ operation: "idle", statusMessage: "Connection test cancelled." })
  }

  closeEditor(): void {
    this.beginMutation()
    this.publish({ selectedModelConfigId: null, modelDraft: null, compatibleKeys: [], dirty: false, statusMessage: "", fieldErrors: {} })
  }

  dispose(): void {
    this.beginMutation()
    this.lifecycle += 1
    this.listeners.clear()
    this.settings = createDefaultSettings()
    this.state = clone({ operation: "idle", loaded: false, modelSummaries: [], compatibleKeys: [], selectedModelConfigId: null, modelDraft: null, dirty: false, fieldErrors: {}, statusMessage: "", runtimePlatform: "web" })
  }
}
