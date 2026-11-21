<script>
  // Bat-handle toggle switch. Up = on. Shows the ship's real state; while an
  // action is in flight it moves at once and settles when telemetry agrees.
  import { read, truthy } from '../../lib/util.js';
  import { press } from '../../lib/actions.js';
  import { buzz } from '../../lib/prefs.svelte.js';

  let { w, ctx, editing = false } = $props();

  const raw = $derived(truthy(read(ctx, w.bind)));
  const actual = $derived(raw == null ? null : w.invert ? !raw : raw);

  let pending = $state(null); // the state we asked for
  let timer;
  $effect(() => {
    if (pending != null && actual === pending) { pending = null; clearTimeout(timer); }
  });
  const shown = $derived(pending ?? actual);

  async function tap() {
    if (editing) return;
    const want = !(shown ?? false);
    const name = (want ? w.actionOn : w.actionOff) || w.action;
    if (!name) return;
    buzz(12);
    pending = want;
    clearTimeout(timer);
    timer = setTimeout(() => (pending = null), 2500);
    const ok = await press(w, name);
    if (!ok) pending = null;
  }
</script>

<button class="sw" class:compact={w.compact} class:on={shown} class:unknown={shown == null} class:pending={pending != null} onclick={tap} title={w.label}>
  <span class="plate">
    <span class="led"></span>
    <span class="slot"><span class="bat"></span></span>
  </span>
  <span class="label">{w.label}</span>
</button>

<style>
  .sw {
    display: grid;
    justify-items: center;
    gap: 4px;
    width: 100%;
    background: none;
    border: 0;
    padding: 2px;
    cursor: pointer;
    touch-action: manipulation;
  }
  .plate {
    position: relative;
    display: grid;
    justify-items: center;
    gap: 5px;
    padding: 6px 8px 8px;
    border-radius: 8px;
    background: linear-gradient(180deg, var(--metal-lo), #0b0b0b);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }
  .led {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #3a1a10;
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.8);
    transition: background 0.2s, box-shadow 0.2s;
  }
  .on .led {
    background: radial-gradient(circle at 40% 35%, #ffd2a0, #ff7a2a 60%);
    box-shadow: 0 0 10px rgba(255, 120, 40, 0.8);
  }
  .pending .led {
    animation: pulse 0.5s ease-in-out infinite alternate;
  }
  .slot {
    position: relative;
    width: 26px;
    height: 46px;
    border-radius: 13px;
    background: radial-gradient(circle at 50% 50%, #050505 30%, #1a1918 70%);
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.9), 0 0 0 2px var(--metal-hi);
  }
  .bat {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 14px;
    height: 30px;
    margin-left: -7px;
    border-radius: 7px;
    background: linear-gradient(90deg, #6a655f, #d6d0c8 45%, #77716a);
    box-shadow: 0 3px 4px rgba(0, 0, 0, 0.7);
    transform-origin: 50% 0;
    transform: translateY(-2px);
    transition: transform 0.22s cubic-bezier(0.5, 1.6, 0.4, 1);
  }
  /* off = handle down, on = handle up */
  .sw:not(.on) .bat {
    transform: translateY(-2px);
  }
  .on .bat {
    transform: translateY(-28px);
  }
  .unknown .bat {
    transform: translateY(-15px) scaleY(0.6);
    opacity: 0.7;
  }
  .label {
    font-family: var(--font-label);
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--label);
    white-space: nowrap;
  }
  .compact .slot {
    width: 22px;
    height: 40px;
  }
  .compact .bat {
    width: 12px;
    margin-left: -6px;
    height: 26px;
  }
  .compact.on .bat {
    transform: translateY(-24px);
  }
  .compact .plate {
    padding: 5px 4px 6px;
  }
  @keyframes pulse {
    from { opacity: 0.3; }
    to { opacity: 1; }
  }
</style>
