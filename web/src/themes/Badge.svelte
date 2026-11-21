<script>
  import { themeById } from './index.js';

  // Official artwork dropped into ./logos/<id>.svg|png|webp wins over the built-in badge.
  const custom = import.meta.glob('./logos/*.{svg,png,webp}', { eager: true, query: '?url', import: 'default' });

  let { id, size = 28 } = $props();
  const t = $derived(themeById(id));
  const url = $derived(Object.entries(custom).find(([k]) => k.replace(/^.*\/|\.\w+$/g, '') === t.id)?.[1]);
</script>

{#if url}
  <img src={url} alt="{t.maker} logo" width={size} height={size} />
{:else}
  <span class="badge" style:width="{size}px" style:height="{size}px" aria-label="{t.maker} badge" role="img">{@html t.badge}</span>
{/if}

<style>
  .badge {
    display: inline-grid;
    color: var(--ink);
    filter: drop-shadow(0 0 3px color-mix(in srgb, var(--ink) 50%, transparent));
  }
  .badge :global(svg) {
    width: 100%;
    height: 100%;
  }
  img {
    object-fit: contain;
  }
</style>
