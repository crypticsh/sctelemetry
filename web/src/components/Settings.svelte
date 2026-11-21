<script>
  import Inspector from './Inspector.svelte';
  import Badge from '../themes/Badge.svelte';
  import { THEMES } from '../themes/index.js';
  import { api } from '../lib/api.js';
  import { prefs, savePrefs, resetPrefs } from '../lib/prefs.svelte.js';
  import { tele } from '../lib/telemetry.svelte.js';
  import { layout, saveLayout, resetLayout, importLayout } from '../lib/layout.svelte.js';
  import { toast } from '../lib/toast.svelte.js';
  import { uid } from '../lib/util.js';

  let s = $state(null); // server settings (editable copy)
  let saved = $state('');
  let stats = $state(null);
  let showInspector = $state(false);

  async function load() {
    const r = await api('/api/settings');
    s = r.settings;
    saved = JSON.stringify(r.settings);
    stats = await api('/api/log/stats');
  }
  load().catch((e) => toast(`Cannot load settings: ${e.message}`, 'warn'));

  const dirty = $derived(s && JSON.stringify(s) !== saved);
  async function save() {
    try {
      const r = await api('/api/settings', { method: 'PUT', body: s });
      s = r.settings;
      saved = JSON.stringify(r.settings);
      toast('Settings saved');
    } catch (e) {
      toast(`Save failed: ${e.message}`, 'warn');
    }
  }
  async function clearLog() {
    if (!confirm('Delete all logged telemetry and events? This cannot be undone.')) return;
    stats = await api('/api/log/clear', { method: 'POST' });
    toast('Flight log cleared');
  }

  function pref(k, v) {
    prefs[k] = v;
    savePrefs();
  }

  // ---- layout profiles
  const profiles = $derived(layout.value.profiles);
  function newProfile(copy) {
    const base = copy ? $state.snapshot(profiles.find((p) => p.id === prefs.profile) || profiles[0]) : null;
    const name = prompt('Name for the new layout (e.g. "iPad", "Phone")', copy ? `${base.name} copy` : 'New layout');
    if (!name) return;
    const p = base ? { ...structuredClone(base), id: `prof-${uid()}`, name } : { id: `prof-${uid()}`, name, screens: [{ id: `scr-${uid()}`, type: 'power' }], rails: { left: [], right: [] } };
    layout.value.profiles.push(p);
    pref('profile', p.id);
    saveLayout();
  }
  function renameProfile() {
    const p = profiles.find((x) => x.id === prefs.profile);
    const name = p && prompt('Rename layout', p.name);
    if (!name) return;
    p.name = name;
    saveLayout();
  }
  function deleteProfile() {
    if (profiles.length < 2) return;
    const i = profiles.findIndex((x) => x.id === prefs.profile);
    if (i < 0 || !confirm(`Delete layout "${profiles[i].name}" for every device?`)) return;
    layout.value.profiles.splice(i, 1);
    pref('profile', profiles[0].id);
    saveLayout();
  }
  function exportLayout() {
    const blob = new Blob([JSON.stringify($state.snapshot(layout.value), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sc-telemetry-layout.json';
    a.click();
  }
  function doImport(e) {
    const f = e.currentTarget.files?.[0];
    if (!f) return;
    f.text().then((t) => {
      try { importLayout(JSON.parse(t)); saveLayout(); } catch (err) { toast(err.message, 'warn'); }
    });
  }
  function doReset() {
    if (!confirm('Replace all layouts with the default for every device?')) return;
    resetLayout();
    pref('profile', 'default');
    saveLayout();
  }

  const st = $derived(tele.status);
  const size = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round((b || 0) / 1024)} KB`);
  const perDay = $derived(s ? Math.round(86400000 / s.logging.intervalMs) : 0);
</script>

<div class="ui-page">
  <div class="ui-page-inner">
    {#if dirty}
      <div class="savebar">
        <span>Server settings changed</span>
        <button class="ui-btn small" onclick={load}>Undo</button>
        <button class="ui-btn small primary" onclick={save}>Save</button>
      </div>
    {/if}

    <section class="ui-card">
      <h2>Theme</h2>
      <div class="themes">
        {#each THEMES as t}
          <button class="theme" class:on={prefs.theme === t.id} onclick={() => pref('theme', t.id)} data-theme={t.id}>
            <Badge id={t.id} size={40} />
            <span class="tn">{t.name}</span>
            <span class="tag">{t.status === 'ready' ? 'Ready' : 'Placeholder'}</span>
          </button>
        {/each}
      </div>
      <p class="hint">Theme is chosen per device. Placeholder themes have a first-pass palette only.</p>
    </section>

    <section class="ui-card">
      <h2>This device</h2>
      <div class="grid2">
        <label class="ui-field">
          Layout
          <select class="ui-select" value={prefs.profile} onchange={(e) => pref('profile', e.currentTarget.value)}>
            {#each profiles as p}<option value={p.id}>{p.name}</option>{/each}
          </select>
          <span class="hint">Make one layout per device (phone, tablet…) and pick it here.</span>
        </label>
        <div class="ui-field">
          &nbsp;
          <div class="btns">
            <button class="ui-btn small" onclick={() => newProfile(true)}>Duplicate</button>
            <button class="ui-btn small" onclick={() => newProfile(false)}>New empty</button>
            <button class="ui-btn small" onclick={renameProfile}>Rename</button>
            <button class="ui-btn small danger" onclick={deleteProfile} disabled={profiles.length < 2}>Delete</button>
          </div>
        </div>
        <label class="ui-check"><input type="checkbox" checked={prefs.animations} onchange={(e) => pref('animations', e.currentTarget.checked)} /> Animations<small>Turn off on slow devices.</small></label>
        <label class="ui-check"><input type="checkbox" checked={prefs.scanlines} onchange={(e) => pref('scanlines', e.currentTarget.checked)} /> CRT scanlines</label>
        <label class="ui-check"><input type="checkbox" checked={prefs.swipe} onchange={(e) => pref('swipe', e.currentTarget.checked)} /> Swipe between screens</label>
        <label class="ui-check"><input type="checkbox" checked={prefs.haptics} onchange={(e) => pref('haptics', e.currentTarget.checked)} /> Vibrate on press<small>Android only.</small></label>
        <label class="ui-field">
          Side panels in portrait
          <select class="ui-select" value={prefs.railsPortrait} onchange={(e) => pref('railsPortrait', e.currentTarget.value)}>
            <option value="below">Below the screen</option>
            <option value="hidden">Hidden (screen only)</option>
          </select>
        </label>
        <label class="ui-field">
          Side panel width: {Math.round(prefs.railScale * 100)}%
          <input type="range" min="0.6" max="1.6" step="0.05" value={prefs.railScale} oninput={(e) => pref('railScale', +e.currentTarget.value)} />
        </label>
      </div>
      <p class="hint">Screen: {innerWidth}×{innerHeight} CSS px · DPR {devicePixelRatio}. <button class="link" onclick={() => { resetPrefs(); toast('Device preferences reset'); }}>Reset device preferences</button></p>
    </section>

    {#if s}
      <section class="ui-card">
        <h2>Telemetry source</h2>
        <div class="status" class:ok={st.connected}>
          <b>{st.connected ? 'Receiving' : st.linked ? 'Connected, no frames' : 'Not connected'}</b>
          {#if st.connected}· {st.fps} frames/s{/if}
          {#if st.origin}· {st.origin}{/if}
          {#if st.error}<div class="err">{st.error}</div>{/if}
        </div>
        <div class="grid2">
          <label class="ui-field">
            Source
            <select class="ui-select" bind:value={s.telemetry.source}>
              <option value="game">Star Citizen (gRPC)</option>
              <option value="sim">Simulator (demo data)</option>
            </select>
          </label>
          <div class="grid2 tight">
            <label class="ui-field">Host<input class="ui-input" bind:value={s.telemetry.host} /></label>
            <label class="ui-field">Port<input class="ui-input" type="number" bind:value={s.telemetry.port} /></label>
          </div>
          <label class="ui-field full">
            StarCitizen.exe path (on the PC running this server)
            <input class="ui-input mono" bind:value={s.telemetry.exePath} />
            <span class="hint">The API definitions are read from the exe and cached, so the app follows game patches.</span>
          </label>
          <label class="ui-field full">
            .protoset file instead (optional)
            <input class="ui-input mono" bind:value={s.telemetry.protosetPath} placeholder="leave empty to read the exe" />
          </label>
          <label class="ui-field">
            Show NO SIGNAL after (ms without data)
            <input class="ui-input" type="number" min="250" step="250" bind:value={s.telemetry.staleAfterMs} />
          </label>
        </div>
      </section>

      <section class="ui-card">
        <h2>Logging</h2>
        <div class="grid2">
          <label class="ui-check full"><input type="checkbox" bind:checked={s.logging.enabled} /> Record telemetry</label>
          <label class="ui-field">
            Log every (ms)
            <input class="ui-input" type="number" min="50" step="50" bind:value={s.logging.intervalMs} />
            <span class="hint">About {perDay.toLocaleString()} samples per day of flying. Game sends ~17/s (≈59 ms).</span>
          </label>
          <label class="ui-field">
            Keep logs for (days, 0 = forever)
            <input class="ui-input" type="number" min="0" bind:value={s.logging.retentionDays} />
          </label>
          <label class="ui-field">
            Max log size (MB, 0 = no limit)
            <input class="ui-input" type="number" min="0" bind:value={s.logging.maxDbMB} />
            <span class="hint">Oldest samples are removed first.</span>
          </label>
          <label class="ui-field">
            Clean-up every (minutes)
            <input class="ui-input" type="number" min="1" bind:value={s.logging.pruneEveryMin} />
          </label>
          <label class="ui-check"><input type="checkbox" bind:checked={s.logging.onlyWhenSeated} /> Only while seated in a ship<small>Skip samples while on foot.</small></label>
          <label class="ui-check"><input type="checkbox" bind:checked={s.logging.onlyOnChange} /> Skip unchanged samples<small>Saves space when parked.</small></label>
          <label class="ui-check"><input type="checkbox" bind:checked={s.logging.logEvents} /> Log state changes and game events<small>Gear, decoupled, power, warnings, seat changes…</small></label>
          <label class="ui-check"><input type="checkbox" bind:checked={s.logging.logFullFrames} /> Store full raw frames<small>Everything the game sends, with each sample. Large.</small></label>
        </div>
        {#if stats}
          <p class="hint">{stats.samples.toLocaleString()} samples · {stats.events.toLocaleString()} events · {size(stats.sizeBytes)}{stats.first ? ` · since ${new Date(stats.first).toLocaleString()}` : ''}</p>
        {/if}
        <button class="ui-btn small danger" onclick={clearLog}>Clear flight log</button>
      </section>

      <section class="ui-card">
        <h2>Live updates</h2>
        <div class="grid2">
          <label class="ui-field">
            Max updates per second to each screen
            <input class="ui-input" type="number" min="1" max="60" bind:value={s.broadcast.hz} />
            <span class="hint">Lower this for old tablets or busy Wi-Fi.</span>
          </label>
          <label class="ui-field">
            Raw frame updates per second (inspector, raw widgets)
            <input class="ui-input" type="number" min="0.2" max="20" step="0.2" bind:value={s.broadcast.rawHz} />
          </label>
        </div>
      </section>

      <section class="ui-card">
        <h2>In-game actions</h2>
        <div class="grid2">
          <label class="ui-check"><input type="checkbox" bind:checked={s.actions.enabled} /> Let buttons and switches send actions<small>Needs <code>server.game.telemetry.trigger.actions.enabled = 1</code> in user.cfg. Anyone on your network who can open this page can press them.</small></label>
          <label class="ui-check"><input type="checkbox" bind:checked={s.actions.allowDangerous} disabled={!s.actions.enabled} /> Allow dangerous actions<small>Self destruct, eject, door and port locks.</small></label>
        </div>
      </section>

      <section class="ui-card">
        <h2>Server</h2>
        <label class="ui-field">
          Port (restart the server after changing)
          <input class="ui-input" type="number" bind:value={s.server.port} style="max-width: 160px" />
        </label>
      </section>
    {/if}

    <section class="ui-card">
      <h2>Layouts</h2>
      <div class="btns">
        <button class="ui-btn small" onclick={exportLayout}>Export JSON</button>
        <label class="ui-btn small">Import JSON<input type="file" accept="application/json,.json" onchange={doImport} hidden /></label>
        <button class="ui-btn small danger" onclick={doReset}>Reset to default</button>
      </div>
      <p class="hint">Layouts are stored on the server and shared by every device. Edit them with the pencil button on the cockpit.</p>
    </section>

    <section class="ui-card">
      <h2>Live data inspector</h2>
      {#if showInspector}
        <Inspector />
      {:else}
        <p class="hint">Everything the game sends, field by field. Tap a value to copy its path for a widget.</p>
        <button class="ui-btn small" onclick={() => (showInspector = true)}>Open inspector</button>
      {/if}
    </section>
  </div>
</div>

<style>
  .savebar {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 10px 14px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--ink) 18%, var(--ui-bg));
    border: 1px solid var(--ink-dim);
  }
  .savebar span {
    flex: 1;
  }
  .themes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 10px;
  }
  .theme {
    display: grid;
    justify-items: center;
    gap: 6px;
    padding: 14px 10px;
    border-radius: 12px;
    border: 1px solid var(--ui-line);
    background: var(--screen-bg);
    cursor: pointer;
    color: var(--ink);
  }
  .theme.on {
    border-color: var(--ink);
    box-shadow: 0 0 0 2px var(--ink) inset;
  }
  .tn {
    font-family: var(--font-label);
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink);
  }
  .grid2 {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
    gap: 14px 18px;
    align-items: start;
  }
  .grid2.tight {
    grid-template-columns: 2fr 1fr;
    gap: 10px;
  }
  .full {
    grid-column: 1 / -1;
  }
  .btns {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .hint {
    font-size: 12px;
    color: var(--ui-text-dim);
    line-height: 1.45;
  }
  .link {
    background: none;
    border: 0;
    color: var(--ink);
    text-decoration: underline;
    cursor: pointer;
    font-size: 12px;
    padding: 0;
  }
  .status {
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid var(--danger);
    margin-bottom: 14px;
    font-size: 14px;
  }
  .status.ok {
    border-color: var(--ok);
  }
  .err {
    margin-top: 4px;
    font-size: 13px;
    color: var(--ui-text-dim);
    font-family: var(--font-screen);
    word-break: break-word;
  }
  code {
    font-size: 11px;
  }
  input[type='range'] {
    accent-color: var(--ink);
  }
</style>
