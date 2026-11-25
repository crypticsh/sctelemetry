// Flight data for the gauges: values straight from the stream plus values
// worked out from it (turn rate, flight-path pitch, estimated bank, time to
// impact, fuel endurance, boost charge rate, G min).

import { onFrame } from './telemetry.svelte.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const deg = (r) => (r * 180) / Math.PI;

export const flight = $state({ D: blank() });

function blank() {
  return { present: false, speed: null, vsi: null, alt: null, radarAlt: null, heading: null, g: null, gMax: null, gMin: null, hull: null, shield: null, h2: null, qt: null, boost: null, boostEngaged: false, boostCritical: false, boostRate: 0, gear: null, vtol: null, landed: null, qtSpool: null, decoupled: null, noise: null, decoy: null, hr: null, inAtmo: false, turnRate: 0, pitch: 0, bank: 0, tti: null, endurance: null, ship: '' };
}

const C = { t: null, heading: null, turnRate: 0, h2: [], boost: null, boostT: null, boostRate: 0, gMin: 1, gMax: 1, ship: null };

/** Reset G min/max drag needles. */
export function resetGDrag() {
  C.gMin = 1;
  C.gMax = 1;
}

onFrame((n) => {
  const s = n.ship || {};
  const t = (n.t || Date.now()) / 1000;
  const dt = C.t == null ? 0 : clamp(t - C.t, 0, 2);
  C.t = t;
  if (s.id !== C.ship) { C.ship = s.id; C.h2 = []; C.heading = null; C.boost = null; resetGDrag(); }

  const D = blank();
  if (!s.present) { D.hr = n.player?.heartRate ?? null; flight.D = D; return; }

  Object.assign(D, {
    present: true,
    ship: s.className || '',
    speed: s.speed,
    vsi: s.vsi,
    alt: s.altitude,
    radarAlt: s.radarAlt,
    heading: s.heading,
    g: s.g,
    hull: s.hull,
    shield: s.shields?.level ?? null,
    h2: s.hydrogen,
    qt: s.quantum,
    boost: s.boost?.reserves ?? null,
    boostEngaged: !!s.boost?.engaged,
    boostCritical: !!s.boost?.critical,
    gear: s.gear,
    vtol: s.vtol,
    landed: s.landed,
    qtSpool: s.qtSpooled,
    decoupled: s.ifcs?.decoupled,
    noise: n.weapons?.noise ?? null,
    decoy: n.weapons?.decoy ?? null,
    hr: n.player?.heartRate ?? null,
  });
  // Near a planet: the game reports an altitude, or the pilot feels gravity.
  const grav = n.player?.gravity ?? 0;
  D.inAtmo = D.alt != null || grav > 0.05;
  const g0 = 9.81 * (grav > 0.05 ? grav : 1);

  // Turn rate from heading change (heading reads 360 when still, so skip when stopped).
  if (D.heading != null && C.heading != null && dt > 0 && (D.speed ?? 0) > 1) {
    let d = D.heading - C.heading;
    d = ((d + 540) % 360) - 180;
    C.turnRate += (d / dt - C.turnRate) * Math.min(1, dt * 4);
  } else if ((D.speed ?? 0) <= 1) C.turnRate = 0;
  C.heading = D.heading;
  D.turnRate = C.turnRate;

  // Pitch = flight-path angle. Bank = coordinated-turn estimate (atmosphere only).
  const v = D.speed ?? 0;
  D.pitch = v > 3 && D.vsi != null ? clamp(deg(Math.asin(clamp(D.vsi / v, -1, 1))), -45, 45) : 0;
  D.bank = D.inAtmo && v > 10 ? clamp(deg(Math.atan((v * (C.turnRate * Math.PI)) / 180 / g0)), -70, 70) : 0;

  // Time to impact.
  D.tti = D.radarAlt != null && D.vsi != null && D.vsi < -0.5 && !D.landed ? D.radarAlt / -D.vsi : null;

  // G min/max (the game gives max; we keep both so the drag needles can be reset).
  if (D.g != null) { C.gMax = Math.max(C.gMax, D.g); C.gMin = Math.min(C.gMin, D.g); }
  D.gMax = C.gMax;
  D.gMin = C.gMin;

  // Hydrogen endurance: fuel left / average burn over the last minute.
  if (D.h2 != null) {
    C.h2.push([t, D.h2]);
    while (C.h2.length > 2 && t - C.h2[0][0] > 60) C.h2.shift();
    const [t0, h0] = C.h2[0];
    const burn = t - t0 > 3 ? (h0 - D.h2) / (t - t0) : 0;
    D.endurance = burn > 1e-6 ? D.h2 / burn : null;
  }

  // Boost charge rate (fraction per second, + charging, − draining).
  if (D.boost != null) {
    if (C.boost != null && dt > 0) C.boostRate += ((D.boost - C.boost) / dt - C.boostRate) * Math.min(1, dt * 3);
    C.boost = D.boost;
    D.boostRate = C.boostRate;
  }

  flight.D = D;
});
