<script lang="ts">
  import { onDestroy, onMount } from "svelte"
  import {
    createRerankerConfigDraft,
    type RerankerConfig,
    type RerankerConfigSummary,
    type RerankerSettingsController,
    type RerankerSettingsState,
  } from "../index"

  type Props = {
    readonly controller: RerankerSettingsController
  }

  const { controller }: Props = $props()

  let state = $state<RerankerSettingsState | null>(null)
  let editTargetId = $state<RerankerConfig["id"] | null>(null)
  let activeId = $state<RerankerConfig["id"]>(createRerankerConfigDraft().id)
  let draft = $state(draftFor(createRerankerConfigDraft()))
  let unsubscribe: (() => void) | null = null

  type SectionDraft = {
    name: string
    model: string
    credentialId: string
    timeoutMs: string
    topK: string
    returnDocuments: boolean
    truncation: boolean
  }

  function draftFor(config: RerankerConfig): SectionDraft {
    return {
      name: config.name,
      model: config.model,
      credentialId: config.credentialId ?? "",
      timeoutMs: String(config.timeoutMs),
      topK: config.defaults.topK === null ? "" : String(config.defaults.topK),
      returnDocuments: config.defaults.returnDocuments,
      truncation: config.defaults.truncation,
    }
  }

  const parsedTimeout = $derived(Number.parseInt(draft.timeoutMs, 10))
  const parsedTopK = $derived(draft.topK.trim() === "" ? null : Number.parseInt(draft.topK, 10))
  const locked = $derived(
    state === null
    || !state.loaded
    || state.operation === "loading"
    || state.operation === "saving"
    || state.operation === "deleting"
    || state.operation === "testing",
  )
  const testing = $derived(state !== null && state.operation === "testing")
  const canSave = $derived(
    draft.name.trim() !== ""
    && draft.model.trim() !== ""
    && Number.isInteger(parsedTimeout)
    && parsedTimeout >= 1
    && (parsedTopK === null || (Number.isInteger(parsedTopK) && parsedTopK >= 1)),
  )

  function resetEditor(): void {
    const fresh = createRerankerConfigDraft()
    editTargetId = null
    activeId = fresh.id
    draft = draftFor(fresh)
  }

  function startEdit(summary: RerankerConfigSummary): void {
    if (locked) return
    editTargetId = summary.id
    activeId = summary.id
    draft = draftFor(summary)
  }

  function submit(): void {
    if (locked || !canSave) return
    const config: RerankerConfig = {
      id: editTargetId ?? activeId,
      name: draft.name,
      provider: "voyage",
      model: draft.model,
      credentialId: draft.credentialId === "" ? null : draft.credentialId,
      timeoutMs: parsedTimeout,
      defaults: {
        topK: parsedTopK,
        returnDocuments: draft.returnDocuments,
        truncation: draft.truncation,
      },
    }
    // The controller publishes a sanitized status message on either outcome.
    controller.saveConfig(config).then(resetEditor, () => undefined)
  }

  function remove(summary: RerankerConfigSummary): void {
    if (locked) return
    if (window.confirm(`Delete reranker configuration ${summary.name}?`)) {
      if (editTargetId === summary.id) resetEditor()
      controller.deleteConfig(summary.id).catch(() => undefined)
    }
  }

  function statusLabel(status: RerankerConfigSummary["credentialStatus"]): string {
    if (status === "none") return "No credential linked"
    if (status === "stored") return "Stored locally"
    if (status === "stale") return "Stale credential"
    return "Key missing"
  }

  function canTest(summary: RerankerConfigSummary): boolean {
    return !locked
      && summary.credentialStatus !== "none"
      && summary.credentialStatus !== "missing"
      && summary.credentialStatus !== "stale"
  }

  onMount(() => {
    unsubscribe = controller.subscribe(value => { state = value })
    controller.load().catch(() => undefined)
  })

  onDestroy(() => {
    unsubscribe?.()
    unsubscribe = null
    draft = draftFor(createRerankerConfigDraft())
  })
</script>

{#if state}
  <section class="reranker" aria-labelledby="ai-reranker-title">
    <h2 id="ai-reranker-title">Reranker</h2>
    <p class="intro">
      Voyage rerank scoring configurations. Each configuration selects a Voyage model, a shared Voyage
      credential, and defaults for top K, returned documents, and truncation.
    </p>

    <ul class="list" aria-label="Reranker configurations">
      {#if state.configs.length === 0}
        <li class="empty">No reranker configurations saved yet.</li>
      {/if}
      {#each state.configs as summary (summary.id)}
        <li class="row">
          <div class="meta">
            <span class="name">{summary.name}</span>
            <span class="model">Voyage · {summary.model}</span>
            <span class="detail">
              {summary.defaults.topK === null ? "all documents" : `top ${summary.defaults.topK}`}
              · documents {summary.defaults.returnDocuments ? "on" : "off"}
              · truncation {summary.defaults.truncation ? "on" : "off"}
            </span>
            <span class="credential">
              {summary.credentialName === null
                ? statusLabel(summary.credentialStatus)
                : `${summary.credentialName} · ${statusLabel(summary.credentialStatus)}`}
            </span>
          </div>
          <div class="row-actions">
            <button
              type="button"
              aria-label={`Test connection for ${summary.name}`}
              disabled={!canTest(summary)}
              onclick={() => { if (!locked) controller.testConnection(summary.id) }}
            >Test connection</button>
            <button type="button" disabled={locked} onclick={() => startEdit(summary)}>Edit</button>
            <button
              type="button"
              class="danger"
              aria-label={`Delete reranker configuration ${summary.name}`}
              disabled={locked}
              onclick={() => remove(summary)}
            >Delete</button>
          </div>
        </li>
      {/each}
    </ul>

    <form class="editor" novalidate onsubmit={(event) => { event.preventDefault(); submit() }}>
      <h3>{editTargetId === null ? "Add reranker configuration" : "Edit reranker configuration"}</h3>
      <div class="field">
        <label for="ai-reranker-name">Name</label>
        <input id="ai-reranker-name" type="text" autocomplete="off" bind:value={draft.name} disabled={locked} />
      </div>
      <div class="field">
        <label for="ai-reranker-model">Voyage model</label>
        <input
          id="ai-reranker-model"
          type="text"
          autocomplete="off"
          placeholder="rerank-2.5"
          bind:value={draft.model}
          disabled={locked}
        />
      </div>
      <div class="field">
        <label for="ai-reranker-credential">Voyage credential</label>
        <select
          id="ai-reranker-credential"
          value={draft.credentialId}
          disabled={locked}
          onchange={(event) => { draft.credentialId = event.currentTarget.value }}
        >
          <option value="">No credential linked</option>
          {#each state.credentials as credential (credential.id)}
            <option value={credential.id}>
              {credential.name} · {statusLabel(credential.status === "not-required" ? "none" : credential.status)}
            </option>
          {/each}
        </select>
      </div>
      <details class="disclosure">
        <summary>Advanced settings</summary>
        <div class="field">
          <label for="ai-reranker-timeout">Timeout (ms)</label>
          <input
            id="ai-reranker-timeout"
            type="number"
            min="1"
            step="1"
            autocomplete="off"
            bind:value={draft.timeoutMs}
            disabled={locked}
          />
        </div>
        <div class="field">
          <label for="ai-reranker-topk">Default top K</label>
          <input
            id="ai-reranker-topk"
            type="number"
            min="1"
            step="1"
            autocomplete="off"
            placeholder="All documents"
            bind:value={draft.topK}
            disabled={locked}
          />
        </div>
        <div class="field field-checkbox">
          <input
            id="ai-reranker-return-documents"
            type="checkbox"
            checked={draft.returnDocuments}
            disabled={locked}
            onchange={(event) => { draft.returnDocuments = event.currentTarget.checked }}
          />
          <label for="ai-reranker-return-documents">Return documents by default</label>
        </div>
        <div class="field field-checkbox">
          <input
            id="ai-reranker-truncation"
            type="checkbox"
            checked={draft.truncation}
            disabled={locked}
            onchange={(event) => { draft.truncation = event.currentTarget.checked }}
          />
          <label for="ai-reranker-truncation">Truncate inputs to the context limit by default</label>
        </div>
      </details>
      <div class="actions">
        <button type="button" class="primary" disabled={locked || !canSave} onclick={submit}>
          Save configuration
        </button>
        {#if editTargetId !== null}
          <button type="button" disabled={locked} onclick={resetEditor}>Cancel</button>
        {/if}
      </div>
    </form>

    {#if testing}
      <div class="actions">
        <button type="button" onclick={() => controller.cancelTest()}>Cancel test</button>
      </div>
    {/if}

    <p class="status" role="status">{state.statusMessage}</p>
  </section>
{:else}
  <p class="loading">Loading reranker settings…</p>
{/if}

<style>
  .reranker {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
  }

  .reranker h2 {
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

  .list {
    list-style: none;
    margin: 16px 0;
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

  .model {
    font-size: 0.82rem;
    color: #ffce3e;
    font-family: "SFMono-Regular", Menlo, Consolas, monospace;
    overflow-wrap: anywhere;
  }

  .detail {
    font-size: 0.78rem;
    color: #b5b5b5;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .credential {
    font-size: 0.78rem;
    color: #b5b5b5;
    letter-spacing: 0.04em;
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

  .field-checkbox {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }

  .field-checkbox input {
    appearance: none;
    width: 20px;
    height: 20px;
    min-height: 20px;
    border: 1px solid rgba(255, 255, 255, 0.4);
    background: #000000;
    cursor: pointer;
    position: relative;
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .field-checkbox input:checked {
    background: #ffc000;
    border-color: #ffc000;
  }

  .field-checkbox input:checked::after {
    content: "";
    position: absolute;
    inset: 3px;
    background: #000000;
    clip-path: polygon(14% 50%, 0 60%, 38% 100%, 100% 24%, 90% 12%, 38% 78%);
  }

  .field-checkbox input:focus-visible {
    outline: 2px solid #29abe2;
    outline-offset: 2px;
  }

  .field-checkbox label {
    text-transform: none;
    letter-spacing: 0.02em;
    font-size: 0.85rem;
    color: #f5f5f5;
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
