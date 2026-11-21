// Demo source: generates frames shaped like the game's TelemetryStream
// (field names from docs/TELEMETRY.md) so the screens and the logger can be
// tried without the game running. Run with `npm run sim` or pick
// "Simulator" in Settings.

import { EventEmitter } from 'node:events';

const FACES = 4; // front, right, back, left (guess; the game may report more)

export function createSimState() {
  return {
    t0: Date.now(),
    landed: true,
    gear: true,
    vtol: false,
    decoupled: false,
    esp: true,
    gsafe: true,
    proximity: true,
    lights: false,
    mode: 'SCM',
    spooled: false,
    hull: 1,
    faces: Array(FACES).fill(100),
    gMax: 0,
    speed: 0,
    heading: 90,
    hydrogen: 1,
    noise: 8,
    decoy: 8,
    power: { power_plants: true, engines: true, weapons: true, coolers: true, life_support: true, sensors: true, gravity_generators: true, shield_generators: true, shield_emitters: true },
    phase: 'landed',
    phaseUntil: 6000,
    nextHit: 15000,
    uec: 1250340,
    events: [],
  };
}

export function stepSim(s, now = Date.now()) {
  const el = now - s.t0;
  const ev = [];
  // Simple flight script: sit landed, lift off, cruise/dogfight, come back.
  if (el > s.phaseUntil) {
    const next = { landed: 'liftoff', liftoff: 'cruise', cruise: 'combat', combat: 'return', return: 'landed' }[s.phase];
    s.phase = next;
    s.phaseUntil = el + { landed: 8000, liftoff: 6000, cruise: 20000, combat: 25000, return: 10000 }[next];
    if (next === 'liftoff') { s.landed = false; ev.push('TAKEOFF'); }
    if (next === 'cruise') { s.gear = false; s.mode = 'NAV'; s.lights = false; }
    if (next === 'combat') { s.mode = 'SCM'; s.decoupled = Math.random() < 0.5; }
    if (next === 'return') { s.decoupled = false; s.mode = 'SCM'; }
    if (next === 'landed') { s.landed = true; s.speed = 0; ev.push('LANDED'); s.noise = 8; s.decoy = 8; }
  }
  if (s.phase === 'return' && s.phaseUntil - el < 5000 && !s.gear) { s.gear = true; s.lights = true; }
  if (s.phase === 'cruise' && Math.random() < 0.003) s.spooled = !s.spooled;
  if (s.phase !== 'cruise') s.spooled = false;

  const target = { landed: 0, liftoff: 40, cruise: 1100, combat: 180 + 120 * Math.sin(el / 2300), return: 60 }[s.phase];
  s.speed += (target - s.speed) * 0.04 + (s.phase === 'combat' ? (Math.random() - 0.5) * 6 : 0);
  if (s.phase === 'landed') s.speed = 0;
  s.heading = (s.heading + (s.phase === 'combat' ? 2.4 * Math.sin(el / 3100) : 0.05) + 360) % 360;
  const g = s.phase === 'landed' ? 0 : Math.max(0, (s.phase === 'combat' ? 3.5 + 3 * Math.sin(el / 1700) : 1) + (Math.random() - 0.5) * 0.4);
  s.gMax = Math.max(s.gMax, g);
  s.hydrogen = Math.max(0, s.hydrogen - (s.phase === 'landed' ? 0 : 0.00005 + s.speed / 4e7));
  if (s.phase === 'landed') s.hydrogen = Math.min(1, s.hydrogen + 0.002);

  // Shields: regenerate, take hits in combat.
  for (let i = 0; i < FACES; i++) s.faces[i] = Math.min(100, s.faces[i] + 0.25);
  if (s.phase === 'combat' && el > s.nextHit) {
    const face = Math.random() < 0.6 ? 0 : Math.floor(Math.random() * FACES);
    const dmg = 15 + Math.random() * 35;
    const over = dmg - s.faces[face];
    s.faces[face] = Math.max(0, s.faces[face] - dmg);
    if (over > 0) s.hull = Math.max(0.2, s.hull - over / 600);
    s.nextHit = el + 600 + Math.random() * 2500;
    if (Math.random() < 0.25 && s.decoy > 0) s.decoy--;
    if (Math.random() < 0.15 && s.noise > 0) s.noise--;
  }
  if (s.phase === 'landed') s.hull = Math.min(1, s.hull + 0.0015);
  if (Math.random() < 0.0015) { s.power.weapons = !s.power.weapons; }
  if (!s.power.weapons && Math.random() < 0.01) s.power.weapons = true;

  const alt = s.phase === 'cruise' ? 3.4028234663852886e38 : s.phase === 'landed' ? 0 : 50 + s.speed * 3;
  const level = s.faces.reduce((a, b) => a + b, 0) / FACES / 100;

  return {
    actor: {
      state: { locomotion: 'SEATED', seat_name: 'Pilot Seat', crew_role: 'PILOT', uec_balance: s.uec },
      vitals: {
        health: { current: 100, max: 100 },
        oxygen: { current: 95, max: 100 },
        hunger: { current: 72, max: 100 },
        thirst: { current: 64, max: 100 },
        body_temperature: { current: 36.8, max: 40 },
        heart_rate: 70 + g * 12 + (Math.random() - 0.5) * 4,
        pressure: 101.3,
        gravity: s.landed ? 1 : 0,
        intoxication_level: 0,
      },
      environment: { external_temperature: s.landed ? 18 : -270, breathable_atmosphere: s.landed, ambient_radiation_rate: 0.01 },
    },
    vehicle: {
      state: {
        name: 'DRAK_Buccaneer_000000000001',
        class_name: 'DRAK_Buccaneer',
        manufacturer: 'Drake Interplanetary',
        type: 'Spaceship',
        health: s.hull,
        lights_enabled: s.lights,
        master_mode: { mode: s.mode, spooled: s.spooled },
        shields: { level, faces: s.faces.map((v) => ({ level: v / 100 })) },
        power: { ...s.power },
        annunciators: { master_warning: s.hull < 0.5, master_caution: level < 0.25, fuel_low: s.hydrogen < 0.15 },
        flight: {
          state: { gear: s.gear, vtol: s.vtol, is_landed: s.landed },
          settings: { decoupled: s.decoupled, esp: s.esp, gsafe: s.gsafe, proximity_assist: s.proximity },
          instruments: {
            speed: s.speed,
            altitude: alt,
            radar_altitude: s.phase === 'cruise' ? alt : Math.max(0, alt - 20),
            heading: s.heading,
            vertical_speed_indicator: s.phase === 'liftoff' ? 12 : s.phase === 'return' ? -8 : 0,
            g_meter: { current: g, max: s.gMax },
            hydrogen_fuel: s.hydrogen,
            quantum_fuel: 0,
            boost: { reserves: 0.8, engaged: false, output: 0, critical: false },
          },
        },
      },
    },
    weapons: {
      preset_index: 0,
      preset_name: 'Group 1',
      settings: { gimbals_locked: false },
      weapons: ['Size 3 Laser Repeater', 'Size 3 Laser Repeater', 'Size 2 Laser Cannon', 'Size 2 Laser Cannon']
        .map((name, i) => ({ name, powered: s.power.weapons, ready_to_fire: s.power.weapons, in_active_group: i < 2 })),
      countermeasures: [{ type: 'NOISE', count: s.noise }, { type: 'DECOY', count: s.decoy }],
    },
    events: { events: ev.map((type) => ({ type })) },
    turret: {},
    force_feedback: {},
  };
}

export class SimSource extends EventEmitter {
  constructor() {
    super();
    this.kind = 'sim';
    this.connected = false;
    this.error = null;
    this.origin = 'built-in simulator';
    this.state = createSimState();
  }

  start() {
    this.connected = true;
    this.emit('status');
    this._iv = setInterval(() => this.emit('frame', stepSim(this.state)), 1000 / 17);
  }

  stop() {
    clearInterval(this._iv);
    this.connected = false;
  }

  async listActions() {
    return { actions: SIM_ACTIONS.map((action_name) => ({ action_name, category: 'sim', holdable: false })) };
  }

  async trigger(name) {
    const s = this.state;
    const set = {
      v_ifcs_vector_decoupling_toggle: () => (s.decoupled = !s.decoupled),
      v_ifcs_vector_decoupling_on: () => (s.decoupled = true),
      v_ifcs_vector_decoupling_off: () => (s.decoupled = false),
      v_ifcs_toggle_esp: () => (s.esp = !s.esp),
      v_ifcs_toggle_gforce_safety: () => (s.gsafe = !s.gsafe),
      v_ifcs_gsafe_on: () => (s.gsafe = true),
      v_ifcs_gsafe_off: () => (s.gsafe = false),
      v_ifcs_proximity_assist_toggle: () => (s.proximity = !s.proximity),
      v_toggle_landing_system: () => (s.gear = !s.gear),
      v_deploy_landing_system: () => (s.gear = true),
      v_retract_landing_system: () => (s.gear = false),
      v_vtol_toggle: () => (s.vtol = !s.vtol),
      v_lights: () => (s.lights = !s.lights),
      v_lights_on: () => (s.lights = true),
      v_lights_off: () => (s.lights = false),
      v_master_mode_cycle: () => (s.mode = s.mode === 'SCM' ? 'NAV' : 'SCM'),
      v_master_mode_set_nav: () => (s.mode = 'NAV'),
      v_master_mode_set_scm: () => (s.mode = 'SCM'),
      v_power_toggle_weapons: () => (s.power.weapons = !s.power.weapons),
      v_power_toggle_shields: () => (s.power.shield_generators = !s.power.shield_generators),
      v_power_toggle_thrusters: () => (s.power.engines = !s.power.engines),
      v_ifcs_reset_gmeter_max: () => (s.gMax = 0),
    }[name];
    if (!set) throw new Error(`Simulator does not model ${name}`);
    set();
    return {};
  }
}

export const SIM_ACTIONS = [
  'v_ifcs_vector_decoupling_toggle', 'v_ifcs_toggle_esp', 'v_ifcs_toggle_gforce_safety', 'v_ifcs_proximity_assist_toggle',
  'v_toggle_landing_system', 'v_vtol_toggle', 'v_lights', 'v_master_mode_cycle', 'v_power_toggle_weapons',
  'v_power_toggle_shields', 'v_power_toggle_thrusters', 'v_ifcs_reset_gmeter_max',
];
