<script>
  import Modal from './Modal.svelte';
  import { layout, profile } from '../../lib/layout.svelte.js';
  import { SCREEN_TYPES } from '../../lib/defaultLayout.js';
  import { uid } from '../../lib/util.js';

  let { onclose } = $props();
  const p = $derived(profile());
  const touch = () => (layout.dirty = true);

  function shift(i, d) {
    const j = i + d;
    if (j < 0 || j >= p.screens.length) return;
    const [s] = p.screens.splice(i, 1);
    p.screens.splice(j, 0, s);
    touch();
  }
  function remove(i) {
    if (p.screens.length <= 1) return;
    p.screens.splice(i, 1);
    touch();
  }
  function add(type) {
    p.screens.push({ id: `scr-${uid()}`, type });
    touch();
  }
</script>

<Modal title="Screens" {onclose}>
  <p class="note">Swipe order on the display. Each screen type can be added more than once (e.g. one per device profile).</p>
  <ol class="list">
    {#each p.screens as s, i (s.id)}
      <li>
        <span class="name">{SCREEN_TYPES[s.type]?.name || s.type}</span>
        <input class="ui-input tab" value={s.tab || ''} placeholder={SCREEN_TYPES[s.type]?.tab} maxlength="5" oninput={(e) => { s.tab = e.currentTarget.value.toUpperCase() || undefined; touch(); }} aria-label="Tab label" />
        <button class="ui-btn small" onclick={() => shift(i, -1)} aria-label="Move up">▲</button>
        <button class="ui-btn small" onclick={() => shift(i, 1)} aria-label="Move down">▼</button>
        <button class="ui-btn small danger" onclick={() => remove(i)} disabled={p.screens.length <= 1} aria-label="Remove">✕</button>
      </li>
    {/each}
  </ol>
  <div class="adds">
    {#each Object.entries(SCREEN_TYPES) as [k, t]}
      <button class="ui-btn small" onclick={() => add(k)}>+ {t.name}</button>
    {/each}
  </div>
  <label class="ui-check"><input type="checkbox" checked={p.showFutureTabs !== false} onchange={(e) => { p.showFutureTabs = e.currentTarget.checked; touch(); }} /> Show unbuilt MFD tabs (WPN, THR, PROX…) dimmed</label>
  {#snippet footer()}
    <button class="ui-btn primary" onclick={onclose}>Done</button>
  {/snippet}
</Modal>

<style>
  .note {
    margin: 0;
    color: var(--ui-text-dim);
    font-size: 13px;
  }
  .list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 8px;
  }
  li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    border: 1px solid var(--ui-line);
    border-radius: 8px;
  }
  .name {
    flex: 1;
  }
  .tab {
    width: 80px;
    min-height: 32px;
    padding: 4px 8px;
  }
  .adds {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
</style>
