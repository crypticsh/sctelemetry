<script>
  // SHIELDS: overall level, hull, and one arc per shield face around the
  // ship. A face that drops flashes like a hit.
  import { untrack } from 'svelte';
  import { Tween } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { prefs } from '../../lib/prefs.svelte.js';

  let { ctx } = $props();
  const ship = $derived(ctx.ship || {});
  const faces = $derived(ship.shields?.faces?.length ? ship.shields.faces : []);
  const level = $derived(ship.shields?.level);

  const lvl = new Tween(0, { duration: 400, easing: cubicOut });
  const hull = new Tween(0, { duration: 400, easing: cubicOut });
  $effect(() => {
    const d = prefs.animations ? 400 : 0;
    lvl.set((level ?? 0) * 100, { duration: d });
    hull.set((ship.hull ?? 0) * 100, { duration: d });
  });

  // Per-face tweens and hit flashes.
  let fv = $state([]);
  let hits = $state([]);
  let prev = [];
  $effect(() => {
    const now = faces.map((f) => f ?? 0);
    untrack(() => {
      if (fv.length !== now.length) { fv = now.slice(); hits = now.map(() => 0); prev = now.slice(); return; }
      now.forEach((v, i) => {
        if (v < prev[i] - 0.02) hits[i]++;
      });
      prev = now.slice();
      fv = now;
    });
  });

  // Arc geometry: faces evenly around the ship, face 0 at the front (top).
  const CX = 100, CY = 100, R = 82;
  function arc(i, n, r = R) {
    const span = 360 / n;
    const gap = n > 1 ? 7 : 0;
    const a0 = ((i * span - span / 2 + gap / 2 - 90) * Math.PI) / 180;
    const a1 = ((i * span + span / 2 - gap / 2 - 90) * Math.PI) / 180;
    const large = span - gap > 180 ? 1 : 0;
    return `M ${CX + r * Math.cos(a0)} ${CY + r * Math.sin(a0)} A ${r} ${r} 0 ${large} 1 ${CX + r * Math.cos(a1)} ${CY + r * Math.sin(a1)}`;
  }
  function labelPos(i, n) {
    const a = ((i * (360 / n) - 90) * Math.PI) / 180;
    return { x: CX + (R + 12) * Math.cos(a), y: CY + (R + 12) * Math.sin(a) + 3 };
  }
  const n = $derived(fv.length);
</script>

<div class="shd">
  <div class="topbar">
    <div class="box">
      <span class="bv">{level == null ? '--' : Math.round(lvl.current)}</span>
      <span class="bm">100</span>
    </div>
    <div class="hull">
      <span class="pm">HULL</span>
      <span class="hv">{ship.hull == null ? '--' : Math.round(hull.current)}</span>
      <span class="pm">/ 100</span>
    </div>
    <div class="mode">{ship.present ? (n ? `${n} FACES` : 'NO FACES') : 'NO SHIP'}</div>
  </div>

  <div class="view">
    <svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet">
      <!-- range rings -->
      <circle cx={CX} cy={CY} r={R - 18} class="ring" />
      <circle cx={CX} cy={CY} r={R + 4} class="ring faint" />

      <!-- shield faces -->
      {#each fv as v, i (i)}
        <path d={arc(i, n)} class="base" />
        {#key hits[i]}
          <path d={arc(i, n)} class="face" class:hit={hits[i] > 0} class:low={v < 0.25} style:opacity={0.25 + v * 0.75} style:stroke-width={3 + v * 5} />
        {/key}
        {@const lp = labelPos(i, n)}
        <text x={lp.x} y={lp.y} class="fl">{Math.round(v * 100)}</text>
      {/each}

      <!-- ship wireframe (generic, top-down) -->
      <g class="wire" transform="translate(100 104)">
        <path d="M0 -46 L7 -30 L8 -10 L30 2 L44 0 L46 8 L30 14 L12 16 L9 30 L18 38 L18 44 L-18 44 L-18 38 L-9 30 L-12 16 L-30 14 L-46 8 L-44 0 L-30 2 L-8 -10 L-7 -30 Z" />
        <path d="M0 -46 L0 40 M-8 -10 L8 -10 M-12 16 L12 16 M-30 2 L-12 8 L12 8 L30 2 M-4 -30 L4 -30" class="thin" />
        <path d="M-5 -24 L5 -24 L4 -14 L-4 -14 Z" class="glass" />
        <ellipse cx="-24" cy="26" rx="7" ry="11" />
        <ellipse cx="24" cy="26" rx="7" ry="11" />
        <path d="M-44 0 L-44 -10 M44 0 L44 -10" class="thin" />
      </g>
    </svg>
    {#if !n}
      <div class="none">{ship.present ? 'NO SHIELD DATA' : 'NOT SEATED'}</div>
    {/if}
  </div>
</div>

<style>
  .shd {
    position: absolute;
    inset: 0;
    display: grid;
    grid-template-rows: auto 1fr;
    padding: 3cqh 4cqw 2cqh;
    font-family: var(--font-screen);
    color: var(--ink);
  }
  .topbar {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: start;
    gap: 3cqw;
  }
  .box {
    display: grid;
    border: 1px solid var(--ink-dim);
    min-width: 15cqw;
    text-align: center;
  }
  .bv {
    font-size: 6cqmin;
    padding: 0.6cqh 2cqw;
    border-bottom: 1px solid var(--ink-dim);
    color: var(--ink-hi);
    font-variant-numeric: tabular-nums;
  }
  .bm {
    font-size: 5cqmin;
    padding: 0.6cqh 2cqw;
    color: var(--ink-dim);
  }
  .hull {
    justify-self: center;
    display: flex;
    align-items: baseline;
    gap: 2cqw;
    font-size: 5.4cqmin;
    padding-top: 1cqh;
  }
  .hv {
    font-size: 7cqmin;
    color: var(--ink-hi);
    font-variant-numeric: tabular-nums;
    min-width: 2.2em;
    text-align: right;
  }
  .pm {
    color: var(--ink-dim);
  }
  .mode {
    font-size: 3.6cqmin;
    color: var(--ink-dim);
    border: 1px solid var(--ink-faint);
    padding: 0.6cqh 1.5cqw;
    margin-top: 1cqh;
  }
  .view {
    position: relative;
    min-height: 0;
    display: grid;
    place-items: center;
  }
  svg {
    position: absolute;
    inset: 3% 0 4%;
    width: 100%;
    height: 93%;
    overflow: visible;
  }
  .ring {
    fill: none;
    stroke: var(--ink-faint);
    stroke-width: 0.6;
    stroke-dasharray: 2 3;
  }
  .ring.faint {
    stroke-dasharray: none;
    opacity: 0.6;
  }
  .base {
    fill: none;
    stroke: var(--ink-faint);
    stroke-width: 8;
  }
  .face {
    fill: none;
    stroke: var(--ink);
    stroke-linecap: butt;
    filter: drop-shadow(0 0 2px var(--ink));
    transition: opacity 0.35s, stroke-width 0.35s;
  }
  .face.low {
    stroke: var(--danger);
    filter: drop-shadow(0 0 2px var(--danger));
  }
  .face.hit {
    animation: hit 0.5s ease-out;
  }
  @keyframes hit {
    0% { stroke: #fff; filter: drop-shadow(0 0 6px #fff); }
    40% { stroke: var(--danger); }
    100% { }
  }
  .fl {
    font-size: 7px;
    fill: var(--ink);
    text-anchor: middle;
    font-family: var(--font-screen);
  }
  .wire {
    fill: none;
    stroke: var(--ink);
    stroke-width: 1;
    stroke-linejoin: round;
    filter: drop-shadow(0 0 1.5px var(--ink));
  }
  .wire .thin {
    stroke-width: 0.5;
    opacity: 0.7;
  }
  .wire .glass {
    fill: color-mix(in srgb, var(--ink) 25%, transparent);
  }
  .none {
    position: absolute;
    bottom: 2cqh;
    font-size: 4cqmin;
    color: var(--ink-dim);
    letter-spacing: 0.2em;
  }
</style>
