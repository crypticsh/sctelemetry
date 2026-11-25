<script>
  import { flight } from '../../lib/flight.svelte.js';
  const e = $derived(flight.D.endurance);
  const s = $derived(e == null ? null : Math.min(e, 5999));
</script>

<div class="lcd">
  <span class="k">H2 ENDURANCE</span>
  <span class="v">{s == null ? '--:--' : `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`}</span>
  <span class="k">{s == null ? 'NOT BURNING' : s >= 5999 ? 'MIN : SEC (99+)' : 'MIN : SEC'}</span>
</div>

<style>
  .lcd {
    display: grid; place-items: center; gap: 2px; padding: 12px 10px; border-radius: 10px;
    background: #050605; border: 2px solid #000; box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.9), 0 0 0 3px #2b2d31;
    font-family: 'Barlow Condensed', var(--font-label); text-align: center;
  }
  .k { font-size: 11px; letter-spacing: 0.14em; color: #7f8a7c; }
  .v { font-size: 34px; color: #b8f5a0; text-shadow: 0 0 8px rgba(150, 255, 120, 0.45); font-variant-numeric: tabular-nums; line-height: 1; }
</style>
