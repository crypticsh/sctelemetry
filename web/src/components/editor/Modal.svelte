<script>
  let { title, onclose, children, footer } = $props();
  function key(e) {
    if (e.key === 'Escape') onclose();
  }
</script>

<svelte:window onkeydown={key} />

<div class="scrim" onclick={onclose} role="presentation"></div>
<div class="modal" role="dialog" aria-label={title}>
  <header>
    <h3>{title}</h3>
    <button class="x" onclick={onclose} aria-label="Close">✕</button>
  </header>
  <div class="body">{@render children()}</div>
  {#if footer}<footer>{@render footer()}</footer>{/if}
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 50;
    animation: fade 0.15s ease-out;
  }
  .modal {
    position: fixed;
    z-index: 51;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(560px, calc(100vw - 24px));
    max-height: calc(100dvh - 24px);
    display: flex;
    flex-direction: column;
    background: var(--ui-bg);
    border: 1px solid var(--ui-line);
    border-radius: 14px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.7);
    animation: pop 0.18s ease-out;
  }
  header {
    display: flex;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid var(--ui-line);
  }
  h3 {
    flex: 1;
    margin: 0;
    font-size: 15px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--ink);
  }
  .x {
    border: 0;
    background: none;
    font-size: 18px;
    min-width: 40px;
    min-height: 40px;
    cursor: pointer;
    color: var(--ui-text-dim);
  }
  .body {
    padding: 16px;
    overflow: auto;
    display: grid;
    gap: 14px;
  }
  footer {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--ui-line);
    justify-content: flex-end;
  }
  @keyframes pop {
    from { opacity: 0; transform: translate(-50%, -46%); }
  }
  @keyframes fade {
    from { opacity: 0; }
  }
</style>
