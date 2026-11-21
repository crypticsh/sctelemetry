<script>
  import Cockpit from './components/Cockpit.svelte';
  import Logs from './components/Logs.svelte';
  import Settings from './components/Settings.svelte';
  import Badge from './themes/Badge.svelte';
  import { tele } from './lib/telemetry.svelte.js';
  import { prefs } from './lib/prefs.svelte.js';
  import { toasts } from './lib/toast.svelte.js';
  import { applyTheme, themeById } from './themes/index.js';

  let route = $state(location.hash.replace(/^#\/?/, '') || 'cockpit');
  let editing = $state(false);
  function go(r) {
    route = r;
    editing = false;
    location.hash = `/${r}`;
  }
  $effect(() => {
    const on = () => (route = location.hash.replace(/^#\/?/, '') || 'cockpit');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  });

  $effect(() => applyTheme(prefs.theme));
  $effect(() => document.documentElement.classList.toggle('no-anim', !prefs.animations));

  const st = $derived(tele.status);
  const ship = $derived(tele.n?.ship);
  const linkText = $derived(!tele.online ? 'OFFLINE' : st.connected ? (st.source === 'sim' ? 'SIM' : 'LINK') : st.linked ? 'STALE' : 'NO LINK');

  let clock = $state('');
  $effect(() => {
    const tick = () => (clock = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    tick();
    const iv = setInterval(tick, 10000);
    return () => clearInterval(iv);
  });

  // Keep the screen awake while the cockpit is open (needs HTTPS or localhost).
  let lock = null;
  async function wake() {
    try {
      if (route === 'cockpit' && document.visibilityState === 'visible' && 'wakeLock' in navigator) lock = await navigator.wakeLock.request('screen');
    } catch { /* not allowed on plain http */ }
  }
  $effect(() => {
    route;
    wake();
    const v = () => wake();
    document.addEventListener('visibilitychange', v);
    return () => { document.removeEventListener('visibilitychange', v); lock?.release?.(); };
  });

  function fullscreen() {
    const el = document.documentElement;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
  }
  const shipName = $derived(ship?.present ? (ship.className || '').replace(/^[A-Z]+_/, '').replace(/_/g, ' ') : '');
</script>

<header class="top">
  <button class="brand" onclick={() => go('cockpit')} title="{themeById(prefs.theme).maker} theme">
    <Badge id={prefs.theme} size={26} />
    <span class="ship">{shipName || 'SC TELEMETRY'}</span>
  </button>

  <span class="link" class:ok={st.connected && tele.online} class:sim={st.source === 'sim'} title={st.error || ''}>
    <i></i>{linkText}{#if st.connected}<small>{Math.round(st.fps)}Hz</small>{/if}
  </span>

  <span class="spacer"></span>
  <span class="clock mono">{clock}</span>

  <nav>
    {#if route === 'cockpit'}
      <button class="nb" class:on={editing} onclick={() => (editing = !editing)} aria-label="Edit layout" title="Edit layout">
        <svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" /></svg>
      </button>
    {/if}
    <button class="nb" class:on={route === 'cockpit'} onclick={() => go('cockpit')} aria-label="Cockpit" title="Cockpit">
      <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
    </button>
    <button class="nb" class:on={route === 'logs'} onclick={() => go('logs')} aria-label="Flight log" title="Flight log">
      <svg viewBox="0 0 24 24"><path d="M3 17l5-6 4 3 4-7 5 6M3 21h18" /></svg>
    </button>
    <button class="nb" class:on={route === 'settings'} onclick={() => go('settings')} aria-label="Settings" title="Settings">
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" /></svg>
    </button>
    <button class="nb" onclick={fullscreen} aria-label="Full screen" title="Full screen">
      <svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
    </button>
  </nav>
</header>

{#if route === 'logs'}
  <Logs />
{:else if route === 'settings'}
  <Settings />
{:else}
  <Cockpit bind:editing />
{/if}

<div class="toasts">
  {#each toasts as t (t.id)}
    <div class="toast {t.kind}">{t.text}</div>
  {/each}
</div>

<style>
  .top {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    padding: 4px 10px;
    background: linear-gradient(180deg, var(--metal-lo), #050505);
    border-bottom: 1px solid #000;
    box-shadow: 0 1px 0 var(--metal) inset;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    background: none;
    border: 0;
    cursor: pointer;
    padding: 0;
    min-width: 0;
  }
  .ship {
    font-family: var(--font-label);
    font-weight: 600;
    letter-spacing: 0.16em;
    font-size: 14px;
    color: var(--label);
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 30vw;
  }
  .link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-screen);
    font-size: 12px;
    letter-spacing: 0.12em;
    color: var(--danger);
    padding: 3px 8px;
    border: 1px solid currentColor;
    border-radius: 4px;
  }
  .link i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: currentColor;
    animation: blink 1.2s steps(2, jump-none) infinite;
  }
  .link.ok {
    color: var(--ok);
  }
  .link.ok.sim {
    color: var(--info);
  }
  .link.ok i {
    animation: none;
    box-shadow: 0 0 6px currentColor;
  }
  .link small {
    opacity: 0.7;
    font-size: 10px;
  }
  .spacer {
    flex: 1;
  }
  .clock {
    color: var(--label-dim);
    font-size: 13px;
  }
  nav {
    display: flex;
    gap: 4px;
  }
  .nb {
    display: grid;
    place-items: center;
    width: 40px;
    height: 36px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: none;
    cursor: pointer;
    color: var(--label);
  }
  .nb svg {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .nb.on {
    color: var(--ink);
    border-color: var(--ink-dim);
    background: color-mix(in srgb, var(--ink) 10%, transparent);
  }
  @media (max-width: 520px) {
    .clock {
      display: none;
    }
    .nb {
      width: 36px;
    }
    .top {
      gap: 6px;
      padding: 4px 6px;
    }
  }
  .toasts {
    position: fixed;
    bottom: calc(16px + env(safe-area-inset-bottom));
    left: 50%;
    transform: translateX(-50%);
    display: grid;
    gap: 8px;
    z-index: 100;
    width: min(420px, calc(100vw - 24px));
    pointer-events: none;
  }
  .toast {
    padding: 10px 14px;
    border-radius: 10px;
    background: var(--ui-bg-2);
    border: 1px solid var(--ui-line);
    color: var(--ui-text);
    font-size: 14px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
    animation: up 0.2s ease-out;
  }
  .toast.warn {
    border-color: var(--warn);
  }
  @keyframes up {
    from { opacity: 0; transform: translateY(10px); }
  }
  @keyframes blink {
    50% { opacity: 0.2; }
  }
</style>
