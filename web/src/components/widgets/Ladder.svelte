<script>
  // Vertical gauge like the VEL strip: LCD on top (value + sub value),
  // tick ladder with + / − ends and a sliding marker.
  import { Tween } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { read, clamp } from '../../lib/util.js';
  import { prefs } from '../../lib/prefs.svelte.js';

  let { w, ctx } = $props();
  const v = $derived(read(ctx, w.bind));
  const sub = $derived(w.sub ? read(ctx, w.sub) : null);
  const min = $derived(+w.min || 0);
  const max = $derived(+w.max || 1);
  const pos = new Tween(0, { duration: 300, easing: cubicOut });
  const num = new Tween(0, { duration: 300, easing: cubicOut });
  $effect(() => {
    const d = prefs.animations ? 300 : 0;
    if (typeof v === 'number') {
      pos.set(clamp((v - min) / (max - min || 1), 0, 1), { duration: d });
      num.set(v, { duration: d });
    }
  });
  const ticks = 21;
</script>

<div class="lad">
  <div class="lcd">
    <span class="big">{typeof v === 'number' ? Math.round(num.current) : '--'}<small>{w.unit}</small></span>
    {#if w.sub}<span class="small">{typeof sub === 'number' ? sub.toFixed(1) : '--'} G</span>{/if}
  </div>
  <span class="label">{w.label}</span>
  <div class="strip">
    <span class="end">+</span>
    <div class="track">
      {#each Array(ticks) as _, i}
        <i class:major={i % 5 === 0} class:red={i === 0 || i === ticks - 1}></i>
      {/each}
      <div class="fill" style:height="{pos.current * 100}%"></div>
      <div class="marker" style:bottom="{pos.current * 100}%"></div>
    </div>
    <span class="end">−</span>
  </div>
</div>

<style>
  .lad {
    display: grid;
    gap: 6px;
    padding: 8px;
    border-radius: 10px;
    background: linear-gradient(180deg, var(--metal-lo), #0b0b0b);
  }
  .lcd {
    display: grid;
    justify-items: center;
    padding: 6px 4px;
    border-radius: 6px;
    background: #060606;
    box-shadow: inset 0 1px 6px rgba(0, 0, 0, 0.9), 0 0 0 1px #000;
    font-family: var(--font-screen);
    color: #e9e4da;
  }
  .big {
    font-size: 20px;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }
  .big small {
    font-size: 12px;
    margin-left: 2px;
    opacity: 0.8;
  }
  .small {
    font-size: 13px;
    opacity: 0.85;
  }
  .label {
    text-align: center;
    font-size: 11px;
    letter-spacing: 0.2em;
    color: var(--label);
  }
  .strip {
    display: grid;
    justify-items: center;
    gap: 4px;
    padding: 6px 0;
    border-radius: 8px;
    background: linear-gradient(90deg, #121212, #1d1c1a 50%, #121212);
    box-shadow: inset 0 1px 6px rgba(0, 0, 0, 0.9);
  }
  .end {
    font-family: var(--font-screen);
    color: #bdb6ab;
    font-size: 16px;
    line-height: 1;
  }
  .track {
    position: relative;
    width: 70%;
    height: clamp(100px, 22vh, 260px);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  i {
    display: block;
    height: 1px;
    width: 50%;
    margin: 0 auto;
    background: #6b665e;
  }
  i.major {
    width: 100%;
    height: 2px;
    background: #9a948a;
  }
  i.red {
    background: #b23a2a;
  }
  .fill {
    position: absolute;
    left: 42%;
    right: 42%;
    bottom: 0;
    background: linear-gradient(0deg, color-mix(in srgb, var(--ink) 30%, transparent), var(--ink));
    border-radius: 2px;
    opacity: 0.55;
  }
  .marker {
    position: absolute;
    left: -6%;
    right: -6%;
    height: 3px;
    margin-bottom: -1.5px;
    background: var(--ink-hi);
    box-shadow: 0 0 8px var(--ink);
  }
</style>
