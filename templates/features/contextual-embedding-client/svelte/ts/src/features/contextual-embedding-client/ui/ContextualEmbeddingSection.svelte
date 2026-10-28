<script lang="ts">
  // allow: SIZE_OK - one settings section with list, editor, status, and scoped styles.
  import { onDestroy, onMount } from "svelte"
  import type {
    ContextualEmbeddingConfigDraft,
    ContextualEmbeddingConfigSummary,
    ContextualEmbeddingOutputDtype,
  } from "../core/types"
  import { isLinkedCredentialId } from "../core/types"
  import type {
    ContextualEmbeddingSettingsController,
    ContextualEmbeddingSettingsState,
  } from "../settings/settings-controller"

  type Props = {
    readonly controller: ContextualEmbeddingSettingsController
  }

  const { controller }: Props = $props()

  const DTYPE_OPTIONS: readonly (readonly [ContextualEmbeddingOutputDtype, string])[] = [
    ["float", "Float numbers"],
    ["int8", "int8"],
    ["uint8", "uint8"],
    ["binary", "binary"],
    ["ubinary", "ubinary"],
  ]

  const INPUT_TYPE_OPTIONS: readonly (readonly [string, string])[] = [
    ["", "Default (none)"],
    ["query", "Query"],
    ["document", "Document"],
  ]

  const ENCODING_OPTIONS: readonly (readonly [string, string])[] = [
    ["", "Number array"],
    ["base64", "Base64 string"],
  ]

  let state = $state<ContextualEmbeddingSettingsState | null>(null)
  let unsubscribe: (() => void) | null = null

  const locked = $derived(
    state === null
    || !state.loaded
    || state.operation === "loading"
    || state.operation === "saving"
    || state.operation === "deleting"
    || state.operation === "testing",
  )
  const testing = $derived(state !== null && state.operation === "testing")

  function canTest(summary: ContextualEmbeddingConfigSummary): boolean {
    return !locked
      && summary.credentialStatus !== null
      && summary.credentialStatus !== "missing"
      && summary.credentialStatus !== "stale"
  }

  function editDraft(change: (draft: ContextualEmbeddingConfigDraft) => ContextualEmbeddingConfigDraft): void {
    if (locked || state === null || state.draft === null) return
    controller.updateDraft(change(state.draft))
  }

  function credentialLabel(summary: ContextualEmbeddingConfigSummary): string {
    if (summary.credentialName === null) return "No credential linked"
    const status = summary.credentialStatus === "stored" ? "" : " (key needs attention)"
    return `${summary.credentialName}${status}`
  }

  function remove(summary: ContextualEmbeddingConfigSummary): void {
    if (locked) return
    if (window.confirm(`Delete configuration ${summary.name}?`)) {
      controller.delete(summary.id).catch(() => undefined)
    }
  }

  onMount(() => {
    unsubscribe = controller.subscribe(value => { state = value })
    controller.load().catch(() => undefined)
  })

  onDestroy(() => {
    unsubscribe?.()
    unsubscribe = null
  })
</script>

{#if state}
  <section class="contextual" aria-labelledby="ai-contextual-title">
    <h2 id="ai-contextual-title">Contextual Embedding</h2>
    <p class="intro">
      Saved Voyage configurations for contextualized chunk embeddings. Calls send ordered groups of
      pre-chunked texts; each group's chunk order is preserved in the result.
    </p>
    <p class="note">
      Link a Voyage credential in AI Services Keys; one key can serve embedding, contextual embedding,
      and reranker configurations. Chunking and token budgets stay your responsibility and the API's.
    </p>

    <ul class="list" aria-label="Contextual embedding configurations">
      {#if state.configs.length === 0}
        <li class="empty">No contextual embedding configurations saved yet.</li>
      {/if}
      {#each state.configs as summary (summary.id)}
        <li class="row">
          <div class="meta">
            <span class="name">{summary.name}</span>
            <span class="detail">Voyage · {credentialLabel(summary)}</span>
            <span class="model">
              {summary.model} · {summary.outputDtype}{summary.outputDimension === null ? "" : ` · ${summary.outputDimension}d`}{summary.base64 ? " · base64" : ""}
            </span>
          </div>
          <div class="row-actions">
            <button
              type="button"
              aria-label={`Test connection for ${summary.name}`}
              disabled={!canTest(summary)}
              onclick={() => { if (!locked) controller.testConnection(summary.id) }}
            >Test connection</button>
            <button type="button" disabled={locked} onclick={() => controller.startEdit(summary.id)}>Edit</button>
            <button
              type="button"
              class="danger"
              aria-label={`Delete configuration ${summary.name}`}
              disabled={locked}
              onclick={() => remove(summary)}
            >Delete</button>
          </div>
        </li>
      {/each}
    </ul>

    {#if state.draft === null}
      <div class="actions">
        <button type="button" class="primary" disabled={locked} onclick={() => controller.startCreate()}>
          New configuration
        </button>
      </div>
    {:else}
      <form class="editor" novalidate onsubmit={(event) => { event.preventDefault(); controller.save().catch(() => undefined) }}>
        <h3>{state.editingId === null ? "New configuration" : "Edit configuration"}</h3>
        <div class="field">
          <label for="ai-contextual-name">Name</label>
          <input
            id="ai-contextual-name"
            type="text"
            autocomplete="off"
            placeholder="Production retrieval"
            value={state.draft.name}
            disabled={locked}
            oninput={(event) => editDraft(draft => ({ ...draft, name: event.currentTarget.value }))}
          />
        </div>
        <div class="field">
          <label for="ai-contextual-model">Model</label>
          <input
            id="ai-contextual-model"
            type="text"
            autocomplete="off"
            placeholder="voyage-context-4"
            value={state.draft.model}
            disabled={locked}
            oninput={(event) => editDraft(draft => ({ ...draft, model: event.currentTarget.value }))}
          />
        </div>
        <div class="field">
          <label for="ai-contextual-credential">Voyage credential</label>
          <select
            id="ai-contextual-credential"
            value={state.draft.credentialId ?? ""}
            disabled={locked}
            onchange={(event) => {
              const value = event.currentTarget.value
              editDraft(draft => ({
                ...draft,
                credentialId: isLinkedCredentialId(value) ? value : null,
              }))
            }}
          >
            <option value="">No credential linked</option>
            {#each state.voyageCredentials.filter(entry => entry.provider === "voyage") as credential (credential.id)}
              <option value={credential.id}>{credential.name}</option>
            {/each}
          </select>
        </div>
        <details class="disclosure">
          <summary>Advanced settings</summary>
          <div class="field">
            <label for="ai-contextual-timeout">Timeout (ms)</label>
            <input
              id="ai-contextual-timeout"
              type="number"
              min="1"
              step="1"
              autocomplete="off"
              placeholder="60000"
              value={state.draft.timeoutMs}
              disabled={locked}
              oninput={(event) => {
                const parsed = Number.parseInt(event.currentTarget.value, 10)
                editDraft(draft => ({ ...draft, timeoutMs: event.currentTarget.value.trim() === "" || Number.isNaN(parsed) ? 0 : parsed }))
              }}
            />
          </div>
          <div class="field">
            <label for="ai-contextual-input-type">Input type</label>
            <select
              id="ai-contextual-input-type"
              value={state.draft.inputType ?? ""}
              disabled={locked}
              onchange={(event) => {
                const value = event.currentTarget.value
                editDraft(draft => ({
                  ...draft,
                  inputType: value === "query" || value === "document" ? value : null,
                }))
              }}
            >
              {#each INPUT_TYPE_OPTIONS as [value, label] (value)}
                <option value={value}>{label}</option>
              {/each}
            </select>
          </div>
          <div class="field">
            <label for="ai-contextual-dimension">Output dimension</label>
            <input
              id="ai-contextual-dimension"
              type="number"
              min="1"
              step="1"
              autocomplete="off"
              placeholder="Model default"
              value={state.draft.outputDimension === null ? "" : state.draft.outputDimension}
              disabled={locked}
              oninput={(event) => {
                const raw = event.currentTarget.value.trim()
                const parsed = Number.parseInt(raw, 10)
                editDraft(draft => ({ ...draft, outputDimension: raw === "" || Number.isNaN(parsed) ? null : parsed }))
              }}
            />
          </div>
          <div class="field">
            <label for="ai-contextual-dtype">Output dtype</label>
            <select
              id="ai-contextual-dtype"
              value={state.draft.outputDtype}
              disabled={locked}
              onchange={(event) => {
                const value = event.currentTarget.value
                if (value === "float" || value === "int8" || value === "uint8" || value === "binary" || value === "ubinary") {
                  editDraft(draft => ({ ...draft, outputDtype: value }))
                }
              }}
            >
              {#each DTYPE_OPTIONS as [value, label] (value)}
                <option value={value}>{label}</option>
              {/each}
            </select>
          </div>
          <div class="field">
            <label for="ai-contextual-encoding">Embedding encoding</label>
            <select
              id="ai-contextual-encoding"
              value={state.draft.base64 ? "base64" : ""}
              disabled={locked}
              onchange={(event) => {
                editDraft(draft => ({ ...draft, base64: event.currentTarget.value === "base64" }))
              }}
            >
              {#each ENCODING_OPTIONS as [value, label] (value)}
                <option value={value}>{label}</option>
              {/each}
            </select>
          </div>
        </details>
        <div class="actions">
          <button type="button" class="primary" disabled={locked} onclick={() => controller.save().catch(() => undefined)}>
            {state.editingId === null ? "Save configuration" : "Update configuration"}
          </button>
          <button type="button" disabled={locked} onclick={() => controller.cancelEdit()}>Cancel</button>
        </div>
      </form>
    {/if}

    {#if testing}
      <div class="actions">
        <button type="button" onclick={() => controller.cancelTest()}>Cancel test</button>
      </div>
    {/if}

    <p class="status" role="status">{state.statusMessage}</p>
  </section>
{:else}
  <p class="loading">Loading contextual embedding settings…</p>
{/if}

<style>
  .contextual {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
  }

  .contextual h2 {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 400;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #ffffff;
  }

  .intro {
    margin: 8px 0 0;
    color: #b5b5b5;
    font-size: 0.82rem;
    line-height: 1.5;
  }

  .note {
    margin: 16px 0;
    padding: 8px 12px;
    border-inline-start: 4px solid #ffc000;
    background: #181818;
    color: #f5f5f5;
    font-size: 0.78rem;
    line-height: 1.4;
  }

  .list {
    list-style: none;
    margin: 0 0 16px;
    padding: 0;
    display: grid;
    gap: 8px;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: stretch;
    gap: 8px;
    border: 1px solid #313131;
    background: #000000;
    padding: 12px 14px;
  }

  .meta {
    flex: 1 1 240px;
    display: grid;
    gap: 4px;
  }

  .name {
    font-size: 0.92rem;
    letter-spacing: 0.04em;
  }

  .detail {
    font-size: 0.78rem;
    color: #b5b5b5;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .model {
    font-size: 0.82rem;
    color: #ffce3e;
    font-family: "SFMono-Regular", Menlo, Consolas, monospace;
    overflow-wrap: anywhere;
  }

  .empty {
    border: 1px dashed #313131;
    padding: 16px;
    color: #7d7d7d;
    font-size: 0.85rem;
    letter-spacing: 0.04em;
  }

  .row-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .row-actions button,
  .actions button {
    min-height: 34px;
    border: 1px solid rgba(255, 255, 255, 0.5);
    border-radius: 0;
    padding: 7px 16px;
    background: transparent;
    color: #ffffff;
    cursor: pointer;
    font: inherit;
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  }

  .row-actions button:hover:not(:disabled),
  .actions button:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
    border-color: #ffffff;
  }

  .actions button.primary {
    border-color: #ffc000;
    background: #ffc000;
    color: #000000;
    font-weight: 700;
  }

  .actions button.primary:hover:not(:disabled) {
    background: #917300;
    border-color: #917300;
    color: #ffffff;
  }

  .row-actions button.danger:hover:not(:disabled) {
    border-color: #ff5a5a;
    color: #ff5a5a;
    background: rgba(255, 90, 90, 0.08);
  }

  .row-actions button:disabled,
  .actions button:disabled {
    cursor: wait;
    opacity: 0.4;
  }

  .row-actions button:focus-visible,
  .actions button:focus-visible {
    outline: 2px solid #29abe2;
    outline-offset: 2px;
  }

  .editor {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px 16px;
    padding: 16px;
    border: 1px solid #313131;
    background: #181818;
  }

  .editor h3 {
    grid-column: 1 / -1;
    margin: 0;
    font-size: 0.95rem;
    font-weight: 400;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #ffffff;
  }

  .field {
    display: grid;
    gap: 6px;
    align-content: start;
    min-width: 0;
  }

  .field label {
    font-weight: 400;
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #ffffff;
  }

  .field input,
  .field select {
    box-sizing: border-box;
    width: 100%;
    min-height: 40px;
    border: 1px solid #313131;
    border-radius: 0;
    padding: 8px 10px;
    background: #000000;
    color: #ffffff;
    font: inherit;
    font-size: 0.88rem;
  }

  .field input:focus-visible,
  .field select:focus-visible {
    outline: 2px solid #29abe2;
    outline-offset: 1px;
  }

  .field input:disabled,
  .field select:disabled {
    cursor: wait;
    opacity: 0.4;
  }

  .disclosure {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px 16px;
    padding: 12px 16px;
    border: 1px solid #313131;
    background: #000000;
  }

  .disclosure summary {
    grid-column: 1 / -1;
    cursor: pointer;
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #ffffff;
  }

  .disclosure summary:focus-visible {
    outline: 2px solid #29abe2;
    outline-offset: 2px;
  }

  .actions {
    grid-column: 1 / -1;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .status {
    margin: 12px 0 0;
    color: #f5f5f5;
    font-size: 0.88rem;
    letter-spacing: 0.02em;
    overflow-wrap: anywhere;
  }

  .loading {
    margin: 0;
    color: #7d7d7d;
    font-size: 0.85rem;
    letter-spacing: 0.04em;
  }

  @media (max-width: 680px) {
    .editor {
      grid-template-columns: minmax(0, 1fr);
      padding: 12px;
    }

    .disclosure {
      grid-template-columns: minmax(0, 1fr);
    }

    .row {
      flex-direction: column;
    }
  }
</style>
