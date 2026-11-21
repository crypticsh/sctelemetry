<script>
  // The multi-function display: metal bezel, page tabs on top, pip lights on
  // the sides, and a CRT glass you swipe left/right between screens.
  import PowerScreen from './screens/PowerScreen.svelte';
  import ShieldScreen from './screens/ShieldScreen.svelte';
  import { SCREEN_TYPES, FUTURE_TABS } from '../lib/defaultLayout.js';
  import { prefs, savePrefs, buzz } from '../lib/prefs.svelte.js';
  import { clamp } from '../lib/util.js';

  const SCREENS = { power: PowerScreen, shields: ShieldScreen };

  let { screens, ctx, status, showFutureTabs = true } = $props();

  const count = $derived(screens.length);
  const index = $derived(clamp(prefs.screenIndex, 0, Math.max(0, count - 1)));

  function go(i) {
    const next = (i + count) % count;
    if (next !== prefs.screenIndex) buzz(6);
    prefs.screenIndex = next;
    savePrefs();
  }

  // ---- swipe
  let glass;
  let dx = $state(0);
  let dragging = $state(false);
  let start = null;
  function down(e) {
    if (!prefs.swipe || count < 2 || e.button > 0) return;
    start = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, locked: null };
  }
  function move(e) {
    if (!start || e.pointerId !== start.id) return;
    const mx = e.clientX - start.x, my = e.clientY - start.y;
    if (start.locked == null && Math.hypot(mx, my) > 8) {
      start.locked = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
      if (start.locked === 'x') { dragging = true; glass.setPointerCapture(e.pointerId); }
    }
    if (start.locked === 'x') dx = mx;
  }
  function up(e) {
    if (!start || e.pointerId !== start.id) return;
    const w = glass.clientWidth || 1;
    const v = dx / Math.max(1, performance.now() - start.t);
    if (dragging && (Math.abs(dx) > w * 0.22 || Math.abs(v) > 0.5)) go(index + (dx < 0 ? 1 : -1));
    start = null;
    dragging = false;
    dx = 0;
  }

  // ---- tabs: the screens you have, plus future pages (dimmed)
  const tabs = $derived([
    ...screens.map((s, i) => ({ label: s.tab || SCREEN_TYPES[s.type]?.tab || '?', i })),
    ...(showFutureTabs ? FUTURE_TABS.filter((t) => !screens.some((s) => (s.tab || SCREEN_TYPES[s.type]?.tab) === t)).slice(0, Math.max(0, 5 - count)).map((label) => ({ label, i: -1 })) : []),
  ]);

  // ---- boot sweep when the link comes up
  let boot = $state(0);
  let wasUp = false;
  $effect(() => {
    const up = !!status.connected;
    if (up && !wasUp) boot++;
    wasUp = up;
  });

  const title = $derived(SCREEN_TYPES[screens[index]?.type]?.name || '');
</script>

<div class="mfd">
  <div class="tabs" role="tablist">
    {#each tabs as t}
      <button class="tab" class:active={t.i === index} disabled={t.i < 0} onclick={() => go(t.i)} role="tab" aria-selected={t.i === index}>{t.label}</button>
    {/each}
  </div>

  <div class="bezel">
    <div class="pips left">
      {#each Array(5) as _, i}<i class:on={i < count} class:cur={i === index}></i>{/each}
    </div>

    <div
      class="glass"
      class:scan={prefs.scanlines}
      bind:this={glass}
      onpointerdown={down}
      onpointermove={move}
      onpointerup={up}
      onpointercancel={up}
    >
      <div class="track" class:dragging style:transform="translateX(calc({-index * 100}% + {dx}px))">
        {#each screens as s, i (s.id)}
          {@const C = SCREENS[s.type]}
          <section class="page" aria-hidden={i !== index}>
            <div class="content">
              {#if C}<C {ctx} />{:else}<div class="missing">Unknown screen "{s.type}"</div>{/if}
            </div>
          </section>
        {/each}
      </div>

      {#if !status.connected}
        <div class="nosig">
          <span class="ns">{status.linked ? 'SIGNAL LOST' : 'NO SIGNAL'}</span>
          {#if status.error}<span class="err">{status.error}</span>{/if}
        </div>
      {/if}
      {#key boot}
        {#if boot > 0 && prefs.animations}<div class="boot"></div>{/if}
      {/key}

      <div class="footer">
        <button class="arrow" onclick={() => go(index - 1)} aria-label="Previous screen">‹</button>
        {#key index}<span class="title">{title}</span>{/key}
        <button class="arrow" onclick={() => go(index + 1)} aria-label="Next screen">›</button>
      </div>
    </div>

    <div class="pips right">
      {#each Array(5) as _, i}<i class:on={ctx.ship?.present && i < 5}></i>{/each}
    </div>

    <span class="serial">9X{(ctx.ship?.id || 'SPBCL').replace(/[^A-Z0-9]/gi, '').slice(-5).toUpperCase()}</span>
  </div>
</div>

<style>
  .mfd {
    display: grid;
    grid-template-rows: auto 1fr;
    justify-items: center;
    min-height: 0;
    min-width: 0;
    height: 100%;
    width: 100%;
  }
  .tabs {
    display: flex;
    gap: 4px;
    padding: 5px 6px;
    margin-bottom: -2px;
    border-radius: 8px 8px 0 0;
    background: linear-gradient(180deg, var(--metal-hi), var(--metal));
    box-shadow: 0 -1px 0 var(--metal-edge) inset;
    z-index: 1;
    max-width: 100%;
    overflow: auto;
    scrollbar-width: none;
  }
  .tab {
    min-width: 48px;
    min-height: 34px;
    padding: 4px 8px;
    border: 1px solid #000;
    border-radius: 4px;
    background: var(--key-off);
    color: var(--key-off-text);
    font-family: var(--font-label);
    font-weight: 600;
    font-size: 14px;
    letter-spacing: 0.06em;
    cursor: pointer;
    box-shadow: inset 0 -4px 8px rgba(0, 0, 0, 0.5);
    transition: background 0.2s, color 0.2s, box-shadow 0.2s;
    touch-action: manipulation;
  }
  .tab.active {
    background: var(--key-on);
    color: var(--key-on-text);
    box-shadow: var(--key-on-glow);
  }
  .tab:disabled {
    cursor: default;
    opacity: 0.55;
  }
  .bezel {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-columns: 22px 1fr 22px;
    gap: 8px;
    padding: 14px 10px 22px;
    border-radius: var(--bezel-radius);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.08), transparent 30%),
      linear-gradient(180deg, var(--metal-hi), var(--metal) 40%, var(--metal-lo));
    box-shadow:
      0 0 0 1px #000,
      inset 0 1px 0 var(--metal-edge),
      inset 0 -2px 6px rgba(0, 0, 0, 0.6),
      0 10px 30px rgba(0, 0, 0, 0.6);
  }
  .pips {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 10%;
    padding: 6px 0;
    border-radius: 6px;
    background: #121110;
    align-items: center;
    box-shadow: inset 0 1px 4px rgba(0, 0, 0, 0.9);
  }
  .pips i {
    width: 8px;
    height: 22px;
    border-radius: 4px;
    background: #3c3a35;
    transition: background 0.3s, box-shadow 0.3s;
  }
  .pips i.on {
    background: color-mix(in srgb, var(--pip) 55%, #3c3a35);
  }
  .pips i.cur,
  .pips.right i.on {
    background: var(--pip);
    box-shadow: var(--pip-glow);
  }
  .glass {
    position: relative;
    overflow: hidden;
    border-radius: 10px;
    background: radial-gradient(120% 100% at 50% 40%, var(--screen-bg) 0%, var(--screen-bg-2) 100%);
    box-shadow: inset 0 0 0 2px #050403, inset 0 0 40px rgba(0, 0, 0, 0.85), 0 0 0 3px #0c0b0a;
    touch-action: pan-y;
    user-select: none;
    -webkit-user-select: none;
    min-height: 0;
    display: grid;
    grid-template-rows: 1fr auto;
  }
  .glass::after {
    /* vignette + glass sheen */
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      linear-gradient(160deg, rgba(255, 255, 255, 0.05) 0%, transparent 35%),
      radial-gradient(130% 110% at 50% 50%, transparent 60%, rgba(0, 0, 0, 0.55) 100%);
    z-index: 3;
  }
  .glass.scan::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: repeating-linear-gradient(0deg, var(--scan) 0 1px, transparent 1px 3px);
    z-index: 2;
    animation: flicker 6s infinite steps(1);
  }
  .track {
    display: flex;
    height: 100%;
    min-height: 0;
    transition: transform 0.38s cubic-bezier(0.2, 0.8, 0.2, 1);
    will-change: transform;
  }
  .track.dragging {
    transition: none;
  }
  .page {
    flex: 0 0 100%;
    position: relative;
    min-height: 0;
  }
  .content {
    position: absolute;
    inset: 0;
    container-type: size;
  }
  .missing {
    padding: 20px;
    color: var(--danger);
  }
  .footer {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: 44px 1fr 44px;
    align-items: center;
    margin: 0 4%;
    border-top: 1px solid var(--ink-dim);
    min-height: 40px;
  }
  .title {
    text-align: center;
    font-family: var(--font-screen);
    color: var(--ink);
    text-shadow: var(--ink-glow);
    letter-spacing: 0.32em;
    font-size: clamp(13px, 2.4vmin, 22px);
    animation: titleIn 0.35s ease-out;
    white-space: nowrap;
    overflow: hidden;
    text-transform: uppercase;
  }
  .arrow {
    background: none;
    border: 0;
    color: var(--ink);
    font-size: 26px;
    min-height: 40px;
    cursor: pointer;
    touch-action: manipulation;
  }
  .nosig {
    position: absolute;
    inset: 0;
    z-index: 4;
    display: grid;
    place-content: center;
    gap: 10px;
    text-align: center;
    background: color-mix(in srgb, var(--screen-bg-2) 70%, transparent);
    backdrop-filter: blur(1.5px);
    font-family: var(--font-screen);
    color: var(--ink);
  }
  .ns {
    font-size: clamp(18px, 4vmin, 38px);
    letter-spacing: 0.3em;
    animation: blink 1.4s steps(2, jump-none) infinite;
    text-shadow: var(--ink-glow);
  }
  .err {
    font-size: 13px;
    color: var(--ink-dim);
    max-width: 40ch;
    padding: 0 16px;
  }
  .boot {
    position: absolute;
    inset: 0;
    z-index: 5;
    pointer-events: none;
    background: linear-gradient(180deg, transparent 0%, color-mix(in srgb, var(--ink) 35%, transparent) 48%, var(--ink-hi) 50%, color-mix(in srgb, var(--ink) 35%, transparent) 52%, transparent 100%);
    background-size: 100% 300%;
    animation: boot 0.9s ease-out forwards;
  }
  .serial {
    position: absolute;
    left: 40px;
    bottom: 4px;
    font-family: var(--font-label);
    font-size: 10px;
    letter-spacing: 0.1em;
    color: var(--label-dim);
  }
  @media (max-width: 520px), (max-height: 420px) {
    .bezel {
      grid-template-columns: 1fr;
      padding: 8px 8px 18px;
    }
    .pips {
      display: none;
    }
    .serial {
      left: 14px;
      bottom: 2px;
    }
    .tab {
      min-height: 30px;
      font-size: 12px;
      min-width: 40px;
    }
  }
  @keyframes boot {
    from { background-position: 0 100%; opacity: 1; }
    to { background-position: 0 0%; opacity: 0; }
  }
  @keyframes blink {
    50% { opacity: 0.25; }
  }
  @keyframes titleIn {
    from { opacity: 0; letter-spacing: 0.6em; }
  }
  @keyframes flicker {
    0%, 100% { opacity: 1; }
    47% { opacity: 0.85; }
    48% { opacity: 1; }
  }
</style>
