// Small helpers shared by screens and widgets.

/** Read a dotted path from the live data: "ship.gear", "raw.vehicle.state.health". */
export function read(ctx, path) {
  if (!path) return undefined;
  let o = ctx;
  for (const k of path.split('.')) {
    if (o == null) return undefined;
    o = o[k];
  }
  return o;
}

export function truthy(v) {
  if (v == null) return null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return /^(true|on|1|yes|enabled|active)$/i.test(v);
  return !!v;
}

export function fmt(v, { decimals = 0, unit = '', format = 'number' } = {}) {
  if (v == null || (typeof v === 'number' && !Number.isFinite(v))) return '--';
  if (format === 'percent') return `${Math.round(v * 100)}${unit || '%'}`;
  if (format === 'text' || typeof v !== 'number') return String(v) + (unit ? ` ${unit}` : '');
  const abs = Math.abs(v);
  if (format === 'compact' && abs >= 1000) return `${(v / 1000).toFixed(abs >= 1e5 ? 0 : 1)}K${unit}`;
  return v.toFixed(decimals) + unit;
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const uid = () => Math.random().toString(36).slice(2, 9);
