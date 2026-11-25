<script>
  import { flight } from '../../lib/flight.svelte.js';
  const D = $derived(flight.D);
</script>

<div class="box">
  <h4>Landing gear</h4>
  <div class="lights">
    <div class="lamp g" class:on={D.gear}><i></i><small>LEFT</small></div>
    <div class="lamp g" class:on={D.gear}><i></i><small>NOSE</small></div>
    <div class="lamp g" class:on={D.gear}><i></i><small>RIGHT</small></div>
  </div>
  <div class="lights">
    <div class="lamp r" class:on={D.gear === false && D.radarAlt != null && D.radarAlt < 300}><i></i><small>GEAR UP</small></div>
    <div class="lamp a" class:on={D.vtol}><i></i><small>VTOL</small></div>
    <div class="lamp g" class:on={D.landed}><i></i><small>LANDED</small></div>
  </div>
</div>

<style>
  .box { padding: 14px; border-radius: 14px; background: #0f1012; border: 1px solid #000; box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.7); display: grid; gap: 10px; justify-items: center; }
  h4 { margin: 0; font: 600 12px 'Barlow Condensed', var(--font-label); letter-spacing: 0.16em; color: #8d939b; text-transform: uppercase; }
  .lights { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; }
  .lamp { display: grid; justify-items: center; gap: 4px; }
  .lamp i { width: 32px; height: 32px; border-radius: 50%; background: radial-gradient(circle at 40% 35%, #333, #111 70%); box-shadow: 0 0 0 3px #2c2e32, inset 0 2px 4px rgba(0, 0, 0, 0.8); transition: background 0.2s, box-shadow 0.2s; }
  .lamp.g.on i { background: radial-gradient(circle at 40% 35%, #c9ffbf, #39c24a 60%, #135c1b); box-shadow: 0 0 0 3px #2c2e32, 0 0 14px rgba(80, 230, 90, 0.7); }
  .lamp.r.on i { background: radial-gradient(circle at 40% 35%, #ffc2bb, #ff3b2a 60%, #6e0d06); box-shadow: 0 0 0 3px #2c2e32, 0 0 14px rgba(255, 60, 40, 0.7); }
  .lamp.a.on i { background: radial-gradient(circle at 40% 35%, #ffe7b0, #ffaa1a 60%, #6e4300); box-shadow: 0 0 0 3px #2c2e32, 0 0 14px rgba(255, 170, 30, 0.7); }
  small { font: 600 11px 'Barlow Condensed', var(--font-label); letter-spacing: 0.12em; color: #8d939b; }
</style>
