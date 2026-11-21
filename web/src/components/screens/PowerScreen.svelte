<script>
  // POWER MANAGEMENT. The stream reports power on/off per system (not pip
  // allocation), so columns show what is real: weapons powered, thrusters
  // on, shield level. Signatures (IR/EM/CS) are not in the stream yet and
  // read "---" until they are.
  import { Tween } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { prefs } from '../../lib/prefs.svelte.js';
  import { fmt } from '../../lib/util.js';

  let { ctx } = $props();
  const ship = $derived(ctx.ship || {});
  const p = $derived(ship.power || {});
  const weapons = $derived(ctx.weapons?.list || []);

  const SEG = 10;
  const cols = $derived([
    {
      key: 'wpn',
      on: p.weapons,
      fill: weapons.length ? weapons.filter((x) => x.powered).length / weapons.length : p.weapons == null ? null : p.weapons ? 1 : 0,
      cap: p.weapons == null ? null : p.weapons ? 1 : 0,
      icon: 'gun',
    },
    { key: 'thr', on: p.engines, fill: p.engines == null ? null : p.engines ? 1 : 0, cap: p.engines == null ? null : p.engines ? 1 : 0, icon: 'thr' },
    {
      key: 'shd',
      on: p.shieldGen,
      fill: ship.shields?.level ?? (p.shieldGen == null ? null : p.shieldGen ? 1 : 0),
      cap: p.shieldGen == null ? null : p.shieldGen ? 1 : 0,
      icon: 'shd',
    },
  ]);

  // Tweened fills so bars rise and fall smoothly.
  const tw = [new Tween(0, { duration: 400, easing: cubicOut }), new Tween(0, { duration: 400, easing: cubicOut }), new Tween(0, { duration: 400, easing: cubicOut })];
  const caps = [new Tween(0, { duration: 500, easing: cubicOut }), new Tween(0, { duration: 500, easing: cubicOut }), new Tween(0, { duration: 500, easing: cubicOut })];
  $effect(() => {
    const d = prefs.animations ? 400 : 0;
    cols.forEach((c, i) => {
      tw[i].set(c.fill ?? 0, { duration: d });
      caps[i].set(c.cap ?? 0, { duration: d });
    });
  });

  const out = new Tween(0, { duration: 400, easing: cubicOut });
  $effect(() => out.set(ship.powerTotal ? ship.powerOn / ship.powerTotal : 0, { duration: prefs.animations ? 400 : 0 }));

  const sig = $derived(ctx.signatures || {});
  const sigs = $derived([
    ['IR', sig.ir, sig.irMax],
    ['EM', sig.em, sig.emMax],
    ['CS', sig.cs, sig.csMax],
  ]);

  const minis = $derived([
    ['PP', p.plants],
    ['CL', p.coolers],
    ['LS', p.lifeSupport],
    ['SN', p.sensors],
    ['GR', p.gravity],
    ['EM', p.shieldEmit],
  ]);
  const sv = (v) => (v == null ? '---' : fmt(v, { decimals: 1, format: 'compact' }));
</script>

<div class="pwr">
  <div class="sigs">
    {#each sigs as [k, a, b]}
      <div class="sig">
        <span class="k">{k}</span>
        <span class="v"><span>{sv(a)}</span><span class="dim">{sv(b)}</span></span>
      </div>
    {/each}
  </div>

  <div class="main">
    <div class="out">
      <div class="out-head">
        <svg viewBox="0 0 24 16" class="ico"><rect x="1" y="2" width="22" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.6" /><rect x="5" y="5" width="3" height="6" fill="currentColor" /><rect x="10.5" y="5" width="3" height="6" fill="currentColor" /><rect x="16" y="5" width="3" height="6" fill="currentColor" /></svg>
        <span>OUTPUT</span>
      </div>
      <div class="out-num">
        <span class="big">{ship.present ? ship.powerOn : '-'}</span>
        <span class="sl">/</span>
        <span class="tot">{ship.present ? ship.powerTotal : '-'}</span>
      </div>
      <div class="minis">
        {#each minis as [k, on]}
          <span class="mini" class:on class:unk={on == null}>{k}</span>
        {/each}
      </div>
    </div>

    <div class="cols">
      {#each cols as c, i}
        <div class="col" class:off={c.on === false} class:unk={c.on == null}>
          <div class="stack">
            <div class="segs">
              {#each Array(SEG) as _, s}
                {@const lit = tw[i].current * SEG > s + 0.5}
                <i class:lit class:edge={lit && tw[i].current * SEG < s + 1.5}></i>
              {/each}
            </div>
            <div class="rail"><div class="railfill" style:height="{caps[i].current * 100}%"></div><span class="notch" style:bottom="{caps[i].current * 100}%"></span></div>
          </div>
          <div class="cico">
            {#if c.icon === 'gun'}
              <svg viewBox="0 0 40 16"><path d="M2 8h20v-3h10v6H22v3h-6l-2 2h-4v-5H2z" fill="currentColor" /></svg>
            {:else if c.icon === 'thr'}
              <svg viewBox="0 0 40 16"><path d="M4 2l8 6-8 6zM15 2l8 6-8 6zM26 2l8 6-8 6z" fill="currentColor" /></svg>
            {:else}
              <svg viewBox="0 0 40 16"><path d="M20 1l8 3v5c0 3-3 5-8 6-5-1-8-3-8-6V4z" fill="none" stroke="currentColor" stroke-width="2" /></svg>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </div>

  <div class="outbar"><div class="outfill" style:width="{out.current * 100}%"></div></div>
</div>

<style>
  .pwr {
    position: absolute;
    inset: 0;
    display: grid;
    grid-template-rows: auto 1fr auto;
    padding: 3cqh 4cqw 3cqh;
    gap: 2.5cqh;
    font-family: var(--font-screen);
    color: var(--ink);
  }
  .sigs {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 2cqw;
  }
  .sig {
    display: flex;
    align-items: center;
    gap: 2.5cqw;
    justify-content: center;
  }
  .k {
    font-size: 6cqmin;
    letter-spacing: 0.05em;
  }
  .v {
    display: grid;
    font-size: 5.2cqmin;
    line-height: 1.05;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .dim {
    color: var(--ink-dim);
  }
  .main {
    display: grid;
    grid-template-columns: 32% 1fr;
    gap: 4cqw;
    min-height: 0;
  }
  .out {
    align-self: start;
    border: 1px solid var(--ink-dim);
    padding: 2cqh 2cqw;
    display: grid;
    gap: 1.5cqh;
  }
  .out-head {
    display: flex;
    align-items: center;
    gap: 2cqw;
    font-size: 4.2cqmin;
    letter-spacing: 0.12em;
  }
  .ico {
    width: 6cqmin;
    color: var(--ink);
  }
  .out-num {
    display: flex;
    align-items: baseline;
    gap: 1.6cqw;
    font-size: 6cqmin;
  }
  .big {
    font-size: 11cqmin;
    color: var(--danger);
    text-shadow: 0 0 6px color-mix(in srgb, var(--danger) 60%, transparent);
    filter: saturate(0.85);
  }
  .sl,
  .tot {
    color: var(--ink);
  }
  .minis {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.8cqmin;
  }
  .mini {
    font-size: 3cqmin;
    text-align: center;
    padding: 0.4cqmin 0;
    border: 1px solid var(--ink-faint);
    color: var(--ink-dim);
    transition: background 0.3s, color 0.3s;
  }
  .mini.on {
    background: color-mix(in srgb, var(--ink) 25%, transparent);
    color: var(--ink-hi);
    border-color: var(--ink-dim);
  }
  .mini.unk {
    opacity: 0.35;
  }
  .cols {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 3cqw;
    min-height: 0;
  }
  .col {
    display: grid;
    grid-template-rows: 1fr auto;
    gap: 1.5cqh;
    min-height: 0;
    transition: opacity 0.3s;
  }
  .col.off .segs i.lit {
    background: var(--ink-dim);
  }
  .col.unk {
    opacity: 0.45;
  }
  .stack {
    display: grid;
    grid-template-columns: 1fr 22%;
    gap: 1.5cqw;
    min-height: 0;
  }
  .segs {
    display: flex;
    flex-direction: column-reverse;
    gap: 0.7cqh;
    background: linear-gradient(180deg, transparent, color-mix(in srgb, var(--ink-faint) 60%, transparent));
    padding: 0.5cqh;
  }
  .segs i {
    flex: 1;
    background: color-mix(in srgb, var(--ink-faint) 70%, transparent);
    transition: background 0.2s, box-shadow 0.2s;
  }
  .segs i.lit {
    background: repeating-linear-gradient(0deg, var(--ink) 0 2px, color-mix(in srgb, var(--ink) 75%, black) 2px 3px);
    box-shadow: 0 0 5px color-mix(in srgb, var(--ink) 50%, transparent);
  }
  .segs i.edge {
    background: var(--ink-hi);
  }
  .rail {
    position: relative;
    border: 1px solid var(--ink-dim);
  }
  .railfill {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    background: color-mix(in srgb, var(--ink) 35%, transparent);
  }
  .notch {
    position: absolute;
    left: -35%;
    width: 50%;
    height: 0;
    border-left: 1.4cqmin solid var(--ink-hi);
    border-top: 0.9cqmin solid transparent;
    border-bottom: 0.9cqmin solid transparent;
    transform: translateY(50%);
  }
  .cico {
    display: grid;
    place-items: center;
    color: var(--ink);
  }
  .cico svg {
    width: 9cqmin;
    height: 4cqmin;
  }
  .outbar {
    margin-left: calc(32% + 4cqw);
    height: 1.6cqh;
    min-height: 4px;
    background: var(--ink-faint);
  }
  .outfill {
    height: 100%;
    background: repeating-linear-gradient(90deg, var(--ink) 0 3px, color-mix(in srgb, var(--ink) 70%, black) 3px 4px);
  }
</style>
