// Server-side settings, shared by every device. Stored in data/settings.json.

import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_SETTINGS = {
  telemetry: {
    source: 'game', // 'game' | 'sim'
    host: '127.0.0.1',
    port: 50051,
    exePath: 'C:\\Program Files\\Roberts Space Industries\\StarCitizen\\LIVE\\Bin64\\StarCitizen.exe',
    protosetPath: '', // optional: use a .protoset file instead of reading the exe
    staleAfterMs: 2000, // show NO SIGNAL when no frame for this long
    readUserCfgPort: true, // use grpc.client.server.port from the channel's user.cfg
    tryLivePort: true, // also try 2942: 4.x LIVE ignores the user.cfg port and always serves there
  },
  gamelog: {
    enabled: true, // follow Game.log for shard, place, quantum travel and play history
    path: '', // empty = Game.log next to the exe's channel folder
    importBackups: true, // also read the finished logs in <channel>/logbackups
    placesPath: '', // empty = data/places.json if present, else the built-in list
  },
  broadcast: {
    hz: 20, // max updates per second sent to each screen
    rawHz: 4, // max raw-frame updates per second (only to screens that ask)
  },
  logging: {
    enabled: true,
    intervalMs: 1000, // how often a sample is written
    retentionDays: 14, // delete samples older than this (0 = keep forever)
    maxDbMB: 500, // delete oldest samples above this size (0 = no limit)
    onlyWhenSeated: true, // skip samples while on foot
    onlyOnChange: false, // skip samples identical to the previous one
    logEvents: true, // log state changes (gear, decoupled, power…) and game events
    logFullFrames: false, // also store the full raw frame with each sample (large)
    pruneEveryMin: 10,
  },
  actions: {
    enabled: false, // allow screens to send in-game actions
    allowDangerous: false, // self destruct, eject, door/port locks
  },
  server: {
    port: 8420, // change needs a restart
  },
};

export const DANGEROUS = /self_destruct|eject|emergency_exit|lock_all|toggle_all_doorlocks|toggle_all_portlocks/;

const LIMITS = {
  'telemetry.port': [1, 65535],
  'telemetry.staleAfterMs': [250, 60000],
  'broadcast.hz': [1, 60],
  'broadcast.rawHz': [0.2, 20],
  'logging.intervalMs': [50, 3600000],
  'logging.retentionDays': [0, 3650],
  'logging.maxDbMB': [0, 100000],
  'logging.pruneEveryMin': [1, 1440],
  'server.port': [1, 65535],
};

function merge(base, patch, prefix = '') {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, def] of Object.entries(base)) {
    if (!patch || !(k in patch)) continue;
    const key = prefix ? `${prefix}.${k}` : k;
    const v = patch[k];
    if (def && typeof def === 'object') out[k] = merge(def, v, key);
    else if (typeof def === 'number') {
      const n = Number(v);
      if (Number.isFinite(n)) {
        const [lo, hi] = LIMITS[key] || [-Infinity, Infinity];
        out[k] = Math.min(hi, Math.max(lo, n));
      }
    } else if (typeof def === 'boolean') out[k] = !!v;
    else if (typeof def === 'string') out[k] = String(v);
  }
  return out;
}

export class Store {
  constructor(file, defaults, sanitize = (base, v) => merge(base, v)) {
    this.file = file;
    this.defaults = defaults;
    this.sanitize = sanitize;
    let saved = {};
    try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first run */ }
    this.value = this.sanitize(defaults, saved);
  }

  update(patch) {
    this.value = this.sanitize(this.defaults, typeof patch === 'object' && patch ? deepAssign(structuredClone(this.value), patch) : this.value);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.value, null, 2));
    return this.value;
  }
}

function deepAssign(target, patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object') deepAssign(target[k], v);
    else target[k] = v;
  }
  return target;
}

export { merge as mergeSettings };
