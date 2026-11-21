// The layout you get on first start (or after "Reset layout").
// rails.left / rails.right hold panels; each panel holds widgets in a grid.

export const SCREEN_TYPES = {
  power: { name: 'Power Management', tab: 'PWR' },
  shields: { name: 'Shields', tab: 'SHLD' },
};

// MFD tabs shown on the bezel but not built yet (from the in-game MFD).
export const FUTURE_TABS = ['WPN', 'THR', 'PROX', 'QT', 'RADR', 'MISL', 'COOL', 'HIT'];

export function defaultLayout() {
  return {
    version: 1,
    profiles: [
      {
        id: 'default',
        name: 'Default',
        screens: [
          { id: 'scr-power', type: 'power' },
          { id: 'scr-shields', type: 'shields' },
        ],
        showFutureTabs: true,
        rails: {
          left: [
            {
              id: 'p-ifcs', title: '', cols: 2,
              widgets: [
                { id: 'w-cpld', type: 'light', label: 'CPLD', bind: 'ship.ifcs.coupled', action: 'v_ifcs_vector_decoupling_toggle' },
                { id: 'w-atmo', type: 'light', label: 'ATMO', bind: 'ship.ifcs.atmo' },
                { id: 'w-esp', type: 'light', label: 'ESP', bind: 'ship.ifcs.esp', action: 'v_ifcs_toggle_esp' },
                { id: 'w-gear', type: 'light', label: 'GEAR', bind: 'ship.gear', action: 'v_toggle_landing_system' },
                { id: 'w-lock', type: 'light', label: 'LOCK', bind: 'weapons.gimbalLocked' },
                { id: 'w-gsaf', type: 'light', label: 'GSAF', bind: 'ship.ifcs.gsafe', action: 'v_ifcs_toggle_gforce_safety' },
              ],
            },
            {
              id: 'p-gear', title: 'Landing gear', cols: 2,
              widgets: [
                { id: 'w-hail', type: 'button', label: 'Hail trgt', sub: 'Comms', action: 'v_target_hail' },
                { id: 'w-geardeploy', type: 'switch', label: 'Deploy', bind: 'ship.gear', actionOn: 'v_deploy_landing_system', actionOff: 'v_retract_landing_system' },
              ],
            },
            {
              id: 'p-mode', title: 'Master mode', cols: 2,
              widgets: [
                { id: 'w-mode', type: 'readout', label: 'Mode', bind: 'ship.masterMode', format: 'text' },
                { id: 'w-modecycle', type: 'button', label: 'Cycle', action: 'v_master_mode_cycle', color: 'red' },
              ],
            },
          ],
          right: [
            {
              id: 'p-vel', title: '', cols: 1,
              widgets: [
                { id: 'w-vel', type: 'ladder', label: 'VEL', bind: 'ship.speed', sub: 'ship.g', min: 0, max: 1200, unit: 'm/s' },
              ],
            },
            {
              id: 'p-cm', title: '', cols: 1,
              widgets: [
                { id: 'w-noise', type: 'counter', label: 'Noise', bind: 'weapons.noise', max: 8 },
                { id: 'w-decoy', type: 'counter', label: 'Decoy', bind: 'weapons.decoy', max: 8 },
              ],
            },
            {
              id: 'p-lights', title: 'Lights', cols: 1,
              widgets: [
                { id: 'w-headlight', type: 'switch', label: 'Head lght', bind: 'ship.lights', actionOn: 'v_lights_on', actionOff: 'v_lights_off' },
              ],
            },
            {
              id: 'p-power', title: 'Power', cols: 5,
              widgets: [
                { id: 'w-pwr', type: 'switch', label: 'Pwr', bind: 'ship.power.plants', action: 'v_power_toggle', compact: true },
                { id: 'w-eng', type: 'switch', label: 'Eng', bind: 'ship.power.engines', action: 'v_power_toggle_thrusters', compact: true },
                { id: 'w-wpn', type: 'switch', label: 'Wpn', bind: 'ship.power.weapons', actionOn: 'v_power_set_weapons_on', actionOff: 'v_power_set_weapons_off', compact: true },
                { id: 'w-shld', type: 'switch', label: 'Shld', bind: 'ship.power.shieldGen', actionOn: 'v_power_set_shields_on', actionOff: 'v_power_set_shields_off', compact: true },
                { id: 'w-vtol', type: 'switch', label: 'VTOL', bind: 'ship.vtol', actionOn: 'v_vtol_on', actionOff: 'v_vtol_off', compact: true },
              ],
            },
          ],
        },
      },
    ],
  };
}

export const WIDGET_TYPES = {
  light: { name: 'Status light', fields: ['label', 'bind', 'invert', 'action', 'color', 'confirm'] },
  switch: { name: 'Toggle switch', fields: ['label', 'bind', 'invert', 'action', 'actionOn', 'actionOff', 'confirm', 'compact'] },
  button: { name: 'Push button', fields: ['label', 'sub', 'action', 'holdMs', 'color', 'confirm', 'bind'] },
  readout: { name: 'Readout', fields: ['label', 'bind', 'format', 'decimals', 'unit'] },
  counter: { name: 'Counter (pips)', fields: ['label', 'bind', 'max'] },
  ladder: { name: 'Vertical gauge', fields: ['label', 'bind', 'sub', 'min', 'max', 'unit'] },
  bar: { name: 'Bar gauge', fields: ['label', 'bind', 'format', 'min', 'max', 'unit'] },
};

export function newWidget(type) {
  const base = { id: `w-${Math.random().toString(36).slice(2, 8)}`, type, label: type.toUpperCase() };
  if (type === 'light') return { ...base, label: 'NEW', bind: 'ship.gear' };
  if (type === 'switch') return { ...base, label: 'Switch', bind: 'ship.lights' };
  if (type === 'button') return { ...base, label: 'Button' };
  if (type === 'readout') return { ...base, label: 'Speed', bind: 'ship.speed', unit: 'm/s', decimals: 0 };
  if (type === 'counter') return { ...base, label: 'Noise', bind: 'weapons.noise', max: 8 };
  if (type === 'ladder') return { ...base, label: 'VEL', bind: 'ship.speed', sub: 'ship.g', min: 0, max: 1200, unit: 'm/s' };
  if (type === 'bar') return { ...base, label: 'Hull', bind: 'ship.hull', format: 'percent', min: 0, max: 1 };
  return base;
}
