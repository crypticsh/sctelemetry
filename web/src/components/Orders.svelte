<script>
  // Open commodity orders: what still has to go down the freight elevator.
  import { api } from '../lib/api.js';
  import { tele } from '../lib/telemetry.svelte.js';
  import { toast } from '../lib/toast.svelte.js';

  const COMMODITIES = [
    'Agricium', 'Agricultural Supplies', 'Aluminum', 'Aphorite', 'Astatine', 'Beryl', 'Bexalite', 'Borase', 'Copper', 'Corundum',
    'Diamond', 'Dolivine', 'Feynmaline', 'Gold', 'Hadanite', 'Hephaestanite', 'Hydrogen', 'Inert Materials', 'Iron', 'Janalite',
    'Laranite', 'Medical Supplies', 'Processed Food', 'Quantanium', 'Quartz', 'Recycled Material Composite', 'Scrap', 'Stims',
    'Taranite', 'Titanium', 'Tungsten', 'Waste',
  ];

  let orders = $state([]);
  let elevator = $state([]);
  let loaded = $state(false);
  let showDone = $state(false);
  let form = $state({ kind: 'sell', item: '', qty: 1, unit: 'unit', price: '', location: '', note: '' });
  let editing = $state(null);

  async function load() {
    try {
      const r = await api('/api/orders');
      orders = r.orders;
      elevator = r.elevator || [];
      loaded = true;
    } catch (e) {
      toast(e.message, 'warn');
    }
  }
  $effect(() => {
    tele.ordersRev;
    load();
  });

  const here = $derived(tele.loc?.placeName || '');
  const open = $derived(orders.filter((o) => o.status === 'open' || o.status === 'sent'));
  const closed = $derived(orders.filter((o) => o.status === 'done' || o.status === 'cancelled'));
  // Group by where the order was placed: that's the elevator they go down.
  const groups = $derived.by(() => {
    const m = new Map();
    for (const o of open) {
      const k = o.location || 'Location not set';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(o);
    }
    return [...m.entries()].sort((a, b) => (b[0] === here) - (a[0] === here));
  });
  const value = (list) => list.reduce((a, o) => a + (o.price || 0), 0);
  const qtyText = (o) => (o.qty == null ? '' : `${o.qty} ${o.unit === 'unit' ? (o.qty === 1 ? 'unit' : 'units') : o.unit.toUpperCase()} `);
  const fmt = (n) => (n == null ? '—' : Math.round(n).toLocaleString());

  async function add(e) {
    e.preventDefault();
    if (!form.item.trim()) return toast('Enter what the order is for', 'warn');
    try {
      await api('/api/orders', { method: 'POST', body: { ...form, location: form.location || undefined } });
      form = { ...form, item: '', qty: 1, price: '', note: '' };
      toast('Order added');
      load();
    } catch (err) {
      toast(err.message, 'warn');
    }
  }
  async function set(o, patch) {
    try {
      await api(`/api/orders/${o.id}`, { method: 'PATCH', body: patch });
      load();
    } catch (err) {
      toast(err.message, 'warn');
    }
  }
  let confirmDel = $state(null);
  async function del(o) {
    if (confirmDel !== o.id) { confirmDel = o.id; setTimeout(() => (confirmDel = null), 3000); return; }
    await api(`/api/orders/${o.id}`, { method: 'DELETE' });
    confirmDel = null;
    load();
  }
  const when = (t) => new Date(t * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
</script>

<div class="ui-page">
  <div class="ui-page-inner">
    <section class="summary">
      <div class="tile"><span class="k">Open orders</span><span class="v">{open.filter((o) => o.status === 'open').length}</span><span class="s">waiting for the freight elevator</span></div>
      <div class="tile"><span class="k">Sent down</span><span class="v">{open.filter((o) => o.status === 'sent').length}</span><span class="s">sent, not confirmed sold</span></div>
      <div class="tile"><span class="k">Value open</span><span class="v">{fmt(value(open))}</span><span class="s">aUEC</span></div>
    </section>

    <section class="ui-card">
      <h2>Add an order</h2>
      <form class="add" onsubmit={add}>
        <label class="ui-field kind">
          Type
          <select class="ui-select" bind:value={form.kind} id="o-kind"><option value="sell">Sell</option><option value="buy">Buy</option></select>
        </label>
        <label class="ui-field item">
          Commodity or item
          <input class="ui-input" list="commodities" bind:value={form.item} id="o-item" placeholder="Hadanite" autocomplete="off" />
        </label>
        <label class="ui-field qty">
          Quantity
          <input class="ui-input" type="number" min="0" step="any" bind:value={form.qty} id="o-qty" />
        </label>
        <label class="ui-field unit">
          Unit
          <select class="ui-select" bind:value={form.unit} id="o-unit"><option value="unit">units</option><option value="scu">SCU</option><option value="cscu">cSCU</option></select>
        </label>
        <label class="ui-field price">
          Total (aUEC)
          <input class="ui-input" type="number" min="0" step="1" bind:value={form.price} id="o-price" placeholder="416" />
        </label>
        <label class="ui-field loc">
          Where (elevator)
          <input class="ui-input" bind:value={form.location} id="o-loc" placeholder={here || 'New Babbage'} />
        </label>
        <button class="ui-btn primary" type="submit">Add</button>
      </form>
      <datalist id="commodities">{#each COMMODITIES as c}<option value={c}></option>{/each}</datalist>
      <p class="hint">Orders you place at a commodity kiosk are added from Game.log automatically, with the price and place. The log doesn't name the commodity or the amount, so name each new commodity once ("Name it"), and it's remembered after that. Where defaults to your current place{here ? ` (${here})` : ''}. Orders are shared by every device.</p>
    </section>

    {#if elevator.length}
      <section class="ui-card">
        <h2>Freight elevator activity</h2>
        <ul class="elev">
          {#each elevator as e}<li><span class="dim">{when(e.t)}</span> {e.text}</li>{/each}
        </ul>
        <p class="hint">From Game.log. The game logs the elevator moving and how many items went on it, but not whether a sale completed, so mark orders yourself when they're done.</p>
      </section>
    {/if}

    {#if loaded && !open.length}
      <section class="ui-card empty">No open orders. Add one above when you place an order at a commodity kiosk.</section>
    {/if}

    {#each groups as [loc, list] (loc)}
      <section class="ui-card">
        <div class="gh">
          <h2>{loc}</h2>
          {#if loc === here}<span class="chip ok">You are here</span>{/if}
          <span class="dim">{list.length} order{list.length === 1 ? '' : 's'} · {fmt(value(list))} aUEC</span>
        </div>
        <ul class="list">
          {#each list as o (o.id)}
            <li class:sent={o.status === 'sent'}>
              <div class="main">
                <span class="kindtag {o.kind}">{o.kind}</span>
                <b>{qtyText(o)}{o.item}</b>
                {#if o.item === 'Unknown commodity'}<button class="ui-btn small name" onclick={() => (editing = { ...o, item: '' })}>Name it</button>{/if}
                <span class="price">{o.price != null ? `${fmt(o.price)} aUEC` : ''}</span>
              </div>
              <div class="meta dim">
                {when(o.created)}{o.shop ? ` · ${o.shop}` : ''}{o.status === 'sent' ? ' · sent down the elevator' : ''}{o.note ? ` · ${o.note}` : ''}{o.source === 'log' ? ' · from Game.log' : ''}
              </div>
              <div class="acts">
                {#if o.status === 'open'}
                  <button class="ui-btn small primary" onclick={() => set(o, { status: 'sent' })}>Sent down</button>
                {:else}
                  <button class="ui-btn small" onclick={() => set(o, { status: 'open' })}>Not sent</button>
                {/if}
                <button class="ui-btn small" onclick={() => set(o, { status: 'done' })}>Completed</button>
                <button class="ui-btn small" onclick={() => (editing = { ...o })}>Edit</button>
                <button class="ui-btn small danger" onclick={() => set(o, { status: 'cancelled' })}>Cancel</button>
              </div>
            </li>
          {/each}
        </ul>
      </section>
    {/each}

    {#if closed.length}
      <section class="ui-card">
        <button class="ui-btn small" onclick={() => (showDone = !showDone)}>{showDone ? 'Hide' : 'Show'} finished orders ({closed.length})</button>
        {#if showDone}
          <ul class="list done">
            {#each closed as o (o.id)}
              <li>
                <div class="main"><span class="kindtag {o.kind}">{o.kind}</span><b>{qtyText(o)}{o.item}</b><span class="price">{o.price != null ? `${fmt(o.price)} aUEC` : ''}</span></div>
                <div class="meta dim">{o.status === 'done' ? 'Completed' : 'Cancelled'} {when(o.updated)} · {o.location || 'no location'}</div>
                <div class="acts">
                  <button class="ui-btn small" onclick={() => set(o, { status: 'open' })}>Reopen</button>
                  <button class="ui-btn small danger" onclick={() => del(o)}>{confirmDel === o.id ? 'Tap again to delete' : 'Delete'}</button>
                </div>
              </li>
            {/each}
          </ul>
          <p class="hint">Finished orders are deleted after the number of days set in Settings → Data kept.</p>
        {/if}
      </section>
    {/if}
  </div>
</div>

{#if editing}
  <div class="scrim" onclick={() => (editing = null)} role="presentation"></div>
  <div class="dlg ui-card" role="dialog" aria-label="Edit order">
    <h2>Edit order</h2>
    <div class="egrid">
      <label class="ui-field">Commodity or item<input class="ui-input" list="commodities" bind:value={editing.item} id="e-item" placeholder="Hadanite" /></label>
      <label class="ui-field">Quantity<input class="ui-input" type="number" min="0" step="any" bind:value={editing.qty} id="e-qty" /></label>
      <label class="ui-field">Total (aUEC)<input class="ui-input" type="number" min="0" bind:value={editing.price} id="e-price" /></label>
      <label class="ui-field">Where<input class="ui-input" bind:value={editing.location} id="e-loc" /></label>
      <label class="ui-field full">Note<input class="ui-input" bind:value={editing.note} id="e-note" maxlength="200" /></label>
    </div>
    <div class="dacts">
      <button class="ui-btn" onclick={() => (editing = null)}>Cancel</button>
      <button class="ui-btn primary" onclick={async () => { const e = editing; editing = null; await set(e, { item: e.item, qty: e.qty, price: e.price, location: e.location, note: e.note }); }}>Save</button>
    </div>
  </div>
{/if}

<style>
  .dim { color: var(--ui-text-dim); }
  .hint { font-size: 12px; color: var(--ui-text-dim); margin: 10px 0 0; }
  .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
  .tile { display: grid; gap: 4px; padding: 14px 16px; border-radius: 12px; background: var(--ui-bg); border: 1px solid var(--ui-line); }
  .tile .k { font-size: 12px; color: var(--ui-text-dim); letter-spacing: 0.06em; text-transform: uppercase; }
  .tile .v { font: 600 26px var(--font-label); font-variant-numeric: tabular-nums; }
  .tile .s { font-size: 12px; color: var(--ui-text-dim); }
  .add { display: grid; grid-template-columns: 110px minmax(160px, 2fr) 100px 100px 130px minmax(140px, 1.5fr) auto; gap: 10px; align-items: end; }
  @media (max-width: 900px) { .add { grid-template-columns: 1fr 1fr; } .add .item, .add .loc { grid-column: 1 / -1; } }
  .empty { color: var(--ui-text-dim); }
  .gh { display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px; margin-bottom: 8px; }
  .gh h2 { margin: 0; }
  .chip { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--ui-line); }
  .chip.ok { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 50%, transparent); }
  .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0; }
  .list li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 12px; padding: 12px 0; border-top: 1px solid var(--ui-line); }
  .list li.sent { opacity: 0.75; }
  .main { display: flex; flex-wrap: wrap; gap: 10px; align-items: baseline; font-size: 15px; }
  .price { color: var(--ink); font-variant-numeric: tabular-nums; }
  .meta { font-size: 12px; grid-column: 1; }
  .acts { grid-column: 2; grid-row: 1 / span 2; display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; align-items: center; }
  @media (max-width: 640px) { .list li { grid-template-columns: 1fr; } .acts { grid-column: 1; grid-row: auto; justify-content: flex-start; } }
  .elev { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; font-size: 14px; }
  .name { min-height: 26px; padding: 2px 8px; }
  .kindtag { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; padding: 2px 6px; border-radius: 4px; border: 1px solid; }
  .kindtag.sell { color: var(--ok); }
  .kindtag.buy { color: var(--info); }
  .scrim { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6); z-index: 50; }
  .dlg { position: fixed; z-index: 51; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(520px, calc(100vw - 24px)); display: grid; gap: 14px; }
  .dlg h2 { margin: 0; }
  .egrid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .egrid .full { grid-column: 1 / -1; }
  .dacts { display: flex; justify-content: flex-end; gap: 8px; }
</style>
