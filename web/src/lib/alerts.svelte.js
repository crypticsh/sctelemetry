// Calculated alerts (GPWS-style) with lights and sound.
// Thresholds live in the layout (shared); sound settings are per device.

import { flight } from './flight.svelte.js';
import { onFrame } from './telemetry.svelte.js';
import { prefs } from './prefs.svelte.js';
import { profile } from './layout.svelte.js';

export const ALERT_DEFAULTS = {
  pullUpTti: 4, pullUpSink: 5,
  sinkTti: 10, sinkRate: 8,
  tooFastAlt: 150, tooFastSpeed: 120,
  gearAlt: 60, gearSpeed: 60,
  overspeed: 1150,
  gLimit: 7, gCaution: 5.5,
  hull: 0.4, shield: 0.25,
  fuelLow: 0.15, fuelCrit: 0.05,
  boostLow: 0.1,
  callouts: true,
  off: [], // ids of switched-off alerts
};

export const RULES = [
  { id: 'pullup', label: 'Pull up', level: 'warning', voice: 'Pull up', whoop: true, test: (D, c) => D.tti != null && D.tti < c.pullUpTti && D.vsi < -c.pullUpSink, help: (c) => `Time to impact under ${c.pullUpTti} s, sinking faster than ${c.pullUpSink} m/s` },
  { id: 'sink', label: 'Sink rate', level: 'caution', voice: 'Sink rate', test: (D, c) => D.tti != null && D.tti < c.sinkTti && D.vsi < -c.sinkRate, help: (c) => `Time to impact under ${c.sinkTti} s, sinking faster than ${c.sinkRate} m/s` },
  { id: 'toofast', label: 'Too fast', level: 'caution', voice: 'Too fast', test: (D, c) => D.radarAlt != null && D.radarAlt < c.tooFastAlt && D.vsi < -1 && D.speed > c.tooFastSpeed, help: (c) => `Descending below ${c.tooFastAlt} m above ground at over ${c.tooFastSpeed} m/s` },
  { id: 'gear', label: 'Gear', level: 'caution', voice: 'Too low, gear', test: (D, c) => D.radarAlt != null && D.radarAlt < c.gearAlt && D.vsi < -0.5 && D.speed < c.gearSpeed && D.gear === false && !D.landed, help: (c) => `Below ${c.gearAlt} m, descending under ${c.gearSpeed} m/s with gear up` },
  { id: 'overspeed', label: 'Overspeed', level: 'caution', voice: 'Overspeed', test: (D, c) => D.speed > c.overspeed, help: (c) => `Faster than ${c.overspeed} m/s` },
  { id: 'glimit', label: 'G limit', level: 'warning', voice: 'G limit', hold: 0.5, test: (D, c) => D.g > c.gLimit, help: (c) => `Over ${c.gLimit} G for half a second` },
  { id: 'gcaution', label: 'High G', level: 'caution', voice: null, test: (D, c) => D.g > c.gCaution && D.g <= c.gLimit, help: (c) => `Over ${c.gCaution} G (light only)` },
  { id: 'hull', label: 'Hull', level: 'warning', voice: 'Hull critical', test: (D, c) => D.hull != null && D.hull < c.hull, help: (c) => `Hull under ${Math.round(c.hull * 100)}%` },
  { id: 'shield', label: 'Shields', level: 'caution', voice: 'Shields low', test: (D, c) => D.shield != null && D.shield < c.shield, help: (c) => `Shields under ${Math.round(c.shield * 100)}%` },
  { id: 'fuelcrit', label: 'Fuel crit', level: 'warning', voice: 'Fuel critical', test: (D, c) => D.h2 != null && D.h2 < c.fuelCrit, help: (c) => `Hydrogen under ${Math.round(c.fuelCrit * 100)}%` },
  { id: 'fuellow', label: 'Fuel low', level: 'caution', voice: 'Fuel low', test: (D, c) => D.h2 != null && D.h2 < c.fuelLow && D.h2 >= c.fuelCrit, help: (c) => `Hydrogen under ${Math.round(c.fuelLow * 100)}%` },
  { id: 'boostlow', label: 'Boost low', level: 'caution', voice: null, test: (D, c) => D.boost != null && (D.boost < c.boostLow || D.boostCritical), help: (c) => `Boost under ${Math.round(c.boostLow * 100)}% or reported critical (light only)` },
  { id: 'qt', label: 'QT spool', level: 'advisory', test: (D) => !!D.qtSpool, help: () => 'Quantum drive spooled' },
  { id: 'decpl', label: 'Decpl', level: 'advisory', test: (D) => !!D.decoupled, help: () => 'Decoupled mode' },
  { id: 'geardn', label: 'Gear dn', level: 'advisory', test: (D) => !!D.gear, help: () => 'Landing gear down' },
];

export function alertConfig() {
  return { ...ALERT_DEFAULTS, ...(profile().gauges?.alerts || {}) };
}

// state[id] = { on, acked, level }
export const alerts = $state({ state: {}, warning: false, caution: false, warnUnacked: false, cautUnacked: false, top: null });

const mem = Object.fromEntries(RULES.map((r) => [r.id, { on: false, since: 0, offSince: 0, acked: false, lastSound: -99 }]));
let prevRA = Infinity;

export function acknowledge(level) {
  for (const r of RULES) if (r.level === level && mem[r.id].on) mem[r.id].acked = true;
  if (level === 'warning') audio.stopSpeech();
  publish();
}

function publish() {
  const st = {};
  let warning = false, caution = false, warnUnacked = false, cautUnacked = false, top = null;
  for (const r of RULES) {
    const m = mem[r.id];
    st[r.id] = { on: m.on, acked: m.acked, level: r.level };
    if (!m.on) continue;
    if (r.level === 'warning') { warning = true; warnUnacked ||= !m.acked; top ??= r.label; }
    if (r.level === 'caution') { caution = true; cautUnacked ||= !m.acked; }
  }
  if (!top) top = RULES.find((r) => r.level === 'caution' && mem[r.id].on)?.label ?? null;
  Object.assign(alerts, { state: st, warning, caution, warnUnacked, cautUnacked, top });
}

onFrame(() => {
  // flight.svelte.js registered its listener first, so flight.D is this frame's data.
  const D = flight.D;
  const c = alertConfig();
  const now = performance.now() / 1000;
  let changed = false;
  for (const r of RULES) {
    const m = mem[r.id];
    const raw = D.present && !c.off.includes(r.id) && !!r.test(D, c);
    if (raw) { m.offSince = 0; if (!m.since) m.since = now; } else { m.since = 0; if (!m.offSince) m.offSince = now; }
    const want = raw ? now - m.since >= (r.hold || 0) : m.on && now - m.offSince < 1; // 1 s hold-off stops flicker
    if (want !== m.on) { m.on = want; changed = true; if (want) { m.acked = false; m.lastSound = -99; } }
  }
  if (changed) publish();

  // Sound: highest-priority unacknowledged alert; warnings repeat every 3 s, cautions once.
  if (prefs.alertSound && audio.ready() && !audio.busy()) {
    const next = [...RULES.filter((r) => r.level === 'warning'), ...RULES.filter((r) => r.level === 'caution')].find((r) => {
      const m = mem[r.id];
      return m.on && !m.acked && r.voice !== null && (r.level === 'warning' ? now - m.lastSound > 3 : m.lastSound < 0);
    });
    if (next) { mem[next.id].lastSound = now; audio.alert(next); }
  }
  // Radar-altitude callouts on approach with gear down.
  const ra = D.radarAlt;
  if (c.callouts && prefs.alertSound && audio.ready() && ra != null && D.gear && D.vsi < -0.3) {
    for (const h of [100, 50, 40, 30, 20, 10]) if (prevRA > h && ra <= h) audio.say(String(h), 1.25);
  }
  prevRA = ra ?? Infinity;
});

// ------------------------------------------------------------------ audio
export const audio = {
  ctx: null,
  until: 0,
  ready() { return !!this.ctx && this.ctx.state === 'running'; },
  unlock() {
    try {
      this.ctx ||= new (window.AudioContext || window.webkitAudioContext)();
      this.ctx.resume();
    } catch { this.ctx = null; }
  },
  busy() { return performance.now() < this.until; },
  tone(f0, f1, start, dur, type = 'square', vol = 0.12) {
    if (!this.ctx) return;
    const v = vol * (prefs.alertVolume ?? 1);
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), t = this.ctx.currentTime + start;
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.02);
    g.gain.setValueAtTime(v, t + dur - 0.04);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  },
  say(text, rate = 1.05) {
    if (!prefs.alertVoice) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = rate; u.pitch = 0.75; u.volume = prefs.alertVolume ?? 1;
      speechSynthesis.speak(u);
    } catch { /* no speech engine */ }
  },
  alert(r) {
    if (r.whoop) { this.tone(380, 1100, 0, 0.32, 'sawtooth', 0.09); this.tone(380, 1100, 0.38, 0.32, 'sawtooth', 0.09); }
    else if (r.level === 'warning') { this.tone(1000, 1000, 0, 0.18, 'square', 0.08); this.tone(800, 800, 0.22, 0.18, 'square', 0.08); }
    else { this.tone(880, 880, 0, 0.25, 'sine', 0.14); this.tone(660, 660, 0.28, 0.35, 'sine', 0.14); }
    const lead = r.whoop ? 760 : r.level === 'warning' ? 450 : 650;
    setTimeout(() => this.say(r.voice), lead);
    this.until = performance.now() + lead + 1400;
  },
  test() { this.unlock(); this.tone(880, 880, 0, 0.12, 'sine', 0.1); setTimeout(() => this.say('Sound check'), 200); },
  stopSpeech() { try { speechSynthesis.cancel(); } catch { /* none */ } },
};

// Browsers only allow sound after a tap; unlock on the first one.
if (typeof window !== 'undefined') {
  const unlock = () => { if (prefs.alertSound) audio.unlock(); };
  window.addEventListener('pointerdown', unlock, { capture: true });
}
