<script lang="ts">
  import type { ResolvedChatContext } from "./helpers/chat-context";

  type AppProps = {
    readonly openCount: number;
    readonly context: ResolvedChatContext;
    readonly onClose: () => Promise<void>;
  };

  const { openCount, context, onClose } = $props<AppProps>();

  const formatValue = (value: string | number | null | undefined): string =>
    value === null || value === undefined ? "Unavailable" : String(value);
</script>

<main class="shell" aria-labelledby="plugin-title">
  <section class="panel">
    <header class="header">
      <div>
        <p class="eyebrow">Risuai API v3</p>
        <h1 id="plugin-title">Svelte Plugin Panel</h1>
      </div>
      <button class="close" type="button" onclick={onClose}>Close</button>
    </header>

    <div class="metric" aria-label="Open count">
      <span>Open count</span>
      <strong>{openCount}</strong>
    </div>

    <dl class="context-grid" aria-label="Current chat context">
      <div>
        <dt>Character index</dt>
        <dd>{formatValue(context.characterIndex)}</dd>
      </div>
      <div>
        <dt>Character ID</dt>
        <dd>{formatValue(context.characterId)}</dd>
      </div>
      <div>
        <dt>Character name</dt>
        <dd>{formatValue(context.characterName)}</dd>
      </div>
      <div>
        <dt>Chat index</dt>
        <dd>{formatValue(context.chatIndex)}</dd>
      </div>
      <div>
        <dt>Chat ID</dt>
        <dd>{formatValue(context.chatId)}</dd>
      </div>
      <div>
        <dt>Chat name</dt>
        <dd>{formatValue(context.chatName)}</dd>
      </div>
    </dl>
  </section>
</main>
