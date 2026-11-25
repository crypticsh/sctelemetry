// Photo-real aircraft-style gauges, drawn as SVG strings.
// Each factory takes options and returns { html, mount(root), update(D, dt) }.
// D is the flight data object from lib/flight.js (direct + calculated values).

const rad = (d) => (d * Math.PI) / 180;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const f1 = (n) => n.toFixed(1);
const P = (r, a, cx = 100, cy = 100) => [cx + r * Math.sin(rad(a)), cy - r * Math.cos(rad(a))];
function arcPath(r, a0, a1, cx = 100, cy = 100) {
  const [x0, y0] = P(r, a0, cx, cy), [x1, y1] = P(r, a1, cx, cy);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0, sweep = a1 > a0 ? 1 : 0;
  return `M${f1(x0)} ${f1(y0)}A${r} ${r} 0 ${large} ${sweep} ${f1(x1)} ${f1(y1)}`;
}
let uid = 0;
const nid = (p) => `g${p}${++uid}`;
function range(a, b, step) {
  const out = [];
  for (let v = a; v <= b + 1e-9; v += step) out.push(+v.toFixed(4));
  return out;
}
const damp = (cur, target, dt, k = 7) => cur + (target - cur) * Math.min(1, dt * k);
const rot = (el, a, cx = 100, cy = 100) => el && el.setAttribute('transform', `rotate(${a.toFixed(2)} ${cx} ${cy})`);
const GREEN = '#2fa84a', YELLOW = '#e7c21e', RED = '#d9301f';

/** Shared gradients/filters. Insert once per page. */
export const DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <linearGradient id="gq-lip" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5d6066"/><stop offset=".5" stop-color="#1d1e21"/><stop offset="1" stop-color="#050506"/></linearGradient>
  <radialGradient id="gq-bezel" cx=".5" cy=".42" r=".6"><stop offset=".80" stop-color="#2a2b2f"/><stop offset=".92" stop-color="#0c0c0d"/><stop offset="1" stop-color="#34363a"/></radialGradient>
  <radialGradient id="gq-face" cx=".5" cy=".45" r=".6"><stop offset="0" stop-color="#1d1e21"/><stop offset=".75" stop-color="#0d0d0f"/><stop offset="1" stop-color="#030303"/></radialGradient>
  <linearGradient id="gq-glass" x1=".15" y1="0" x2=".7" y2=".9"><stop offset="0" stop-color="#fff" stop-opacity=".20"/><stop offset=".38" stop-color="#fff" stop-opacity=".05"/><stop offset=".39" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <radialGradient id="gq-hub" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#6b6e74"/><stop offset="1" stop-color="#0d0d0e"/></radialGradient>
  <linearGradient id="gq-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d5fae"/><stop offset="1" stop-color="#7fb8ea"/></linearGradient>
  <linearGradient id="gq-ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a0683c"/><stop offset="1" stop-color="#4c2f19"/></linearGradient>
  <pattern id="gq-barber" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="12" height="12" fill="#f2f2ee"/><rect width="6" height="12" fill="#d42a1e"/></pattern>
  <filter id="gq-shadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="1.6" dy="2.4" stdDeviation="1.4" flood-color="#000" flood-opacity=".75"/></filter>
  <clipPath id="gq-faceClip"><circle cx="100" cy="100" r="88"/></clipPath>
</defs></svg>`;

function shell(label, inner) {
  return `<svg viewBox="0 0 200 200" role="img" aria-label="${label}">
    <circle cx="100" cy="100" r="99" fill="url(#gq-lip)"/>
    <circle cx="100" cy="100" r="95" fill="url(#gq-bezel)"/>
    <circle cx="100" cy="100" r="89" fill="url(#gq-face)"/>
    ${inner}
    <circle cx="100" cy="100" r="89" fill="url(#gq-glass)" pointer-events="none"/>
    <circle cx="100" cy="100" r="89" fill="none" stroke="#000" stroke-opacity=".7" stroke-width="2.5"/>
  </svg>`;
}

function scaleSvg({ ang, ticks, arcs = [], r = 85, labelR = 64, size = 14, redlines = [] }) {
  let s = '';
  for (const a of arcs) if (a.to > a.from) s += `<path d="${arcPath(r - 5, ang(a.from), ang(a.to))}" stroke="${a.color}" stroke-width="${a.w || 7}" fill="none"/>`;
  for (const t of ticks) {
    const a = ang(t.v), [x0, y0] = P(r, a), [x1, y1] = P(r - (t.len || (t.label != null ? 13 : 7)), a);
    s += `<line x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(x1)}" y2="${f1(y1)}" stroke="#f1f1ec" stroke-width="${t.w || (t.label != null ? 2.6 : 1.4)}"/>`;
    if (t.label != null) {
      const [lx, ly] = P(labelR, a);
      s += `<text x="${f1(lx)}" y="${f1(ly + size * 0.36)}" text-anchor="middle" class="gn" font-size="${size}">${t.label}</text>`;
    }
  }
  for (const v of redlines) {
    const a = ang(v), [x0, y0] = P(r + 2, a), [x1, y1] = P(r - 16, a);
    s += `<line x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(x1)}" y2="${f1(y1)}" stroke="#e42a1c" stroke-width="4"/>`;
  }
  return s;
}

function needle(id, { len = 74, tail = 20, w = 3.4, color = '#f4f4ef', cx = 100, cy = 100, tip = 'sword' } = {}) {
  const shape =
    tip === 'thin'
      ? `M${cx} ${cy - len} L${cx + 1.3} ${cy - len + 6} L${cx + 1.3} ${cy + tail} L${cx - 1.3} ${cy + tail} L${cx - 1.3} ${cy - len + 6}Z`
      : tip === 'tri'
        ? `M${cx} ${cy - len} L${cx + 6} ${cy - len + 12} L${cx + 1.2} ${cy - len + 10} L${cx + 1.2} ${cy + tail} L${cx - 1.2} ${cy + tail} L${cx - 1.2} ${cy - len + 10} L${cx - 6} ${cy - len + 12}Z`
        : `M${cx} ${cy - len} L${cx + w} ${cy - len + 16} L${cx + w * 0.75} ${cy + tail} L${cx - w * 0.75} ${cy + tail} L${cx - w} ${cy - len + 16}Z`;
  return `<g id="${id}" filter="url(#gq-shadow)"><path d="${shape}" fill="${color}"/></g>`;
}
const hub = (cx = 100, cy = 100, r = 8) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#gq-hub)" stroke="#000" stroke-width="1"/>`;
const win = (id, x, y, w, size = 13, text = '--') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${size + 4}" rx="2" fill="#000" stroke="#333"/><text id="${id}" x="${x + w / 2}" y="${y + size + 0.5}" text-anchor="middle" class="gn" font-size="${size}">${text}</text>`;
const short = (v) => (v >= 1000 ? `${+(v / 1000).toFixed(2)}K` : v);

// ------------------------------------------------------------------ dials

export function asi(o) {
  const n = nid('asi'), MAX = +o.max || 1250;
  const map = (v) => Math.sqrt(clamp(v, 0, MAX) / MAX);
  const ang = (v) => -150 + map(v) * 300;
  const labels = [0, 50, 100, 200, 300, 400, 600, 800, 1000, 1250, 1500, 2000].filter((v) => v <= MAX);
  if (!labels.includes(MAX)) labels.push(MAX);
  const ticks = [...range(0, Math.min(200, MAX), 10), ...range(250, MAX, 50)].filter((v) => !labels.includes(v)).map((v) => ({ v }));
  for (const v of labels) ticks.push({ v, label: short(v) });
  const inner =
    scaleSvg({ ang, ticks, size: 13, arcs: [{ from: +o.greenFrom, to: +o.greenTo, color: GREEN }, { from: +o.greenTo, to: +o.yellowTo, color: YELLOW }], redlines: [+o.redline] }) +
    `<text x="100" y="122" text-anchor="middle" class="gt" font-size="12">AIRSPEED</text>
     <text x="100" y="133" text-anchor="middle" class="gs" font-size="9">M/S</text>${win(`${n}d`, 80, 138, 40)}` +
    needle(`${n}n`, { len: 78 }) + hub();
  let disp = 0, el, dig;
  return {
    html: shell('Airspeed', inner),
    mount(r) { el = r.querySelector(`#${n}n`); dig = r.querySelector(`#${n}d`); },
    update(D, dt) {
      disp = damp(disp, D.speed ?? 0, dt);
      rot(el, ang(disp));
      dig.textContent = D.speed == null ? '--' : Math.round(D.speed);
    },
  };
}

export function vsi(o) {
  const n = nid('vsi'), MAX = +o.range || 200, lin = o.scale === 'linear';
  const map = lin ? (v) => clamp(v / MAX, -1, 1) : (v) => Math.sign(v) * Math.sqrt(Math.min(Math.abs(v), MAX) / MAX);
  const ang = (v) => -90 + map(v) * 168;
  const cand = lin ? range(0, MAX, MAX <= 10 ? 2 : MAX <= 50 ? 10 : 20) : [0, 5, 10, 20, 50, 100, 200, 500, 1000].filter((v) => v <= MAX);
  if (!cand.includes(MAX)) cand.push(MAX);
  const minorStep = lin ? (MAX <= 10 ? 0.5 : MAX / 40) : null;
  const minors = lin ? range(0, MAX, minorStep) : [1, 2, 3, 4, 6, 7, 8, 9, 15, 30, 40, 75, 150, 300, 400].filter((v) => v < MAX);
  const ticks = [];
  for (const s of [1, -1]) {
    for (const v of minors) if (!cand.includes(v)) ticks.push({ v: s * v });
    for (const v of cand) if (!(s < 0 && v === 0)) ticks.push({ v: s * v, label: v === MAX && s < 0 ? null : short(v) });
  }
  const warn = +o.warnBelow || 0;
  const inner =
    scaleSvg({ ang, ticks, size: lin ? 15 : 13, arcs: warn > 0 && warn < MAX ? [{ from: -MAX, to: -warn, color: lin ? YELLOW : '#c9301f', w: 5 }] : [] }) +
    `<text x="116" y="78" text-anchor="middle" class="gt" font-size="10">${o.title || 'VERTICAL SPEED'}</text>
     <text x="116" y="89" text-anchor="middle" class="gs" font-size="8">METERS PER SECOND</text>
     <text x="66" y="88" class="gs" font-size="8">UP</text><text x="66" y="118" class="gs" font-size="8">DOWN</text>` +
    needle(`${n}n`, { len: 76 }) + hub();
  let disp = 0, el;
  return {
    html: shell('Vertical speed', inner),
    mount(r) { el = r.querySelector(`#${n}n`); },
    update(D, dt) { disp = damp(disp, D.vsi ?? 0, dt, 5); rot(el, ang(disp)); },
  };
}

export function alt() {
  const n = nid('alt');
  const ang = (v) => v * 36;
  const ticks = range(0, 9.8, 0.2).map((v) => ({ v, label: Number.isInteger(v) ? v : null, len: Number.isInteger(v) ? 14 : Math.abs(((v * 10) % 10) - 5) < 1e-6 ? 10 : 6 }));
  const inner =
    scaleSvg({ ang, ticks, size: 18, labelR: 62 }) +
    `<text x="100" y="140" text-anchor="middle" class="gt" font-size="15">ALT</text>
     <text x="100" y="150" text-anchor="middle" class="gs" font-size="7">METERS</text>
     ${win(`${n}d`, 118, 92, 34, 11, '0')}
     <g id="${n}f"><rect x="50" y="92" width="28" height="15" fill="url(#gq-barber)" stroke="#000"/></g>` +
    needle(`${n}c`, { len: 86, tip: 'tri', tail: 10 }) + needle(`${n}k`, { len: 48, w: 5.5, tail: 14 }) + needle(`${n}h`, { len: 80, w: 3, tail: 22 }) + hub();
  let disp = 0, h, k, c, flag, dig;
  return {
    html: shell('Altimeter', inner),
    mount(r) { h = r.querySelector(`#${n}h`); k = r.querySelector(`#${n}k`); c = r.querySelector(`#${n}c`); flag = r.querySelector(`#${n}f`); dig = r.querySelector(`#${n}d`); },
    update(D, dt) {
      const has = D.alt != null;
      flag.style.display = has ? 'none' : '';
      if (!has) { dig.textContent = '-----'; return; }
      disp = damp(disp, D.alt, dt, 6);
      rot(h, ((disp % 1000) / 1000) * 360); rot(k, ((disp % 10000) / 10000) * 360); rot(c, ((disp % 100000) / 100000) * 360);
      dig.textContent = Math.round(D.alt).toLocaleString('en-US');
    },
  };
}

export function radalt(o) {
  const n = nid('ra'), MAX = +o.max || 1500, DH = +o.dh || 30;
  const map = (v) => Math.log10(1 + clamp(v, 0, MAX) / 10) / Math.log10(1 + MAX / 10);
  const ang = (v) => -150 + map(v) * 300;
  const labelSet = [0, 10, 20, 50, 100, 200, 500, 1000, 1500, 2000, 5000].filter((v) => v <= MAX);
  if (!labelSet.includes(MAX)) labelSet.push(MAX);
  const ticks = [...range(0, 20, 2), ...range(30, 100, 10), ...range(150, 500, 50), 600, 700, 800, 900, 1000, 1500, 2000, 3000, 4000, 5000]
    .filter((v) => v <= MAX && !labelSet.includes(v)).map((v) => ({ v }));
  for (const v of labelSet) ticks.push({ v, label: short(v) });
  const a = ang(DH), [bx, by] = P(91, a), [lx, ly] = P(80, a - 4), [rx, ry] = P(80, a + 4);
  const inner =
    scaleSvg({ ang, ticks, size: 13, arcs: [{ from: 0, to: DH, color: YELLOW, w: 5 }] }) +
    `<polygon points="${f1(bx)},${f1(by)} ${f1(lx)},${f1(ly)} ${f1(rx)},${f1(ry)}" fill="#f2a93b"/>
     <text x="100" y="62" text-anchor="middle" class="gt" font-size="12">RADAR ALT</text>
     <text x="100" y="75" text-anchor="middle" class="gs" font-size="10">M AGL</text>
     <circle id="${n}dh" cx="128" cy="118" r="7" fill="#3a2a0a" stroke="#000"/><text x="128" y="136" text-anchor="middle" class="gs" font-size="8">DH</text>
     ${win(`${n}d`, 76, 124, 40)}
     <g id="${n}f"><rect x="56" y="96" width="30" height="16" fill="url(#gq-barber)" stroke="#000"/></g>` +
    needle(`${n}n`, { len: 76 }) + hub();
  let disp = MAX, el, flag, dig, dh;
  return {
    html: shell('Radar altimeter', inner),
    mount(r) { el = r.querySelector(`#${n}n`); flag = r.querySelector(`#${n}f`); dig = r.querySelector(`#${n}d`); dh = r.querySelector(`#${n}dh`); },
    update(D, dt) {
      const v = D.radarAlt, ok = v != null && v <= MAX;
      flag.style.display = ok ? 'none' : '';
      disp = damp(disp, ok ? v : MAX, dt, 6);
      rot(el, ang(disp) + (ok ? 0 : 6));
      dig.textContent = ok ? Math.round(v) : '----';
      dh.setAttribute('fill', ok && v < DH ? '#ffb31a' : '#3a2a0a');
    },
  };
}

export function tti(o) {
  const n = nid('tti'), MAX = +o.max || 60, red = +o.red || 4, yellow = +o.yellow || 10;
  const ang = (v) => -135 + (clamp(v, 0, MAX) / MAX) * 270;
  const step = MAX <= 30 ? 5 : 10;
  const ticks = range(0, MAX, step / 5).map((v) => ({ v, label: Math.abs(v % step) < 1e-6 ? v : null }));
  const inner =
    scaleSvg({ ang, ticks, size: 14, arcs: [{ from: 0, to: red, color: RED }, { from: red, to: yellow, color: YELLOW }, { from: yellow, to: MAX, color: GREEN, w: 3 }] }) +
    `<text x="100" y="64" text-anchor="middle" class="gt" font-size="11">TIME TO IMPACT</text>
     <text x="100" y="77" text-anchor="middle" class="gs" font-size="10">SECONDS</text>${win(`${n}d`, 80, 126, 40)}` +
    needle(`${n}n`, { len: 76 }) + hub();
  let disp = MAX, el, dig;
  return {
    html: shell('Time to impact', inner),
    mount(r) { el = r.querySelector(`#${n}n`); dig = r.querySelector(`#${n}d`); },
    update(D, dt) {
      disp = damp(disp, D.tti == null ? MAX : Math.min(D.tti, MAX), dt, 5);
      rot(el, ang(disp));
      dig.textContent = D.tti == null ? '---' : D.tti >= 99 ? '99+' : D.tti.toFixed(D.tti < 10 ? 1 : 0);
    },
  };
}

export function gmeter(o) {
  const n = nid('g'), MIN = +o.min, MAX = +o.max;
  const ang = (v) => -150 + ((clamp(v, MIN, MAX) - MIN) / (MAX - MIN)) * 300;
  const ticks = range(MIN, MAX, 0.5).map((v) => ({ v, label: Number.isInteger(v) ? v : null }));
  const inner =
    scaleSvg({ ang, ticks, size: 15, arcs: [{ from: +o.caution, to: +o.limit, color: YELLOW }, { from: +o.limit, to: MAX, color: RED }, { from: MIN, to: Math.min(-2, MIN + 1), color: YELLOW }] }) +
    `<text x="100" y="128" text-anchor="middle" class="gt" font-size="13">G UNITS</text>
     <text x="100" y="141" text-anchor="middle" class="gs" font-size="8">MAX · MIN DRAG</text>` +
    needle(`${n}mx`, { len: 70, tip: 'thin', color: '#f2a93b', tail: 0 }) + needle(`${n}mn`, { len: 70, tip: 'thin', color: '#f2a93b', tail: 0 }) + needle(`${n}n`, { len: 78 }) + hub();
  let disp = 1, el, mx, mn;
  return {
    html: shell('G-meter', inner),
    mount(r) { el = r.querySelector(`#${n}n`); mx = r.querySelector(`#${n}mx`); mn = r.querySelector(`#${n}mn`); },
    update(D, dt) { disp = damp(disp, D.g ?? 0, dt, 9); rot(el, ang(disp)); rot(mx, ang(D.gMax ?? 1)); rot(mn, ang(D.gMin ?? 1)); },
  };
}

export function hr() {
  const n = nid('hr');
  const ang = (v) => -135 + ((clamp(v, 40, 200) - 40) / 160) * 270;
  const ticks = range(40, 200, 10).map((v) => ({ v, label: v % 40 === 0 ? v : null }));
  const inner =
    scaleSvg({ ang, ticks, size: 14, arcs: [{ from: 55, to: 120, color: GREEN }, { from: 120, to: 160, color: YELLOW }, { from: 160, to: 200, color: RED }] }) +
    `<text x="100" y="66" text-anchor="middle" class="gt" font-size="12">PILOT</text>
     <text x="100" y="79" text-anchor="middle" class="gs" font-size="10">BPM</text>
     <path id="${n}p" d="M72 128 h12 l4 -9 l5 18 l5 -24 l5 15 h25" fill="none" stroke="#e44" stroke-width="2" stroke-linejoin="round"/>` +
    needle(`${n}n`, { len: 76 }) + hub();
  let disp = 70, el, pulse, t = 0;
  return {
    html: shell('Heart rate', inner),
    mount(r) { el = r.querySelector(`#${n}n`); pulse = r.querySelector(`#${n}p`); },
    update(D, dt) {
      t += dt;
      disp = damp(disp, D.hr ?? 40, dt, 3);
      rot(el, ang(disp));
      pulse.style.opacity = D.hr ? 0.35 + 0.65 * Math.max(0, Math.sin((t * Math.PI * D.hr) / 60)) : 0.2;
    },
  };
}

export function hullshield(o) {
  const n = nid('hs');
  const angH = (v) => -150 + clamp(v, 0, 1) * 120;
  const angS = (v) => 150 - clamp(v, 0, 1) * 120;
  const ticks = () => range(0, 1, 0.05).map((v) => ({ v, label: [0, 0.5, 1].includes(v) ? Math.round(v * 100) : null }));
  const inner =
    scaleSvg({ ang: angH, ticks: ticks(), size: 12, arcs: [{ from: 0, to: +o.hullRed, color: RED }, { from: +o.hullRed, to: Math.min(1, +o.hullRed + 0.3), color: YELLOW }] }) +
    scaleSvg({ ang: angS, ticks: ticks(), size: 12, arcs: [{ from: 0, to: +o.shieldRed, color: RED }] }) +
    `<text x="62" y="104" text-anchor="middle" class="gt" font-size="13">HULL</text>
     <text x="138" y="104" text-anchor="middle" class="gt" font-size="13">SHLD</text>
     <text x="100" y="150" text-anchor="middle" class="gs" font-size="9">PERCENT</text>` +
    needle(`${n}h`, { len: 74 }) + needle(`${n}s`, { len: 74, color: '#9fd3ff' }) + hub();
  let dh = 1, ds = 1, h, s;
  return {
    html: shell('Hull and shield', inner),
    mount(r) { h = r.querySelector(`#${n}h`); s = r.querySelector(`#${n}s`); },
    update(D, dt) { dh = damp(dh, D.hull ?? 0, dt, 4); ds = damp(ds, D.shield ?? 0, dt, 4); rot(h, angH(dh)); rot(s, angS(ds)); },
  };
}

export function hdg() {
  const n = nid('hdg');
  let card = '';
  for (let d = 0; d < 360; d += 5) {
    const major = d % 10 === 0, [x0, y0] = P(84, d), [x1, y1] = P(major ? 72 : 77, d);
    card += `<line x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(x1)}" y2="${f1(y1)}" stroke="#f1f1ec" stroke-width="${major ? 2.2 : 1.2}"/>`;
    if (d % 30 === 0) {
      const lbl = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[d] ?? d / 10;
      const [lx, ly] = P(60, d);
      card += `<text x="${f1(lx)}" y="${f1(ly)}" transform="rotate(${d} ${f1(lx)} ${f1(ly)})" dy="6" text-anchor="middle" class="gn" font-size="${typeof lbl === 'string' ? 19 : 16}">${lbl}</text>`;
    }
  }
  let fixed = '';
  for (let d = 45; d < 360; d += 45) {
    const [x0, y0] = P(91, d), [x1, y1] = P(87, d);
    fixed += `<line x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(x1)}" y2="${f1(y1)}" stroke="#f2a93b" stroke-width="3"/>`;
  }
  const inner = `<g id="${n}c">${card}</g>${fixed}
    <polygon points="100,12 94,24 106,24" fill="#f2a93b"/>
    <g fill="none" stroke="#f4f4ef" stroke-width="2.2" stroke-linejoin="round" filter="url(#gq-shadow)">
      <path d="M100 66 c3 0 4 4 4 10 v14 l30 10 v6 l-30 -4 v16 l9 6 v5 l-13 -3 l-13 3 v-5 l9 -6 v-16 l-30 4 v-6 l30 -10 v-14 c0 -6 1 -10 4 -10z"/>
    </g>${win(`${n}d`, 81, 130, 38, 11, '000°')}`;
  let disp = 0, c, dig;
  return {
    html: shell('Heading', inner),
    mount(r) { c = r.querySelector(`#${n}c`); dig = r.querySelector(`#${n}d`); },
    update(D, dt) {
      const h = D.heading ?? 0;
      let d = h - disp;
      d = ((d + 540) % 360) - 180;
      disp = (disp + d * Math.min(1, dt * 6) + 360) % 360;
      rot(c, -disp);
      dig.textContent = D.heading == null ? '---°' : String(Math.round(h) % 360).padStart(3, '0') + '°';
    },
  };
}

export function tc(o) {
  const n = nid('tc'), std = +o.stdRate || 3;
  const marks = [0, 20].flatMap((a) => [-90 - a, 90 + a]).map((a) => {
    const [x0, y0] = P(86, a), [x1, y1] = P(72, a);
    return `<line x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(x1)}" y2="${f1(y1)}" stroke="#f1f1ec" stroke-width="4"/>`;
  }).join('');
  const inner = `${marks}
    <text x="36" y="132" class="gn" font-size="16">L</text><text x="156" y="132" class="gn" font-size="16">R</text>
    <text x="100" y="40" text-anchor="middle" class="gt" font-size="10">TURN COORDINATOR</text>
    <text x="100" y="146" text-anchor="middle" class="gs" font-size="8">INDEX = ${std}°/S</text>
    <rect x="70" y="118" width="60" height="16" rx="8" fill="#0a0a0a" stroke="#444"/>
    <text id="${n}d" x="100" y="130" text-anchor="middle" class="gn" font-size="11">0.0 °/S</text>
    <text x="100" y="166" text-anchor="middle" class="gs" font-size="7">NO SLIP DATA</text>
    <g id="${n}a" filter="url(#gq-shadow)" fill="#f4f4ef">
      <rect x="28" y="96" width="144" height="5" rx="2"/><circle cx="100" cy="98.5" r="9"/>
      <rect x="97.5" y="80" width="5" height="12" rx="2"/><rect x="86" y="80" width="28" height="3" rx="1.5"/>
    </g>${hub(100, 98.5, 4)}`;
  let disp = 0, a, dig;
  return {
    html: shell('Turn coordinator', inner),
    mount(r) { a = r.querySelector(`#${n}a`); dig = r.querySelector(`#${n}d`); },
    update(D, dt) {
      const tr = D.turnRate ?? 0;
      disp = damp(disp, clamp((tr / std) * 20, -40, 40), dt, 5);
      rot(a, disp, 100, 98.5);
      dig.textContent = `${Math.abs(tr).toFixed(1)} °/S`;
    },
  };
}

export function att() {
  const n = nid('att'), K = 2.2;
  let ladder = '';
  for (let p = -40; p <= 40; p += 5) {
    if (!p) continue;
    const y = 100 - p * K, w = p % 10 === 0 ? 30 : 14;
    ladder += `<line x1="${100 - w / 2}" y1="${y}" x2="${100 + w / 2}" y2="${y}" stroke="#fff" stroke-width="1.6"/>`;
    if (p % 10 === 0) ladder += `<text x="${100 - w / 2 - 4}" y="${y + 4}" text-anchor="end" class="gn" font-size="10">${Math.abs(p)}</text><text x="${100 + w / 2 + 4}" y="${y + 4}" class="gn" font-size="10">${Math.abs(p)}</text>`;
  }
  let bank = '';
  for (const b of [-60, -45, -30, -20, -10, 10, 20, 30, 45, 60]) {
    const [x0, y0] = P(86, b), [x1, y1] = P(Math.abs(b) % 30 === 0 ? 74 : 79, b);
    bank += `<line x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(x1)}" y2="${f1(y1)}" stroke="#fff" stroke-width="${Math.abs(b) % 30 === 0 ? 3 : 1.8}"/>`;
  }
  const inner = `<g clip-path="url(#gq-faceClip)"><g id="${n}h">
      <rect x="-120" y="-340" width="440" height="440" fill="url(#gq-sky)"/>
      <rect x="-120" y="100" width="440" height="440" fill="url(#gq-ground)"/>
      <line x1="-120" y1="100" x2="320" y2="100" stroke="#fff" stroke-width="2"/>${ladder}
    </g></g>
    <g id="${n}b"><polygon points="100,22 94,33 106,33" fill="#f2a93b"/></g>
    ${bank}<polygon points="100,19 95,10 105,10" fill="#fff"/>
    <g filter="url(#gq-shadow)" fill="#f2a93b" stroke="#6b3c00" stroke-width=".8">
      <path d="M44 99 h34 l10 9 h-6 l-7 -5 h-31z"/><path d="M156 99 h-34 l-10 9 h6 l7 -5 h31z"/><circle cx="100" cy="100" r="3.5"/>
    </g>
    <g id="${n}f"><rect x="58" y="130" width="84" height="18" rx="2" fill="#000" opacity=".8"/><text x="100" y="143" text-anchor="middle" class="gn" font-size="10" fill="#ffb31a">NO GRAV · BANK OFF</text></g>`;
  let pd = 0, bd = 0, h, b, flag;
  return {
    html: shell('Attitude', inner),
    mount(r) { h = r.querySelector(`#${n}h`); b = r.querySelector(`#${n}b`); flag = r.querySelector(`#${n}f`); },
    update(D, dt) {
      pd = damp(pd, D.pitch ?? 0, dt, 5);
      bd = damp(bd, D.inAtmo ? D.bank ?? 0 : 0, dt, 4);
      h.setAttribute('transform', `rotate(${(-bd).toFixed(2)} 100 100) translate(0 ${(pd * K).toFixed(2)})`);
      rot(b, -bd);
      flag.style.display = D.inAtmo ? 'none' : '';
    },
  };
}

// ------------------------------------------------------------------ rectangular instruments

function stripShell(n, label, inner) {
  return `<svg viewBox="0 0 180 96" role="img" aria-label="${label}">
    <rect x="1" y="1" width="178" height="94" rx="10" fill="url(#gq-lip)"/>
    <rect x="6" y="6" width="168" height="84" rx="6" fill="url(#gq-face)" stroke="#000" stroke-width="2"/>
    <clipPath id="${n}c"><rect x="8" y="8" width="164" height="80" rx="5"/></clipPath>
    <g clip-path="url(#${n}c)">${inner}</g>
    <rect x="6" y="6" width="168" height="40" rx="6" fill="url(#gq-glass)" pointer-events="none"/>
  </svg>`;
}

/** Edge-reading fuel gauge: E … ½ … F. */
export function fuel(o) {
  const n = nid('fs'), cx = 90, cy = 128, R = 92, key = o.source === 'qt' ? 'qt' : 'h2';
  const red = +o.red, yellow = +o.yellow;
  const ang = (v) => -36 + clamp(v, 0, 1) * 72;
  const arc = (a, b, c) => (b > a ? `<path d="${arcPath(R - 8, ang(a), ang(b), cx, cy)}" stroke="${c}" stroke-width="6" fill="none"/>` : '');
  let s = arc(0, red, RED) + arc(red, yellow, YELLOW) + arc(yellow, 1, GREEN);
  for (const v of range(0, 1, 0.125)) {
    const major = Math.abs(v % 0.5) < 1e-6, [x0, y0] = P(R, ang(v), cx, cy), [x1, y1] = P(R - (major ? 14 : 8), ang(v), cx, cy);
    s += `<line x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(x1)}" y2="${f1(y1)}" stroke="#f1f1ec" stroke-width="${major ? 2.4 : 1.3}"/>`;
  }
  for (const [v, l] of [[0, 'E'], [0.5, '½'], [1, 'F']]) {
    const [x, y] = P(R - 26, ang(v), cx, cy);
    s += `<text x="${f1(x)}" y="${f1(y + 5)}" text-anchor="middle" class="gn" font-size="14">${l}</text>`;
  }
  s += `<text x="16" y="22" class="gt" font-size="11">${key === 'qt' ? 'QT FUEL' : 'H2 FUEL'}</text>
        <text id="${n}d" x="164" y="22" text-anchor="end" class="gs" font-size="11">--</text>${needle(`${n}n`, { len: 92, cx, cy, w: 2.6, tail: 0 })}`;
  let disp = 0, el, dig;
  return {
    html: stripShell(n, 'Fuel', s),
    mount(r) { el = r.querySelector(`#${n}n`); dig = r.querySelector(`#${n}d`); },
    update(D, dt) {
      const v = D[key];
      disp = damp(disp, v ?? 0, dt, 3);
      rot(el, ang(disp), cx, cy);
      dig.textContent = v == null ? '--' : `${Math.round(v * 100)}%`;
    },
  };
}

/**
 * Boost: it recharges, so it reads like an aircraft battery ammeter.
 * Centre-zero needle = flow (DISCHARGE left while boosting, CHARGE right
 * while refilling), a segmented bar = reserve, and a time-to-full / time-left readout.
 */
export function boost(o) {
  const n = nid('bo'), cx = 90, cy = 112, R = 70, full = +o.fullScale || 0.3; // fraction per second at full deflection
  const ang = (v) => clamp(v / full, -1, 1) * 42;
  let s = `<path d="${arcPath(R - 6, -42, -2, cx, cy)}" stroke="${RED}" stroke-width="5" fill="none"/><path d="${arcPath(R - 6, 2, 42, cx, cy)}" stroke="${GREEN}" stroke-width="5" fill="none"/>`;
  for (const v of range(-1, 1, 0.25)) {
    const major = Math.abs(v % 0.5) < 1e-6, a = v * 42, [x0, y0] = P(R, a, cx, cy), [x1, y1] = P(R - (major ? 13 : 7), a, cx, cy);
    s += `<line x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(x1)}" y2="${f1(y1)}" stroke="#f1f1ec" stroke-width="${major ? 2.4 : 1.3}"/>`;
  }
  s += `<text x="${P(R - 22, -34, cx, cy)[0]}" y="${P(R - 22, -34, cx, cy)[1] + 4}" text-anchor="middle" class="gn" font-size="12">−</text>
        <text x="${P(R - 22, 34, cx, cy)[0]}" y="${P(R - 22, 34, cx, cy)[1] + 4}" text-anchor="middle" class="gn" font-size="12">+</text>
        <text x="16" y="22" class="gt" font-size="11">BOOST</text>
        <text x="38" y="56" text-anchor="middle" class="gs" font-size="8">DISCH</text><text x="142" y="56" text-anchor="middle" class="gs" font-size="8">CHARGE</text>
        <text id="${n}t" x="90" y="76" text-anchor="middle" class="gs" font-size="9">--</text>`;
  for (let i = 0; i < 10; i++) s += `<rect id="${n}s${i}" x="${21 + i * 14}" y="80" width="11" height="6" rx="1" fill="#1d2a1d"/>`;
  s += `<g id="${n}n" filter="url(#gq-shadow)"><path d="M${cx} ${cy - R + 3} L${cx + 2.4} ${cy - 44} L${cx - 2.4} ${cy - 44}Z" fill="#f4f4ef"/></g>` +
    `<circle id="${n}l" cx="164" cy="18" r="4" fill="#3a1410" stroke="#000"/>`;
  let disp = 0, el, segs, txt, lamp, blink = 0;
  return {
    html: stripShell(n, 'Boost charge', s),
    mount(r) {
      el = r.querySelector(`#${n}n`); txt = r.querySelector(`#${n}t`); lamp = r.querySelector(`#${n}l`);
      segs = [...Array(10)].map((_, i) => r.querySelector(`#${n}s${i}`));
    },
    update(D, dt) {
      blink += dt;
      const lvl = D.boost, rate = D.boostRate ?? 0;
      disp = damp(disp, D.boostEngaged && rate > -0.005 ? -full * 0.4 : rate, dt, 5);
      rot(el, ang(disp), cx, cy);
      const lit = lvl == null ? 0 : Math.round(lvl * 10);
      segs.forEach((sg, i) => sg.setAttribute('fill', i < lit ? (lvl < 0.2 ? '#ff5a3c' : lvl >= 0.999 ? '#7dff8a' : '#5fd068') : '#1d2a1d'));
      const crit = D.boostCritical || (lvl != null && lvl < 0.1);
      lamp.setAttribute('fill', crit && Math.sin(blink * 12) > 0 ? '#ff4436' : '#3a1410');
      if (lvl == null) txt.textContent = 'NO DATA';
      else if (lvl >= 0.995) txt.textContent = 'FULL';
      else if (rate > 0.002) txt.textContent = `${Math.round(lvl * 100)}% · FULL IN ${Math.ceil((1 - lvl) / rate)}s`;
      else if (rate < -0.002) txt.textContent = `${Math.round(lvl * 100)}% · ${Math.floor(lvl / -rate)}s LEFT`;
      else txt.textContent = `${Math.round(lvl * 100)}%`;
    },
  };
}
