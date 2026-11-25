<script>
  import Modal from '../editor/Modal.svelte';
  import GaugeView from './GaugeView.svelte';
  import { GAUGES, SIZES, gid } from '../../gauges/catalog.js';
  import { layout } from '../../lib/layout.svelte.js';

  let { item, items, onclose } = $props();
  const def = $derived(GAUGES[item.type]);
  const fields = $derived(def.fields || GAUGES[def.base]?.fields || []);
  const opts = $derived({ ...(def.defaults || {}), ...(item.opts || {}) });

  function set(k, v) {
    item.opts = { ...(item.opts || {}), [k]: v };
    layout.dirty = true;
  }
  function resetOpts() {
    item.opts = {};
    layout.dirty = true;
  }
  function remove() {
    items.splice(items.indexOf(item), 1);
    layout.dirty = true;
    onclose();
  }
  function duplicate() {
    items.splice(items.indexOf(item) + 1, 0, { ...$state.snapshot(item), id: gid() });
    layout.dirty = true;
    onclose();
  }
</script>

<Modal title={def.name} {onclose}>
  <p class="desc">{def.desc} <span class="src {def.src}">{def.src}</span></p>
  {#if def.kind === 'dial' || def.kind === 'strip'}
    <div class="pv" class:strip={def.kind === 'strip'}><GaugeView {item} /></div>
  {/if}
  <div class="row">
    <label class="ui-field">
      Label under the gauge
      <input class="ui-input" value={item.label ?? ''} placeholder={def.name} oninput={(e) => { item.label = e.currentTarget.value || undefined; layout.dirty = true; }} maxlength="28" />
    </label>
    <label class="ui-field">
      Size
      <select class="ui-select" value={item.size} onchange={(e) => { item.size = e.currentTarget.value; layout.dirty = true; }}>
        {#each SIZES as [k, l]}<option value={k}>{l}</option>{/each}
      </select>
    </label>
  </div>
  {#if fields.length}
    <div class="row">
      {#each fields as f (f.key)}
        <label class="ui-field">
          {f.label}
          {#if f.type === 'select'}
            <select class="ui-select" value={opts[f.key]} onchange={(e) => set(f.key, e.currentTarget.value)}>
              {#each f.options as [v, l]}<option value={v}>{l}</option>{/each}
            </select>
          {:else if f.type === 'text'}
            <input class="ui-input" value={opts[f.key]} onchange={(e) => set(f.key, e.currentTarget.value.toUpperCase())} maxlength="20" />
          {:else if f.type === 'percent'}
            <input class="ui-input" type="number" min="0" max="100" step="1" value={Math.round(opts[f.key] * 100)} onchange={(e) => set(f.key, +e.currentTarget.value / 100)} />
          {:else}
            <input class="ui-input" type="number" step={f.step || 1} value={opts[f.key]} onchange={(e) => set(f.key, +e.currentTarget.value)} />
          {/if}
        </label>
      {/each}
    </div>
    <button class="ui-btn small" onclick={resetOpts}>Restore default settings</button>
  {/if}
  {#snippet footer()}
    <button class="ui-btn danger" onclick={remove}>Remove</button>
    <button class="ui-btn" onclick={duplicate}>Duplicate</button>
    <span style="flex:1"></span>
    <button class="ui-btn primary" onclick={onclose}>Done</button>
  {/snippet}
</Modal>

<style>
  .desc { margin: 0; color: var(--ui-text-dim); font-size: 13px; line-height: 1.5; }
  .pv { width: min(220px, 70%); margin: 0 auto; }
  .pv.strip { width: min(300px, 90%); }
  .row { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
  .src { font: 600 10px var(--font-label); letter-spacing: 0.08em; text-transform: uppercase; padding: 1px 6px; border-radius: 4px; border: 1px solid; }
  .src.direct { color: var(--ok); }
  .src.calc { color: var(--info); }
  .src.est { color: var(--warn); }
</style>
