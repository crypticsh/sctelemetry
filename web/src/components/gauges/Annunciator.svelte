<script>
  import { RULES, alerts, acknowledge } from '../../lib/alerts.svelte.js';
</script>

<div class="annun">
  <button class="mw" class:lit={alerts.warning} class:flash={alerts.warnUnacked} onclick={() => acknowledge('warning')} title="Silence warnings">Master<br />Warning</button>
  <div class="tiles">
    {#each RULES as r (r.id)}
      {@const s = alerts.state[r.id]}
      <div class="tile {s?.on ? r.level : ''}" class:unacked={s?.on && !s.acked && r.level !== 'advisory'} title={r.label}>{r.label}</div>
    {/each}
  </div>
  <button class="mw caution" class:lit={alerts.caution} class:flash={alerts.cautUnacked} onclick={() => acknowledge('caution')} title="Silence cautions">Master<br />Caution</button>
</div>

<style>
  .annun {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 10px;
    padding: 10px;
    border-radius: 14px;
    background: #0f1013;
    border: 1px solid #26282c;
    box-shadow: inset 0 2px 10px rgba(0, 0, 0, 0.6);
  }
  .mw {
    width: 92px;
    border-radius: 10px;
    border: 2px solid #000;
    cursor: pointer;
    font: 700 13px/1.1 'Barlow Condensed', var(--font-label);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    background: #2a1210;
    color: #6b2a24;
    box-shadow: inset 0 -6px 12px rgba(0, 0, 0, 0.6);
    transition: background 0.15s, color 0.15s, box-shadow 0.15s;
    touch-action: manipulation;
  }
  .mw.caution { background: #2a2210; color: #6e5520; }
  .mw.lit { background: radial-gradient(circle at 50% 40%, #ff7b6e, #ff4436 55%, #9c1a12); color: #2a0302; box-shadow: 0 0 18px rgba(255, 68, 54, 0.7); }
  .mw.caution.lit { background: radial-gradient(circle at 50% 40%, #ffe08a, #ffb31a 55%, #a06b00); color: #2a1c00; box-shadow: 0 0 18px rgba(255, 179, 26, 0.6); }
  .mw.lit.flash { animation: flash 0.5s steps(2, jump-none) infinite; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: 6px; }
  .tile {
    display: grid; place-items: center; text-align: center; min-height: 36px; padding: 4px 6px;
    border-radius: 6px; border: 1px solid #000; background: #121316; color: #3b3e44;
    font: 600 13px/1.05 'Barlow Condensed', var(--font-label); letter-spacing: 0.08em; text-transform: uppercase;
    box-shadow: inset 0 -4px 8px rgba(0, 0, 0, 0.5); transition: background 0.2s, color 0.2s, box-shadow 0.2s;
  }
  .tile.warning { background: #3a0d0a; color: #ff8a80; box-shadow: 0 0 12px rgba(255, 68, 54, 0.45), inset 0 0 10px rgba(255, 68, 54, 0.4); }
  .tile.caution { background: #382705; color: #ffd36e; box-shadow: 0 0 10px rgba(255, 179, 26, 0.35), inset 0 0 10px rgba(255, 179, 26, 0.3); }
  .tile.advisory { background: #0d2a12; color: #9cf0a5; box-shadow: inset 0 0 10px rgba(95, 208, 104, 0.3); }
  .tile.unacked { animation: flash 0.6s steps(2, jump-none) infinite; }
  @keyframes flash { 50% { filter: brightness(0.45); } }
  @media (max-width: 560px) {
    .annun { grid-template-columns: 1fr 1fr; }
    .tiles { grid-column: 1 / -1; grid-row: 2; }
    .mw { width: auto; min-height: 46px; }
  }
</style>
