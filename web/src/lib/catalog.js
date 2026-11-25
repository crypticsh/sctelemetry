// What widgets can show (bind) and what they can do (actions).
// Any other value is reachable by typing a path; `raw.` paths read the game's
// own frame (see Settings → Live data inspector).

export const BINDINGS = [
  { group: 'Flight control', items: [
    ['ship.ifcs.coupled', 'Coupled', 'bool'],
    ['ship.ifcs.decoupled', 'Decoupled', 'bool'],
    ['ship.ifcs.esp', 'ESP', 'bool'],
    ['ship.ifcs.gsafe', 'G-Safe', 'bool'],
    ['ship.ifcs.proximity', 'Proximity assist', 'bool'],
    ['ship.ifcs.atmo', 'Atmospheric flight', 'bool'],
    ['ship.ifcs.cruise', 'Cruise control', 'bool'],
    ['ship.ifcs.speedLimiter', 'Speed limiter', 'bool'],
    ['ship.gear', 'Landing gear down', 'bool'],
    ['ship.vtol', 'VTOL', 'bool'],
    ['ship.landed', 'Landed', 'bool'],
    ['ship.lights', 'Lights', 'bool'],
    ['ship.qtSpooled', 'Quantum spooled', 'bool'],
    ['ship.masterMode', 'Master mode (NAV/SCM)', 'text'],
    ['ship.boost.engaged', 'Boost engaged', 'bool'],
    ['ship.boost.critical', 'Boost critical', 'bool'],
  ] },
  { group: 'Instruments', items: [
    ['ship.speed', 'Speed (m/s)', 'number'],
    ['ship.g', 'G-load', 'number'],
    ['ship.gMax', 'G-load max', 'number'],
    ['ship.altitude', 'Altitude (m)', 'number'],
    ['ship.radarAlt', 'Radar altitude (m)', 'number'],
    ['ship.heading', 'Heading (°)', 'number'],
    ['ship.vsi', 'Vertical speed (m/s)', 'number'],
    ['ship.hydrogen', 'Hydrogen fuel', 'fraction'],
    ['ship.quantum', 'Quantum fuel', 'fraction'],
    ['ship.boost.reserves', 'Boost reserves', 'fraction'],
    ['ship.hull', 'Hull health', 'fraction'],
    ['ship.shields.level', 'Shield level', 'fraction'],
  ] },
  { group: 'Power', items: [
    ['ship.power.plants', 'Power plants', 'bool'],
    ['ship.power.engines', 'Engines / thrusters', 'bool'],
    ['ship.power.weapons', 'Weapons', 'bool'],
    ['ship.power.coolers', 'Coolers', 'bool'],
    ['ship.power.lifeSupport', 'Life support', 'bool'],
    ['ship.power.sensors', 'Sensors', 'bool'],
    ['ship.power.gravity', 'Gravity generators', 'bool'],
    ['ship.power.shieldGen', 'Shield generators', 'bool'],
    ['ship.power.shieldEmit', 'Shield emitters', 'bool'],
    ['ship.powerOn', 'Systems powered (count)', 'number'],
  ] },
  { group: 'Weapons', items: [
    ['weapons.gimbalLocked', 'Gimbal lock', 'bool'],
    ['weapons.presetName', 'Weapon group', 'text'],
    ['weapons.noise', 'Noise countermeasures', 'number'],
    ['weapons.decoy', 'Decoy countermeasures', 'number'],
  ] },
  { group: 'Warnings', items: [
    ['ship.annunciators.master_warning', 'Master warning', 'bool'],
    ['ship.annunciators.master_caution', 'Master caution', 'bool'],
  ] },
  { group: 'Player', items: [
    ['player.health', 'Health', 'fraction'],
    ['player.oxygen', 'Oxygen', 'fraction'],
    ['player.heartRate', 'Heart rate', 'number'],
    ['player.pressure', 'Pressure', 'number'],
    ['player.extTemp', 'Outside temperature', 'number'],
    ['player.breathable', 'Breathable air', 'bool'],
    ['player.uec', 'aUEC balance', 'number'],
    ['player.locomotion', 'Movement state', 'text'],
    ['player.role', 'Crew role', 'text'],
  ] },
  { group: 'Location (Game.log)', items: [
    ['loc.line', 'Where + what ("Flying at Cellin, 940 m…")', 'text'],
    ['loc.placeName', 'Place name', 'text'],
    ['loc.situation', 'Situation (landed, flying…)', 'text'],
    ['loc.event.text', 'Latest event ("Landed at Ruin Station")', 'text'],
    ['loc.jurisdiction', 'Jurisdiction', 'text'],
    ['loc.armistice', 'In armistice zone', 'bool'],
    ['loc.shard', 'Shard id', 'text'],
    ['loc.transit.state', 'Quantum state (spool / travel)', 'text'],
    ['loc.transit.toName', 'Quantum destination', 'text'],
    ['loc.gameRunning', 'Game running', 'bool'],
  ] },
  { group: 'Link', items: [
    ['link.connected', 'Telemetry connected', 'bool'],
  ] },
];

export const BINDING_LABEL = Object.fromEntries(BINDINGS.flatMap((g) => g.items.map(([p, l]) => [p, l])));

// From the game's ListTriggerableActions (PTU, Nov 2026). The server's live
// list replaces this when the game is running.
export const ACTIONS = [
  { group: 'Flight', items: [
    'v_ifcs_vector_decoupling_toggle', 'v_ifcs_vector_decoupling_on', 'v_ifcs_vector_decoupling_off',
    'v_ifcs_toggle_esp', 'v_ifcs_toggle_gforce_safety', 'v_ifcs_gsafe_on', 'v_ifcs_gsafe_off',
    'v_ifcs_proximity_assist_toggle', 'v_ifcs_proximity_assist_on', 'v_ifcs_proximity_assist_off',
    'v_ifcs_reset_gmeter_max', 'v_master_mode_cycle', 'v_master_mode_set_nav', 'v_master_mode_set_scm',
    'v_toggle_landing_system', 'v_deploy_landing_system', 'v_retract_landing_system', 'v_atc_request',
    'v_vtol_toggle', 'v_vtol_on', 'v_vtol_off',
    'v_flight_advanced_hud_toggle', 'v_transform_cycle', 'v_transform_deploy', 'v_transform_retract',
    'v_toggle_qdrive_engagement', 'v_flightready',
  ] },
  { group: 'Power', items: [
    'v_power_toggle', 'v_power_set_on', 'v_power_set_off',
    'v_power_toggle_shields', 'v_power_set_shields_on', 'v_power_set_shields_off',
    'v_power_toggle_thrusters', 'v_power_set_thrusters_on', 'v_power_set_thrusters_off',
    'v_power_toggle_weapons', 'v_power_set_weapons_on', 'v_power_set_weapons_off',
  ] },
  { group: 'Ship', items: [
    'v_lights', 'v_lights_on', 'v_lights_off',
    'v_toggle_all_doors', 'v_open_all_doors', 'v_close_all_doors',
    'v_toggle_all_doorlocks', 'v_lock_all_doors', 'v_unlock_all_doors',
    'v_toggle_all_portlocks', 'v_lock_all_ports', 'v_unlock_all_ports',
    'v_toggle_docking_request', 'v_target_hail', 'v_invoke_ping',
    'v_light_amplification_toggle',
  ] },
  { group: 'Operator mode', items: [
    'v_operator_mode_cycle_forward', 'v_operator_mode_cycle_back', 'v_set_flight_mode', 'v_set_guns_mode',
    'v_set_scan_mode', 'v_set_quantum_mode', 'v_set_mining_mode', 'v_set_salvage_mode', 'v_set_refuel_mode',
  ] },
  { group: 'Danger', items: ['v_eject', 'v_emergency_exit', 'v_self_destruct'] },
];
