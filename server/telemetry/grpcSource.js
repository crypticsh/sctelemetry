// Live source: the game's local gRPC TelemetryStream.

import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { loadRoot, SERVICE } from './protoset.js';

const require = createRequire(import.meta.url);
const grpc = require('@grpc/grpc-js');

const TO_OBJECT = { longs: Number, enums: String, defaults: true, arrays: true, objects: false, oneofs: false };

export class GrpcSource extends EventEmitter {
  constructor({ host, ports, exePath, protosetPath, dataDir }) {
    super();
    // Ports to try in turn until one streams (the user.cfg port, then 2942).
    this.ports = ports?.length ? ports : [50051];
    this.port = this.ports[0];
    Object.assign(this, { host, exePath, protosetPath, dataDir });
    this.kind = 'game';
    this.connected = false;
    this.error = null;
    this.origin = null;
    this._stopped = false;
    this._call = null;
    this._client = null;
    this._timer = null;
  }

  _types() {
    if (this._svc) return this._svc;
    const { root, origin } = loadRoot(this);
    this.origin = origin;
    const service = root.lookupService(SERVICE);
    const m = (name) => {
      const method = service.methods[name];
      if (!method) return null;
      method.resolve();
      return { path: `/${SERVICE}/${name}`, req: method.resolvedRequestType, res: method.resolvedResponseType };
    };
    this._svc = { stream: m('TelemetryStream'), list: m('ListTriggerableActions'), trigger: m('TriggerGameAction') };
    return this._svc;
  }

  start() {
    this._stopped = false;
    this._connect();
  }

  _connect() {
    if (this._stopped) return;
    let svc;
    try {
      svc = this._types();
    } catch (e) {
      this._fail(e.message, 10000);
      return;
    }
    this._client?.close();
    this._client = new grpc.Client(`${this.host}:${this.port}`, grpc.credentials.createInsecure());
    const { stream } = svc;
    let got = false;
    const call = this._client.makeServerStreamRequest(
      stream.path,
      (o) => Buffer.from(stream.req.encode(stream.req.fromObject(o)).finish()),
      (buf) => stream.res.toObject(stream.res.decode(buf), TO_OBJECT),
      {},
    );
    this._call = call;
    call.on('data', (frame) => {
      got = true;
      if (!this.connected) { this.connected = true; this.error = null; this.emit('status'); }
      this.emit('frame', frame);
    });
    const done = (msg) => {
      if (this._call !== call) return;
      this._call = null;
      if (!got && this.ports.length > 1) {
        // Nothing on this port: try the next one at once; wait only after a full round.
        const i = (this.ports.indexOf(this.port) + 1) % this.ports.length;
        this.port = this.ports[i];
        this._client?.close();
        this._client = null;
        if (i !== 0) { clearTimeout(this._timer); this._timer = setTimeout(() => this._connect(), 50); return; }
      }
      this._fail(`${msg} (port${this.ports.length > 1 ? 's ' + this.ports.join(', ') : ' ' + this.port})`, 3000);
    };
    call.on('error', (e) => done(e.details || e.message));
    call.on('end', () => done('stream ended'));
  }

  _fail(msg, retryMs) {
    const changed = this.connected || this.error !== msg;
    this.connected = false;
    this.error = msg;
    if (changed) this.emit('status');
    clearTimeout(this._timer);
    if (!this._stopped) this._timer = setTimeout(() => this._connect(), retryMs);
  }

  _unary(which, obj) {
    const svc = this._types();
    const m = svc[which];
    if (!m) return Promise.reject(new Error(`This build has no ${which} method`));
    if (!this._client) this._client = new grpc.Client(`${this.host}:${this.port}`, grpc.credentials.createInsecure());
    return new Promise((resolve, reject) => {
      this._client.makeUnaryRequest(
        m.path,
        (o) => Buffer.from(m.req.encode(m.req.fromObject(o)).finish()),
        (buf) => m.res.toObject(m.res.decode(buf), TO_OBJECT),
        obj,
        { deadline: Date.now() + 3000 },
        (err, res) => (err ? reject(new Error(err.details || err.message)) : resolve(res)),
      );
    });
  }

  listActions() {
    return this._unary('list', {});
  }

  trigger(actionName, holdMs = 0) {
    return this._unary('trigger', holdMs ? { action_name: actionName, hold_ms: holdMs } : { action_name: actionName });
  }

  stop() {
    this._stopped = true;
    clearTimeout(this._timer);
    this._call?.cancel();
    this._call = null;
    this._client?.close();
    this._client = null;
    this.connected = false;
  }
}
