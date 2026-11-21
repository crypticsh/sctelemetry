import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startFakeGame } from '../scripts/fake-game.js';
import { GrpcSource } from '../server/telemetry/grpcSource.js';
import { extractFromBuffer } from '../server/telemetry/protoset.js';
import { normalize } from '../server/telemetry/normalize.js';

test('extracts descriptors from an exe-like blob', async () => {
  const { exe, server } = await startFakeGame(50061);
  server.forceShutdown();
  const files = extractFromBuffer(exe);
  assert.equal(files.length, 1);
  assert.equal(files[0].name, 'sc/game/telemetry/v1/telemetry.proto');
});

test('streams, normalizes and triggers actions over gRPC', async () => {
  const { exe, server, port } = await startFakeGame(50062);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sct-'));
  const exePath = path.join(dir, 'StarCitizen.exe');
  fs.writeFileSync(exePath, exe);
  const src = new GrpcSource({ host: '127.0.0.1', port, exePath, dataDir: dir });
  const frame = await new Promise((resolve, reject) => {
    src.once('frame', resolve);
    src.on('status', () => src.error && reject(new Error(src.error)));
    src.start();
  });
  const n = normalize(frame);
  assert.equal(n.ship.present, true);
  assert.equal(n.ship.className, 'DRAK_Buccaneer');
  assert.equal(n.ship.gear, true);
  assert.equal(n.ship.ifcs.coupled, true);
  assert.equal(n.ship.shields.faces.length, 4);
  assert.equal(n.weapons.noise, 8);
  assert.ok(fs.readdirSync(dir).some((f) => f.startsWith('protoset-')), 'protoset cached');
  const list = await src.listActions();
  assert.ok(list.actions.length > 5);
  await src.trigger('v_toggle_landing_system');
  src.stop();
  server.forceShutdown();
});

test('normalize survives empty and on-foot frames', () => {
  const n = normalize({ actor: { vitals: { health: { current: 50, max: 100 } } } });
  assert.equal(n.ship.present, false);
  assert.equal(n.player.health, 0.5);
  assert.doesNotThrow(() => normalize(undefined));
});
