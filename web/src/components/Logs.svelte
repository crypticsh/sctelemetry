<script>
  // Flight data recorder: logged channels over a time range, plus the event log.
  import Chart from './logs/Chart.svelte';
  import { api } from '../lib/api.js';
  import { prefs, savePrefs } from '../lib/prefs.svelte.js';

  const CH = {
    speed: { label: 'Speed', unit: ' m/s', f: (v) => Math.round(v) },
    g: { label: 'G-load', unit: ' G', f: (v) => v.toFixed(1) },
    shield: { label: 'Shield level', unit: '%', f: (v) => Math.round(v * 100) },
    hull: { label: 'Hull', unit: '%', f: (v) => Math.round(v * 100) },
    hydrogen: { label: 'Hydrogen fuel', unit: '%', f: (v) => Math.round(v * 100) },
    quantum: { label: 'Quantum fuel', unit: '%', f: (v) => Math.round(v * 100) },
    altitude: { label: 'Altitude', unit: ' m', f: (v) => Math.round(v) },
    radar_alt: { label: 'Radar altitude', unit: ' m', f: (v) => Math.round(v) },
    vsi: { label: 'Vertical speed', unit: ' m/s', f: (v) => v.toFixed(1) },
    heading: { label: 'Heading', unit: '°', f: (v) => Math.round(v) },
    boost: { label: 'Boost reserves', unit: '%', f: (v) => Math.round(v * 100) },
    power_on: { label: 'Systems powered', unit: '', f: (v) => Math.round(v) },
    noise: { label: 'Noise CM', unit: '', f: (v) => Math.round(v) },
    decoy: { label: 'Decoy CM', unit: '', f: (v) => Math.round(v) },
    health: { label: 'Health', unit: '%', f: (v) => Math.round(v * 100) },
    oxygen: { label: 'Oxygen', unit: '%', f: (v) => Math.round(v * 100) },
    heart_rate: { label: 'Heart rate', unit: ' bpm', f: (v) => Math.round(v) },
    pressure: { label: 'Pressure', unit: ' kPa', f: (v) => v.toFixed(1) },
    ext_temp: { label: 'Outside temp', unit: '°C', f: (v) => Math.round(v) },
  };
  const RANGES = [
    ['5m', 300000], ['15m', 900000], ['1h', 3600000], ['6h', 21600000], ['24h', 86400000], ['7d', 604800000],
  ];

  let selected = $state(JSON.parse(localStorage.getItem('sct.logs.ch') || 'null') || ['speed', 'g', 'shield', 'hull', 'hydrogen']);
  let live = $state(true);
  let toTime = $state(null); // null = now
  let data = $state(null);
  let events = $state([]);
  let stats = $state(null);
  let evFilter = $state('all');
  let loading = $state(false);
  let err = $state('');

  const span = $derived(prefs.logsRange);
  const range = $derived.by(() => {
    const to = toTime ?? Date.now();
    return [to - span, to];
  });

  async function load() {
    loading = true;
    try {
      const to = toTime ?? Date.now();
      const from = to - span;
      const q = `from=${from}&to=${to}`;
      const [h, ev, st] = await Promise.all([
        api(`/api/history?${q}&channels=${selected.join(',')}&points=1200`),
        api(`/api/events?${q}&limit=400`),
        api('/api/log/stats'),
      ]);
      data = { ...h, range: [from / 1000, to / 1000] };
      events = ev;
      stats = st;
      err = '';
    } catch (e) {
      err = e.message;
    }
    loading = false;
  }

  $effect(() => {
    selected; span; toTime;
    load();
  });
  $effect(() => {
    if (!live || toTime != null) return;
    const iv = setInterval(load, span <= 900000 ? 3000 : 15000);
    return () => clearInterval(iv);
  });

  function toggle(c) {
    selected = selected.includes(c) ? selected.filter((x) => x !== c) : [...selected, c];
    try { localStorage.setItem('sct.logs.ch', JSON.stringify(selected)); } catch {}
  }
  function setRange(ms) {
    prefs.logsRange = ms;
    savePrefs();
  }
  function step(dir) {
    const base = toTime ?? Date.now();
    const next = base + dir * span * 0.5;
    toTime = next >= Date.now() ? null : next;
  }
  function pickEnd(e) {
    const v = e.currentTarget.value;
    toTime = v ? new Date(v).getTime() : null;
  }
  const localInput = (ms) => {
    const d = new Date(ms - new Date().getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 16);
  };

  const evShown = $derived(events.filter((e) => evFilter === 'all' || e.kind === evFilter));
  const evLabel = (e) => {
    if (e.kind === 'location') return e.value;
    const v = e.value;
    if (v === 'true') return `${e.name.replace(/_/g, ' ')} ON`;
    if (v === 'false') return `${e.name.replace(/_/g, ' ')} OFF`;
    return `${e.name.replace(/_/g, ' ')}${v != null ? ` → ${v}` : ''}`;
  };
  const size = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
</script>

<div class="ui-page">
  <div class="ui-page-inner">
    <div class="bar">
      <div class="seg">
        {#each RANGES as [l, ms]}
          <button class="ui-btn small" class:primary={span === ms} onclick={() => setRange(ms)}>{l}</button>
        {/each}
      </div>
      <div class="seg">
        <button class="ui-btn small" onclick={() => step(-1)} aria-label="Earlier">◀</button>
        <input class="ui-input when" type="datetime-local" value={toTime ? localInput(toTime) : ''} onchange={pickEnd} aria-label="End time" />
        <button class="ui-btn small" onclick={() => step(1)} disabled={toTime == null} aria-label="Later">▶</button>
        <button class="ui-btn small" class:primary={toTime == null} onclick={() => (toTime = null)}>Now</button>
      </div>
      <label class="ui-check live"><input type="checkbox" bind:checked={live} /> Live</label>
      <a class="ui-btn small" href="/api/log/export.csv?from={range[0]}&to={range[1]}" download>Export CSV</a>
    </div>

    <div class="chips">
      {#each Object.entries(CH) as [k, c]}
        <button class="chip" class:on={selected.includes(k)} onclick={() => toggle(k)}>{c.label}</button>
      {/each}
    </div>

    {#if err}<div class="ui-card">Could not load the log: {err}</div>{/if}

    <div class="charts">
      {#if data}
        {#each selected.filter((c) => CH[c]) as c (c)}
          <Chart t={data.t} values={data[c] || []} label={CH[c].label} unit={CH[c].unit} fmtV={CH[c].f} range={data.range} />
        {/each}
      {/if}
    </div>
    {#if data && !data.t.length && !loading}
      <div class="ui-card empty">Nothing logged in this time range. Samples are written while you are seated in a ship (change this in Settings → Logging).</div>
    {/if}

    <div class="ui-card">
      <div class="evhead">
        <h2>Event log</h2>
        <select class="ui-select evsel" bind:value={evFilter}>
          <option value="all">All</option><option value="state">State changes</option><option value="warning">Warnings</option><option value="game">Game events</option><option value="system">Link / actions</option><option value="location">Location (Game.log)</option>
        </select>
      </div>
      {#if evShown.length}
        <ol class="events">
          {#each evShown as e}
            <li class={e.kind}>
              <span class="t mono">{new Date(e.t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              <span class="k">{e.kind}</span>
              <span class="v">{evLabel(e)}</span>
            </li>
          {/each}
        </ol>
      {:else}
        <p class="dim">No events in this range.</p>
      {/if}
    </div>

    {#if stats}
      <p class="dim foot">
        {stats.samples.toLocaleString()} samples · {stats.events.toLocaleString()} events · {size(stats.sizeBytes)}
        {#if stats.first} · since {new Date(stats.first).toLocaleString()}{/if}
      </p>
    {/if}
  </div>
</div>

<style>
  .bar {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
  }
  .seg {
    display: flex;
    gap: 4px;
    align-items: center;
  }
  .when {
    min-height: 32px;
    padding: 4px 8px;
    width: auto;
    font-size: 13px;
  }
  .live {
    font-size: 14px;
  }
  a.ui-btn {
    text-decoration: none;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    border: 1px solid var(--ui-line);
    background: transparent;
    color: var(--ui-text-dim);
    border-radius: 999px;
    padding: 6px 12px;
    font-size: 13px;
    cursor: pointer;
    min-height: 32px;
  }
  .chip.on {
    border-color: var(--ink);
    color: var(--ui-text);
    background: color-mix(in srgb, var(--ink) 15%, transparent);
  }
  .charts {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 420px), 1fr));
    gap: 12px;
  }
  .empty,
  .dim {
    color: var(--ui-text-dim);
    font-size: 14px;
  }
  .evhead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .evhead h2 {
    margin: 0;
  }
  .evsel {
    width: auto;
    min-height: 34px;
    padding: 4px 8px;
  }
  .events {
    list-style: none;
    margin: 12px 0 0;
    padding: 0;
    max-height: 380px;
    overflow: auto;
    display: grid;
  }
  .events li {
    display: grid;
    grid-template-columns: 150px 70px 1fr;
    gap: 10px;
    padding: 6px 4px;
    border-bottom: 1px solid var(--ui-line);
    font-size: 13px;
    align-items: baseline;
  }
  .t {
    color: var(--ui-text-dim);
    font-size: 12px;
  }
  .k {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--ui-text-dim);
  }
  .v {
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .warning .v {
    color: var(--warn);
  }
  .system .v {
    color: var(--info);
  }
  .location .v {
    color: var(--ink);
  }
  .foot {
    text-align: center;
    margin: 0;
  }
  @media (max-width: 520px) {
    .events li {
      grid-template-columns: 1fr auto;
    }
    .events .v {
      grid-column: 1 / -1;
    }
  }
</style>
