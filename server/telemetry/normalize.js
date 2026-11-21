// Turn a raw TelemetryStream frame into a small, stable model the screens and
// the logger use. The game's exact field shapes are not documented, so every
// read here is defensive: a value may be a number, {current, max}, {value},
// a bool or {enabled}. Anything not covered here is still reachable from
// widgets through `raw.<path>`.

const FLT_MAX = 3.4e38;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function get(obj, path) {
  let o = obj;
  for (const k of path.split('.')) {
    if (o == null) return undefined;
    o = o[k];
  }
  return o;
}

/** First number found in v: a number, or .current/.value/.level/.amount. */
export function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v !== '' && !Number.isNaN(+v)) return +v;
  if (isObj(v)) {
    for (const k of ['current', 'value', 'level', 'amount', 'normalized', 'percent']) {
      if (k in v) return num(v[k]);
    }
  }
  return null;
}

function max(v) {
  if (isObj(v)) return num(v.max ?? v.maximum);
  return null;
}

/** Fraction 0..1 if we can tell, from {current,max}, a 0..1 number, or 0..100. */
function frac(v) {
  const n = num(v);
  if (n == null) return null;
  const m = max(v);
  if (m) return n / m;
  return n > 1.0001 ? n / 100 : n;
}

export function bool(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return /^(true|on|enabled|1|yes|deployed|down|active)$/i.test(v);
  if (isObj(v)) {
    for (const k of ['enabled', 'on', 'active', 'value', 'state', 'powered', 'is_on']) if (k in v) return bool(v[k]);
  }
  return null;
}

/** Find a key in obj whose name matches re; return its value. */
function find(obj, re) {
  if (!isObj(obj)) return undefined;
  for (const k of Object.keys(obj)) if (re.test(k)) return obj[k];
  return undefined;
}

const POWER_KEYS = {
  plants: /power_?plant/i,
  engines: /engine|thruster/i,
  weapons: /weapon/i,
  coolers: /cooler/i,
  lifeSupport: /life_?support/i,
  sensors: /sensor|radar/i,
  gravity: /gravity/i,
  shieldGen: /shield_?gen/i,
  shieldEmit: /shield_?emit/i,
};

export function normalize(raw, meta = {}) {
  const a = raw?.actor || {};
  const v = raw?.vehicle?.state;
  const fl = v?.flight || {};
  const ins = fl.instruments || {};
  const set = fl.settings || {};
  const w = raw?.weapons || {};

  const ship = v
    ? {
        present: true,
        id: v.name || '',
        className: v.class_name || '',
        manufacturer: v.manufacturer || '',
        type: v.type || '',
        hull: frac(v.health),
        lights: bool(v.lights_enabled),
        masterMode: String(v.master_mode?.mode ?? '').replace(/^.*_/, '') || null,
        qtSpooled: bool(v.master_mode?.spooled),
        shields: {
          level: frac(v.shields?.level),
          faces: (Array.isArray(v.shields?.faces) ? v.shields.faces : []).map((f) => frac(f)),
        },
        power: Object.fromEntries(Object.entries(POWER_KEYS).map(([k, re]) => [k, bool(find(v.power, re))])),
        annunciators: isObj(v.annunciators) ? Object.fromEntries(Object.entries(v.annunciators).map(([k, x]) => [k, bool(x)])) : {},
        gear: bool(fl.state?.gear),
        vtol: bool(fl.state?.vtol),
        landed: bool(fl.state?.is_landed),
        ifcs: {
          decoupled: bool(find(set, /decoupl/i)),
          coupled: (() => { const d = bool(find(set, /decoupl/i)); return d == null ? bool(find(set, /^coupled/i)) : !d; })(),
          esp: bool(find(set, /esp/i)),
          gsafe: bool(find(set, /g_?safe|gforce|g_force/i)),
          proximity: bool(find(set, /proximity/i)),
          atmo: bool(find(set, /atmo/i)),
          cruise: bool(find(set, /cruise/i)),
          speedLimiter: bool(find(set, /limiter/i)),
          raw: set,
        },
        speed: num(ins.speed),
        altitude: (() => { const n = num(ins.altitude); return n == null || n > FLT_MAX ? null : n; })(),
        radarAlt: (() => { const n = num(ins.radar_altitude); return n == null || n > FLT_MAX ? null : n; })(),
        heading: num(ins.heading),
        vsi: num(ins.vertical_speed_indicator),
        g: num(ins.g_meter),
        gMax: max(ins.g_meter),
        hydrogen: frac(ins.hydrogen_fuel),
        quantum: frac(ins.quantum_fuel),
        boost: {
          reserves: frac(ins.boost?.reserves),
          engaged: bool(ins.boost?.engaged),
          output: num(ins.boost?.output),
          critical: bool(ins.boost?.critical),
        },
      }
    : { present: false, shields: { faces: [] }, power: {}, annunciators: {}, ifcs: {}, boost: {} };

  // Power output: how many systems report on (the stream has no pip allocation).
  const pw = Object.values(ship.power).filter((x) => x != null);
  ship.powerOn = pw.filter(Boolean).length;
  ship.powerTotal = pw.length;

  const cms = Array.isArray(w.countermeasures) ? w.countermeasures : [];
  const cm = (re) => {
    const c = cms.find((x) => re.test(String(x.type ?? x.name ?? '')));
    return c ? num(c.count ?? c.remaining ?? c.ammo) : null;
  };

  return {
    t: meta.t ?? Date.now(),
    source: meta.source ?? 'game',
    player: {
      locomotion: a.state?.locomotion ?? null,
      seat: a.state?.seat_name ?? null,
      role: a.state?.crew_role ?? null,
      uec: num(a.state?.uec_balance),
      health: frac(a.vitals?.health),
      oxygen: frac(a.vitals?.oxygen),
      hunger: frac(a.vitals?.hunger),
      thirst: frac(a.vitals?.thirst),
      bodyTemp: num(a.vitals?.body_temperature),
      heartRate: num(a.vitals?.heart_rate),
      pressure: num(a.vitals?.pressure),
      gravity: num(a.vitals?.gravity),
      intoxication: num(a.vitals?.intoxication_level),
      extTemp: num(a.environment?.external_temperature),
      breathable: bool(a.environment?.breathable_atmosphere),
      radiation: num(a.environment?.ambient_radiation_rate),
    },
    ship,
    weapons: {
      preset: num(w.preset_index),
      presetName: w.preset_name ?? null,
      gimbalLocked: bool(w.settings?.gimbals_locked),
      list: (Array.isArray(w.weapons) ? w.weapons : []).map((x) => ({
        name: x.name ?? '',
        powered: bool(x.powered),
        ready: bool(x.ready_to_fire ?? x.ready),
        active: bool(x.in_active_group ?? x.active),
      })),
      noise: cm(/noise|chaff/i),
      decoy: cm(/decoy|flare/i),
      countermeasures: cms.map((c) => ({ type: String(c.type ?? c.name ?? ''), count: num(c.count ?? c.remaining) })),
    },
    // Not in the stream today; kept so screens can show them if CIG adds them.
    signatures: { ir: null, irMax: null, em: null, emMax: null, cs: null, csMax: null },
    events: (raw?.events?.events || []).map((e) => e?.type).filter(Boolean),
  };
}

/** Numeric channels written to the flight log each sample. */
export const CHANNELS = {
  speed: (n) => n.ship.speed,
  altitude: (n) => n.ship.altitude,
  radar_alt: (n) => n.ship.radarAlt,
  heading: (n) => n.ship.heading,
  vsi: (n) => n.ship.vsi,
  g: (n) => n.ship.g,
  hull: (n) => n.ship.hull,
  shield: (n) => n.ship.shields.level,
  hydrogen: (n) => n.ship.hydrogen,
  quantum: (n) => n.ship.quantum,
  boost: (n) => n.ship.boost.reserves,
  power_on: (n) => (n.ship.present ? n.ship.powerOn : null),
  health: (n) => n.player.health,
  oxygen: (n) => n.player.oxygen,
  heart_rate: (n) => n.player.heartRate,
  pressure: (n) => n.player.pressure,
  ext_temp: (n) => n.player.extTemp,
  noise: (n) => n.weapons.noise,
  decoy: (n) => n.weapons.decoy,
};

/** Discrete states whose changes are written to the event log. */
export const DISCRETES = {
  seated: (n) => n.ship.present,
  ship: (n) => n.ship.className || null,
  gear: (n) => n.ship.gear,
  vtol: (n) => n.ship.vtol,
  landed: (n) => n.ship.landed,
  lights: (n) => n.ship.lights,
  master_mode: (n) => n.ship.masterMode,
  qt_spooled: (n) => n.ship.qtSpooled,
  decoupled: (n) => n.ship.ifcs.decoupled,
  esp: (n) => n.ship.ifcs.esp,
  gsafe: (n) => n.ship.ifcs.gsafe,
  proximity: (n) => n.ship.ifcs.proximity,
  boost: (n) => n.ship.boost.engaged,
  gimbal_lock: (n) => n.weapons.gimbalLocked,
  weapon_group: (n) => n.weapons.presetName,
  ...Object.fromEntries(Object.keys(POWER_KEYS).map((k) => [`power_${k}`, (n) => n.ship.power[k] ?? null])),
};
