// Demo source: generates frames shaped like the game's TelemetryStream
// (field names from docs/TELEMETRY.md) so the screens and the logger can be
// tried without the game running. Run with `npm run sim` or pick
// "Simulator" in Settings.

import fs from 'node:fs';
import path from 'node:path';
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
    boost: 1,
    boosting: false,
    boostIdle: 0,
    alt: 0,
    vsi: 0,
    lastStep: Date.now(),
    cycle: 0,
    shardN: 1,
    logOut: [],
    logSched: [],
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
    s.phaseUntil = el + { landed: 8000, liftoff: 6000, cruise: 20000, combat: 25000, return: 90000 }[next];
    if (next === 'liftoff') { s.landed = false; ev.push('TAKEOFF'); simLog(s, now, 'liftoff'); }
    if (next === 'cruise') { s.gear = false; s.mode = 'NAV'; s.lights = false; simLog(s, now, 'cruise'); }
    if (next === 'combat') { s.mode = 'SCM'; s.decoupled = Math.random() < 0.5; simLog(s, now, 'arrive'); }
    if (next === 'return') { s.decoupled = false; s.mode = 'SCM'; s.alt = 420; s.vsi = -14; s.hot = !s.hot; s.recovered = false; }
    if (next === 'liftoff') { s.alt = 0; }
    if (next === 'landed') { s.landed = true; s.speed = 0; s.alt = 0; s.vsi = 0; ev.push('LANDED'); s.noise = 8; s.decoy = 8; }
  }
  while (s.logSched.length && s.logSched[0][0] <= now) { const [t, l] = s.logSched.shift(); s.logOut.push(stamp(t) + l); }
  const dt = Math.min(0.5, (now - s.lastStep) / 1000);
  s.lastStep = now;
  // Vertical profile: climb out, then a real descent to touchdown on return.
  if (s.phase === 'liftoff') { s.vsi += (12 - s.vsi) * 0.05; s.alt += s.vsi * dt; }
  if (s.phase === 'return') {
    // Every other approach comes in hot, to show SINK RATE / PULL UP.
    if (s.hot && !s.recovered && s.vsi < -1 && s.alt / -s.vsi < 3) s.recovered = true;
    const want = s.hot && !s.recovered ? -45 : s.alt > 150 ? -14 : s.alt > 25 ? -4 : -1.2;
    s.vsi += (want - s.vsi) * 0.05;
    s.alt = Math.max(0, s.alt + s.vsi * dt);
    if (s.alt < 180 && !s.gear) { s.gear = true; s.lights = true; }
    if (s.alt <= 0 && !s.landed) { s.landed = true; s.vsi = 0; s.phaseUntil = el + 1000; simLog(s, now, 'land'); }
  }
  if (s.phase !== 'liftoff' && s.phase !== 'return') s.vsi = 0;
  // Boost: bursts in combat drain it, then it recharges after a short delay.
  if (s.phase === 'combat' && !s.boosting && s.boost > 0.6 && Math.random() < 0.012) s.boosting = true;
  if (s.boosting) {
    s.boost = Math.max(0, s.boost - 0.22 * dt);
    if (s.boost <= 0.05 || Math.random() < 0.01) { s.boosting = false; s.boostIdle = 1.5; }
  } else if (s.boostIdle > 0) s.boostIdle -= dt;
  else s.boost = Math.min(1, s.boost + 0.09 * dt);
  if (s.phase === 'cruise' && Math.random() < 0.003) s.spooled = !s.spooled;
  if (s.phase !== 'cruise') s.spooled = false;

  const target = { landed: 0, liftoff: 40, cruise: 1100, combat: 180 + 120 * Math.sin(el / 2300) + (s.boosting ? 120 : 0), return: s.alt > 150 ? 70 : s.alt > 25 ? 30 : 6 }[s.phase];
  s.speed += (target - s.speed) * 0.04 + (s.phase === 'combat' ? (Math.random() - 0.5) * 6 : 0);
  if (s.phase === 'landed' || s.landed) s.speed = 0;
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

  const space = s.phase === 'cruise' || s.phase === 'combat';
  const alt = space ? 3.4028234663852886e38 : s.alt;
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
        gravity: space ? 0 : 1,
        intoxication_level: 0,
      },
      environment: { external_temperature: space ? -270 : 18, breathable_atmosphere: !space, ambient_radiation_rate: 0.01 },
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
            radar_altitude: alt,
            heading: s.heading,
            vertical_speed_indicator: s.vsi,
            g_meter: { current: g, max: s.gMax },
            hydrogen_fuel: s.hydrogen,
            quantum_fuel: 0,
            boost: { reserves: s.boost, engaged: s.boosting, output: s.boosting ? 1 : 0, critical: s.boost < 0.1 },
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

// ---- a matching fake Game.log, so locations and play history work in the simulator
const stamp = (t) => `<${new Date(t).toISOString()}> `;
const N = (text) => `[Notice] <SHUDEvent_OnNotification> Added notification "${text}: " [1] to queue. [Team_CoreGameplayFeatures]`;
const INV = (a, b) => `[Notice] <Update Inventory Location> Player [SimPilot] is changing location. Landing [${a}] -> [${b}]. Location [${a || 7}] -> [${b || 7}]. Pending [0] [Inventory]`;
const LOC = (name) => `[Notice] <RequestLocationInventory> Player[SimPilot] requested inventory for Location[${name}] [Inventory]`;
const QT = (target) => `[Notice] <Player Selected Quantum Target - Local> [ItemNavigation] | Player has selected point ${target} as their destination, routing locally [QuantumTravel]`;
const ROUTE = (from, target) => `[Notice] <Calculate Route> [ItemNavigation] | Projected Start Location is ${from} for route to destination ${target} [QuantumTravel]`;
const JOIN = (n) => `[Notice] <Join PU> address[0.0.0.0] port[0] shard[pub_sim_${String(n).padStart(3, '0')}] locationId[1] [Matchmaking]`;

export function simLogHeader(now) {
  return [
    'Log started on ' + new Date(now).toUTCString(),
    'FileVersion: 4.10.201.48085',
    'Branch: sc-alpha-4.10.0',
    '[CIG] build_version[13220821]',
    'Executable: C:\\Program Files\\Roberts Space Industries\\StarCitizen\\LIVE\\Bin64\\StarCitizen.exe',
    '[Notice] <Legacy login response> [CIG-net] User Login Success - Handle[SimPilot] - Time[1] [Login]',
    JOIN(1),
    INV(0, 111),
    LOC('RR_CRU_LEO'),
    N('Entering Armistice Zone - Combat Prohibited'),
  ].map((l) => stamp(now) + l);
}

function simLog(s, now, what) {
  const at = (ms, line) => s.logSched.push([now + ms, line]);
  const toMoon = s.cycle % 2 === 0;
  if (what === 'liftoff') {
    if (s.cycle > 0 && s.cycle % 3 === 0) { // switch shards now and then
      s.logOut.push(stamp(now) + 'Requesting game mode Frontend_Main/SC_Frontend');
      s.shardN++;
      s.logOut.push(stamp(now + 1) + JOIN(s.shardN));
    }
    if (toMoon) s.logOut.push(stamp(now) + N('Leaving Armistice Zone - Caution Advised'));
    s.logOut.push(stamp(now) + INV(toMoon ? 111 : 222, 0));
  } else if (what === 'cruise') {
    const target = toMoon ? 'OOC_Stanton_2b_Daymar' : 'RR_CRU_LEO';
    s.logOut.push(stamp(now) + QT(target), stamp(now) + ROUTE(toMoon ? 'Seraphim Station' : 'Daymar', target));
    at(1500, N('Quantum Travel Calibration Started By SimPilot'));
    at(6000, N('Quantum Travel Calibration Complete By SimPilot'));
  } else if (what === 'arrive') {
    s.logOut.push(stamp(now) + '[Notice] <Quantum Drive Arrived - Arrived at Final Destination> | Quantum Drive has arrived at final destination [QuantumTravel]');
    if (toMoon) {
      s.logOut.push(stamp(now + 100) + "[Notice] <Planet CPU Maps Loaded> Planet 'OOC_Stanton_2b_Daymar' (entity 1) CPU maps: x [Planet]");
      at(2000, N('Entered Crusader Industries Jurisdiction'));
    } else at(2000, N('Entered UEE Jurisdiction'));
  } else if (what === 'land') {
    s.logOut.push(stamp(now) + INV(0, toMoon ? 222 : 111));
    s.logOut.push(stamp(now) + LOC(toMoon ? 'Outpost_PAF_Stanton2b_Attritus_2' : 'RR_CRU_LEO'));
    if (!toMoon) s.logOut.push(stamp(now) + N('Entering Armistice Zone - Combat Prohibited'));
    s.cycle++;
  }
}

export class SimSource extends EventEmitter {
  constructor({ logFile } = {}) {
    super();
    this.logFile = logFile;
    this.kind = 'sim';
    this.connected = false;
    this.error = null;
    this.origin = 'built-in simulator';
    this.state = createSimState();
  }

  start() {
    this.connected = true;
    this.emit('status');
    if (this.logFile) {
      try { fs.mkdirSync(path.dirname(this.logFile), { recursive: true }); fs.writeFileSync(this.logFile, simLogHeader(Date.now()).join('\r\n') + '\r\n'); } catch (e) { console.error('sim log:', e.message); }
    }
    this._iv = setInterval(() => {
      this.emit('frame', stepSim(this.state));
      if (this.logFile && this.state.logOut.length) {
        try { fs.appendFileSync(this.logFile, this.state.logOut.splice(0).join('\r\n') + '\r\n'); } catch { /* ignore */ }
      }
    }, 1000 / 17);
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
