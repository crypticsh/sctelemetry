<script>
  // Backlit square key (CPLD, ESP, GSAF…). Lit when its binding is true.
  import { read, truthy } from '../../lib/util.js';
  import { press } from '../../lib/actions.js';
  import { buzz } from '../../lib/prefs.svelte.js';

  let { w, ctx, editing = false } = $props();

  const raw = $derived(truthy(read(ctx, w.bind)));
  const on = $derived(raw == null ? null : w.invert ? !raw : raw);
  const color = $derived(w.color && w.color !== 'accent' ? `var(--${w.color === 'green' ? 'ok' : w.color === 'red' ? 'danger' : w.color === 'blue' ? 'info' : 'warn'})` : null);

  let flash = $state(0);
  let prev;
  $effect(() => {
    if (prev !== undefined && on !== prev) flash++;
    prev = on;
  });

  function tap() {
    if (editing || !w.action) return;
    buzz();
    press(w, w.action);
  }
</script>

<button
  class="key"
  class:on
  class:unknown={on == null}
  class:actionable={!!w.action}
  style:--tint={color}
  onclick={tap}
  aria-pressed={on ?? undefined}
  title={w.action ? `${w.label}: ${w.action}` : w.label}
>
  {#key flash}
    <span class="face" class:blink={flash > 0}>{w.label}</span>
  {/key}
</button>

<style>
  .key {
    position: relative;
    width: 100%;
    aspect-ratio: 1.55;
    min-height: 34px;
    border: 0;
    padding: 4px;
    border-radius: 7px;
    background: linear-gradient(180deg, var(--metal-lo), #0a0a0a);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 2px 3px rgba(0, 0, 0, 0.6);
    cursor: default;
    touch-action: manipulation;
    container-type: inline-size;
  }
  .key.actionable {
    cursor: pointer;
  }
  .key.actionable:active .face {
    transform: scale(0.96);
  }
  .face {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    border-radius: 4px;
    background: var(--key-off);
    color: var(--key-off-text);
    font-family: var(--font-screen);
    font-size: clamp(11px, 19cqw, 22px);
    letter-spacing: 0.08em;
    border: 1px solid rgba(0, 0, 0, 0.6);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.03), inset 0 -6px 10px rgba(0, 0, 0, 0.5);
    transition: background 0.25s ease, color 0.25s ease, box-shadow 0.25s ease, transform 0.08s;
    text-transform: uppercase;
    overflow: hidden;
    white-space: nowrap;
  }
  .on .face {
    background: var(--key-on);
    color: var(--key-on-text);
    box-shadow: var(--key-on-glow);
  }
  .on[style*='--tint'] .face {
    background: radial-gradient(circle at 50% 45%, color-mix(in srgb, var(--tint) 70%, white), var(--tint) 60%, color-mix(in srgb, var(--tint) 60%, black));
    box-shadow: 0 0 14px color-mix(in srgb, var(--tint) 60%, transparent);
  }
  .unknown .face {
    color: color-mix(in srgb, var(--key-off-text) 45%, transparent);
    background: repeating-linear-gradient(135deg, var(--key-off) 0 6px, color-mix(in srgb, var(--key-off) 80%, black) 6px 12px);
  }
  .blink {
    animation: blink 0.45s steps(2, jump-none) 1;
  }
  @keyframes blink {
    0% { filter: brightness(1.8); }
    50% { filter: brightness(0.6); }
    100% { filter: brightness(1); }
  }
</style>
