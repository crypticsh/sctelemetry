<script>
  // Play history and "where am I", from Game.log.
  import { api } from '../lib/api.js';
  import { tele } from '../lib/telemetry.svelte.js';
  import { toast } from '../lib/toast.svelte.js';

  let days = $state(30);
  let data = $state(null);
  let err = $state('');
  let busy = $state(false);
  let confirmClear = $state(false);
  let now = $state(Date.now() / 1000);

  async function load() {
    try {
      data = await api(`/api/sessions?from=${Date.now() - days * 86400000}`);
      err = '';
    } catch (e) {
      err = e.message;
    }
  }
  $effect(() => {
    days;
    load();
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
  });
  $effect(() => {
    const iv = setInterval(() => (now = Date.now() / 1000), 1000);
    return () => clearInterval(iv);
  });

  const loc = $derived(tele.loc || data?.location || {});

  const dur = (s) => {
    if (s == null || !Number.isFinite(s)) return '—';
    s = Math.max(0, Math.round(s));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h ? `${h} h ${String(m).padStart(2, '0')} min` : m ? `${m} min` : `${s % 60} s`;
  };
  const when = (t) => new Date(t * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const clock = (t) => new Date(t * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Time on a shard per local day, for the bars.
  const daily = $derived.by(() => {
    if (!data) return [];
    const out = [];
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    for (let i = days - 1; i >= 0; i--) {
      const d0 = new Date(start); d0.setDate(d0.getDate() - i);
      const d1 = new Date(d0); d1.setDate(d1.getDate() + 1);
      out.push({ day: d0, from: d0 / 1000, to: d1 / 1000, shard: 0, game: 0 });
    }
    const clip = (a, b, day) => Math.max(0, Math.min(b, day.to) - Math.max(a, day.from));
    for (const r of data.runs) {
      const end = !r.closed && loc.gameRunning && loc.run?.key === r.key ? now : r.ended;
      for (const d of out) d.game += clip(r.started, end, d);
      for (const s of r.shards) {
        const se = !s.closed && loc.gameRunning && loc.shard === s.shard ? now : s.left_at;
        for (const d of out) d.shard += clip(s.joined, se, d);
      }
    }
    return out;
  });
  const maxDay = $derived(Math.max(3600, ...daily.map((d) => d.game)));
  const sum = (n) => daily.slice(-n).reduce((a, d) => a + d.shard, 0);
  const sumGame = (n) => daily.slice(-n).reduce((a, d) => a + d.game, 0);

  async function importLogs() {
    busy = true;
    try {
      const r = await api('/api/sessions/import', { method: 'POST' });
      toast(r.error ? r.error : `Imported ${r.imported} old log${r.imported === 1 ? '' : 's'}${r.skipped ? `, ${r.skipped} already in` : ''}`, r.error ? 'warn' : 'info');
      load();
    } catch (e) {
      toast(e.message, 'warn');
    }
    busy = false;
  }
  async function clearAll() {
    if (!confirmClear) { confirmClear = true; setTimeout(() => (confirmClear = false), 3000); return; }
    confirmClear = false;
    await api('/api/sessions/clear', { method: 'POST' });
    toast('Play history cleared');
    load();
  }
</script>

<div class="ui-page">
  <div class="ui-page-inner">
    <section class="ui-card now">
      <h2>Right now</h2>
      {#if !loc.enabled}
        <p class="dim">Game.log reading is off or the game folder isn't set. See Settings → Game.log.</p>
        {#if loc.error}<p class="dim">{loc.error}</p>{/if}
      {:else}
        <div class="nowgrid">
          <div class="big">
            <span class="state" class:on={loc.gameRunning}>{loc.gameRunning ? 'In game' : 'Game not running'}</span>
            <div class="line">{loc.line || loc.event?.text || (loc.placeName ? loc.placeName : 'Location unknown yet')}</div>
            {#if loc.path?.length}<div class="path">{loc.path.join(' › ')}</div>{/if}
            <div class="chips">
              {#if loc.armistice}<span class="chip ok">Armistice zone</span>{/if}
              {#if loc.jurisdiction}<span class="chip">{loc.jurisdiction} jurisdiction</span>{/if}
              {#if loc.confidence}<span class="chip dim">{{ exact: 'exact place', near: 'near this body', area: 'in this area', system: 'system only' }[loc.confidence]}</span>{/if}
            </div>
            {#if loc.transit}
              <div class="qt">
                <b>{loc.transit.state === 'spool' ? 'Quantum calibrating' : 'Quantum travel'}</b>
                {loc.transit.fromName || '?'} → {loc.transit.toName || 'somewhere'} · {dur(now - loc.transit.since)}
              </div>
            {:else if loc.plotted?.toName}
              <div class="qt dim">Route plotted to {loc.plotted.toName}</div>
            {/if}
          </div>
          <dl class="facts">
            <dt>Shard</dt><dd class="mono">{loc.shard || '—'}</dd>
            <dt>On this shard</dt><dd>{loc.shardSince && loc.gameRunning ? dur(now - loc.shardSince) : '—'}</dd>
            <dt>This game run</dt><dd>{loc.run ? dur((loc.gameRunning ? now : loc.run.ended || loc.run.lastAt) - loc.run.started) : '—'}</dd>
            <dt>Game</dt><dd>{loc.run ? `${loc.run.channel || '?'} ${loc.run.version || ''}` : '—'}</dd>
            <dt>Latest</dt><dd>{loc.event ? `${loc.event.text} · ${clock(loc.event.at)}` : '—'}</dd>
          </dl>
        </div>
      {/if}
    </section>

    {#if err}<div class="ui-card">Could not load play history: {err}</div>{/if}

    {#if data}
      <section class="tiles">
        <div class="tile"><span class="k">Today on a shard</span><span class="v">{dur(sum(1))}</span><span class="s">{dur(sumGame(1))} with the game open</span></div>
        <div class="tile"><span class="k">Last 7 days</span><span class="v">{dur(sum(7))}</span><span class="s">{dur(sumGame(7))} with the game open</span></div>
        <div class="tile"><span class="k">All time</span><span class="v">{dur(Math.max(data.totals.shardSecs, sum(days)))}</span><span class="s">{dur(Math.max(data.totals.playSecs, sumGame(days)))} game open · {data.totals.runs} {data.totals.runs === 1 ? 'run' : 'runs'}</span></div>
        <div class="tile"><span class="k">Shards</span><span class="v">{data.totals.distinctShards}</span><span class="s">{data.totals.shardSessions} {data.totals.shardSessions === 1 ? 'session' : 'sessions'}{data.totals.longestShard ? ` · longest ${dur(data.totals.longestShard.secs)}` : ''}</span></div>
      </section>

      <section class="ui-card">
        <div class="head">
          <h2>Time on a shard per day</h2>
          <select class="ui-select small" bind:value={days} aria-label="Range">
            <option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option>
          </select>
        </div>
        <div class="bars" style:--n={daily.length}>
          {#each daily as d}
            <div class="col" title="{d.day.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}: {dur(d.shard)} on a shard, {dur(d.game)} game open">
              <div class="game" style:height="{(d.game / maxDay) * 100}%"></div>
              <div class="bar" style:height="{(d.shard / maxDay) * 100}%"></div>
            </div>
          {/each}
        </div>
        <div class="axis"><span>{daily[0]?.day.toLocaleDateString([], { month: 'short', day: 'numeric' })}</span><span>Today</span></div>
        <p class="dim small">Solid: on a shard. Faint: game open (menus and loading included). Peak {dur(maxDay)}.</p>
      </section>

      <div class="two">
        <section class="ui-card">
          <h2>Game runs</h2>
          {#if !data.runs.length}<p class="dim">Nothing yet. Play a session, or import old logs below.</p>{/if}
          <ol class="runs">
            {#each data.runs as r (r.key)}
              {@const open = !r.closed && loc.gameRunning && loc.run?.key === r.key}
              <li>
                <div class="rh">
                  <b>{when(r.started)}</b>
                  <span>{dur((open ? now : r.ended) - r.started)}</span>
                  <span class="dim">{r.channel || ''} {r.version || ''}</span>
                  {#if open}<span class="chip ok">now</span>{/if}
                </div>
                {#each r.shards as s}
                  {@const so = !s.closed && open && loc.shard === s.shard}
                  <div class="sh"><span class="mono">{s.shard}</span><span>{clock(s.joined)}–{so ? 'now' : clock(s.left_at)}</span><span>{dur((so ? now : s.left_at) - s.joined)}</span></div>
                {:else}
                  <div class="sh dim">Menu only, no shard joined</div>
                {/each}
              </li>
            {/each}
          </ol>
        </section>

        <section class="ui-card">
          <h2>Where you spent time</h2>
          {#if !data.places.length}<p class="dim">No places yet.</p>{/if}
          <table>
            <tbody>
              {#each data.places as p}
                <tr><td>{p.name || p.place_id}</td><td class="num">{dur(p.secs)}</td><td class="num dim">{p.visits}×</td></tr>
              {/each}
            </tbody>
          </table>
          <h2 class="gap">Recent events</h2>
          <ol class="events">
            {#each data.events.slice(0, 60) as e}
              <li><span class="t">{when(e.t)}</span><span class="k {e.kind}">{e.kind}</span><span>{e.text}</span></li>
            {/each}
          </ol>
        </section>
      </div>

      <div class="actions">
        <button class="ui-btn small" onclick={importLogs} disabled={busy}>{busy ? 'Importing…' : 'Import old logs (logbackups)'}</button>
        <button class="ui-btn small danger" onclick={clearAll}>{confirmClear ? 'Tap again to clear history' : 'Clear play history'}</button>
        <span class="dim small">Read from {loc.file || 'Game.log'} · places: {loc.places || '—'}. Only derived facts are stored, never log lines.</span>
      </div>
    {/if}
  </div>
</div>

<style>
  .dim { color: var(--ui-text-dim); }
  .small { font-size: 12px; }
  .mono { font-family: var(--font-screen); }
  .nowgrid { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 20px; }
  .big { display: grid; gap: 8px; align-content: start; }
  .state { font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ui-text-dim); }
  .state.on { color: var(--ok); }
  .line { font: 600 clamp(20px, 3vw, 28px) / 1.2 var(--font-label); color: var(--ink); text-wrap: balance; }
  .path { color: var(--ui-text-dim); font-size: 13px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--ui-line); }
  .chip.ok { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 50%, transparent); }
  .chip.dim { color: var(--ui-text-dim); }
  .qt { font-size: 14px; padding: 8px 10px; border-radius: 8px; background: color-mix(in srgb, var(--info) 12%, transparent); }
  .qt b { color: var(--info); margin-right: 6px; }
  .facts { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; margin: 0; font-size: 14px; }
  .facts dt { color: var(--ui-text-dim); }
  .facts dd { margin: 0; font-variant-numeric: tabular-nums; word-break: break-all; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
  .tile { display: grid; gap: 4px; padding: 14px 16px; border-radius: 12px; background: var(--ui-bg); border: 1px solid var(--ui-line); }
  .tile .k { font-size: 12px; color: var(--ui-text-dim); letter-spacing: 0.06em; text-transform: uppercase; }
  .tile .v { font: 600 24px var(--font-label); font-variant-numeric: tabular-nums; }
  .tile .s { font-size: 12px; color: var(--ui-text-dim); }
  .head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; }
  .head h2 { margin: 0; }
  .ui-select.small { width: auto; min-height: 34px; padding: 4px 8px; }
  .bars { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 2px; height: 160px; align-items: end; border-bottom: 1px solid var(--ui-line); }
  .col { position: relative; height: 100%; display: flex; align-items: flex-end; justify-content: center; }
  .col:hover { background: color-mix(in srgb, var(--ink) 6%, transparent); }
  .game, .bar { position: absolute; bottom: 0; left: 15%; right: 15%; border-radius: 3px 3px 0 0; }
  .game { background: color-mix(in srgb, var(--ink) 22%, transparent); }
  .bar { background: var(--ink); }
  .axis { display: flex; justify-content: space-between; font-size: 12px; color: var(--ui-text-dim); margin-top: 4px; }
  .two { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr)); gap: 16px; align-items: start; }
  .runs, .events { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; max-height: 520px; overflow: auto; }
  .rh { display: flex; flex-wrap: wrap; gap: 10px; align-items: baseline; font-size: 14px; }
  .sh { display: grid; grid-template-columns: minmax(0, 1.6fr) auto auto; gap: 10px; font-size: 13px; padding: 4px 0 4px 14px; border-left: 2px solid var(--ui-line); margin-top: 4px; }
  .sh .mono { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  td { padding: 6px 4px; border-bottom: 1px solid var(--ui-line); }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .gap { margin-top: 18px !important; }
  .events { gap: 0; max-height: 320px; }
  .events li { display: grid; grid-template-columns: 120px 64px 1fr; gap: 8px; padding: 5px 0; border-bottom: 1px solid var(--ui-line); font-size: 13px; }
  .events .t { color: var(--ui-text-dim); font-size: 12px; }
  .events .k { font-size: 11px; text-transform: uppercase; color: var(--ui-text-dim); }
  .events .k.quantum { color: var(--info); }
  .events .k.session { color: var(--ok); }
  .actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  @media (max-width: 640px) {
    .nowgrid { grid-template-columns: 1fr; }
    .events li { grid-template-columns: 1fr auto; }
    .events li span:last-child { grid-column: 1 / -1; }
  }
</style>
