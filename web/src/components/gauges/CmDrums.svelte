<script>
  import { flight } from '../../lib/flight.svelte.js';
  const D = $derived(flight.D);
  const digits = (v) => (v == null ? [null, null] : [Math.floor(v / 10) % 10, v % 10]);
</script>

{#snippet drum(v, label)}
  <div class="drum">
    <div class="win">
      {#each digits(v) as d}
        <div class="digit"><div class="reel" style:transform="translateY({d == null ? 38 : -d * 38}px)">{#each '0123456789' as c}<span>{c}</span>{/each}</div></div>
      {/each}
    </div>
    <small>{label}</small>
  </div>
{/snippet}

<div class="box">
  <h4>Countermeasures</h4>
  <div class="drums">{@render drum(D.noise, 'NOISE')}{@render drum(D.decoy, 'DECOY')}</div>
</div>

<style>
  .box { padding: 14px; border-radius: 14px; background: #0f1012; border: 1px solid #000; box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.7); display: grid; gap: 10px; justify-items: center; }
  h4 { margin: 0; font: 600 12px 'Barlow Condensed', var(--font-label); letter-spacing: 0.16em; color: #8d939b; text-transform: uppercase; }
  .drums { display: flex; gap: 14px; flex-wrap: wrap; justify-content: center; }
  .drum { display: grid; justify-items: center; gap: 4px; }
  .win { display: flex; gap: 2px; padding: 3px; background: #000; border-radius: 4px; box-shadow: inset 0 0 0 1px #333; }
  .digit { width: 26px; height: 38px; overflow: hidden; border-radius: 2px; background: linear-gradient(180deg, #000, #1c1c1c 30%, #2a2a2a 50%, #1c1c1c 70%, #000); }
  .reel { display: grid; transition: transform 0.5s cubic-bezier(0.3, 1.4, 0.5, 1); }
  .reel span { height: 38px; display: grid; place-items: center; font: 600 28px 'Barlow Condensed', var(--font-label); color: #f2f2ee; }
  small { font: 600 11px 'Barlow Condensed', var(--font-label); letter-spacing: 0.14em; color: #8d939b; }
</style>
