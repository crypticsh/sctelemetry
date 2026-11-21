// Per-device preferences (this browser only).

const KEY = 'sct.prefs';
const DEFAULTS = {
  theme: 'drake',
  profile: 'default',
  animations: true,
  scanlines: true,
  swipe: true,
  railsPortrait: 'below', // 'below' | 'hidden'
  railScale: 1,
  haptics: true,
  screenIndex: 0,
  logsRange: 3600000,
};

function load() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
}

export const prefs = $state(load());

export function savePrefs() {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* private mode */ }
}

export function resetPrefs() {
  Object.assign(prefs, DEFAULTS);
  savePrefs();
}

export function buzz(ms = 8) {
  if (prefs.haptics && navigator.vibrate) navigator.vibrate(ms);
}
