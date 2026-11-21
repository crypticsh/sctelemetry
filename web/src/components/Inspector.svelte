<script>
  // Shows every field of the newest raw frame. Tap a value to copy its path
  // (for a widget's "custom data path").
  import { tele, wantRaw } from '../lib/telemetry.svelte.js';
  import { toast } from '../lib/toast.svelte.js';

  let filter = $state('');
  let paused = $state(false);
  let frozen = $state(null);

  $effect(() => wantRaw());

  function flatten(o, prefix = 'raw', out = []) {
    if (o == null || typeof o !== 'object') { out.push([prefix, o]); return out; }
    const entries = Array.isArray(o) ? o.map((v, i) => [i, v]) : Object.entries(o);
    if (!entries.length) out.push([prefix, Array.isArray(o) ? '[]' : '{}']);
    for (const [k, v] of entries) flatten(v, `${prefix}.${k}`, out);
    return out;
  }
  const src = $derived(paused ? frozen : tele.raw);
  const rows = $derived(src ? flatten(src).filter(([p]) => !filter || p.toLowerCase().includes(filter.toLowerCase())) : []);

  async function copy(p) {
    try { await navigator.clipboard.writeText(p); toast(`Copied ${p}`); } catch { toast(p); }
  }
  const show = (v) => (typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(3)) : JSON.stringify(v));
</script>

<div class="insp">
  <div class="tools">
    <input class="ui-input" placeholder="Filter, e.g. shield" bind:value={filter} />
    <button class="ui-btn small" class:primary={paused} onclick={() => { frozen = $state.snapshot(tele.raw); paused = !paused; }}>{paused ? 'Resume' : 'Pause'}</button>
  </div>
  {#if !src}
    <p class="dim">No frame yet. The stream starts once you are loaded into the game.</p>
  {:else}
    <div class="rows mono">
      {#each rows as [p, v] (p)}
        <button class="row" onclick={() => copy(p)}><span class="p">{p.slice(4)}</span><span class="v">{show(v)}</span></button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .insp {
    display: grid;
    gap: 10px;
  }
  .tools {
    display: flex;
    gap: 8px;
  }
  .rows {
    max-height: 420px;
    overflow: auto;
    border: 1px solid var(--ui-line);
    border-radius: 8px;
    font-size: 12px;
  }
  .row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    padding: 5px 10px;
    border: 0;
    border-bottom: 1px solid var(--ui-line);
    background: none;
    text-align: left;
    cursor: pointer;
    font: inherit;
  }
  .row:hover {
    background: var(--ui-bg-2);
  }
  .p {
    color: var(--ui-text-dim);
    word-break: break-all;
  }
  .v {
    color: var(--ink);
    white-space: nowrap;
  }
  .dim {
    color: var(--ui-text-dim);
    font-size: 14px;
  }
</style>
