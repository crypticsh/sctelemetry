<script>
  import Modal from './Modal.svelte';
  import { layout, profile } from '../../lib/layout.svelte.js';
  import { WIDGET_TYPES, newWidget } from '../../lib/defaultLayout.js';

  let { panel, onclose, onEditWidget } = $props();

  const side = $derived(profile().rails.left.includes(panel) ? 'left' : 'right');
  const touch = () => (layout.dirty = true);

  function set(k, v) {
    panel[k] = v;
    touch();
  }
  function add(type) {
    const w = newWidget(type);
    panel.widgets.push(w);
    touch();
    onEditWidget(panel.widgets[panel.widgets.length - 1], panel);
  }
  function remove() {
    if (panel.widgets.length && !confirm(`Delete this panel and its ${panel.widgets.length} widget(s)?`)) return;
    const list = profile().rails[side];
    list.splice(list.indexOf(panel), 1);
    touch();
    onclose();
  }
  function moveSide() {
    const p = profile();
    p.rails[side].splice(p.rails[side].indexOf(panel), 1);
    p.rails[side === 'left' ? 'right' : 'left'].push(panel);
    touch();
    onclose();
  }
  function shift(d) {
    const list = profile().rails[side];
    const i = list.indexOf(panel);
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    list.splice(i, 1);
    list.splice(j, 0, panel);
    touch();
  }
</script>

<Modal title="Panel" {onclose}>
  <div class="row2">
    <label class="ui-field">Title (optional)<input class="ui-input" value={panel.title || ''} oninput={(e) => set('title', e.currentTarget.value)} maxlength="20" /></label>
    <label class="ui-field">
      Columns
      <select class="ui-select" value={panel.cols || 1} onchange={(e) => set('cols', +e.currentTarget.value)}>
        {#each [1, 2, 3, 4, 5, 6] as n}<option value={n}>{n}</option>{/each}
      </select>
    </label>
  </div>
  <label class="ui-field">
    Style
    <select class="ui-select" value={panel.style || 'plain'} onchange={(e) => set('style', e.currentTarget.value === 'plain' ? undefined : e.currentTarget.value)}>
      <option value="plain">Plain plate</option>
      <option value="hazard">Hazard stripes</option>
    </select>
  </label>
  <div class="ui-field">
    Add a widget
    <div class="adds">
      {#each Object.entries(WIDGET_TYPES) as [k, t]}
        <button class="ui-btn small" onclick={() => add(k)}>+ {t.name}</button>
      {/each}
    </div>
  </div>
  <div class="ui-field">
    Position
    <div class="adds">
      <button class="ui-btn small" onclick={() => shift(-1)}>▲ Up</button>
      <button class="ui-btn small" onclick={() => shift(1)}>▼ Down</button>
      <button class="ui-btn small" onclick={moveSide}>Move to {side === 'left' ? 'right' : 'left'} side</button>
    </div>
  </div>
  {#snippet footer()}
    <button class="ui-btn danger" onclick={remove}>Delete panel</button>
    <span style="flex:1"></span>
    <button class="ui-btn primary" onclick={onclose}>Done</button>
  {/snippet}
</Modal>

<style>
  .row2 {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 12px;
  }
  .adds {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
</style>
