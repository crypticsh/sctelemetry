<script>
  // Configure one widget: type, label, what it shows, what it does.
  import Modal from './Modal.svelte';
  import Widget from '../widgets/Widget.svelte';
  import { BINDINGS, ACTIONS, BINDING_LABEL } from '../../lib/catalog.js';
  import { WIDGET_TYPES } from '../../lib/defaultLayout.js';
  import { layout, profile } from '../../lib/layout.svelte.js';
  import { uid } from '../../lib/util.js';

  let { w, panel, ctx, liveActions = [], onclose } = $props();

  const fields = $derived(new Set(WIDGET_TYPES[w.type]?.fields || []));
  const allPanels = $derived([...profile().rails.left, ...profile().rails.right]);
  let customBind = $state(false);
  const actionGroups = $derived(liveActions.length ? [{ group: 'From the game', items: liveActions }, ...ACTIONS] : ACTIONS);

  function touch() {
    layout.dirty = true;
  }
  function set(k, v) {
    if (v === '' || v == null) delete w[k];
    else w[k] = v;
    touch();
  }
  function remove() {
    const i = panel.widgets.indexOf(w);
    if (i >= 0) panel.widgets.splice(i, 1);
    touch();
    onclose();
  }
  function duplicate() {
    const i = panel.widgets.indexOf(w);
    panel.widgets.splice(i + 1, 0, { ...$state.snapshot(w), id: `w-${uid()}` });
    touch();
    onclose();
  }
  function moveTo(id) {
    const target = allPanels.find((p) => p.id === id);
    if (!target || target === panel) return;
    panel.widgets.splice(panel.widgets.indexOf(w), 1);
    target.widgets.push(w);
    touch();
    onclose();
  }
  function shift(d) {
    const i = panel.widgets.indexOf(w);
    const j = i + d;
    if (j < 0 || j >= panel.widgets.length) return;
    panel.widgets.splice(i, 1);
    panel.widgets.splice(j, 0, w);
    touch();
  }
</script>

{#snippet bindSelect(key, label, hint)}
  <label class="ui-field">
    {label}
    {#if customBind || (w[key] && !BINDING_LABEL[w[key]])}
      <input class="ui-input mono" value={w[key] || ''} onchange={(e) => set(key, e.currentTarget.value.trim())} placeholder="ship.gear or raw.vehicle.state…" />
    {:else}
      <select class="ui-select" value={w[key] || ''} onchange={(e) => set(key, e.currentTarget.value)}>
        <option value="">— none —</option>
        {#each BINDINGS as g}
          <optgroup label={g.group}>
            {#each g.items as [p, l]}<option value={p}>{l}</option>{/each}
          </optgroup>
        {/each}
      </select>
    {/if}
    {#if hint}<span class="hint">{hint}</span>{/if}
  </label>
{/snippet}

{#snippet actionSelect(key, label)}
  <label class="ui-field">
    {label}
    <input class="ui-input mono" list="sct-actions" value={w[key] || ''} onchange={(e) => set(key, e.currentTarget.value.trim())} placeholder="none" />
  </label>
{/snippet}

<datalist id="sct-actions">
  {#each actionGroups as g}{#each g.items as a}<option value={a}>{g.group}</option>{/each}{/each}
</datalist>

<Modal title="Configure widget" {onclose}>
  <div class="preview" style:--cols="1">
    <div class="pv"><Widget {w} {ctx} editing /></div>
  </div>

  <div class="row2">
    <label class="ui-field">
      Type
      <select class="ui-select" value={w.type} onchange={(e) => set('type', e.currentTarget.value)}>
        {#each Object.entries(WIDGET_TYPES) as [k, t]}<option value={k}>{t.name}</option>{/each}
      </select>
    </label>
    <label class="ui-field">
      Label
      <input class="ui-input" value={w.label || ''} oninput={(e) => set('label', e.currentTarget.value)} maxlength="16" />
    </label>
  </div>

  {#if fields.has('bind')}
    {@render bindSelect('bind', w.type === 'button' ? 'Light up when (optional)' : 'Shows')}
    <label class="ui-check"><input type="checkbox" checked={customBind} onchange={(e) => (customBind = e.currentTarget.checked)} /> Type a custom data path<small>See Settings → Live data inspector for every field the game sends.</small></label>
  {/if}
  {#if fields.has('sub')}
    {#if w.type === 'button'}
      <label class="ui-field">Small caption above<input class="ui-input" value={w.sub || ''} oninput={(e) => set('sub', e.currentTarget.value)} maxlength="16" /></label>
    {:else}
      {@render bindSelect('sub', 'Second value (shown small)')}
    {/if}
  {/if}
  {#if fields.has('invert')}
    <label class="ui-check"><input type="checkbox" checked={!!w.invert} onchange={(e) => set('invert', e.currentTarget.checked || null)} /> Invert (lit when false)</label>
  {/if}

  {#if fields.has('format')}
    <div class="row3">
      <label class="ui-field">
        Format
        <select class="ui-select" value={w.format || 'number'} onchange={(e) => set('format', e.currentTarget.value)}>
          <option value="number">Number</option>
          <option value="percent">Percent (0–1 → %)</option>
          <option value="compact">Compact (13.7K)</option>
          <option value="text">Text</option>
        </select>
      </label>
      {#if fields.has('decimals')}
        <label class="ui-field">Decimals<input class="ui-input" type="number" min="0" max="4" value={w.decimals ?? 0} onchange={(e) => set('decimals', +e.currentTarget.value)} /></label>
      {/if}
      {#if fields.has('unit')}
        <label class="ui-field">Unit<input class="ui-input" value={w.unit || ''} oninput={(e) => set('unit', e.currentTarget.value)} maxlength="6" /></label>
      {/if}
    </div>
  {:else if fields.has('unit')}
    <label class="ui-field">Unit<input class="ui-input" value={w.unit || ''} oninput={(e) => set('unit', e.currentTarget.value)} maxlength="6" /></label>
  {/if}
  {#if fields.has('min') || fields.has('max')}
    <div class="row2">
      {#if fields.has('min')}<label class="ui-field">Min<input class="ui-input" type="number" value={w.min ?? 0} onchange={(e) => set('min', +e.currentTarget.value)} /></label>{/if}
      <label class="ui-field">Max<input class="ui-input" type="number" value={w.max ?? ''} onchange={(e) => set('max', +e.currentTarget.value)} /></label>
    </div>
  {/if}

  {#if fields.has('action')}
    {@render actionSelect('action', w.type === 'switch' ? 'Action (toggle)' : 'Action on tap')}
  {/if}
  {#if fields.has('actionOn')}
    <div class="row2">
      {@render actionSelect('actionOn', 'Action when switched on')}
      {@render actionSelect('actionOff', 'Action when switched off')}
    </div>
    <span class="hint">Explicit on/off actions keep the switch in step with the ship. If set, they are used instead of the toggle action.</span>
  {/if}
  {#if fields.has('holdMs')}
    <label class="ui-field">Hold (ms, only for holdable actions like v_invoke_ping)<input class="ui-input" type="number" min="0" max="10000" value={w.holdMs ?? 0} onchange={(e) => set('holdMs', +e.currentTarget.value || null)} /></label>
  {/if}
  <div class="row2">
    {#if fields.has('color')}
      <label class="ui-field">
        Color
        <select class="ui-select" value={w.color || 'accent'} onchange={(e) => set('color', e.currentTarget.value === 'accent' ? null : e.currentTarget.value)}>
          <option value="accent">Theme</option><option value="green">Green</option><option value="red">Red</option><option value="amber">Amber</option><option value="blue">Blue</option>
        </select>
      </label>
    {/if}
    <label class="ui-field">
      Width
      <select class="ui-select" value={w.span ? 'full' : 'cell'} onchange={(e) => set('span', e.currentTarget.value === 'full' || null)}>
        <option value="cell">One cell</option><option value="full">Full panel width</option>
      </select>
    </label>
  </div>
  {#if fields.has('confirm')}
    <label class="ui-check"><input type="checkbox" checked={!!w.confirm} onchange={(e) => set('confirm', e.currentTarget.checked || null)} /> Ask before sending</label>
  {/if}
  {#if fields.has('compact')}
    <label class="ui-check"><input type="checkbox" checked={!!w.compact} onchange={(e) => set('compact', e.currentTarget.checked || null)} /> Compact</label>
  {/if}

  <div class="row2">
    <label class="ui-field">
      Move to panel
      <select class="ui-select" value={panel.id} onchange={(e) => moveTo(e.currentTarget.value)}>
        {#each allPanels as p}<option value={p.id}>{p.title || p.id}</option>{/each}
      </select>
    </label>
    <div class="ui-field">
      Order
      <div class="order">
        <button class="ui-btn" onclick={() => shift(-1)}>◀ Earlier</button>
        <button class="ui-btn" onclick={() => shift(1)}>Later ▶</button>
      </div>
    </div>
  </div>

  {#snippet footer()}
    <button class="ui-btn danger" onclick={remove}>Delete</button>
    <button class="ui-btn" onclick={duplicate}>Duplicate</button>
    <span style="flex:1"></span>
    <button class="ui-btn primary" onclick={onclose}>Done</button>
  {/snippet}
</Modal>

<style>
  .preview {
    display: grid;
    place-items: center;
    padding: 14px;
    border-radius: 10px;
    background: var(--panel);
  }
  .pv {
    width: min(200px, 60%);
    pointer-events: none;
  }
  .row2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .row3 {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr;
    gap: 12px;
  }
  .order {
    display: flex;
    gap: 8px;
  }
  .order .ui-btn {
    flex: 1;
    padding: 6px;
  }
  .hint {
    font-size: 12px;
    color: var(--ui-text-dim);
    margin-top: -6px;
  }
  @media (max-width: 480px) {
    .row2,
    .row3 {
      grid-template-columns: 1fr;
    }
  }
</style>
