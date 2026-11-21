<script>
  import Mfd from './Mfd.svelte';
  import Rail from './Rail.svelte';
  import WidgetEditor from './editor/WidgetEditor.svelte';
  import PanelEditor from './editor/PanelEditor.svelte';
  import ScreensEditor from './editor/ScreensEditor.svelte';
  import { tele } from '../lib/telemetry.svelte.js';
  import { makeCtx } from '../lib/ctx.js';
  import { layout, profile, saveLayout } from '../lib/layout.svelte.js';
  import { drag } from '../lib/drag.svelte.js';
  import { prefs } from '../lib/prefs.svelte.js';
  import { api } from '../lib/api.js';
  import { uid } from '../lib/util.js';
  import { defaultLayout } from '../lib/defaultLayout.js';

  let { editing = $bindable(false) } = $props();

  const ctx = $derived(makeCtx(tele));
  const p = $derived(profile());

  let editW = $state(null); // { w, panel }
  let editP = $state(null);
  let editScreens = $state(false);
  let liveActions = $state([]);

  $effect(() => {
    if (!editing) return;
    api('/api/actions').then((r) => (liveActions = (r.actions || []).map((a) => a.action_name || a.actionName).filter(Boolean))).catch(() => {});
  });

  function addPanel(side) {
    p.rails[side].push({ id: `p-${uid()}`, title: 'New panel', cols: 2, widgets: [] });
    layout.dirty = true;
    editP = p.rails[side][p.rails[side].length - 1];
  }

  async function done() {
    if (layout.dirty) await saveLayout();
    editing = false;
  }
  function discard() {
    layout.dirty = false;
    layout.value = tele.layouts?.profiles?.length ? structuredClone($state.snapshot(tele.layouts)) : defaultLayout();
  }
</script>

{#if editing}
  <div class="editbar">
    <span class="msg">Editing layout · drag <b>⠿</b> to move · tap to configure</span>
    <button class="ui-btn small" onclick={() => (editScreens = true)}>Screens</button>
    <button class="ui-btn small" onclick={discard} disabled={!layout.dirty}>Discard</button>
    <button class="ui-btn small primary" onclick={done}>{layout.dirty ? 'Save & close' : 'Close'}</button>
  </div>
{/if}

<div class="cockpit" class:hide-rails={prefs.railsPortrait === 'hidden'} style:--rail-scale={prefs.railScale}>
  <div class="left">
    <Rail side="left" panels={p.rails.left} {ctx} {editing} onEditWidget={(w, panel) => (editW = { w, panel })} onEditPanel={(x) => (editP = x)} onAddPanel={addPanel} />
  </div>
  <div class="center">
    <Mfd screens={p.screens} {ctx} status={tele.online ? tele.status : { connected: false, error: 'Cannot reach the SC Telemetry server' }} showFutureTabs={p.showFutureTabs !== false} />
  </div>
  <div class="right">
    <Rail side="right" panels={p.rails.right} {ctx} {editing} onEditWidget={(w, panel) => (editW = { w, panel })} onEditPanel={(x) => (editP = x)} onAddPanel={addPanel} />
  </div>
</div>

{#if drag.active}
  <div class="ghost" style:left="{drag.x}px" style:top="{drag.y}px">{drag.label}</div>
{/if}

{#if editW}
  <WidgetEditor w={editW.w} panel={editW.panel} {ctx} {liveActions} onclose={() => (editW = null)} />
{/if}
{#if editP}
  <PanelEditor panel={editP} onclose={() => (editP = null)} onEditWidget={(w, panel) => { editP = null; editW = { w, panel }; }} />
{/if}
{#if editScreens}
  <ScreensEditor onclose={() => (editScreens = false)} />
{/if}

<style>
  .cockpit {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: calc(clamp(120px, 17vw, 230px) * var(--rail-scale, 1)) minmax(0, 1fr) calc(clamp(120px, 17vw, 230px) * var(--rail-scale, 1));
    grid-template-areas: 'left center right';
    gap: clamp(8px, 1.4vw, 18px);
    padding: clamp(6px, 1.2vw, 16px);
  }
  .left { grid-area: left; }
  .center { grid-area: center; }
  .right { grid-area: right; }
  .left,
  .right,
  .center {
    min-height: 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .left :global(.rail),
  .right :global(.rail) {
    flex: 1;
  }
  .left :global(.rail) {
    justify-content: safe center;
  }

  /* Portrait / narrow: screen on top, the two rails side by side below. */
  @media (max-aspect-ratio: 1/1), (max-width: 620px) {
    .cockpit {
      grid-template-columns: 1fr 1fr;
      grid-template-rows: minmax(260px, 58%) minmax(0, 1fr);
      grid-template-areas: 'center center' 'left right';
    }
    .cockpit.hide-rails {
      grid-template-rows: 1fr;
      grid-template-areas: 'center center';
    }
    .cockpit.hide-rails .left,
    .cockpit.hide-rails .right {
      display: none;
    }
  }

  .editbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: color-mix(in srgb, var(--ink) 14%, var(--ui-bg));
    border-bottom: 1px solid var(--ink-dim);
    animation: slide 0.2s ease-out;
  }
  .msg {
    flex: 1;
    font-size: 13px;
    color: var(--ui-text);
    min-width: 200px;
  }
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
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.6);
  }
  @keyframes slide {
    from { transform: translateY(-100%); }
  }
</style>
