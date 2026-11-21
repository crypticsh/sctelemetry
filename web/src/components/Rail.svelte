<script>
  // A column of panels beside the screen. In edit mode: drag handles,
  // tap-to-configure and drop markers.
  import Widget from './widgets/Widget.svelte';
  import { drag, startDrag } from '../lib/drag.svelte.js';

  let { side, panels, ctx, editing = false, onEditWidget, onEditPanel, onAddPanel } = $props();
</script>

<div class="rail {side}" data-prail={editing ? side : undefined} class:editing>
  {#each panels as panel, pi (panel.id)}
    <div
      class="panel"
      class:hazard={panel.style === 'hazard'}
      class:dragging={drag.active && drag.kind === 'panel' && drag.id === panel.id}
      class:drop-before={drag.kind === 'panel' && drag.target?.key === `${side}:${pi}`}
      class:drop-after={drag.kind === 'panel' && pi === panels.length - 1 && drag.target?.key === `${side}:${pi + 1}`}
      data-pslot={editing ? '' : undefined}
      data-side={side}
      data-index={pi}
    >
      <span class="rivet tl"></span><span class="rivet tr"></span><span class="rivet bl"></span><span class="rivet br"></span>
      {#if editing}
        <div class="ptools">
          <button class="handle" onpointerdown={(e) => startDrag(e, 'panel', panel.id, panel.title || 'Panel')} aria-label="Drag panel">⠿</button>
          <span class="pname">{panel.title || 'Panel'}</span>
          <button class="tool" onclick={() => onEditPanel(panel)} aria-label="Panel settings">⚙</button>
        </div>
      {/if}
      {#if panel.title}<div class="ptitle">{panel.title}</div>{/if}
      <div class="grid" style:--cols={panel.cols || 1} data-wpanel={editing ? panel.id : undefined}>
        {#each panel.widgets as w, wi (w.id)}
          <div
            class="slot"
            class:span={w.span}
            class:dragging={drag.active && drag.kind === 'widget' && drag.id === w.id}
            class:drop-before={drag.kind === 'widget' && drag.target?.key === `${panel.id}:${wi}`}
            class:drop-after={drag.kind === 'widget' && wi === panel.widgets.length - 1 && drag.target?.key === `${panel.id}:${wi + 1}`}
            data-wslot={editing ? '' : undefined}
            data-panel={panel.id}
            data-index={wi}
          >
            <Widget {w} {ctx} {editing} />
            {#if editing}
              <button class="cover" onclick={() => onEditWidget(w, panel)} aria-label="Configure {w.label}"></button>
              <button class="whandle" onpointerdown={(e) => startDrag(e, 'widget', w.id, w.label)} aria-label="Drag {w.label}">⠿</button>
            {/if}
          </div>
        {/each}
        {#if editing && !panel.widgets.length}
          <div class="empty">Drop widgets here</div>
        {/if}
      </div>
    </div>
  {/each}
  {#if editing}
    <button class="addpanel" onclick={() => onAddPanel(side)}>+ Panel</button>
  {/if}
</div>

<style>
  .rail {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 2px;
    scrollbar-width: none;
    --rail-w: 100%;
  }
  .rail::-webkit-scrollbar {
    display: none;
  }
  .panel {
    position: relative;
    padding: 12px 12px 12px;
    border-radius: 10px;
    background: var(--panel);
    box-shadow: 0 0 0 1px #000, inset 0 1px 0 var(--metal-edge), 0 6px 14px rgba(0, 0, 0, 0.5);
    transition: opacity 0.2s, transform 0.2s;
    flex: none;
  }
  .panel.hazard {
    background:
      repeating-linear-gradient(135deg, var(--hazard-a) 0 10px, var(--hazard-b) 10px 20px) bottom / 100% 18px no-repeat,
      var(--panel);
    padding-bottom: 26px;
  }
  .rivet {
    position: absolute;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--rivet);
  }
  .tl { top: 4px; left: 4px; }
  .tr { top: 4px; right: 4px; }
  .bl { bottom: 4px; left: 4px; }
  .br { bottom: 4px; right: 4px; }
  .ptitle {
    font-size: 10px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--label);
    text-align: center;
    margin: -4px 0 8px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .ptitle::before,
  .ptitle::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--label-dim);
    opacity: 0.6;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
    gap: 8px;
    align-items: start;
  }
  .slot {
    position: relative;
    min-width: 0;
  }
  .slot.span {
    grid-column: 1 / -1;
  }
  /* edit mode */
  .editing .panel {
    outline: 1px dashed color-mix(in srgb, var(--ink) 50%, transparent);
    outline-offset: 2px;
  }
  .ptools {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: -4px -4px 8px;
    padding: 4px;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.45);
  }
  .pname {
    flex: 1;
    font-size: 12px;
    color: var(--ui-text-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .handle,
  .tool,
  .whandle {
    border: 0;
    background: var(--ink);
    color: #140a02;
    border-radius: 5px;
    min-width: 32px;
    min-height: 32px;
    cursor: grab;
    touch-action: none;
    font-size: 16px;
    line-height: 1;
  }
  .tool {
    cursor: pointer;
    background: var(--ui-bg-2);
    color: var(--ui-text);
  }
  .cover {
    position: absolute;
    inset: 0;
    background: color-mix(in srgb, var(--ink) 8%, transparent);
    border: 1px dashed color-mix(in srgb, var(--ink) 60%, transparent);
    border-radius: 8px;
    cursor: pointer;
  }
  .whandle {
    position: absolute;
    top: -6px;
    right: -6px;
    min-width: 26px;
    min-height: 26px;
    font-size: 13px;
    border-radius: 50%;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.6);
  }
  .dragging {
    opacity: 0.35;
  }
  .slot.drop-before::before,
  .slot.drop-after::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    width: 4px;
    border-radius: 2px;
    background: var(--ink-hi);
    box-shadow: 0 0 8px var(--ink);
    z-index: 5;
  }
  .slot.drop-before::before { left: -6px; }
  .slot.drop-after::after { right: -6px; }
  .panel.drop-before { box-shadow: 0 -4px 0 var(--ink-hi), 0 0 0 1px #000; }
  .panel.drop-after { box-shadow: 0 4px 0 var(--ink-hi), 0 0 0 1px #000; }
  .empty {
    grid-column: 1 / -1;
    padding: 18px 8px;
    text-align: center;
    font-size: 12px;
    color: var(--ui-text-dim);
    border: 1px dashed var(--ui-line);
    border-radius: 8px;
  }
  .addpanel {
    border: 1px dashed var(--ink-dim);
    background: transparent;
    color: var(--ink);
    border-radius: 10px;
    min-height: 44px;
    cursor: pointer;
    flex: none;
  }
</style>
