<script>
  // Small LCD readout: label + value. Numbers glide to new values.
  import { Tween } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { read, fmt } from '../../lib/util.js';
  import { prefs } from '../../lib/prefs.svelte.js';

  let { w, ctx } = $props();
  const v = $derived(read(ctx, w.bind));
  const isNum = $derived(typeof v === 'number' && w.format !== 'text');
  const t = new Tween(0, { duration: 250, easing: cubicOut });
  $effect(() => {
    if (isNum) t.set(v, { duration: prefs.animations ? 250 : 0 });
  });
  const text = $derived(fmt(isNum ? t.current : v, { decimals: +w.decimals || 0, unit: w.unit ? (w.format === 'percent' ? '' : w.unit) : '', format: w.format || 'number' }));
</script>

<div class="ro">
  <span class="label">{w.label}</span>
  <span class="lcd">{text}</span>
</div>

<style>
  .ro {
    display: grid;
    gap: 4px;
    padding: 6px;
    border-radius: 8px;
    background: linear-gradient(180deg, var(--metal-lo), #0b0b0b);
  }
  .label {
    font-size: 10px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--label);
    text-align: center;
  }
  .lcd {
    font-family: var(--font-screen);
    font-size: 17px;
    text-align: center;
    color: var(--ink-hi);
    text-shadow: var(--ink-glow);
    background: var(--panel-inset);
    border-radius: 4px;
    padding: 4px 6px;
    box-shadow: inset 0 1px 4px rgba(0, 0, 0, 0.8);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-variant-numeric: tabular-nums;
  }
</style>
