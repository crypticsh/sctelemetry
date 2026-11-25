// Files next to the game: the channel folder, user.cfg and Game.log.
// user.cfg is only written when you press the button in Settings.

import fs from 'node:fs';
import path from 'node:path';

export const LIVE_PORT = 2942; // 4.x LIVE ignores grpc.client.server.port and always serves here
export const ENV_NAME = 'GRPC_CLIENT_SERVER_ENABLED';
export const WANTED = {
  'grpc.client.server.enabled': '1',
  'grpc.client.server.port': '50051',
  'server.game.telemetry.enabled': '1',
};
const ACTIONS_KEY = 'server.game.telemetry.trigger.actions.enabled';

/** Works with Windows paths even when this runs elsewhere (tests). */
const P = (p) => (/^[a-zA-Z]:\\|\\\\/.test(p) ? path.win32 : path);

/** ...\StarCitizen\LIVE\Bin64\StarCitizen.exe → ...\StarCitizen\LIVE */
export function channelDir(exePath) {
  if (!exePath) return null;
  const p = P(exePath);
  const bin = p.dirname(exePath);
  return p.basename(bin).toLowerCase() === 'bin64' ? p.dirname(bin) : bin;
}

export function gameFiles(settings) {
  const dir = channelDir(settings.telemetry.exePath);
  const p = P(dir || '');
  return {
    channelDir: dir,
    channel: dir ? p.basename(dir).toUpperCase() : null,
    userCfg: dir ? p.join(dir, 'user.cfg') : null,
    gameLog: settings.gamelog.path || (dir ? p.join(dir, 'Game.log') : null),
  };
}

const LINE = /^\s*([A-Za-z0-9_.\-]+)\s*=?\s*(.*?)\s*$/;
const isComment = (s) => !s || /^(--|;|#|\/\/)/.test(s);

export function readCfg(file) {
  const out = {};
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch { return out; }
  for (const raw of text.split(/\r?\n/)) {
    const s = raw.trim();
    if (isComment(s)) continue;
    const m = LINE.exec(s);
    if (m) out[m[1].toLowerCase()] = m[2];
  }
  return out;
}

/** Ports to try, in order: the user.cfg port (or the setting), then 2942. */
export function portsFor(settings) {
  const t = settings.telemetry;
  let first = t.port;
  if (t.readUserCfgPort) {
    const { userCfg } = gameFiles(settings);
    const v = parseInt(readCfg(userCfg)['grpc.client.server.port'], 10);
    if (v >= 1 && v <= 65535) first = v;
  }
  const out = [first];
  if (t.tryLivePort && !out.includes(LIVE_PORT)) out.push(LIVE_PORT);
  return out;
}

export function missing(file, withActions = false) {
  const cur = readCfg(file);
  const out = {};
  for (const [k, v] of Object.entries(WANTED)) {
    if (k === 'grpc.client.server.port') { if (!(k in cur)) out[k] = v; } else if (cur[k] !== v) out[k] = v;
  }
  if (withActions && cur[ACTIONS_KEY] !== '1') out[ACTIONS_KEY] = '1';
  return out;
}

/** Add or fix only the lines we need; comments and everything else stay. */
export function applyCfg(file, changes) {
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch { /* new file */ }
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text ? text.split(/\r?\n/) : [];
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  const done = new Set();
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i].trim();
    if (isComment(s)) continue;
    const m = LINE.exec(s);
    const key = m?.[1].toLowerCase();
    if (key && key in changes) { lines[i] = `${key} = ${changes[key]}`; done.add(key); }
  }
  const extra = Object.entries(changes).filter(([k]) => !done.has(k)).map(([k, v]) => `${k} = ${v}`);
  if (extra.length) {
    if (lines.length && lines[lines.length - 1].trim()) lines.push('');
    lines.push('-- SC Telemetry: game telemetry server', ...extra);
  }
  fs.writeFileSync(file, lines.join(eol) + eol);
}

export function setupStatus(settings) {
  const f = gameFiles(settings);
  const exists = (p) => { try { return !!p && fs.existsSync(p); } catch { return false; } };
  return {
    ...f,
    exeFound: exists(settings.telemetry.exePath),
    userCfgFound: exists(f.userCfg),
    gameLogFound: exists(f.gameLog),
    cfg: f.userCfg ? readCfg(f.userCfg) : {},
    missing: f.userCfg ? missing(f.userCfg, settings.actions.enabled) : {},
    ports: portsFor(settings),
    // Only meaningful on the gaming PC, and only what this server process inherited at start.
    envVar: process.platform === 'win32' ? (process.env[ENV_NAME] || null) : null,
  };
}

// Where people usually install the game. Checked on every drive letter.
const ROOTS = [
  'Program Files\\Roberts Space Industries\\StarCitizen',
  'Roberts Space Industries\\StarCitizen',
  'Games\\Roberts Space Industries\\StarCitizen',
  'StarCitizen\\StarCitizen',
  'StarCitizen',
  'Games\\StarCitizen',
];
const CHANNELS = ['LIVE', 'PTU', 'EPTU', 'TECH-PREVIEW', 'HOTFIX'];

/** Find StarCitizen.exe (Windows only). Prefers the given channel. */
export function detectExe(prefer = 'LIVE') {
  if (process.platform !== 'win32') return null;
  const order = [prefer, ...CHANNELS.filter((c) => c !== prefer)];
  for (const ch of order) {
    for (const d of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
      for (const r of ROOTS) {
        const exe = path.win32.join(`${d}:\\`, r, ch, 'Bin64', 'StarCitizen.exe');
        try { if (fs.existsSync(exe)) return exe; } catch { /* drive not ready */ }
      }
    }
  }
  return null;
}
