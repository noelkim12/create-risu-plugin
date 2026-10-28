<script lang="ts">
  // allow: SIZE_OK — the per-framework Keys panel co-locates list/editor/reveal/delete-confirm UX.
  import { onDestroy, onMount } from "svelte"
  import { AiServiceError, parseVertexServiceAccountJson } from "../../ai-services"
  import type { CredentialManagerController } from "../settings/credential-manager-controller"
  import type {
    ApiKeySecret,
    CredentialControllerState,
    CredentialDraft,
    CredentialId,
    CredentialKind,
    CredentialProviderId,
    CredentialSummary,
    ResolvedCredential,
    VertexServiceAccountSecret,
  } from "../core/types"

  type Props = {
    readonly controller: CredentialManagerController
  }

  const { controller }: Props = $props()

  const PROVIDER_LABELS: Readonly<Record<CredentialProviderId, string>> = {
    "google-ai-studio": "Google AI Studio",
    "google-vertex": "Google Vertex",
    "openai-compatible": "OpenAI-compatible",
    ollama: "Ollama",
    deepseek: "DeepSeek",
    voyage: "Voyage",
  }
  const KIND_LABELS: Readonly<Record<CredentialKind, string>> = {
    "api-key": "API key",
    "vertex-service-account": "Service Account JSON",
    none: "No authentication",
  }
  const API_KEY_AUTH_LABELS: Readonly<Record<"api-key" | "bearer", string>> = {
    "api-key": "API key header",
    bearer: "Bearer token",
  }
  const LOCKED_OPERATIONS: readonly CredentialControllerState["operation"][] = [
    "loading", "saving", "revealing", "deleting",
  ]

  let state = $state<CredentialControllerState | null>(null)
  let draft = $state<CredentialDraft | null>(null)
  let editingId = $state<CredentialId | null>(null)
  // Transient secret inputs and reveal output stay in this component; they never
  // enter controller state and are cleared on every editor transition.
  let apiKey = $state("")
  let serviceAccountJson = $state("")
  let revealed = $state<ResolvedCredential | null>(null)
  let hideReveal = $state(false)
  let editorError = $state("")
  let unsubscribe: (() => void) | null = null

  const locked = $derived(state === null || !state.loaded || LOCKED_OPERATIONS.includes(state.operation))
  const editingSummary = $derived(
    editingId === null ? null : state?.credentials.find(summary => summary.id === editingId) ?? null,
  )
  const canSave = $derived(draft !== null && draft.name.trim() !== "" && (
    draft.kind === "none"
    || (draft.kind === "api-key"
      ? draft.audience.trim() !== "" && (editingId !== null || apiKey.trim() !== "")
      : editingId !== null || serviceAccountJson.trim() !== "")
  ))

  function readValue(event: Event): string {
    return (event.currentTarget as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value
  }

  function statusLabel(summary: CredentialSummary): string {
    if (summary.status === "not-required") return "No key required"
    if (summary.status === "stored") return "Stored locally"
    if (summary.status === "stale") return "Stale credential"
    return "Key missing"
  }

  function formatRevealed(value: ResolvedCredential): string {
    if (value.kind === "api-key") return value.secret.apiKey
    return JSON.stringify({
      type: "service_account",
      project_id: value.secret.projectId,
      ...(value.secret.privateKeyId === undefined ? {} : { private_key_id: value.secret.privateKeyId }),
      private_key: value.secret.privateKey,
      client_email: value.secret.clientEmail,
      token_uri: "https://oauth2.googleapis.com/token",
      location: value.secret.location,
    }, null, 2)
  }

  function clearEditorSecrets(): void {
    apiKey = ""
    serviceAccountJson = ""
    revealed = null
    hideReveal = false
    editorError = ""
  }

  function closeEditor(): void {
    draft = null
    editingId = null
    clearEditorSecrets()
  }

  function startCreate(): void {
    if (locked) return
    draft = controller.beginCreate()
    editingId = null
    clearEditorSecrets()
  }

  function startEdit(summary: CredentialSummary): void {
    if (locked) return
    const next = controller.beginEdit(summary.id)
    if (next === null) return
    draft = next
    editingId = summary.id
    clearEditorSecrets()
  }

  function setProvider(value: string): void {
    if (draft === null) return
    if (value !== "google-ai-studio" && value !== "google-vertex" && value !== "openai-compatible"
      && value !== "ollama" && value !== "deepseek" && value !== "voyage") return
    // Plain form defaults: Vertex binds service accounts, AI Studio uses its header, others use bearer.
    draft = value === "google-vertex"
      ? { name: draft.name, provider: value, kind: "vertex-service-account", authMode: "service-account", audience: "unbound" }
      : {
        name: draft.name,
        provider: value,
        kind: "api-key",
        authMode: value === "google-ai-studio" ? "api-key" : "bearer",
        audience: "unbound",
      }
  }

  function setAuthMode(value: string): void {
    if (draft === null || draft.kind !== "api-key") return
    if (value !== "api-key" && value !== "bearer") return
    draft = { ...draft, authMode: value }
  }

  function vertexSecretFromInput(): { readonly secret: VertexServiceAccountSecret } | { readonly error: string } {
    try {
      const parsed = parseVertexServiceAccountJson(serviceAccountJson, null)
      return {
        secret: {
          projectId: parsed.projectId,
          location: parsed.location,
          clientEmail: parsed.clientEmail,
          privateKey: parsed.privateKey,
          ...(parsed.privateKeyId === undefined ? {} : { privateKeyId: parsed.privateKeyId }),
        },
      }
    } catch (error) {
      if (error instanceof AiServiceError) return { error: error.message }
      return { error: "Service Account JSON could not be parsed." }
    }
  }

  function submit(): void {
    if (locked || draft === null || !canSave) return
    const current = draft
    if (current.kind === "vertex-service-account") {
      if (serviceAccountJson.trim() === "") {
        if (editingId !== null) void controller.update(editingId, { ...current }).then(closeEditor, () => undefined)
        return
      }
      const parsed = vertexSecretFromInput()
      if ("error" in parsed) {
        editorError = parsed.error
        return
      }
      const input = {
        ...current,
        audience: `vertex:${parsed.secret.projectId}:${parsed.secret.location}`,
        secret: parsed.secret,
      }
      if (editingId === null) void controller.create(input).then(closeEditor, () => undefined)
      else void controller.update(editingId, input).then(closeEditor, () => undefined)
      return
    }
    if (current.kind === "api-key") {
      const secret: ApiKeySecret | null = apiKey.trim() === "" ? null : { apiKey }
      if (editingId === null) {
        if (secret === null) return
        void controller.create({ ...current, secret }).then(closeEditor, () => undefined)
      } else {
        void controller
          .update(editingId, secret === null ? { ...current } : { ...current, secret })
          .then(closeEditor, () => undefined)
      }
      return
    }
    if (editingId === null) void controller.create({ ...current, secret: null }).then(closeEditor, () => undefined)
    else void controller.update(editingId, { ...current }).then(closeEditor, () => undefined)
  }

  function revealCredential(): void {
    if (locked || editingId === null) return
    if (revealed !== null && revealed.keyId === editingId) {
      hideReveal = false
      return
    }
    controller.reveal(editingId).then(value => {
      revealed = value
      hideReveal = false
    }, () => undefined)
  }

  function clearStoredSecret(): void {
    if (locked || editingId === null || draft === null) return
    clearEditorSecrets()
    controller.clearSecret(editingId, draft).catch(() => undefined)
  }

  onMount(() => {
    unsubscribe = controller.subscribe(value => {
      state = value
      if (value.loaded && editingId !== null && !value.credentials.some(summary => summary.id === editingId)) {
        closeEditor()
      }
    })
    controller.load().catch(() => undefined)
  })

  onDestroy(() => {
    unsubscribe?.()
    unsubscribe = null
    closeEditor()
    state = null
  })
</script>

{#if state}
  <section class="keys" aria-labelledby="ai-keys-heading">
    <h2 id="ai-keys-heading">Keys</h2>
    <p class="intro">
      Saved credentials for every AI service. A credential serves configurations whose
      provider, authentication, and audience match it exactly.
    </p>
    <p class="warning">
      Credentials use device-local storage that is shared between plugins and is not
      encrypted or an OS credential vault.
    </p>

    <ul class="list" aria-label="Saved credentials">
      {#if state.credentials.length === 0}
        <li class="empty">No credentials saved yet.</li>
      {:else}
        {#each state.credentials as summary (summary.id)}
          <li class="row">
            <div class="meta">
              <span class="name">{summary.name}</span>
              <span class="detail">
                {PROVIDER_LABELS[summary.provider]} · {KIND_LABELS[summary.kind]} · {statusLabel(summary)}
              </span>
              <span class="mask">{summary.maskedSecret ?? "—"}</span>
              <span class="audience">{summary.audience}</span>
            </div>
            {#if state.pendingDeleteId === summary.id}
              <div class="confirm" role="group" aria-label={`Confirm deleting ${summary.name}`}>
                <span>Delete this credential? Referencing configurations keep their other settings.</span>
                <button
                  type="button"
                  class="danger"
                  disabled={locked}
                  onclick={() => controller.confirmDelete().catch(() => undefined)}
                >Confirm delete</button>
                <button type="button" disabled={locked} onclick={() => controller.cancelDelete()}>Cancel</button>
              </div>
            {:else}
              <div class="row-actions">
                <button
                  type="button"
                  aria-label={`Edit credential ${summary.name}`}
                  disabled={locked}
                  onclick={() => startEdit(summary)}
                >Edit</button>
                <button
                  type="button"
                  class="danger"
                  aria-label={`Delete credential ${summary.name}`}
                  disabled={locked}
                  onclick={() => controller.requestDelete(summary.id)}
                >Delete</button>
              </div>
            {/if}
          </li>
        {/each}
      {/if}
    </ul>

    {#if draft}
      <form class="editor" novalidate onsubmit={(event) => { event.preventDefault(); submit() }}>
        <h3>{editingId === null ? "Add credential" : "Edit credential"}</h3>
        <div class="field">
          <label for="ai-keys-provider">Provider</label>
          <select
            id="ai-keys-provider"
            value={draft.provider}
            disabled={locked || editingId !== null}
            onchange={(event) => setProvider(readValue(event))}
          >
            {#each Object.entries(PROVIDER_LABELS) as [value, label] (value)}
              <option value={value}>{label}</option>
            {/each}
          </select>
        </div>
        <div class="field">
          <label for="ai-keys-name">Name</label>
          <input id="ai-keys-name" type="text" autocomplete="off" value={draft.name} disabled={locked}
            oninput={(event) => { if (draft !== null) draft = { ...draft, name: readValue(event) } }} />
        </div>
        {#if draft.kind === "api-key"}
          <div class="field">
            <label for="ai-keys-auth">Authentication</label>
            <select id="ai-keys-auth" value={draft.authMode} disabled={locked} onchange={(event) => setAuthMode(readValue(event))}>
              {#each Object.entries(API_KEY_AUTH_LABELS) as [value, label] (value)}
                <option value={value}>{label}</option>
              {/each}
            </select>
          </div>
          <div class="field">
            <label for="ai-keys-audience">Audience</label>
            <input
              id="ai-keys-audience"
              type="text"
              autocomplete="off"
              placeholder="unbound or exact endpoint URL"
              value={draft.audience}
              disabled={locked}
              oninput={(event) => { if (draft !== null) draft = { ...draft, audience: readValue(event) } }}
            />
            <p class="help">Use unbound for provider-wide keys, or the exact URL a configuration binds to.</p>
          </div>
          <div class="field">
            <label for="ai-keys-api-key">API key</label>
            <input id="ai-keys-api-key" type="password" autocomplete="new-password" value={apiKey} disabled={locked}
              oninput={(event) => { apiKey = readValue(event) }} />
            <p class="help">
              {editingSummary?.status === "stored"
                ? `Stored key: ${editingSummary.maskedSecret ?? "***"}. Leave blank to keep it.`
                : "No API key is stored yet. Enter one to save it."}
            </p>
          </div>
        {:else if draft.kind === "vertex-service-account"}
          <p class="stored">Authentication: Service Account JSON</p>
          <p class="stored">Audience: {draft.audience} (derived from the Service Account JSON as vertex:project:location)</p>
          <div class="field field-wide">
            <label for="ai-keys-service-account-json">Service Account JSON</label>
            <textarea id="ai-keys-service-account-json" rows="5" autocomplete="off" value={serviceAccountJson}
              disabled={locked} oninput={(event) => { serviceAccountJson = readValue(event) }}></textarea>
            <p class="help">
              {editingSummary?.status === "stored"
                ? "Stored Service Account JSON: ***. Leave blank to keep it."
                : "Paste the Google Service Account JSON to store it."}
            </p>
          </div>
        {:else}
          <p class="stored">Authentication: No authentication</p>
          <div class="field">
            <label for="ai-keys-audience">Audience</label>
            <input
              id="ai-keys-audience"
              type="text"
              autocomplete="off"
              placeholder="unbound or exact endpoint URL"
              value={draft.audience}
              disabled={locked}
              oninput={(event) => { if (draft !== null) draft = { ...draft, audience: readValue(event) } }}
            />
          </div>
        {/if}
        {#if editingId !== null && (editingSummary?.status === "stored" || editingSummary?.status === "stale")}
          <div class="btn-group" role="group" aria-label="Reveal stored credential">
            <button type="button" disabled={locked || editingSummary?.status !== "stored"} onclick={revealCredential}>Reveal key</button>
            <button type="button" disabled={revealed === null || hideReveal} onclick={() => { hideReveal = true }}>Hide key</button>
          </div>
          {#if revealed !== null && !hideReveal && revealed.keyId === editingId}
            <pre class="stored revealed" role="status">Revealed locally:
{formatRevealed(revealed)}</pre>
          {/if}
        {/if}
        {#if editorError !== ""}
          <p class="error" role="alert">{editorError}</p>
        {/if}
        <div class="actions">
          <button type="button" class="primary" disabled={locked || !canSave} onclick={submit}>
            {editingId === null ? "Save credential" : "Save changes"}
          </button>
          {#if editingId !== null && (editingSummary?.status === "stored" || editingSummary?.status === "stale")}
            <button type="button" class="danger" disabled={locked} onclick={clearStoredSecret}>Clear stored key</button>
          {/if}
          <button type="button" disabled={locked} onclick={closeEditor}>Close editor</button>
        </div>
      </form>
    {:else}
      <button type="button" class="primary" disabled={locked} onclick={startCreate}>Add credential</button>
    {/if}

    <p class:error={state.operation === "error"} role={state.operation === "error" ? "alert" : "status"}
      aria-live="polite">{state.statusMessage}</p>
  </section>
{:else}
  <p class="loading">Loading credentials…</p>
{/if}

<style>
  .keys {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
  }

  .keys h2 {
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

  .warning {
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

  .mask {
    font-size: 0.82rem;
    color: #ffce3e;
    font-family: "SFMono-Regular", Menlo, Consolas, monospace;
    overflow-wrap: anywhere;
  }

  .audience {
    font-size: 0.78rem;
    color: #7d7d7d;
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

  .confirm {
    flex: 1 1 100%;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    border-inline-start: 4px solid #ff5a5a;
    padding: 8px 12px;
    background: rgba(255, 90, 90, 0.06);
  }

  .confirm span {
    flex: 1 1 240px;
    color: #f5f5f5;
    font-size: 0.82rem;
  }

  .row-actions button,
  .confirm button,
  .actions button,
  .keys > button.primary {
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
  .confirm button:hover:not(:disabled),
  .actions button:hover:not(:disabled),
  .keys > button.primary:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
    border-color: #ffffff;
  }

  .actions button.primary,
  .keys > button.primary {
    border-color: #ffc000;
    background: #ffc000;
    color: #000000;
    font-weight: 700;
  }

  .actions button.primary:hover:not(:disabled),
  .keys > button.primary:hover:not(:disabled) {
    background: #917300;
    border-color: #917300;
    color: #ffffff;
  }

  .row-actions button.danger:hover:not(:disabled),
  .confirm button.danger:hover:not(:disabled),
  .actions button.danger:hover:not(:disabled) {
    border-color: #ff5a5a;
    color: #ff5a5a;
    background: rgba(255, 90, 90, 0.08);
  }

  .row-actions button:disabled,
  .confirm button:disabled,
  .actions button:disabled,
  .keys > button.primary:disabled {
    cursor: wait;
    opacity: 0.4;
  }

  .row-actions button:focus-visible,
  .confirm button:focus-visible,
  .actions button:focus-visible,
  .keys > button.primary:focus-visible {
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

  .editor > .field-wide,
  .editor > .btn-group,
  .editor > .actions,
  .editor > .stored,
  .editor > .error,
  .editor > .help {
    grid-column: 1 / -1;
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
  .field select,
  .field textarea {
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

  .field textarea {
    resize: vertical;
    font-family: "SFMono-Regular", Menlo, Consolas, monospace;
  }

  .field input:focus-visible,
  .field select:focus-visible,
  .field textarea:focus-visible {
    outline: none;
    border-color: #ffc000;
  }

  .field input:disabled,
  .field select:disabled,
  .field textarea:disabled {
    cursor: wait;
    opacity: 0.4;
  }

  .btn-group {
    display: flex;
    flex-wrap: wrap;
  }

  .btn-group button {
    position: relative;
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
  }

  .btn-group button + button {
    margin-inline-start: -1px;
  }

  .btn-group button:disabled {
    cursor: wait;
    opacity: 0.4;
  }

  .btn-group button:focus-visible {
    outline: 2px solid #29abe2;
    outline-offset: 2px;
    z-index: 2;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .help,
  .stored,
  .error {
    overflow-wrap: anywhere;
    margin: 0;
  }

  .help {
    color: #7d7d7d;
    font-size: 0.82rem;
    line-height: 1.5;
  }

  .error {
    color: #ff5a5a;
  }

  .stored {
    color: #ffce3e;
    font-size: 0.85rem;
  }

  pre.stored.revealed {
    grid-column: 1 / -1;
    max-height: 18rem;
    overflow: auto;
    border: 1px solid #313131;
    padding: 12px;
    background: #000000;
    font: 0.82rem/1.5 "SFMono-Regular", Menlo, Consolas, monospace;
    white-space: pre-wrap;
  }

  .keys > p[aria-live="polite"] {
    margin: 12px 0 0;
    color: #f5f5f5;
    font-size: 0.88rem;
    letter-spacing: 0.02em;
    overflow-wrap: anywhere;
  }

  .keys > p[aria-live="polite"].error {
    color: #ff5a5a;
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

    .row {
      flex-direction: column;
    }
  }
</style>
