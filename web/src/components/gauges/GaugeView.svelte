<script>
  // Draws one SVG gauge and moves its needles every animation frame.
  import { untrack } from 'svelte';
  import { GAUGES } from '../../gauges/catalog.js';
  import { flight } from '../../lib/flight.svelte.js';
  import { prefs } from '../../lib/prefs.svelte.js';

  let { item } = $props();
  let host;

  $effect(() => {
    const def = GAUGES[item.type];
    const opts = { ...(def.defaults || {}), ...$state.snapshot(item.opts || {}) };
    const g = def.make(opts);
    host.innerHTML = g.html;
    g.mount(host);
    untrack(() => g.update(flight.D, 1));
    let raf, last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      g.update(flight.D, prefs.animations ? dt : 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  });
</script>

<div class="gv" bind:this={host}></div>

<style>
  .gv :global(svg) {
    display: block;
    width: 100%;
    height: auto;
  }
</style>
