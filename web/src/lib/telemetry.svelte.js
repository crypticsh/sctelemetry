// Live link to the server: newest frame, link status and game events.

export const tele = $state({
  n: null, // normalized frame (see server/telemetry/normalize.js)
  raw: null, // raw frame, only while something asks for it
  status: { connected: false, linked: false, source: null, error: null, fps: 0 },
  online: false, // websocket to our own server
  layouts: undefined, // shared layouts from the server (undefined = not loaded yet)
  loc: null, // where you are, from Game.log (see server/gamelog)
  lastAt: 0,
});

const listeners = new Set();
const frameListeners = new Set();
/** Called with every normalized frame as it arrives: fn(n). */
export function onFrame(fn) {
  frameListeners.add(fn);
  return () => frameListeners.delete(fn);
}
/** Subscribe to game events / state-change pulses: fn(eventName). */
export function onEvent(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let ws = null;
let rawWanted = 0;
let retry = 500;

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => {
    tele.online = true;
    retry = 500;
    sub();
  };
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.type === 'frame') {
      tele.n = msg.n;
      tele.lastAt = performance.now();
      if (msg.raw) tele.raw = msg.raw;
      for (const fn of frameListeners) fn(msg.n);
      if (msg.events) for (const e of msg.events) for (const fn of listeners) fn(e);
    } else if (msg.type === 'status') {
      tele.status = msg.status;
    } else if (msg.type === 'hello') {
      tele.status = msg.status;
      tele.layouts = msg.layouts ?? null;
      if (msg.loc) tele.loc = msg.loc;
    } else if (msg.type === 'loc') {
      tele.loc = msg.loc;
    } else if (msg.type === 'layouts') {
      tele.layouts = msg.layouts ?? null;
    }
  };
  ws.onclose = () => {
    tele.online = false;
    tele.status = { ...tele.status, connected: false };
    setTimeout(connect, retry);
    retry = Math.min(5000, retry * 1.6);
  };
  ws.onerror = () => ws.close();
}

function sub() {
  if (ws?.readyState === 1) ws.send(JSON.stringify({ type: 'sub', raw: rawWanted > 0 }));
}

/** Ask the server to include raw frames; returns a release function. */
export function wantRaw() {
  rawWanted++;
  sub();
  return () => {
    rawWanted--;
    sub();
  };
}

if (typeof window !== 'undefined') connect();
