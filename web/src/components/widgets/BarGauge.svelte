<script>
  import { Tween } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { read, clamp, fmt } from '../../lib/util.js';
  import { prefs } from '../../lib/prefs.svelte.js';

  let { w, ctx } = $props();
  const v = $derived(read(ctx, w.bind));
  const min = $derived(+w.min || 0);
  const max = $derived(w.max === '' || w.max == null ? 1 : +w.max);
  const f = new Tween(0, { duration: 350, easing: cubicOut });
  $effect(() => {
    if (typeof v === 'number') f.set(clamp((v - min) / (max - min || 1), 0, 1), { duration: prefs.animations ? 350 : 0 });
  });
</script>

<div class="bar">
  <div class="top">
    <span class="label">{w.label}</span>
    <span class="val">{fmt(v, { format: w.format || 'number', unit: w.unit || '' })}</span>
  </div>
  <div class="track"><div class="fill" class:low={f.current < 0.25} style:width="{f.current * 100}%"></div></div>
</div>

<style>
  .bar {
    display: grid;
    gap: 5px;
    padding: 6px 8px 8px;
    border-radius: 8px;
    background: linear-gradient(180deg, var(--metal-lo), #0b0b0b);
  }
  .top {
    display: flex;
    justify-content: space-between;
    gap: 6px;
  }
  .label {
    font-size: 10px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--label);
  }
  .val {
    font-family: var(--font-screen);
    color: var(--ink-hi);
    font-size: 13px;
  }
  .track {
    height: 10px;
    border-radius: 3px;
    background: var(--panel-inset);
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.9);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: repeating-linear-gradient(90deg, var(--ink) 0 6px, transparent 6px 8px);
    box-shadow: 0 0 6px var(--ink);
  }
  .fill.low {
    background: repeating-linear-gradient(90deg, var(--danger) 0 6px, transparent 6px 8px);
  }
</style>
