<script>
  // The Gauges page: aircraft-style instruments you arrange yourself.
  // Edit mode: drag ⠿ to reorder, tap a gauge to tune it, + to add, ✕ to remove.
  import GaugeView from './GaugeView.svelte';
  import Annunciator from './Annunciator.svelte';
  import Endurance from './Endurance.svelte';
  import GearLights from './GearLights.svelte';
  import CmDrums from './CmDrums.svelte';
  import GaugeEditor from './GaugeEditor.svelte';
  import AlertSettings from './AlertSettings.svelte';
  import { GAUGES, defaultGauges, gid } from '../../gauges/catalog.js';
  import { DEFS } from '../../gauges/lib.js';
  import { layout, profile, saveLayout } from '../../lib/layout.svelte.js';
  import { prefs, savePrefs, buzz } from '../../lib/prefs.svelte.js';
  import { tele } from '../../lib/telemetry.svelte.js';
  import { resetGDrag } from '../../lib/flight.svelte.js';
  import { audio } from '../../lib/alerts.svelte.js';
  import { defaultLayout } from '../../lib/defaultLayout.js';

  const COMPONENTS = { annunciator: Annunciator, endurance: Endurance, gear: GearLights, cm: CmDrums };

  let { editing = $bindable(false) } = $props();

  const p = $derived(profile());
  $effect(() => {
    if (!p.gauges) p.gauges = defaultGauges();
  });
  const items = $derived(p.gauges?.items || []);

  let edit = $state(null);
  let showAlerts = $state(false);
  let showAdd = $state(false);

  // ---- drag to reorder (pointer events, works with touch)
  let drag = $state(null); // { id, x, y, target: index }
  function startDrag(e, it) {
    e.preventDefault();
    e.stopPropagation();
    drag = { id: it.id, label: it.label || GAUGES[it.type].name, x: e.clientX, y: e.clientY, target: null };
    buzz(10);
    const move = (ev) => {
      drag.x = ev.clientX;
      drag.y = ev.clientY;
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-gi]');
      if (!el) return (drag.target = null);
      const r = el.getBoundingClientRect();
      const i = +el.dataset.gi;
      drag.target = ev.clientX > r.left + r.width / 2 ? i + 1 : i;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (drag?.target != null) {
        const from = items.findIndex((x) => x.id === drag.id);
        let to = drag.target;
        if (from >= 0 && to !== from && to !== from + 1) {
          const [moved] = items.splice(from, 1);
          if (from < to) to--;
          items.splice(to, 0, moved);
          layout.dirty = true;
          buzz(6);
        }
      }
      drag = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  function add(type) {
    const def = GAUGES[type];
    items.push({ id: gid(), type, size: def.size || (def.kind === 'dial' ? 'm' : 's'), opts: {} });
    layout.dirty = true;
    showAdd = false;
    requestAnimationFrame(() => document.querySelector('.gauges .cell:last-child')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }
  function remove(it) {
    items.splice(items.indexOf(it), 1);
    layout.dirty = true;
  }
  function resetAll() {
    if (!confirmReset) { confirmReset = true; setTimeout(() => (confirmReset = false), 3000); return; }
    p.gauges = { ...defaultGauges(), alerts: p.gauges?.alerts || {} };
    layout.dirty = true;
    confirmReset = false;
  }
  let confirmReset = $state(false);

  async function done() {
    if (layout.dirty) await saveLayout();
    editing = false;
  }
  function discard() {
    layout.dirty = false;
    layout.value = tele.layouts?.profiles?.length ? structuredClone($state.snapshot(tele.layouts)) : defaultLayout();
    editing = false;
  }
  function tap(it) {
    if (editing) edit = it;
    else if (it.type === 'gmeter') { resetGDrag(); buzz(8); }
  }
  function soundToggle() {
    prefs.alertSound = !prefs.alertSound;
    savePrefs();
    if (prefs.alertSound) audio.test();
  }
</script>

{@html DEFS}

{#if editing}
  <div class="editbar">
    <span class="msg">Editing gauges · drag <b>⠿</b> to move · tap a gauge to tune it · <b>✕</b> removes</span>
    <button class="ui-btn small primary" onclick={() => (showAdd = !showAdd)}>+ Add gauge</button>
    <button class="ui-btn small" onclick={() => (showAlerts = true)}>Alerts</button>
    <button class="ui-btn small" class:danger={confirmReset} onclick={resetAll}>{confirmReset ? 'Tap again to reset' : 'Reset to all gauges'}</button>
    <button class="ui-btn small" onclick={discard} disabled={!layout.dirty}>Discard</button>
    <button class="ui-btn small primary" onclick={done}>{layout.dirty ? 'Save & close' : 'Close'}</button>
  </div>
  {#if showAdd}
    <div class="palette">
      {#each Object.entries(GAUGES) as [k, g]}
        <button class="chip" onclick={() => add(k)}>
          <b>+ {g.name}</b><span class="src {g.src}">{g.src}</span>
        </button>
      {/each}
    </div>
  {/if}
{/if}

<div class="page">
  <div class="tools">
    <button class="ui-btn small" class:on={prefs.alertSound} onclick={soundToggle} aria-pressed={prefs.alertSound}>{prefs.alertSound ? 'Sound on' : 'Sound off'}</button>
    <button class="ui-btn small" onclick={() => (showAlerts = true)}>Alert settings</button>
    <label class="zoom">Gauge size <input type="range" min="130" max="360" step="10" value={prefs.gaugeCell} oninput={(e) => { prefs.gaugeCell = +e.currentTarget.value; savePrefs(); }} /></label>
  </div>

  <div class="gauges" class:editing style:--cell="{prefs.gaugeCell}px">
    {#each items as it, i (it.id)}
      {@const def = GAUGES[it.type]}
      {#if def}
        <div
          class="cell size-{it.size} kind-{def.kind}"
          class:dragging={drag?.id === it.id}
          class:drop-before={drag && drag.target === i}
          class:drop-after={drag && i === items.length - 1 && drag.target === items.length}
          data-gi={i}
        >
          <div class="inst" role="button" tabindex="0" onclick={() => tap(it)} onkeydown={(e) => e.key === 'Enter' && tap(it)}>
            {#if def.kind === 'dial'}
              <div class="well"><GaugeView item={it} /></div>
            {:else if def.kind === 'strip'}
              <div class="strip"><GaugeView item={it} /></div>
            {:else}
              {@const C = COMPONENTS[it.type]}
              <C />
            {/if}
            {#if it.type !== 'annunciator'}
              <div class="plate"><b>{it.label || def.name}</b><span class="src {def.src}">{def.src}</span></div>
            {/if}
          </div>
          {#if editing}
            <button class="h drag" onpointerdown={(e) => startDrag(e, it)} aria-label="Drag {def.name}">⠿</button>
            <button class="h del" onclick={() => remove(it)} aria-label="Remove {def.name}">✕</button>
          {/if}
        </div>
      {/if}
    {/each}
    {#if !items.length}
      <div class="empty">No gauges. Tap the pencil, then <b>+ Add gauge</b>.</div>
    {/if}
  </div>
</div>

{#if drag}<div class="ghost" style:left="{drag.x}px" style:top="{drag.y}px">{drag.label}</div>{/if}
{#if edit}<GaugeEditor item={edit} {items} onclose={() => (edit = null)} />{/if}
{#if showAlerts}<AlertSettings onclose={() => (showAlerts = false)} />{/if}

<style>
  .page {
    flex: 1;
    overflow: auto;
    padding: 14px max(14px, env(safe-area-inset-right)) 24px max(14px, env(safe-area-inset-left));
    background:
      radial-gradient(90% 60% at 30% 0%, rgba(110, 150, 210, 0.08), transparent 60%),
      linear-gradient(180deg, #1a1b1e, #111214);
  }
  .tools {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    margin-bottom: 12px;
  }
  .tools .on {
    border-color: var(--ok);
    color: var(--ok);
  }
  .zoom {
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: 12px;
    color: var(--ui-text-dim);
    margin-left: auto;
  }
  .zoom input {
    accent-color: var(--ink);
    width: 120px;
  }
  .gauges {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--cell)), 1fr));
    grid-auto-flow: dense;
    gap: clamp(10px, 2vw, 24px);
    align-items: start;
  }
  .cell {
    position: relative;
    min-width: 0;
  }
  .size-s .inst {
    width: 80%;
    margin: 0 auto;
  }
  .size-l {
    grid-column: span 2;
    grid-row: span 2;
  }
  .size-wide {
    grid-column: span 2;
  }
  .size-full {
    grid-column: 1 / -1;
  }
  .size-wide.kind-dial .inst {
    width: 55%;
    margin: 0 auto;
  }
  .inst {
    display: grid;
    justify-items: center;
    gap: 8px;
    cursor: default;
    outline-offset: 4px;
  }
  .editing .inst {
    cursor: pointer;
  }
  .well {
    width: 100%;
    aspect-ratio: 1;
    border-radius: 50%;
    padding: 3.5%;
    background: radial-gradient(circle at 50% 50%, #0a0a0b 62%, #1f2023 70%, #0d0e10 74%);
    box-shadow: inset 0 10px 18px rgba(0, 0, 0, 0.95), inset 0 -2px 3px rgba(255, 255, 255, 0.06), 0 1px 0 rgba(255, 255, 255, 0.05);
  }
  .strip {
    width: 100%;
  }
  .inst > :global(.box),
  .inst > :global(.lcd),
  .inst > :global(.annun) {
    width: 100%;
  }
  .plate {
    display: flex;
    gap: 6px;
    align-items: baseline;
    flex-wrap: wrap;
    justify-content: center;
    text-align: center;
  }
  .plate b {
    font: 600 13px 'Barlow Condensed', var(--font-label);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #dfe2e6;
  }
  .src {
    font: 600 10px var(--font-label);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 1px 6px;
    border-radius: 4px;
    border: 1px solid;
  }
  .src.direct { color: #5fd068; }
  .src.calc { color: #69b7ff; }
  .src.est { color: #ffb31a; }
  .h {
    position: absolute;
    top: -6px;
    min-width: 34px;
    min-height: 34px;
    border: 0;
    border-radius: 50%;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.6);
    font-size: 15px;
    line-height: 1;
    z-index: 2;
  }
  .drag {
    left: -6px;
    background: var(--ink);
    color: #140a02;
    cursor: grab;
    touch-action: none;
  }
  .del {
    right: -6px;
    background: #3a1410;
    color: #ff8a80;
    cursor: pointer;
  }
  .editing .cell {
    outline: 1px dashed color-mix(in srgb, var(--ink) 45%, transparent);
    outline-offset: 4px;
    border-radius: 12px;
  }
  .dragging {
    opacity: 0.3;
  }
  .drop-before::before,
  .drop-after::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    width: 4px;
    border-radius: 2px;
    background: var(--ink-hi);
    box-shadow: 0 0 10px var(--ink);
    z-index: 3;
  }
  .drop-before::before { left: -10px; }
  .drop-after::after { right: -10px; }
  .ghost {
    position: fixed;
    z-index: 60;
    transform: translate(-50%, -130%);
    padding: 6px 12px;
    border-radius: 8px;
    background: var(--ink);
    color: #140a02;
    font-size: 13px;
    font-weight: 600;
    pointer-events: none;
  }
  .editbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: color-mix(in srgb, var(--ink) 14%, var(--ui-bg));
    border-bottom: 1px solid var(--ink-dim);
  }
  .msg {
    flex: 1;
    font-size: 13px;
    min-width: 200px;
  }
  .palette {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 10px 12px;
    background: var(--ui-bg);
    border-bottom: 1px solid var(--ui-line);
    max-height: 40vh;
    overflow: auto;
  }
  .chip {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    border: 1px solid var(--ui-line);
    background: var(--ui-bg-2);
    color: var(--ui-text);
    border-radius: 999px;
    padding: 6px 12px;
    font-size: 13px;
    cursor: pointer;
    min-height: 36px;
  }
  .chip b {
    font-weight: 500;
  }
  .empty {
    grid-column: 1 / -1;
    padding: 40px 16px;
    text-align: center;
    color: var(--ui-text-dim);
  }
  @media (max-width: 520px) {
    .size-l,
    .size-wide {
      grid-column: 1 / -1;
    }
    .zoom {
      margin-left: 0;
    }
  }
  :global(.gn) {
    font-family: 'Barlow Condensed', 'Arial Narrow', sans-serif;
    font-weight: 600;
    fill: #f1f1ec;
  }
  :global(.gt) {
    font-family: 'Barlow Condensed', 'Arial Narrow', sans-serif;
    font-weight: 600;
    fill: #e8e8e2;
    letter-spacing: 0.08em;
  }
  :global(.gs) {
    font-family: 'Barlow Condensed', 'Arial Narrow', sans-serif;
    font-weight: 500;
    fill: #9ea3a9;
    letter-spacing: 0.06em;
  }
</style>
