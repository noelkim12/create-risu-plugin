<script lang="ts">
  import { onDestroy, onMount } from "svelte"
  import type { ProviderConfig, ProviderId } from "../core/types"
  import { isLocalNetworkUrl } from "../network/url-policy"
  import type {
    LlmSettingsController,
    SettingsState,
  } from "../settings/settings-controller"

  type Props = {
    readonly controller: LlmSettingsController
    readonly onClose: () => Promise<void>
  }

  const { controller, onClose }: Props = $props()
  let state = $state<SettingsState | null>(null)
  let apiKey = $state("")
  let serviceAccountJson = $state("")
  let customHeadersJson = $state("")
  let unsubscribe: (() => void) | null = null

  const providers: readonly (readonly [ProviderId, string])[] = [
    ["google-ai-studio", "Google AI Studio"],
    ["google-vertex", "Google Vertex"],
    ["openai-compatible", "OpenAI-compatible"],
    ["ollama", "Ollama"],
  ]
  const lockedOperations = ["loading", "saving", "clearing", "resetting", "testing"]

  function valueOf(event: Event): string {
    return (event.currentTarget as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value
  }

  function clearDrafts(): void {
    apiKey = ""
    serviceAccountJson = ""
    customHeadersJson = ""
  }

  function isLocked(value = state): boolean {
    return value === null || !value.loaded || lockedOperations.includes(value.operation)
  }

  function updateConfig(patch: Record<string, unknown>): void {
    if (!state || isLocked()) return
    controller.updateConfig({ ...state.activeConfig, ...patch } as ProviderConfig)
  }

  function selectProvider(event: Event): void {
    if (isLocked()) return
    clearDrafts()
    controller.selectProvider(valueOf(event) as ProviderId)
  }

  function setVertexAuth(authMode: "api-key" | "service-account"): void {
    if (isLocked()) return
    apiKey = ""
    serviceAccountJson = ""
    updateConfig({ authMode })
    queueMicrotask(() => document.getElementById(`llm-vertex-${authMode}-tab`)?.focus())
  }

  function onVertexKey(event: KeyboardEvent, current: "api-key" | "service-account"): void {
    const modes = ["api-key", "service-account"] as const
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) || isLocked()) return
    event.preventDefault()
    const index = modes.indexOf(current)
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? modes.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + modes.length) % modes.length
    const next = modes[nextIndex]
    if (next) setVertexAuth(next)
  }

  function setApiKey(event: Event): void {
    if (isLocked()) return
    apiKey = valueOf(event)
    controller.setSecretDraft({ apiKey })
  }

  function setServiceAccountJson(event: Event): void {
    if (isLocked()) return
    serviceAccountJson = valueOf(event)
    controller.setSecretDraft({ serviceAccountJson })
  }

  function setCustomHeadersJson(event: Event): void {
    if (isLocked()) return
    customHeadersJson = valueOf(event)
    controller.setSecretDraft({ customHeadersJson })
  }

  function save(): void {
    if (!isLocked()) void controller.save()
  }

  function testConnection(): void {
    if (!isLocked()) void controller.testConnection()
  }

  function clearCredential(): void {
    if (!isLocked()) void controller.clearCredential()
  }

  function resetProvider(): void {
    if (isLocked()) return
    if (window.confirm("Reset this provider and remove its stored credentials?")) {
      clearDrafts()
      void controller.resetActiveProvider()
    }
  }

  function close(): void {
    if (state?.operation !== "testing") void onClose()
  }

  onMount(() => {
    unsubscribe = controller.subscribe(value => {
      if (
        value.statusMessage === "Saved locally."
        || value.statusMessage === "Credential removed."
        || value.statusMessage === "Provider reset."
      ) clearDrafts()
      state = value
    })
    void controller.load()
  })

  onDestroy(() => {
    unsubscribe?.()
    controller.dispose()
  })
</script>

{#if state}
  <main class="shell" aria-labelledby="llm-settings-title">
    <section class="card">
      <h1 id="llm-settings-title">LLM Provider Settings</h1>
      <p class="storage-warning">
        Settings and credentials use device-local storage that is shared between plugins and is not encrypted or an OS credential vault.
      </p>

      <form onsubmit={(event) => { event.preventDefault(); save() }} novalidate>
        <div class="grid">
          <div class="field">
            <label for="llm-provider">Provider</label>
            <select id="llm-provider" value={state.activeConfig.provider} disabled={isLocked(state)} onchange={selectProvider}>
              {#each providers as provider}
                <option value={provider[0]}>{provider[1]}</option>
              {/each}
            </select>
          </div>

          <div class="field">
            <label for="llm-model">Model</label>
            <input id="llm-model" value={state.activeConfig.model} disabled={isLocked(state)}
              aria-describedby="llm-model-error" aria-invalid={Boolean(state.fieldErrors.model)}
              oninput={(event) => updateConfig({ model: valueOf(event) })} />
            <p id="llm-model-error" class="error">{state.fieldErrors.model ?? ""}</p>
          </div>

          <div class="field">
            <label for="llm-timeout">Timeout (ms)</label>
            <input id="llm-timeout" type="number" value={state.activeConfig.timeoutMs} disabled={isLocked(state)}
              aria-describedby="llm-timeout-error" aria-invalid={Boolean(state.fieldErrors.timeoutMs)}
              oninput={(event) => updateConfig({ timeoutMs: Number(valueOf(event)) })} />
            <p id="llm-timeout-error" class="error">{state.fieldErrors.timeoutMs ?? ""}</p>
          </div>

          {#if state.activeConfig.provider === "google-ai-studio"}
            <p class="help">Endpoint: https://generativelanguage.googleapis.com</p>
            <div class="field">
              <label for="llm-api-key">API key</label>
              <input id="llm-api-key" type="password" autocomplete="new-password" value={apiKey}
                disabled={isLocked(state)} aria-describedby="llm-api-key-help" oninput={setApiKey} />
              <p id="llm-api-key-help" class="help">Leave blank to preserve the stored key.</p>
            </div>
          {:else if state.activeConfig.provider === "google-vertex"}
            <fieldset class="field auth-tabs">
              <legend>Authentication</legend>
              <div role="tablist" aria-label="Vertex authentication">
                <button id="llm-vertex-api-key-tab" type="button" role="tab"
                  aria-selected={state.activeConfig.authMode === "api-key"} aria-controls="llm-vertex-api-key-panel"
                  tabindex={state.activeConfig.authMode === "api-key" ? 0 : -1} disabled={isLocked(state)}
                  onclick={() => setVertexAuth("api-key")} onkeydown={(event) => onVertexKey(event, "api-key")}>API Key</button>
                <button id="llm-vertex-service-account-tab" type="button" role="tab"
                  aria-selected={state.activeConfig.authMode === "service-account"} aria-controls="llm-vertex-service-account-panel"
                  tabindex={state.activeConfig.authMode === "service-account" ? 0 : -1} disabled={isLocked(state)}
                  onclick={() => setVertexAuth("service-account")} onkeydown={(event) => onVertexKey(event, "service-account")}>Service Account</button>
              </div>
              {#if state.activeConfig.authMode === "api-key"}
                <div id="llm-vertex-api-key-panel" role="tabpanel" aria-labelledby="llm-vertex-api-key-tab" class="field">
                  <label for="llm-api-key">API key</label>
                  <input id="llm-api-key" type="password" autocomplete="new-password" value={apiKey}
                    disabled={isLocked(state)} aria-describedby="llm-api-key-help" oninput={setApiKey} />
                  <p id="llm-api-key-help" class="help">Leave blank to preserve the stored key.</p>
                </div>
              {:else}
                <div id="llm-vertex-service-account-panel" role="tabpanel" aria-labelledby="llm-vertex-service-account-tab">
                  <div class="field">
                    <label for="llm-project-id">Project ID</label>
                    <input id="llm-project-id" value={state.activeConfig.projectId} disabled={isLocked(state)}
                      aria-describedby="llm-project-id-error" aria-invalid={Boolean(state.fieldErrors.projectId)}
                      oninput={(event) => updateConfig({ projectId: valueOf(event) })} />
                    <p id="llm-project-id-error" class="error">{state.fieldErrors.projectId ?? ""}</p>
                  </div>
                  <div class="field">
                    <label for="llm-location">Location</label>
                    <input id="llm-location" value={state.activeConfig.location} disabled={isLocked(state)}
                      aria-describedby="llm-location-error" aria-invalid={Boolean(state.fieldErrors.location)}
                      oninput={(event) => updateConfig({ location: valueOf(event) })} />
                    <p id="llm-location-error" class="error">{state.fieldErrors.location ?? ""}</p>
                  </div>
                  <div class="field">
                    <label for="llm-service-account-json">Service Account JSON</label>
                    <textarea id="llm-service-account-json" rows="7" autocomplete="off" value={serviceAccountJson}
                      disabled={isLocked(state)} aria-describedby="llm-service-account-help" oninput={setServiceAccountJson}></textarea>
                    <p id="llm-service-account-help" class="help">Leave blank to preserve the stored Service Account credential.</p>
                  </div>
                </div>
              {/if}
            </fieldset>
          {:else if state.activeConfig.provider === "openai-compatible"}
            <div class="field">
              <label for="llm-base-url">Base URL</label>
              <input id="llm-base-url" value={state.activeConfig.baseUrl} disabled={isLocked(state)}
                aria-describedby="llm-base-url-error" aria-invalid={Boolean(state.fieldErrors.baseUrl)}
                oninput={(event) => updateConfig({ baseUrl: valueOf(event) })} />
              <p id="llm-base-url-error" class="error">{state.fieldErrors.baseUrl ?? ""}</p>
            </div>
            <div class="field">
              <label for="llm-authentication">Authentication</label>
              <select id="llm-authentication" value={state.activeConfig.authMode} disabled={isLocked(state)}
                onchange={(event) => updateConfig({ authMode: valueOf(event) })}>
                <option value="bearer">Bearer</option><option value="none">None</option>
              </select>
            </div>
            <div class="field">
              <label for="llm-api-key">{state.activeConfig.authMode === "none" ? "API key (optional)" : "API key"}</label>
              <input id="llm-api-key" type="password" autocomplete="new-password" value={apiKey}
                disabled={isLocked(state)} aria-describedby="llm-api-key-help" oninput={setApiKey} />
              <p id="llm-api-key-help" class="help">Leave blank to preserve the stored key.</p>
            </div>
            <div class="field">
              <label for="llm-custom-headers">Custom headers JSON</label>
              <textarea id="llm-custom-headers" rows="7" autocomplete="off" value={customHeadersJson}
                disabled={isLocked(state)} aria-describedby="llm-custom-headers-error"
                aria-invalid={Boolean(state.fieldErrors.customHeaderNames)} oninput={setCustomHeadersJson}></textarea>
              <p id="llm-custom-headers-error" class="error">{state.fieldErrors.customHeaderNames ?? ""}</p>
              <p class="help">Leave blank to preserve stored headers; enter {"{}"} to remove them. Reserved headers are rejected.</p>
            </div>
            {#if state.activeConfig.customHeaderNames.length > 0}
              <p class="stored">Stored header names: {state.activeConfig.customHeaderNames.join(", ")}</p>
            {/if}
            {#if state.runtimePlatform === "web" && isLocalNetworkUrl(state.activeConfig.baseUrl)}
              <p class="error">Hosted web cannot reach this local endpoint. Use Risu desktop/Tauri or self-hosted Node.</p>
            {/if}
          {:else}
            <div class="field">
              <label for="llm-base-url">Base URL</label>
              <input id="llm-base-url" value={state.activeConfig.baseUrl} disabled={isLocked(state)}
                aria-describedby="llm-base-url-error" aria-invalid={Boolean(state.fieldErrors.baseUrl)}
                oninput={(event) => updateConfig({ baseUrl: valueOf(event) })} />
              <p id="llm-base-url-error" class="error">{state.fieldErrors.baseUrl ?? ""}</p>
            </div>
            <div class="field">
              <label for="llm-authentication">Authentication</label>
              <select id="llm-authentication" value={state.activeConfig.authMode} disabled={isLocked(state)}
                onchange={(event) => updateConfig({ authMode: valueOf(event) })}>
                <option value="none">None</option><option value="bearer">Bearer</option>
              </select>
            </div>
            <div class="field">
              <label for="llm-api-key">{state.activeConfig.authMode === "none" ? "API key (optional)" : "API key"}</label>
              <input id="llm-api-key" type="password" autocomplete="new-password" value={apiKey}
                disabled={isLocked(state)} aria-describedby="llm-api-key-help" oninput={setApiKey} />
              <p id="llm-api-key-help" class="help">Leave blank to preserve the stored key.</p>
            </div>
            {#if state.runtimePlatform === "web" && isLocalNetworkUrl(state.activeConfig.baseUrl)}
              <p class="error">Hosted web cannot reach local Ollama. Use Risu desktop/Tauri or self-hosted Node.</p>
            {:else}
              <p class="help">This runtime can route this Ollama endpoint.</p>
            {/if}
          {/if}
        </div>

        <div class="actions">
          <button type="button" disabled={isLocked(state)} onclick={save}>Save</button>
          <button type="button" disabled={isLocked(state)} onclick={testConnection}>Test connection</button>
          <button type="button" hidden={state.operation !== "testing"} disabled={state.operation !== "testing"}
            onclick={() => { if (state.operation === "testing") controller.cancelTest() }}>Cancel test</button>
          <button type="button" disabled={isLocked(state)} onclick={clearCredential}>Clear credential</button>
          <button type="button" disabled={isLocked(state)} onclick={resetProvider}>Reset provider</button>
          <button type="button" disabled={state.operation === "testing"} onclick={close}>Close</button>
        </div>
      </form>

      <p class:stored={state.credentialState === "stored"} class:help={state.credentialState !== "stored"}>
        {state.credentialState === "stored"
          ? "Stored locally"
          : state.credentialState === "stale"
            ? "Stored credential does not match the current endpoint or auth settings."
            : "No credential stored"}
      </p>
      <p class:error={state.operation === "error"} role={state.operation === "error" ? "alert" : "status"} aria-live="polite">{state.statusMessage}</p>
    </section>
  </main>
{/if}

<style>
  .shell { box-sizing: border-box; min-height: 100dvh; padding: 24px; }
  .card { box-sizing: border-box; width: min(840px, 100%); margin: 0 auto; border: 1px solid color-mix(in srgb, CanvasText 18%, transparent); border-radius: 20px; background: color-mix(in srgb, Canvas 94%, CanvasText 6%); box-shadow: 0 18px 50px color-mix(in srgb, CanvasText 14%, transparent); padding: 24px; }
  h1 { margin: 0; font-size: 1.35rem; line-height: 1.2; }
  .storage-warning { margin: 12px 0 24px; padding: 12px 14px; border-inline-start: 4px solid #d97706; background: color-mix(in srgb, #f59e0b 12%, Canvas); }
  .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
  .field { display: grid; gap: 6px; min-width: 0; align-content: start; }
  .field label, .field legend { font-weight: 650; }
  .field input, .field select, .field textarea { box-sizing: border-box; width: 100%; min-height: 44px; border: 1px solid color-mix(in srgb, CanvasText 28%, transparent); border-radius: 10px; padding: 10px 12px; background: Canvas; color: CanvasText; font: inherit; }
  .field textarea { resize: vertical; }
  .field > .error { min-height: 1lh; margin: 0; }
  .auth-tabs { grid-column: 1 / -1; border: 1px solid color-mix(in srgb, CanvasText 18%, transparent); border-radius: 14px; padding: 16px; }
  .auth-tabs [role="tablist"] { display: flex; gap: 8px; }
  .auth-tabs [role="tab"] { min-height: 44px; border: 1px solid color-mix(in srgb, CanvasText 22%, transparent); border-radius: 999px; padding: 8px 14px; background: transparent; color: CanvasText; font: inherit; }
  .auth-tabs [role="tab"][aria-selected="true"] { background: CanvasText; color: Canvas; }
  .auth-tabs [role="tabpanel"] { display: grid; gap: 14px; margin-top: 16px; }
  .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; }
  .actions button { min-height: 44px; border: 1px solid color-mix(in srgb, CanvasText 22%, transparent); border-radius: 999px; padding: 9px 16px; background: Canvas; color: CanvasText; cursor: pointer; font: inherit; }
  .actions button:first-child { border-color: CanvasText; background: CanvasText; color: Canvas; }
  .actions button:disabled { cursor: wait; opacity: 0.55; }
  .actions button:focus-visible, .field :focus-visible { outline: 3px solid Highlight; outline-offset: 2px; }
  .help, .stored, .error { overflow-wrap: anywhere; }
  .help { color: color-mix(in srgb, CanvasText 70%, transparent); }
  .error { color: #dc2626; }
  .stored { color: #15803d; }
  @media (max-width: 680px) {
    .shell { padding: 12px; }
    .card { border-radius: 14px; padding: 18px; }
    .grid { grid-template-columns: 1fr; }
  }
</style>
