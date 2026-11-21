<script>
  // Round push button in a square housing. Optional bind lights its ring.
  import { read, truthy } from '../../lib/util.js';
  import { press } from '../../lib/actions.js';
  import { buzz } from '../../lib/prefs.svelte.js';

  let { w, ctx, editing = false } = $props();
  const lit = $derived(w.bind ? truthy(read(ctx, w.bind)) : null);
  let down = $state(false);

  function tap() {
    if (editing || !w.action) return;
    buzz(15);
    press(w, w.action);
  }
</script>

<button
  class="pb {w.color || ''}"
  class:lit
  class:down
  onpointerdown={() => (down = true)}
  onpointerup={() => (down = false)}
  onpointerleave={() => (down = false)}
  onclick={tap}
  title={w.action || w.label}
>
  {#if w.sub}<span class="sub">{w.sub}</span>{/if}
  <span class="cap"></span>
  <span class="label">{w.label}</span>
</button>

<style>
  .pb {
    display: grid;
    justify-items: center;
    gap: 5px;
    width: 100%;
    padding: 6px 4px 8px;
    border: 0;
    border-radius: 8px;
    background: linear-gradient(180deg, var(--metal-lo), #0b0b0b);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
    cursor: pointer;
    touch-action: manipulation;
  }
  .sub,
  .label {
    font-family: var(--font-label);
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--label-dim);
    white-space: nowrap;
  }
  .label {
    font-size: 11px;
    color: var(--label);
  }
  .cap {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: radial-gradient(circle at 40% 35%, #5d5a56, #1e1d1b 70%);
    box-shadow: 0 0 0 3px #0b0b0b, 0 0 0 5px var(--metal-hi), 0 4px 6px rgba(0, 0, 0, 0.7);
    transition: transform 0.08s, box-shadow 0.2s;
  }
  .red .cap {
    background: radial-gradient(circle at 40% 35%, #ff6a5a, #8a140e 70%);
  }
  .green .cap {
    background: radial-gradient(circle at 40% 35%, #b8ff8a, #2f6a12 70%);
  }
  .blue .cap {
    background: radial-gradient(circle at 40% 35%, #a8d8ff, #134a7a 70%);
  }
  .lit .cap {
    box-shadow: 0 0 0 3px #0b0b0b, 0 0 0 5px var(--ink), 0 0 14px var(--ink);
  }
  .down .cap {
    transform: scale(0.92);
    box-shadow: 0 0 0 3px #0b0b0b, 0 0 0 5px var(--metal-hi), 0 1px 2px rgba(0, 0, 0, 0.7);
  }
</style>
