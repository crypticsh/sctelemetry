// SC Telemetry server: reads the game's local telemetry, logs it, and serves
// the cockpit screens to phones and tablets on your network.

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { DANGEROUS, DEFAULT_SETTINGS, Store } from './config.js';
import { Recorder } from './recorder.js';
import { GrpcSource } from './telemetry/grpcSource.js';
import { normalize } from './telemetry/normalize.js';
import { SimSource } from './telemetry/simSource.js';
import { gameFiles, portsFor, setupStatus, applyCfg, missing as cfgMissing, detectExe } from './gamefiles.js';
import { Places } from './gamelog/places.js';
import { Sessions } from './gamelog/sessions.js';
import { GameLogFollower } from './gamelog/follower.js';
import { stateOf, Steady, describe } from './gamelog/situation.js';
import { Orders } from './orders.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const DATA = path.resolve(args.data || process.env.SCT_DATA || path.join(ROOT, 'data'));
const DIST = path.join(ROOT, 'web', 'dist');
fs.mkdirSync(DATA, { recursive: true });

const settings = new Store(path.join(DATA, 'settings.json'), DEFAULT_SETTINGS);
const layouts = { file: path.join(DATA, 'layouts.json'), value: null };
try { layouts.value = JSON.parse(fs.readFileSync(layouts.file, 'utf8')); } catch { /* client default */ }
const S = () => settings.value;

// The game isn't where the settings say: look for it on the usual drives and folders.
if (!fs.existsSync(S().telemetry.exePath)) {
  const found = detectExe();
  if (found) {
    console.log(`  found the game at ${found}`);
    settings.update({ telemetry: { exePath: found } });
  }
}

const recorder = new Recorder(path.join(DATA, 'telemetry.db'), S);
recorder.prune();
const sessions = new Sessions(recorder.db, S);
const orders = new Orders(recorder.db, S);
sessions.hooks = {
  onOrder(o, runKey, source) {
    // Orders found in old logs (logbackups) more than a week back are filed as finished.
    const old = source === 'backup' && Date.now() / 1000 - o.at > 7 * 86400;
    if (orders.addFromLog(o, runKey, places?.nameOf(o.place), old)) ordersChanged();
  },
};
recorder.onPrune = () => { sessions.prune(); orders.prune(); };
recorder.prune();

function ordersChanged() {
  for (const c of clients) send(c.ws, { type: 'orders' });
}

// ---------------------------------------------------------------- source
let source = null;
let latest = null; // { n, raw, at }
let fps = 0, frameCount = 0, fpsWindow = Date.now();

function startSource() {
  source?.stop();
  source?.removeAllListeners();
  const t = S().telemetry;
  const kind = args.source || t.source;
  source = kind === 'sim'
    ? new SimSource({ logFile: SIM_LOG })
    : new GrpcSource({ host: t.host, ports: portsFor(S()), exePath: t.exePath, protosetPath: t.protosetPath, dataDir: DATA });
  source.on('frame', onFrame);
  source.on('status', () => {
    recorder.mark('link', source.connected ? 'up' : 'lost');
    broadcastStatus();
  });
  source.start();
  broadcastStatus();
  startGameLog();
}

// ---------------------------------------------------------------- Game.log
const SIM_LOG = path.join(DATA, 'sim', 'Game.log');
let follower = null;
let places = null;
const steady = new Steady();
let situation = null;
let locJson = '';

function gameLogPath() {
  const kind = args.source || S().telemetry.source;
  if (kind === 'sim' && !S().gamelog.path) return SIM_LOG;
  return gameFiles(S()).gameLog;
}

function startGameLog() {
  const file = S().gamelog.enabled ? gameLogPath() : null;
  if (follower && follower.file === file) return;
  follower?.stop();
  follower = null;
  places = Places.load(S().gamelog.placesPath || path.join(DATA, 'places.json'));
  if (!file) { pushLocation(true); return; }
  follower = new GameLogFollower({ file, places, sessions });
  follower.isRunning = () => location().gameRunning;
  follower.on('change', () => pushLocation());
  follower.start();
  if (S().gamelog.importBackups && file !== SIM_LOG) setTimeout(() => { try { follower?.importBackups(); } catch (e) { console.error(e); } }, 2000);
}

function location() {
  const snap = follower?.tracker?.snapshot() || null;
  const ship = latest?.n?.ship;
  const live = !!source?.connected && latest && Date.now() - latest.at < S().telemetry.staleAfterMs;
  const quiet = follower ? follower.quietFor() : Infinity;
  const running = !!(snap?.run && !snap.run.ended && (quiet < 180 || live));
  return {
    enabled: !!follower,
    file: follower?.file || null,
    error: follower?.error || null,
    places: places?.origin || null,
    gameRunning: running,
    ...(snap || {}),
    situation: live ? situation : null,
    line: live && snap ? describe(situation, snap.confidence, snap.placeName, ship?.radarAlt ?? ship?.altitude) : null,
  };
}

let lastLocPush = 0, locTimer = null;
function pushLocation(force = false) {
  const now = Date.now();
  if (!force && now - lastLocPush < 250) {
    if (!locTimer) locTimer = setTimeout(() => { locTimer = null; pushLocation(); }, 260);
    return;
  }
  lastLocPush = now;
  const loc = location();
  const j = JSON.stringify(loc);
  if (j === locJson && !force) return;
  locJson = j;
  for (const c of clients) send(c.ws, { type: 'loc', loc });
}

function onFrame(raw) {
  const now = Date.now();
  const n = normalize(raw, { t: now, source: source.kind });
  latest = { n, raw, at: now };
  const st = steady.feed(stateOf(n), now);
  if (st !== situation) { situation = st; pushLocation(); }
  frameCount++;
  if (now - fpsWindow >= 2000) { fps = (frameCount * 1000) / (now - fpsWindow); frameCount = 0; fpsWindow = now; }
  try { recorder.onFrame(n, raw); } catch (e) { console.error('recorder:', e.message); }
  if (n.events.length) for (const c of clients) c.pendingEvents.push(...n.events);
}

function status() {
  const stale = !latest || Date.now() - latest.at > S().telemetry.staleAfterMs;
  return {
    source: source?.kind,
    connected: !!source?.connected && !stale,
    linked: !!source?.connected,
    error: source?.error || null,
    origin: source?.origin ? `${source.origin}${source.kind === 'game' && source.connected ? ` · port ${source.port}` : ''}` : null,
    fps: Math.round(fps * 10) / 10,
    lastFrameAt: latest?.at || null,
    clients: clients.size,
    actions: S().actions.enabled,
  };
}

// ---------------------------------------------------------------- websocket
const clients = new Set();

function send(ws, obj) {
  if (ws.readyState === 1 && ws.bufferedAmount < 1 << 20) ws.send(JSON.stringify(obj));
}

function broadcastStatus() {
  const st = status();
  for (const c of clients) send(c.ws, { type: 'status', status: st });
}

// One loop pushes the newest frame to every screen at its own rate.
let lastStatusPush = 0;
setInterval(() => {
  const now = Date.now();
  if (now - lastStatusPush > 1000) { lastStatusPush = now; broadcastStatus(); pushLocation(); }
  if (!latest) return;
  for (const c of clients) {
    if (c.sentAt !== latest.at && now - c.lastSend >= 1000 / Math.min(S().broadcast.hz, c.hz || 60)) {
      c.lastSend = now;
      c.sentAt = latest.at;
      const msg = { type: 'frame', n: latest.n };
      if (c.pendingEvents.length) { msg.events = c.pendingEvents.splice(0); }
      if (c.raw && now - c.lastRaw >= 1000 / S().broadcast.rawHz) { c.lastRaw = now; msg.raw = latest.raw; }
      send(c.ws, msg);
    }
  }
}, 1000 / 60);

// ---------------------------------------------------------------- http
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };

function json(res, code, obj) {
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function body(req, limit = 2 << 20) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks)) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  let file = path.normalize(path.join(DIST, decodeURIComponent(pathname)));
  if (!file.startsWith(DIST)) { res.writeHead(403).end(); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  if (!fs.existsSync(file)) {
    res.writeHead(503, { 'content-type': 'text/plain' }).end('Web app not built. Run `npm run build` first (or `npm run dev`).');
    return;
  }
  const hashed = pathname.startsWith('/assets/');
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

const time = (v, d) => (v == null || v === '' ? d : /^\d+$/.test(v) ? +v : Date.parse(v) || d);

async function api(req, res, url) {
  const p = url.pathname;
  const q = url.searchParams;
  if (p === '/api/status') return json(res, 200, { ...status(), log: recorder.stats(), version: '0.1.0' });
  if (p === '/api/settings' && req.method === 'GET') return json(res, 200, { settings: S(), defaults: DEFAULT_SETTINGS });
  if (p === '/api/settings' && req.method === 'PUT') {
    const before = JSON.stringify(S().telemetry), beforeLog = JSON.stringify(S().gamelog);
    const v = settings.update(await body(req));
    if (JSON.stringify(v.telemetry) !== before && !args.source) startSource();
    else if (JSON.stringify(v.gamelog) !== beforeLog) { follower?.stop(); follower = null; startGameLog(); }
    recorder.prune();
    return json(res, 200, { settings: v });
  }
  if (p === '/api/layouts' && req.method === 'GET') return json(res, 200, { layouts: layouts.value });
  if (p === '/api/layouts' && req.method === 'PUT') {
    layouts.value = (await body(req)).layouts ?? null;
    fs.writeFileSync(layouts.file, JSON.stringify(layouts.value, null, 2));
    for (const c of clients) send(c.ws, { type: 'layouts', layouts: layouts.value });
    return json(res, 200, { ok: true });
  }
  if (p === '/api/raw') return json(res, 200, latest ? { t: latest.at, raw: latest.raw, n: latest.n } : { t: null });
  if (p === '/api/history') {
    const to = time(q.get('to'), Date.now());
    const from = time(q.get('from'), to - 3600000);
    const ch = q.get('channels')?.split(',').filter(Boolean);
    return json(res, 200, recorder.history(from, to, ch, Math.min(5000, +q.get('points') || 1500)));
  }
  if (p === '/api/events') {
    const to = time(q.get('to'), Date.now());
    const from = time(q.get('from'), to - 3600000);
    const limit = Math.min(5000, +q.get('limit') || 500);
    const loc = sessions.events(from / 1000, to / 1000, limit).map((e) => ({ t: Math.round(e.t * 1000), kind: 'location', name: e.kind, value: e.text }));
    return json(res, 200, [...recorder.events(from, to, limit), ...loc].sort((a, b) => b.t - a.t).slice(0, limit));
  }
  if (p === '/api/location') return json(res, 200, location());
  if (p === '/api/sessions') {
    const to = time(q.get('to'), Date.now()) / 1000;
    const from = time(q.get('from'), Date.now() - 30 * 86400000) / 1000;
    return json(res, 200, { totals: sessions.totals(), runs: sessions.history(from, to), places: sessions.topPlaces(from, to), events: sessions.events(from, to, 200), trades: sessions.trades(from, to), trips: sessions.trips(from, to), location: location() });
  }
  if (p === '/api/sessions/import' && req.method === 'POST') {
    if (!follower) return json(res, 400, { error: 'Game.log reading is off or no game folder is set.' });
    return json(res, 200, follower.importBackups());
  }
  if (p === '/api/sessions/clear' && req.method === 'POST') {
    sessions.clear();
    follower?.stop(); follower = null; startGameLog();
    return json(res, 200, { ok: true });
  }
  if (p === '/api/orders' && req.method === 'GET') {
    const since = Date.now() / 1000 - 7 * 86400;
    return json(res, 200, { orders: orders.list(), elevator: sessions.events(since, Date.now() / 1000, 400).filter((e) => e.kind === 'cargo').slice(0, 12) });
  }
  if (p === '/api/orders' && req.method === 'POST') {
    const o = await body(req);
    if (!o.location && location().placeName) { o.location = location().placeName; o.place_id = location().place; }
    try { const id = orders.add(o); ordersChanged(); return json(res, 200, { id }); } catch (e) { return json(res, 400, { error: e.message }); }
  }
  {
    const m = /^\/api\/orders\/(\d+)$/.exec(p);
    if (m && req.method === 'PATCH') {
      try { orders.update(+m[1], await body(req)); ordersChanged(); return json(res, 200, { ok: true }); } catch (e) { return json(res, 400, { error: e.message }); }
    }
    if (m && req.method === 'DELETE') { orders.remove(+m[1]); ordersChanged(); return json(res, 200, { ok: true }); }
  }
  if (p === '/api/data' && req.method === 'GET') {
    const st = recorder.stats();
    const c = sessions.counts();
    const ev = recorder.db.prepare('SELECT COUNT(*) n, MIN(t) first FROM events').get();
    return json(res, 200, {
      sizeBytes: st.sizeBytes,
      kinds: {
        samples: { n: st.samples, first: st.first },
        flightEvents: { n: ev.n, first: ev.first },
        locationEvents: { n: c.locationEvents.n, first: c.locationEvents.first && c.locationEvents.first * 1000 },
        visits: { n: c.visits.n, first: c.visits.first && c.visits.first * 1000 },
        sessions: { n: c.sessions.n, first: c.sessions.first && c.sessions.first * 1000 },
        orders: { n: orders.count().n, first: orders.count().first && orders.count().first * 1000 },
        trades: { n: c.trades.n, first: c.trades.first && c.trades.first * 1000 },
        trips: { n: c.trips.n, first: c.trips.first && c.trips.first * 1000 },
      },
    });
  }
  if (p === '/api/data/purge' && req.method === 'POST') {
    const { kind } = await body(req);
    if (kind === 'samples') recorder.db.exec('DELETE FROM samples');
    else if (kind === 'flightEvents') recorder.db.exec('DELETE FROM events');
    else if (['locationEvents', 'visits', 'sessions', 'trades', 'trips'].includes(kind)) sessions.purge(kind);
    else if (kind === 'orders') { orders.purgeClosed(); ordersChanged(); }
    else return json(res, 400, { error: 'unknown kind' });
    return json(res, 200, { ok: true });
  }
  if (p === '/api/setup' && req.method === 'GET') return json(res, 200, setupStatus(S()));
  if (p === '/api/setup/usercfg' && req.method === 'POST') {
    const { userCfg, channelDir } = gameFiles(S());
    if (!channelDir || !fs.existsSync(channelDir)) return json(res, 400, { error: 'Game folder not found. Check the StarCitizen.exe path.' });
    const changes = cfgMissing(userCfg, S().actions.enabled);
    if (!Object.keys(changes).length) return json(res, 200, { changed: [], status: setupStatus(S()) });
    try { applyCfg(userCfg, changes); } catch (e) { return json(res, 500, { error: `Could not write user.cfg: ${e.message}` }); }
    return json(res, 200, { changed: Object.keys(changes), status: setupStatus(S()) });
  }
  if (p === '/api/log/stats') return json(res, 200, recorder.stats());
  if (p === '/api/log/raw') return json(res, 200, recorder.rawAt(time(q.get('t'), Date.now())));
  if (p === '/api/log/clear' && req.method === 'POST') { recorder.clear(); return json(res, 200, recorder.stats()); }
  if (p === '/api/log/export.csv') {
    const to = time(q.get('to'), Date.now());
    const from = time(q.get('from'), 0);
    res.writeHead(200, { 'content-type': 'text/csv', 'content-disposition': `attachment; filename="sc-telemetry-${new Date(from).toISOString().slice(0, 10)}.csv"` });
    for (const line of recorder.csv(from, to)) if (!res.write(line)) await new Promise((r) => res.once('drain', r));
    return res.end();
  }
  if (p === '/api/actions' && req.method === 'GET') {
    try { return json(res, 200, { enabled: S().actions.enabled, ...(await source.listActions()) }); } catch (e) { return json(res, 200, { enabled: S().actions.enabled, actions: [], error: e.message }); }
  }
  if (p === '/api/action' && req.method === 'POST') {
    const { name, holdMs } = await body(req);
    const a = S().actions;
    if (!a.enabled) return json(res, 403, { error: 'Actions are off. Turn them on in Settings → Actions.' });
    if (typeof name !== 'string' || !/^[a-z0-9_]+$/i.test(name)) return json(res, 400, { error: 'bad action name' });
    if (DANGEROUS.test(name) && !a.allowDangerous) return json(res, 403, { error: `${name} is blocked. Allow dangerous actions in Settings first.` });
    try {
      await source.trigger(name, Math.max(0, Math.min(10000, +holdMs || 0)));
      recorder.mark('action', name);
      return json(res, 200, { ok: true });
    } catch (e) { return json(res, 502, { error: e.message }); }
  }
  json(res, 404, { error: 'not found' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else if (req.method === 'GET' || req.method === 'HEAD') serveStatic(req, res, url.pathname);
    else res.writeHead(405).end();
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, 500, { error: e.message });
  }
});

const wss = new WebSocketServer({ server, path: '/ws', perMessageDeflate: false });
wss.on('connection', (ws) => {
  const c = { ws, hz: 60, raw: false, lastSend: 0, lastRaw: 0, sentAt: null, pendingEvents: [] };
  clients.add(c);
  send(ws, { type: 'hello', status: status(), layouts: layouts.value, loc: location() });
  if (latest) send(ws, { type: 'frame', n: latest.n });
  ws.on('message', (m) => {
    try {
      const msg = JSON.parse(m);
      if (msg.type === 'sub') { c.raw = !!msg.raw; if (msg.hz) c.hz = Math.max(1, Math.min(60, +msg.hz)); }
    } catch { /* ignore */ }
  });
  ws.on('close', () => clients.delete(c));
  ws.on('error', () => clients.delete(c));
});

const port = +(args.port || process.env.PORT || S().server.port);
server.listen(port, '0.0.0.0', () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log(`SC Telemetry on http://localhost:${port}`);
  for (const ip of ips) console.log(`  on your network: http://${ip}:${port}`);
  console.log(`  data: ${DATA}`);
  startSource();
});

function shutdown() {
  source?.stop();
  follower?.stop();
  recorder.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
