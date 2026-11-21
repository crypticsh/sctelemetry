<script>
  // Countermeasure-style counter: label plate + pips that drain away.
  import { read } from '../../lib/util.js';

  let { w, ctx } = $props();
  const v = $derived(read(ctx, w.bind));
  const max = $derived(Math.max(1, Math.min(24, +w.max || 8)));
  const n = $derived(typeof v === 'number' ? v : null);

  let drop = $state(0);
  let prev;
  $effect(() => {
    if (prev != null && n != null && n < prev) drop++;
    prev = n;
  });
</script>

<div class="ctr">
  <span class="label">{w.label}</span>
  <div class="win">
    {#key drop}
      <span class="num" class:hit={drop > 0}>{n == null ? '--' : n}</span>
    {/key}
    <span class="pips">
      {#each Array(max) as _, i}
        <i class:full={n != null && i < n}></i>
      {/each}
    </span>
  </div>
</div>

<style>
  .ctr {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 8px;
    background: linear-gradient(180deg, var(--metal-lo), #0b0b0b);
  }
  .label {
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--label);
    min-width: 4.5em;
  }
  .win {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    border-radius: 4px;
    background: var(--panel-inset);
    box-shadow: inset 0 1px 4px rgba(0, 0, 0, 0.8);
    min-width: 0;
  }
  .num {
    font-family: var(--font-screen);
    color: var(--ink-hi);
    text-shadow: var(--ink-glow);
    font-size: 16px;
    min-width: 1.6em;
    text-align: right;
  }
  .hit {
    animation: hit 0.6s ease-out;
  }
  .pips {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    min-width: 0;
  }
  i {
    width: 5px;
    height: 10px;
    border-radius: 1px;
    background: var(--ink-faint);
    transition: background 0.3s, box-shadow 0.3s;
  }
  i.full {
    background: var(--ink);
    box-shadow: 0 0 4px var(--ink);
  }
  @keyframes hit {
    0% { color: #fff; transform: scale(1.35); }
    100% { transform: scale(1); }
  }
</style>
