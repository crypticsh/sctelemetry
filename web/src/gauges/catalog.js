// Every gauge you can put on the Gauges page, with its tunable options.
import * as L from './lib.js';

const pct = (key, label) => ({ key, label, type: 'percent' });
const num = (key, label, step = 1) => ({ key, label, type: 'number', step });

export const GAUGES = {
  annunciator: { name: 'Alert panel', kind: 'component', src: 'calc', size: 'full', desc: 'Master warning/caution and the alert lights. Tap a master button to silence.' },
  asi: {
    name: 'Airspeed', kind: 'dial', src: 'direct', make: L.asi, desc: 'Speed in m/s on a square-root scale.',
    defaults: { max: 1250, greenFrom: 20, greenTo: 230, yellowTo: 1000, redline: 1150 },
    fields: [num('max', 'Full scale (m/s)', 50), num('greenFrom', 'Green arc from'), num('greenTo', 'Green arc to (SCM limit)'), num('yellowTo', 'Yellow arc to'), num('redline', 'Red line')],
  },
  att: { name: 'Attitude', kind: 'dial', src: 'est', make: L.att, desc: 'Pitch = flight-path angle (VSI ÷ speed). Bank estimated from turn rate; atmosphere only.' },
  alt: { name: 'Altimeter', kind: 'dial', src: 'direct', make: L.alt, desc: 'Three pointers: 100 m, 1 km, 10 km. Striped flag when there is no altitude (space).' },
  radalt: {
    name: 'Radar altimeter', kind: 'dial', src: 'direct', make: L.radalt, desc: 'Height above ground, log scale. Amber DH light below decision height.',
    defaults: { max: 1500, dh: 30 }, fields: [num('max', 'Full scale (m)', 100), num('dh', 'Decision height (m)')],
  },
  vsi: {
    name: 'Vertical speed', kind: 'dial', src: 'direct', make: L.vsi, desc: 'Climb/sink rate. Add a second one with a small range for landings.',
    defaults: { range: 200, scale: 'sqrt', warnBelow: 50, title: 'VERTICAL SPEED' },
    fields: [num('range', 'Range ± (m/s)', 1), { key: 'scale', label: 'Scale', type: 'select', options: [['sqrt', 'Square-root (detail near 0)'], ['linear', 'Linear']] }, num('warnBelow', 'Colored sink arc from (m/s, 0 = off)', 0.5), { key: 'title', label: 'Dial title', type: 'text' }],
  },
  vsifine: {
    name: 'Vertical speed · fine', kind: 'dial', src: 'direct', make: L.vsi, desc: '±10 m/s for touchdowns.', base: 'vsi',
    defaults: { range: 10, scale: 'linear', warnBelow: 4, title: 'VERT SPEED · FINE' },
  },
  tti: {
    name: 'Time to impact', kind: 'dial', src: 'calc', make: L.tti, desc: 'Radar altitude ÷ sink rate while descending.',
    defaults: { max: 60, red: 4, yellow: 10 }, fields: [num('max', 'Full scale (s)', 5), num('red', 'Red below (s)', 0.5), num('yellow', 'Yellow below (s)', 0.5)],
  },
  tc: {
    name: 'Turn coordinator', kind: 'dial', src: 'calc', make: L.tc, desc: 'Turn rate from heading change per second.',
    defaults: { stdRate: 3 }, fields: [num('stdRate', 'Index mark turn rate (°/s)', 0.5)],
  },
  hdg: { name: 'Heading', kind: 'dial', src: 'direct', make: L.hdg, desc: 'Rotating compass card.' },
  gmeter: {
    name: 'Accelerometer', kind: 'dial', src: 'direct', make: L.gmeter, desc: 'G now, with max and min drag needles. Tap to reset the drag needles.',
    defaults: { min: -3, max: 9, caution: 5, limit: 7 }, fields: [num('min', 'Scale min (G)'), num('max', 'Scale max (G)'), num('caution', 'Yellow from (G)', 0.5), num('limit', 'Red from (G)', 0.5)],
  },
  hullshield: {
    name: 'Hull · Shield', kind: 'dial', src: 'direct', make: L.hullshield, desc: 'Left needle hull, right needle shields.',
    defaults: { hullRed: 0.4, shieldRed: 0.25 }, fields: [pct('hullRed', 'Hull red below'), pct('shieldRed', 'Shield red below')],
  },
  hr: { name: 'Heart rate', kind: 'dial', src: 'direct', make: L.hr, desc: 'Pilot heart rate (bpm).' },
  fuel: {
    name: 'Fuel', kind: 'strip', src: 'direct', make: L.fuel, desc: 'Edge gauge, E to F.',
    defaults: { source: 'h2', red: 0.05, yellow: 0.15 },
    fields: [{ key: 'source', label: 'Tank', type: 'select', options: [['h2', 'Hydrogen'], ['qt', 'Quantum (reads 0 in current builds)']] }, pct('red', 'Red below'), pct('yellow', 'Yellow below')],
  },
  boost: {
    name: 'Boost charge', kind: 'strip', src: 'calc', make: L.boost, desc: 'Boost recharges, so this reads like a battery ammeter: needle = draining (left) or charging (right), bar = reserve, plus time to full.',
    defaults: { fullScale: 0.3 }, fields: [pct('fullScale', 'Needle full deflection (% per second)')],
  },
  endurance: { name: 'H2 endurance', kind: 'component', src: 'calc', desc: 'Hydrogen left ÷ average burn over the last minute.' },
  gear: { name: 'Gear lights', kind: 'component', src: 'direct', desc: 'Gear, VTOL and landed lamps.' },
  cm: { name: 'Countermeasures', kind: 'component', src: 'direct', desc: 'Noise and decoy drum counters.' },
};

export const SIZES = [['s', 'Small'], ['m', 'Medium'], ['l', 'Large (2×2)'], ['wide', 'Wide (2×1)'], ['full', 'Full row']];

let n = 0;
export const gid = () => `gi-${Date.now().toString(36)}${(n++).toString(36)}`;

/** Every gauge once, so you can try them all and remove what you don't like. */
export function defaultGauges() {
  const order = ['annunciator', 'asi', 'att', 'alt', 'tc', 'hdg', 'vsi', 'radalt', 'vsifine', 'tti', 'gmeter', 'hullshield', 'hr', 'gear', 'cm', 'fuel', 'fuel', 'boost', 'endurance'];
  const items = order.map((type) => ({ id: gid(), type, size: GAUGES[type].size || (GAUGES[type].kind === 'dial' ? 'm' : 's'), opts: {} }));
  items.find((i, k) => i.type === 'fuel' && k > 15).opts = { source: 'qt' };
  return { items, alerts: {} };
}
