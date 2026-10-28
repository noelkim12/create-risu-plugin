<script lang="ts">
  import { onDestroy, onMount } from "svelte"
  import { isCredentialId } from "../../credential-manager/core/validation"
  import { MODEL_FLAGS } from "../core/types"
  import type {
    ModelFlag,
    ProviderId,
    ProviderReasoning,
    ReasoningEffort,
    SavedModelConfig,
    SavedModelConfigId,
  } from "../core/types"
  import { isLocalNetworkUrl } from "../network/url-policy"
  import type {
    LlmSettingsController,
    SettingsOperation,
    SettingsState,
  } from "../settings/settings-controller"

  type Props = { readonly controller: LlmSettingsController }

  const { controller }: Props = $props()
  const PROVIDER_LABELS: Readonly<Record<ProviderId, string>> = {
    "google-ai-studio": "Google AI Studio",
    "google-vertex": "Google Vertex",
    "openai-compatible": "OpenAI-compatible",
    ollama: "Ollama",
    deepseek: "DeepSeek",
  }
  const REASONING_LEVELS: readonly ReasoningEffort[] = ["minimal", "low", "medium", "high"]
  const LOCKED_OPERATIONS: readonly SettingsOperation[] = ["loading", "saving", "deleting", "testing"]
  const NUMBER_PARAMS = ["maxTokens", "temperature", "topP", "topK", "thinkingTokens"] as const

  let state = $state<SettingsState | null>(null)
  let modelProvider = $state<ProviderId>("google-ai-studio")
  let unsubscribe: (() => void) | null = null

  function readValue(event: Event): string {
    return (event.currentTarget as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value
  }

  function isLocked(value: SettingsState | null = state): boolean {
    return value === null || !value.loaded || LOCKED_OPERATIONS.includes(value.operation)
  }

  function reasoningSummary(reasoning: ProviderReasoning): string {
    if (reasoning.provider === "google-ai-studio" || reasoning.provider === "google-vertex") {
      return reasoning.level === null ? "thinking off" : `thinking ${reasoning.level}`
    }
    if (reasoning.provider === "openai-compatible") return reasoning.effort === null ? "effort none" : `effort ${reasoning.effort}`
    return reasoning.enabled ? "reasoning on" : "reasoning off"
  }

  function numberOrUndefined(value: string): number | undefined {
    const trimmed = value.trim()
    if (trimmed === "") return undefined
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  function updateModel(patch: Partial<SavedModelConfig>): void {
    if (isLocked() || state?.modelDraft === null) return
    controller.updateModelDraft({ ...$state.snapshot(state.modelDraft), ...patch } as SavedModelConfig)
  }

  function onModelProvider(event: Event): void {
    if (isLocked()) return
    modelProvider = readValue(event) as ProviderId
    controller.createModel(modelProvider)
  }

  function onModelKey(event: Event): void {
    const value = readValue(event)
    if (value === "none" || isCredentialId(value)) void controller.linkModelKey(value === "none" ? null : value)
  }

  function onModelAuthMode(event: Event): void {
    const draft = state?.modelDraft
    if (draft?.provider === "openai-compatible" || draft?.provider === "ollama") {
      updateModel({ authMode: readValue(event) as "bearer" | "none", keyId: null })
    }
  }

  function onFlag(flag: ModelFlag, event: Event): void {
    const draft = state?.modelDraft
    if (isLocked() || draft === null || draft === undefined) return
    const checked = (event.currentTarget as HTMLInputElement).checked
    updateModel({ flags: checked ? [...draft.flags, flag] : draft.flags.filter(item => item !== flag) })
  }

  function onModelNumber(parameter: (typeof NUMBER_PARAMS)[number], event: Event): void {
    updateModel({ [parameter]: numberOrUndefined(readValue(event)) } as Partial<SavedModelConfig>)
  }

  function onReasoning(event: Event): void {
    const draft = state?.modelDraft
    if (isLocked() || draft === null || draft === undefined) return
    const value = readValue(event)
    const reasoning = draft.reasoning
    if (reasoning.provider === "google-ai-studio" || reasoning.provider === "google-vertex") {
      updateModel({ reasoning: { ...reasoning, level: value === "null" ? null : value as ReasoningEffort } })
    } else if (reasoning.provider === "openai-compatible") {
      updateModel({ reasoning: { ...reasoning, effort: value === "null" ? null : value as ReasoningEffort } })
    } else {
      updateModel({ reasoning: { ...reasoning, enabled: value === "enabled" } })
    }
  }

  function reasoningValue(): string {
    const reasoning = state?.modelDraft?.reasoning
    if (reasoning?.provider === "openai-compatible") return reasoning.effort ?? "null"
    if (reasoning?.provider === "google-ai-studio" || reasoning?.provider === "google-vertex") return reasoning.level ?? "null"
    return reasoning?.enabled ? "enabled" : "disabled"
  }

  function reasoningUsesLevel(): boolean {
    const provider = state?.modelDraft?.reasoning.provider
    return provider === "google-ai-studio" || provider === "google-vertex" || provider === "openai-compatible"
  }

  function addModel(): void { if (!isLocked()) controller.createModel(modelProvider) }
  function selectModel(id: SavedModelConfigId): void { if (!isLocked()) controller.selectModelConfig(id) }
  function saveModel(): void { if (!isLocked()) void controller.saveModel() }
  function deleteModel(id: SavedModelConfigId, name: string): void {
    if (!isLocked() && window.confirm(`Delete saved model ${name}?`)) void controller.deleteModel(id, true)
  }
  function closeEditor(): void { if (!isLocked()) controller.closeEditor() }
  function testConnection(): void { if (!isLocked()) void controller.testConnection() }
  function cancelTest(): void { if (state?.operation === "testing") controller.cancelTest() }

  onMount(() => {
    unsubscribe = controller.subscribe(value => { state = value })
    void controller.load()
  })

  onDestroy(() => {
    unsubscribe?.()
    controller.dispose()
  })
</script>

{#if state}
  <div class="llm-section">
    <p class="storage-warning">Manage saved credentials in AI Services Keys. LLM settings store model configurations only.</p>
    <section class="catalog-section" aria-labelledby="llm-models-heading">
      <header class="catalog-header">
        <h2 id="llm-models-heading">Model Configurations</h2>
        <button class="btn-primary" type="button" disabled={isLocked(state)} onclick={addModel}>Add model</button>
      </header>
      <ul class="catalog-list" aria-label="Saved model configurations">
        {#if state.modelSummaries.length === 0}
          <li class="catalog-empty">No model configurations saved yet.</li>
        {:else}
          {#each state.modelSummaries as summary (summary.id)}
            <li class="catalog-row">
              <button class="catalog-select" class:catalog-select-active={state.selectedModelConfigId === summary.id}
                aria-current={String(state.selectedModelConfigId === summary.id)} disabled={isLocked(state)}
                onclick={() => selectModel(summary.id)}>
                <span class="catalog-name">{PROVIDER_LABELS[summary.provider]} · {summary.name}</span>
                <span class="catalog-meta">model: {summary.model}</span>
                <span class="catalog-mask">{reasoningSummary(summary.reasoning)}</span>
              </button>
              <button class="btn-danger" type="button" disabled={isLocked(state)} onclick={() => deleteModel(summary.id, summary.name)}>Delete</button>
            </li>
          {/each}
        {/if}
      </ul>

      {#if state.modelDraft}
        {@const draft = state.modelDraft}
        {@const isNew = !state.modelSummaries.some(summary => summary.id === draft.id)}
        <form class="editor" novalidate onsubmit={(event) => { event.preventDefault(); saveModel() }}>
          <h3>{isNew ? "Add model" : "Edit model"}</h3>
          {#if isNew}
            <div class="field"><label for="llm-new-model-provider">Provider</label>
              <select id="llm-new-model-provider" value={draft.provider} disabled={isLocked(state)} onchange={onModelProvider}>
                {#each Object.entries(PROVIDER_LABELS) as [value, label]}<option value={value}>{label}</option>{/each}
              </select>
            </div>
          {/if}
          <div class="field"><label for="llm-model-name">Name</label>
            <input id="llm-model-name" value={draft.name} disabled={isLocked(state)} oninput={(event) => updateModel({ name: readValue(event) })} />
            <p class="error">{state.fieldErrors.name ?? ""}</p>
          </div>
          <div class="field"><label for="llm-model-id">Model ID</label>
            <input id="llm-model-id" value={draft.modelId} disabled={isLocked(state)} oninput={(event) => updateModel({ modelId: readValue(event) })} />
            <p class="error">{state.fieldErrors.modelId ?? ""}</p>
          </div>
          {#if draft.provider === "openai-compatible" || draft.provider === "ollama" || draft.provider === "deepseek"}
            <div class="field"><label for="llm-model-base-url">Base URL</label>
              <input id="llm-model-base-url" value={draft.baseUrl} disabled={isLocked(state) || draft.provider === "deepseek"} oninput={(event) => updateModel({ baseUrl: readValue(event) })} />
              <p class="error">{state.fieldErrors.baseUrl ?? ""}</p>
            </div>
            {#if draft.provider === "openai-compatible" || draft.provider === "ollama"}
              <div class="field"><label for="llm-model-auth-mode">Authentication</label>
                <select id="llm-model-auth-mode" value={draft.authMode} disabled={isLocked(state)} onchange={onModelAuthMode}>
                  <option value="bearer">Bearer</option><option value="none">None</option>
                </select>
              </div>
            {/if}
            {#if draft.provider !== "deepseek" && state.runtimePlatform === "web" && isLocalNetworkUrl(draft.baseUrl)}
              <p class="error">Hosted web cannot reach this local endpoint. Use Risu desktop/Tauri or self-hosted Node.</p>
            {/if}
          {/if}
          <div class="field"><label for="llm-model-key">Linked key</label>
            <select id="llm-model-key" value={draft.keyId ?? "none"} disabled={isLocked(state)} onchange={onModelKey}>
              <option value="none">(none)</option>
              {#each state.compatibleKeys as key (key.id)}<option value={key.id}>{key.name}</option>{/each}
            </select>
            <p class="error">{state.fieldErrors.keyId ?? ""}</p>
          </div>
          {#if draft.provider === "google-vertex"}
            <p class="help">Project ID and location come from the linked Service Account key.</p>
          {/if}
          <div class="field"><label for="llm-model-timeout">Timeout (ms)</label>
            <input id="llm-model-timeout" type="number" value={draft.timeoutMs} disabled={isLocked(state)} oninput={(event) => updateModel({ timeoutMs: Number(readValue(event)) || 0 })} />
          </div>
          {#each NUMBER_PARAMS as parameter (parameter)}
            <div class="field"><label for={`llm-model-${parameter}`}>{parameter}</label>
              <input id={`llm-model-${parameter}`} type="number" value={draft[parameter] ?? ""} disabled={isLocked(state)}
                oninput={(event) => onModelNumber(parameter, event)} />
            </div>
          {/each}
          <div class="field"><label for="llm-model-reasoning">Reasoning</label>
            <select id="llm-model-reasoning" value={reasoningValue()} disabled={isLocked(state)} onchange={onReasoning}>
              {#if reasoningUsesLevel()}
                <option value="null">off</option>
                {#each REASONING_LEVELS as level}<option value={level}>{level}</option>{/each}
              {:else}
                <option value="disabled">disabled</option><option value="enabled">enabled</option>
              {/if}
            </select>
          </div>
          <fieldset class="flags"><legend>Capability flags</legend>
            {#each MODEL_FLAGS as flag (flag)}
              <label><input type="checkbox" checked={draft.flags.includes(flag)} disabled={isLocked(state)} onchange={(event) => onFlag(flag, event)} />{flag}</label>
            {/each}
          </fieldset>
          <div class="field field-wide"><label for="llm-model-additional-json">Additional JSON</label>
            <textarea id="llm-model-additional-json" rows="5" value={draft.additionalJson} disabled={isLocked(state)} oninput={(event) => updateModel({ additionalJson: readValue(event) })}></textarea>
          </div>
          <div class="editor-actions">
            <button class="btn-primary" type="button" disabled={isLocked(state)} onclick={saveModel}>Save model</button>
            <button class="btn-danger" type="button" disabled={isLocked(state)} onclick={() => deleteModel(draft.id, draft.name)}>Delete model</button>
            <button type="button" disabled={isLocked(state)} onclick={closeEditor}>Close editor</button>
          </div>
        </form>
      {/if}
    </section>
    <div class="actions">
      <button type="button" disabled={isLocked(state) || state.selectedModelConfigId === null} onclick={testConnection}>Test connection</button>
      <button type="button" hidden={state.operation !== "testing"} disabled={state.operation !== "testing"} onclick={cancelTest}>Cancel test</button>
    </div>
    <p class:error={state.operation === "error"} role={state.operation === "error" ? "alert" : "status"} aria-live="polite">{state.statusMessage}</p>
  </div>
{/if}

<style>
  .llm-section { min-width: 0; color: #fff; }
  .storage-warning { margin: 8px 0 16px; padding: 8px 12px; border-inline-start: 4px solid #ffc000; background: #181818; }
  .catalog-section { padding-block-end: 16px; }
  .catalog-header, .catalog-row, .editor-actions, .actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .catalog-header { justify-content: space-between; margin-block-end: 16px; }
  .catalog-header h2 { margin: 0; font-size: 1rem; letter-spacing: .14em; text-transform: uppercase; }
  .catalog-list { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
  .catalog-select { flex: 1; display: grid; gap: 4px; min-height: 64px; border: 1px solid #313131; padding: 12px 14px; background: #000; color: #fff; text-align: start; }
  .catalog-select-active { border-color: #ffc000; background: #18120a; }
  .catalog-name { font-size: .92rem; }
  .catalog-meta { color: #b5b5b5; font-size: .78rem; text-transform: uppercase; }
  .catalog-mask { color: #ffce3e; font-family: monospace; }
  .catalog-empty { border: 1px dashed #313131; padding: 16px; color: #7d7d7d; }
  .editor { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 16px; margin-block-start: 12px; border: 1px solid #313131; padding: 16px; background: #181818; }
  .editor > h3, .editor > p, .editor > fieldset, .editor > .field-wide, .editor > .editor-actions { grid-column: 1 / -1; }
  .field { display: grid; gap: 6px; min-width: 0; }
  .field label, .flags legend { font-size: .75rem; letter-spacing: .1em; text-transform: uppercase; }
  .field input, .field select, .field textarea { box-sizing: border-box; width: 100%; min-height: 40px; border: 1px solid #313131; padding: 9px 12px; background: #000; color: #fff; }
  .flags { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; border: 1px solid #313131; padding: 16px; }
  .flags label { display: flex; gap: 8px; align-items: center; }
  button { min-height: 34px; border: 1px solid rgba(255,255,255,.5); padding: 7px 16px; background: transparent; color: #fff; text-transform: uppercase; }
  button:disabled { opacity: .4; }
  .btn-primary { border-color: #ffc000; background: #ffc000; color: #000; font-weight: 700; }
  .btn-danger:hover:not(:disabled) { border-color: #ff5a5a; color: #ff5a5a; }
  .help { color: #7d7d7d; }
  .error { color: #ff5a5a; }
  .actions { margin-block-start: 20px; }
  @media (max-width: 680px) { .editor { grid-template-columns: 1fr; } .catalog-row { flex-direction: column; } }
</style>
