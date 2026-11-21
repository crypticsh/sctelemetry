// Read the telemetry API's protobuf definitions straight out of StarCitizen.exe.
//
// The game embeds its FileDescriptorProtos (sc/game/telemetry/v1/*.proto).
// Reading them from the installed exe keeps us in step with the build you run,
// also after a patch. Port of 7Hills Link's protoset.py. The result is cached
// in data/ per exe size + modified time.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const protobuf = require('protobufjs');
const descriptor = require('protobufjs/ext/descriptor');

export const SERVICE = 'sc.game.telemetry.v1.GameTelemetryService';
const NEEDLE = Buffer.from('sc/game/telemetry');

// FileDescriptorProto field number -> wire type (0 varint, 2 length-delimited)
const FDP_FIELDS = { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 2, 9: 2, 10: 0, 11: 0, 12: 2, 14: 0 };

function varint(b, i) {
  let result = 0, shift = 0;
  while (i < b.length) {
    const c = b[i++];
    result += (c & 0x7f) * 2 ** shift;
    if (!(c & 0x80)) return [result, i];
    shift += 7;
    if (shift > 63) break;
  }
  throw new Error('bad varint');
}

function encodeVarint(n) {
  const out = [];
  while (n > 0x7f) { out.push((n & 0x7f) | 0x80); n = Math.floor(n / 128); }
  out.push(n);
  return Buffer.from(out);
}

/** Follow fields from start while they look like a FileDescriptorProto. */
function walk(b, start, limit = 4 << 20) {
  let i = start;
  const end = Math.min(b.length, start + limit);
  let seenName = false;
  while (i < end) {
    let tag, j;
    try { [tag, j] = varint(b, i); } catch { break; }
    const field = Math.floor(tag / 8), wt = tag & 7;
    if (FDP_FIELDS[field] !== wt || (field === 1 && seenName)) break;
    try {
      if (wt === 0) [, j] = varint(b, j);
      else { let ln; [ln, j] = varint(b, j); j += ln; }
    } catch { break; }
    if (j > end) break;
    seenName ||= field === 1;
    i = j;
  }
  return b.subarray(start, i);
}

/** Scan a buffer (the exe) and return [{name, deps, bytes}] in dependency order. */
export function extractFromBuffer(data) {
  const found = new Map();
  let at = 0;
  for (;;) {
    const nameStart = data.indexOf(NEEDLE, at);
    if (nameStart < 0) break;
    at = nameStart + 1;
    for (const back of [2, 3]) {
      const s = nameStart - back;
      if (s < 0 || data[s] !== 0x0a) continue;
      let ln, j;
      try { [ln, j] = varint(data, s + 1); } catch { continue; }
      if (j !== nameStart) continue;
      if (!data.subarray(nameStart, nameStart + ln).toString('latin1').endsWith('.proto')) continue;
      const bytes = Buffer.from(walk(data, s));
      let fdp;
      try { fdp = descriptor.FileDescriptorProto.decode(bytes); } catch { continue; }
      const prev = found.get(fdp.name);
      if (!prev || bytes.length > prev.bytes.length) {
        found.set(fdp.name, { name: fdp.name, deps: fdp.dependency || [], bytes, fdp });
      }
    }
  }
  // Dependencies first.
  const ordered = [];
  const pending = new Map(found);
  while (pending.size) {
    let progressed = false;
    for (const [name, f] of pending) {
      if (f.deps.every((d) => ordered.some((o) => o.name === d) || !found.has(d))) {
        ordered.push(f); pending.delete(name); progressed = true;
      }
    }
    if (!progressed) { ordered.push(...pending.values()); break; }
  }
  return ordered;
}

/** Serialise files as a FileDescriptorSet (repeated field 1). */
export function toFileDescriptorSet(files) {
  const parts = [];
  for (const f of files) parts.push(Buffer.from([0x0a]), encodeVarint(f.bytes.length), f.bytes);
  return Buffer.concat(parts);
}

export function hasService(root) {
  try { return !!root.lookupService(SERVICE); } catch { return false; }
}

/** Build a protobufjs Root from FileDescriptorSet bytes. */
export function rootFromSet(setBytes) {
  const set = descriptor.FileDescriptorSet.decode(setBytes);
  const root = protobuf.Root.fromDescriptor(set, { keepCase: true });
  // Well-known types the game protos may import.
  for (const [file, json] of Object.entries(protobuf.common || {})) {
    if (!file.startsWith('google/protobuf/')) continue;
    try { root.addJSON(json.nested); } catch { /* already present */ }
  }
  root.resolveAll();
  return root;
}

/**
 * Load the API definitions: an explicit .protoset file wins, otherwise the
 * descriptors are read from the exe (cached under dataDir).
 */
export function loadRoot({ exePath, protosetPath, dataDir }) {
  if (protosetPath) {
    const root = rootFromSet(fs.readFileSync(protosetPath));
    if (!hasService(root)) throw new Error(`${protosetPath} has no ${SERVICE}`);
    return { root, origin: protosetPath };
  }
  if (!exePath || !fs.existsSync(exePath)) {
    throw new Error(`StarCitizen.exe not found at "${exePath}". Set the path in Settings → Telemetry source.`);
  }
  const st = fs.statSync(exePath);
  const cache = path.join(dataDir, `protoset-${st.size}-${Math.floor(st.mtimeMs / 1000)}.bin`);
  if (fs.existsSync(cache)) {
    try {
      const root = rootFromSet(fs.readFileSync(cache));
      if (hasService(root)) return { root, origin: `cache ${path.basename(cache)}` };
    } catch { /* re-extract */ }
  }
  const files = extractFromBuffer(fs.readFileSync(exePath));
  const set = toFileDescriptorSet(files);
  const root = rootFromSet(set);
  if (!hasService(root)) throw new Error('This Star Citizen build has no telemetry service');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(cache, set);
  return { root, origin: `extracted from exe (${files.length} files)` };
}
