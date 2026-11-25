<script>
  import Modal from '../editor/Modal.svelte';
  import { RULES, ALERT_DEFAULTS, alertConfig, audio } from '../../lib/alerts.svelte.js';
  import { layout, profile, saveLayout } from '../../lib/layout.svelte.js';
  import { prefs, savePrefs } from '../../lib/prefs.svelte.js';

  let { onclose } = $props();
  const c = $derived(alertConfig());

  const FIELDS = [
    ['pullUpTti', 'Pull up: time to impact under (s)', 0.5],
    ['pullUpSink', 'Pull up: sinking faster than (m/s)', 1],
    ['sinkTti', 'Sink rate: time to impact under (s)', 0.5],
    ['sinkRate', 'Sink rate: sinking faster than (m/s)', 1],
    ['tooFastAlt', 'Too fast: below (m above ground)', 10],
    ['tooFastSpeed', 'Too fast: faster than (m/s)', 5],
    ['gearAlt', 'Gear: below (m above ground)', 5],
    ['gearSpeed', 'Gear: slower than (m/s)', 5],
    ['overspeed', 'Overspeed above (m/s)', 10],
    ['gLimit', 'G limit (warning) above (G)', 0.5],
    ['gCaution', 'High G (caution) above (G)', 0.5],
    ['hull', 'Hull warning below (%)', 'pct'],
    ['shield', 'Shields caution below (%)', 'pct'],
    ['fuelLow', 'Fuel low below (%)', 'pct'],
    ['fuelCrit', 'Fuel critical below (%)', 'pct'],
    ['boostLow', 'Boost low below (%)', 'pct'],
  ];

  function set(k, v) {
    const p = profile();
    p.gauges.alerts = { ...(p.gauges.alerts || {}), [k]: v };
    layout.dirty = true;
  }
  function toggle(id, on) {
    const off = new Set(c.off);
    if (on) off.delete(id); else off.add(id);
    set('off', [...off]);
  }
  function pref(k, v) {
    prefs[k] = v;
    savePrefs();
    if (k === 'alertSound' && v) audio.unlock();
  }
  async function done() {
    if (layout.dirty) await saveLayout();
    onclose();
  }
</script>

<Modal title="Alerts" onclose={done}>
  <section class="grp">
    <h4>Sound on this device</h4>
    <label class="ui-check"><input type="checkbox" checked={prefs.alertSound} onchange={(e) => pref('alertSound', e.currentTarget.checked)} /> Play alert sounds<small>Browsers need one tap on the page before they allow sound.</small></label>
    <label class="ui-check"><input type="checkbox" checked={prefs.alertVoice} onchange={(e) => pref('alertVoice', e.currentTarget.checked)} disabled={!prefs.alertSound} /> Spoken callouts ("Pull up", "Sink rate")</label>
    <label class="ui-check"><input type="checkbox" checked={c.callouts} onchange={(e) => set('callouts', e.currentTarget.checked)} /> Radar-altitude callouts on approach (100 … 10)</label>
    <label class="ui-field">Volume {Math.round(prefs.alertVolume * 100)}%<input type="range" min="0.1" max="1" step="0.05" value={prefs.alertVolume} oninput={(e) => pref('alertVolume', +e.currentTarget.value)} /></label>
    <button class="ui-btn small" onclick={() => audio.test()}>Test sound</button>
  </section>

  <section class="grp">
    <h4>Which alerts</h4>
    <div class="rules">
      {#each RULES as r (r.id)}
        <label class="ui-check">
          <input type="checkbox" checked={!c.off.includes(r.id)} onchange={(e) => toggle(r.id, e.currentTarget.checked)} />
          <span><b class="lvl {r.level}">{r.label}</b> · {r.help(c)}</span>
        </label>
      {/each}
    </div>
  </section>

  <section class="grp">
    <h4>Thresholds (shared by every device using this layout)</h4>
    <div class="row">
      {#each FIELDS as [k, label, step]}
        <label class="ui-field">
          {label}
          {#if step === 'pct'}
            <input class="ui-input" type="number" min="0" max="100" value={Math.round(c[k] * 100)} onchange={(e) => set(k, +e.currentTarget.value / 100)} />
          {:else}
            <input class="ui-input" type="number" {step} value={c[k]} onchange={(e) => set(k, +e.currentTarget.value)} />
          {/if}
        </label>
      {/each}
    </div>
    <button class="ui-btn small" onclick={() => { profile().gauges.alerts = {}; layout.dirty = true; }}>Restore default thresholds</button>
  </section>

  {#snippet footer()}
    <button class="ui-btn primary" onclick={done}>Save &amp; close</button>
  {/snippet}
</Modal>

<style>
  .grp { display: grid; gap: 10px; }
  h4 { margin: 0; font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink); }
  .rules { display: grid; gap: 8px; }
  .rules .ui-check { font-size: 13px; }
  .lvl { text-transform: uppercase; letter-spacing: 0.04em; }
  .lvl.warning { color: var(--danger); }
  .lvl.caution { color: var(--warn); }
  .lvl.advisory { color: var(--ok); }
  .row { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
  input[type='range'] { accent-color: var(--ink); }
</style>
