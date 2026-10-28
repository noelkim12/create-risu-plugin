<script lang="ts">
  import type { AiServiceSection } from "../settings/section-registry"

  type Props = {
    readonly sections: readonly AiServiceSection[]
    readonly onClose: () => Promise<void>
  }

  const { sections, onClose }: Props = $props()

  let activeId = $state<AiServiceSection["id"] | null>(sections[0]?.id ?? null)
  let contentEl = $state<HTMLElement | null>(null)

  // Switching sections runs the previous section's cleanup before mounting the next;
  // component unmount runs the same teardown path once more.
  $effect(() => {
    const container = contentEl
    const section = sections.find(candidate => candidate.id === activeId)
    if (container === null || section === undefined) return
    container.replaceChildren()
    return section.mount({ target: container, close: onClose })
  })

  function close(): void {
    void onClose()
  }
</script>

<main class="shell" aria-labelledby="ai-services-title">
  <section class="card">
    <header class="settings-header">
      <h1 id="ai-services-title">AI Services</h1>
      <button class="close-button" type="button" aria-label="Close" title="Close" onclick={close}>×</button>
    </header>

    <div class="workspace">
      <aside class="sidebar" aria-label="AI Services sections">
        <p class="sidebar-eyebrow">Configuration</p>
        <nav class="settings-nav">
          {#each sections as section (section.id)}
            <button
              type="button"
              class="nav-button"
              class:nav-button-active={section.id === activeId}
              aria-current={section.id === activeId ? "true" : undefined}
              onclick={() => { activeId = section.id }}
            >
              <span>{section.label}</span>
            </button>
          {/each}
        </nav>
      </aside>
      <div class="content" bind:this={contentEl}></div>
    </div>
  </section>
</main>

<style>
  /* Lamborghini design system — absolute black canvas, gold CTA, sharp corners, uppercase voice. */
  .shell {
    box-sizing: border-box;
    min-height: 100dvh;
    padding: 20px 16px;
    background: #000000;
    color: #ffffff;
    font-family: "Helvetica Neue", Roboto, Arial, sans-serif;
  }

  .card {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    width: 1200px;
    max-width: 100%;
    height: 800px;
    max-height: calc(100dvh - 40px);
    margin: 0 auto;
    border: 1px solid #313131;
    border-radius: 0;
    background: #202020;
    padding: 24px;
    box-shadow: none;
    overflow: hidden;
  }

  .settings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .card h1 {
    margin: 0;
    font-size: 1.4rem;
    font-weight: 400;
    line-height: 1.0;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: #ffffff;
  }

  .close-button {
    display: grid;
    flex: 0 0 44px;
    width: 44px;
    height: 44px;
    place-items: center;
    border: 1px solid transparent;
    padding: 0;
    background: transparent;
    color: #ffffff;
    cursor: pointer;
    font: 300 2rem/1 "Helvetica Neue", Roboto, Arial, sans-serif;
  }

  .close-button:hover:not(:disabled) {
    border-color: #ffffff;
    background: rgba(255, 255, 255, 0.1);
  }

  .close-button:focus-visible {
    outline: 2px solid #29abe2;
    outline-offset: 2px;
  }

  .workspace {
    display: grid;
    flex: 1;
    min-height: 0;
    grid-template-columns: minmax(176px, 1fr) minmax(0, 4fr);
    border: 1px solid #313131;
    background: #181818;
  }

  .sidebar {
    min-width: 0;
    padding: 16px 12px;
    border-inline-end: 1px solid #313131;
    background: #000000;
  }

  .sidebar-eyebrow {
    margin: 0 8px 8px;
    color: #7d7d7d;
    font-size: 0.63rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  .settings-nav {
    display: grid;
    gap: 4px;
  }

  .nav-button {
    position: relative;
    display: block;
    width: 100%;
    min-height: 48px;
    border: 1px solid transparent;
    padding: 10px;
    background: transparent;
    color: #ffffff;
    font: inherit;
    font-size: 0.82rem;
    letter-spacing: 0.08em;
    text-align: start;
    text-transform: uppercase;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .nav-button:hover {
    border-color: #313131;
    background: #181818;
  }

  .nav-button:focus-visible {
    outline: 2px solid #29abe2;
    outline-offset: 2px;
  }

  .nav-button-active {
    border-color: #ffc000;
    background: #18120a;
  }

  .nav-button-active::before {
    content: "";
    position: absolute;
    inset-block: 10px;
    inset-inline-start: -1px;
    width: 3px;
    background: #ffc000;
  }

  .content {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    padding: 20px 24px 24px;
    overflow-x: hidden;
    overflow-y: auto;
  }

  @media (max-width: 680px) {
    .shell {
      padding: 20px 12px;
    }

    .card {
      padding: 16px 12px;
    }

    .workspace {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr);
    }

    .sidebar {
      padding: 12px;
      border-inline-end: 0;
      border-block-end: 1px solid #313131;
    }

    .settings-nav {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .content {
      padding: 16px 12px 20px;
    }
  }
</style>
