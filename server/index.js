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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const DATA = path.resolve(args.data || process.env.SCT_DATA || path.join(ROOT, 'data'));
const DIST = path.join(ROOT, 'web', 'dist');
fs.mkdirSync(DATA, { recursive: true });

const settings = new Store(path.join(DATA, 'settings.json'), DEFAULT_SETTINGS);
const layouts = { file: path.join(DATA, 'layouts.json'), value: null };
try { layouts.value = JSON.parse(fs.readFileSync(layouts.file, 'utf8')); } catch { /* client default */ }
const S = () => settings.value;

const recorder = new Recorder(path.join(DATA, 'telemetry.db'), S);
recorder.prune();

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
    ? new SimSource()
    : new GrpcSource({ host: t.host, port: t.port, exePath: t.exePath, protosetPath: t.protosetPath, dataDir: DATA });
  source.on('frame', onFrame);
  source.on('status', () => {
    recorder.mark('link', source.connected ? 'up' : 'lost');
    broadcastStatus();
  });
  source.start();
  broadcastStatus();
}

function onFrame(raw) {
  const now = Date.now();
  const n = normalize(raw, { t: now, source: source.kind });
  latest = { n, raw, at: now };
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
    origin: source?.origin || null,
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
  if (now - lastStatusPush > 1000) { lastStatusPush = now; broadcastStatus(); }
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
    const before = JSON.stringify(S().telemetry);
    const v = settings.update(await body(req));
    if (JSON.stringify(v.telemetry) !== before && !args.source) startSource();
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
    return json(res, 200, recorder.events(time(q.get('from'), to - 3600000), to, Math.min(5000, +q.get('limit') || 500)));
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
  send(ws, { type: 'hello', status: status(), layouts: layouts.value });
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
  recorder.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
