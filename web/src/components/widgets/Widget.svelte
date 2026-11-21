<script>
  import StatusLight from './StatusLight.svelte';
  import ToggleSwitch from './ToggleSwitch.svelte';
  import PushButton from './PushButton.svelte';
  import Readout from './Readout.svelte';
  import Counter from './Counter.svelte';
  import Ladder from './Ladder.svelte';
  import BarGauge from './BarGauge.svelte';

  const TYPES = { light: StatusLight, switch: ToggleSwitch, button: PushButton, readout: Readout, counter: Counter, ladder: Ladder, bar: BarGauge };

  let { w, ctx, editing = false } = $props();
  const C = $derived(TYPES[w.type]);
</script>

{#if C}
  <C {w} {ctx} {editing} />
{:else}
  <div class="unknown">? {w.type}</div>
{/if}

<style>
  .unknown {
    font-size: 12px;
    color: var(--danger);
    padding: 8px;
  }
</style>
