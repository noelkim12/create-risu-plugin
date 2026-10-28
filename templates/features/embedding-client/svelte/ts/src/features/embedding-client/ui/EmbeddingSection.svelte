<script lang="ts">
  import { onDestroy, onMount } from "svelte"
  import {
    type RetrievalProviderAuthMode,
  } from "../../ai-services"
  import { isCredentialId, type CredentialSummary } from "../../credential-manager"
  import type {
    EmbeddingConfigDraft,
    EmbeddingConfigId,
    EmbeddingProviderId,
    VoyageOutputDtype,
  } from "../core/types"
  import type { EmbeddingConfigSummary } from "../settings/config-drafts"
  import type {
    EmbeddingControllerState,
    EmbeddingSettingsController,
  } from "../settings/embedding-controller"

  type Props = {
    readonly controller: EmbeddingSettingsController
  }

  const { controller }: Props = $props()

  const PROVIDER_LABELS: Readonly<Record<EmbeddingProviderId, string>> = {
    voyage: "Voyage",
    "openai-compatible": "OpenAI-compatible",
  }

  const AUTH_MODE_LABELS: Readonly<Record<RetrievalProviderAuthMode, string>> = {
    bearer: "API key (Bearer)",
    none: "No authentication",
  }

  const INPUT_TYPE_OPTIONS = [
    { value: "", label: "Not set" },
    { value: "query", label: "Query" },
    { value: "document", label: "Document" },
  ] as const

  const DTYPE_OPTIONS = [
    { value: "float", label: "float (32-bit)" },
    { value: "int8", label: "int8" },
    { value: "uint8", label: "uint8" },
    { value: "binary", label: "binary" },
    { value: "ubinary", label: "ubinary" },
  ] as const satisfies readonly { readonly value: VoyageOutputDtype; readonly label: string }[]

  const ENCODING_OPTIONS = [
    { value: "float", label: "float (number arrays)" },
    { value: "base64", label: "base64 (encoded strings)" },
  ] as const

  let state = $state<EmbeddingControllerState | null>(null)
  let draft = $state<EmbeddingConfigDraft | null>(null)
  let editingId = $state<EmbeddingConfigId | null>(null)
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
  const authRequired = $derived(
    draft !== null && (draft.provider === "voyage" || draft.authMode === "bearer"),
  )
  const compatibleCredentials = $derived.by<readonly CredentialSummary[]>(() => {
    if (draft === null || state === null) return []
    if (draft.provider === "voyage") {
      return state.credentials.filter(credential => credential.provider === "voyage" && credential.authMode === "bearer")
    }
    return state.credentials.filter(credential =>
      credential.provider === "openai-compatible"
      && credential.authMode === "bearer"
      && draft.authMode === "bearer"
      && credential.audience === draft.endpoint.trim(),
    )
  })
  const canSave = $derived(
    draft !== null
    && draft.name.trim() !== ""
    && draft.modelId.trim() !== ""
    && (draft.provider === "voyage" || draft.endpoint.trim() !== "")
    && (!authRequired || draft.credentialId !== null),
  )

  function startCreate(): void {
    if (locked) return
    draft = controller.beginCreate()
    editingId = null
  }

  function startEdit(summary: EmbeddingConfigSummary): void {
    if (locked) return
    const next = controller.beginEdit(summary.id)
    if (next === null) return
    draft = next
    editingId = summary.id
  }

  function cancelEditor(): void {
    draft = null
    editingId = null
  }

  function submit(): void {
    if (locked || draft === null || !canSave) return
    controller
      .saveDraft(draft, { editingId })
      .then(cancelEditor, () => undefined)
  }

  function remove(summary: EmbeddingConfigSummary): void {
    if (locked) return
    if (window.confirm(`Delete embedding configuration ${summary.name}?`)) {
      controller.deleteConfig(summary.id).catch(() => undefined)
    }
  }

  function statusLabel(summary: EmbeddingConfigSummary): string {
    if (summary.credentialStatus === "not-required") return "No key required"
    if (summary.credentialStatus === "linked") return `Key: ${summary.credentialName ?? "stored"}`
    if (summary.credentialStatus === "stale") return "Stale credential"
    if (summary.credentialStatus === "missing") return `Key missing: ${summary.credentialName ?? "linked"}`
    return "Credential required"
  }

  function canTest(summary: EmbeddingConfigSummary): boolean {
    return !locked
      && summary.credentialStatus !== "unlinked"
      && summary.credentialStatus !== "missing"
      && summary.credentialStatus !== "stale"
  }

  function setProvider(value: string): void {
    if (draft === null) return
    if (value !== "voyage" && value !== "openai-compatible") return
    draft = {
      ...draft,
      provider: value,
      authMode: value === "voyage" ? "bearer" : "none",
      credentialId: null,
      encodingFormat: "float",
    }
  }

  function setAuthMode(value: string): void {
    if (draft === null) return
    if (value !== "bearer" && value !== "none") return
    draft = { ...draft, authMode: value, credentialId: value === "none" ? null : draft.credentialId }
  }

  function setCredential(value: string): void {
    if (draft === null) return
    draft = { ...draft, credentialId: isCredentialId(value) ? value : null }
  }

  function setInputType(value: string): void {
    if (draft === null) return
    draft = {
      ...draft,
      inputType: value === "query" || value === "document" ? value : null,
    }
  }

  function setDtype(value: string): void {
    if (draft === null) return
    const next = DTYPE_OPTIONS.find(entry => entry.value === value)
    if (next !== undefined) draft = { ...draft, outputDtype: next.value }
  }

  function setEncoding(value: string): void {
    if (draft === null) return
    if (value === "float" || value === "base64") draft = { ...draft, encodingFormat: value }
  }

  onMount(() => {
    unsubscribe = controller.subscribe(value => { state = value })
    controller.load().catch(() => undefined)
  })

  onDestroy(() => {
    unsubscribe?.()
    unsubscribe = null
    draft = null
    editingId = null
  })
</script>

{#if state}
  <section class="embedding" aria-labelledby="ai-embedding-title">
    <h2 id="ai-embedding-title">Embedding</h2>
    <p class="intro">
      Saved text embedding configurations. Voyage uses its fixed embeddings endpoint;
      OpenAI-compatible configurations call the exact endpoint URL you save.
    </p>

    <ul class="list" aria-label="Embedding configurations">
      {#if state.configs.length === 0}
        <li class="empty">No embedding configurations saved yet.</li>
      {/if}
      {#each state.configs as summary (summary.id)}
        <li class="row">
          <div class="meta">
            <span class="name">{summary.name}</span>
            <span class="detail">
              {PROVIDER_LABELS[summary.provider]} · {summary.modelId} · {statusLabel(summary)}
            </span>
            {#if summary.endpoint !== null}
              <span class="endpoint">{summary.endpoint}</span>
            {/if}
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
              aria-label={`Delete embedding configuration ${summary.name}`}
              disabled={locked}
              onclick={() => remove(summary)}
            >Delete</button>
          </div>
        </li>
      {/each}
    </ul>

    {#if draft === null}
      <div class="actions">
        <button type="button" class="primary" disabled={locked} onclick={startCreate}>
          New embedding configuration
        </button>
      </div>
    {:else}
      <form class="editor" novalidate onsubmit={(event) => { event.preventDefault(); submit() }}>
        <h3>{editingId === null ? "Add embedding configuration" : "Edit embedding configuration"}</h3>
        <div class="field">
          <label for="ai-embedding-provider">Provider</label>
          <select
            id="ai-embedding-provider"
            value={draft.provider}
            disabled={locked || editingId !== null}
            onchange={(event) => setProvider(event.currentTarget.value)}
          >
            {#each Object.entries(PROVIDER_LABELS) as [value, label] (value)}
              <option value={value}>{label}</option>
            {/each}
          </select>
        </div>
        <div class="field">
          <label for="ai-embedding-name">Name</label>
          <input id="ai-embedding-name" type="text" autocomplete="off" bind:value={draft.name} disabled={locked} />
        </div>
        <div class="field">
          <label for="ai-embedding-model">Model ID</label>
          <input id="ai-embedding-model" type="text" autocomplete="off" bind:value={draft.modelId} disabled={locked} />
        </div>
        {#if draft.provider !== "voyage"}
          <div class="field">
            <label for="ai-embedding-endpoint">Exact endpoint URL</label>
            <input
              id="ai-embedding-endpoint"
              type="text"
              autocomplete="off"
              placeholder="https://example.com/v1/embeddings"
              value={draft.endpoint}
              disabled={locked || editingId !== null}
              oninput={(event) => { draft = { ...draft, endpoint: event.currentTarget.value, credentialId: null } }}
            />
          </div>
          <div class="field">
            <label for="ai-embedding-auth">Authentication</label>
            <select
              id="ai-embedding-auth"
              value={draft.authMode}
              disabled={locked}
              onchange={(event) => setAuthMode(event.currentTarget.value)}
            >
              {#each Object.entries(AUTH_MODE_LABELS) as [value, label] (value)}
                <option value={value}>{label}</option>
              {/each}
            </select>
          </div>
        {/if}
        {#if authRequired}
          <div class="field">
            <label for="ai-embedding-credential">API key linkage</label>
            <select
              id="ai-embedding-credential"
              value={draft.credentialId ?? ""}
              disabled={locked}
              onchange={(event) => setCredential(event.currentTarget.value)}
            >
              <option value="">None (link later)</option>
              {#each compatibleCredentials as credential (credential.id)}
                <option value={credential.id}>{credential.name} ({credential.audience})</option>
              {/each}
            </select>
          </div>
          <p class="key-note">Manage keys in AI Services Keys, then select a compatible key.</p>
        {/if}
        <details class="disclosure">
          <summary>Advanced settings</summary>
          {#if draft.provider === "voyage"}
            <div class="field">
              <label for="ai-embedding-input-type">Default input type</label>
              <select
                id="ai-embedding-input-type"
                value={draft.inputType ?? ""}
                disabled={locked}
                onchange={(event) => setInputType(event.currentTarget.value)}
              >
                {#each INPUT_TYPE_OPTIONS as entry (entry.value)}
                  <option value={entry.value}>{entry.label}</option>
                {/each}
              </select>
            </div>
            <div class="field">
              <label for="ai-embedding-truncation">Truncate long inputs</label>
              <input
                id="ai-embedding-truncation"
                type="checkbox"
                checked={draft.truncation}
                disabled={locked}
                onchange={(event) => { draft = { ...draft, truncation: event.currentTarget.checked } }}
              />
            </div>
            <div class="field">
              <label for="ai-embedding-dimension">Output dimension (optional)</label>
              <input
                id="ai-embedding-dimension"
                type="number"
                min="1"
                value={draft.outputDimension === null ? "" : draft.outputDimension}
                disabled={locked}
                oninput={(event) => {
                  const parsed = Number(event.currentTarget.value)
                  draft = {
                    ...draft,
                    outputDimension: event.currentTarget.value === "" || !Number.isFinite(parsed) ? null : parsed,
                  }
                }}
              />
            </div>
            <div class="field">
              <label for="ai-embedding-dtype">Output dtype</label>
              <select
                id="ai-embedding-dtype"
                value={draft.outputDtype}
                disabled={locked}
                onchange={(event) => setDtype(event.currentTarget.value)}
              >
                {#each DTYPE_OPTIONS as entry (entry.value)}
                  <option value={entry.value}>{entry.label}</option>
                {/each}
              </select>
            </div>
          {:else}
            <div class="field">
              <label for="ai-embedding-dimensions">Dimensions (optional)</label>
              <input
                id="ai-embedding-dimensions"
                type="number"
                min="1"
                value={draft.dimensions === null ? "" : draft.dimensions}
                disabled={locked}
                oninput={(event) => {
                  const parsed = Number(event.currentTarget.value)
                  draft = {
                    ...draft,
                    dimensions: event.currentTarget.value === "" || !Number.isFinite(parsed) ? null : parsed,
                  }
                }}
              />
            </div>
          {/if}
          <div class="field">
            <label for="ai-embedding-encoding">Embedding encoding</label>
            <select
              id="ai-embedding-encoding"
              value={draft.encodingFormat}
              disabled={locked}
              onchange={(event) => setEncoding(event.currentTarget.value)}
            >
              {#each ENCODING_OPTIONS as entry (entry.value)}
                <option value={entry.value}>{entry.label}</option>
              {/each}
            </select>
          </div>
          <div class="field">
            <label for="ai-embedding-timeout">Timeout (ms)</label>
            <input
              id="ai-embedding-timeout"
              type="number"
              min="1"
              max="3600000"
              value={draft.timeoutMs}
              disabled={locked}
              oninput={(event) => {
                const parsed = Number(event.currentTarget.value)
                draft = { ...draft, timeoutMs: Number.isFinite(parsed) ? parsed : 0 }
              }}
            />
          </div>
        </details>
        <div class="actions">
          <button type="button" class="primary" disabled={locked || !canSave} onclick={submit}>
            {editingId === null ? "Save configuration" : "Save changes"}
          </button>
          <button type="button" disabled={locked} onclick={cancelEditor}>Cancel</button>
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
  <p class="loading">Loading embedding settings...</p>
{/if}

<style>
  .embedding {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
  }

  .embedding h2 {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 400;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #ffffff;
  }

  .intro {
    margin: 8px 0 16px;
    color: #b5b5b5;
    font-size: 0.82rem;
    line-height: 1.5;
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

  .endpoint {
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

  .field input[type="checkbox"] {
    width: 20px;
    min-height: 20px;
    height: 20px;
    accent-color: #ffc000;
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
