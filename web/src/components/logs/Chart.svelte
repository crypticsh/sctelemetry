<script>
  // One channel over time (small multiples share a synced crosshair).
  import uPlot from 'uplot';
  import 'uplot/dist/uPlot.min.css';

  let { t, values, label, unit = '', fmtV = (v) => v, height = 150, syncKey = 'sct', range } = $props();

  let el;
  let plot = null;
  let width = $state(300);

  function css(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function build() {
    plot?.destroy();
    const ink = css('--ink') || '#e7953c';
    const grid = css('--ui-line') || '#333';
    const text = css('--ui-text-dim') || '#999';
    const opts = {
      width,
      height,
      padding: [8, 8, 0, 0],
      legend: { show: false },
      cursor: { sync: { key: syncKey, setSeries: false }, points: { size: 8, fill: ink }, drag: { x: false, y: false } },
      scales: { x: { time: true, ...(range ? { range: () => range } : {}) } },
      axes: [
        { stroke: text, grid: { stroke: grid, width: 1 }, ticks: { show: false }, font: '11px system-ui', space: 70 },
        { stroke: text, grid: { stroke: grid, width: 1 }, ticks: { show: false }, font: '11px system-ui', size: 52, values: (u, vals) => vals.map((v) => fmtV(v)) },
      ],
      series: [{}, { stroke: ink, width: 2, fill: `${ink}22`, spanGaps: false, points: { show: false } }],
      hooks: {
        setCursor: [
          (u) => {
            const i = u.cursor.idx;
            hover = i == null ? null : { t: u.data[0][i], v: u.data[1][i] };
          },
        ],
      },
    };
    plot = new uPlot(opts, [t, values], el);
  }

  let hover = $state(null);

  $effect(() => {
    t; values; range;
    if (!el) return;
    if (!plot) build();
    else {
      if (range) plot.setScale('x', { min: range[0], max: range[1] });
      plot.setData([t, values], !range);
    }
  });
  $effect(() => {
    if (plot && width) plot.setSize({ width, height });
  });
  $effect(() => () => plot?.destroy());

  const last = $derived.by(() => {
    for (let i = values.length - 1; i >= 0; i--) if (values[i] != null) return values[i];
    return null;
  });
</script>

<div class="chart">
  <div class="head">
    <span class="name">{label}</span>
    <span class="val mono">
      {#if hover && hover.v != null}
        {new Date(hover.t * 1000).toLocaleTimeString()} · {fmtV(hover.v)}{unit}
      {:else if last != null}
        {fmtV(last)}{unit}
      {:else}
        no data
      {/if}
    </span>
  </div>
  <div class="plot" bind:clientWidth={width} bind:this={el}></div>
</div>

<style>
  .chart {
    background: var(--ui-bg);
    border: 1px solid var(--ui-line);
    border-radius: 12px;
    padding: 10px 12px 6px;
    min-width: 0;
  }
  .head {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 4px;
    font-size: 13px;
  }
  .name {
    color: var(--ui-text);
    letter-spacing: 0.06em;
  }
  .val {
    color: var(--ui-text-dim);
    white-space: nowrap;
  }
  .plot {
    width: 100%;
    overflow: hidden;
  }
  .plot :global(.u-cursor-x),
  .plot :global(.u-cursor-y) {
    border-color: var(--ui-text-dim) !important;
  }
</style>
