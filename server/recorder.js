// Flight data recorder: numeric samples at a set interval, plus an event log
// of state changes, in SQLite (node:sqlite, built into Node 22.13+).

import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { CHANNELS, DISCRETES } from './telemetry/normalize.js';

export class Recorder {
  constructor(file, getSettings) {
    this.file = file;
    this.getSettings = getSettings;
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS samples (t INTEGER NOT NULL, d TEXT NOT NULL, raw TEXT);
      CREATE INDEX IF NOT EXISTS samples_t ON samples (t);
      CREATE TABLE IF NOT EXISTS events (t INTEGER NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL, value TEXT);
      CREATE INDEX IF NOT EXISTS events_t ON events (t);
    `);
    this.q = {
      insSample: this.db.prepare('INSERT INTO samples (t, d, raw) VALUES (?, ?, ?)'),
      insEvent: this.db.prepare('INSERT INTO events (t, kind, name, value) VALUES (?, ?, ?, ?)'),
      range: this.db.prepare('SELECT t, d FROM samples WHERE t >= ? AND t <= ? ORDER BY t'),
      events: this.db.prepare('SELECT t, kind, name, value FROM events WHERE t >= ? AND t <= ? ORDER BY t DESC LIMIT ?'),
      bounds: this.db.prepare('SELECT MIN(t) AS first, MAX(t) AS last, COUNT(*) AS n FROM samples'),
      evCount: this.db.prepare('SELECT COUNT(*) AS n FROM events'),
      rawAt: this.db.prepare('SELECT t, raw FROM samples WHERE t <= ? AND raw IS NOT NULL ORDER BY t DESC LIMIT 1'),
    };
    this.lastSampleAt = 0;
    this.lastSampleKey = '';
    this.prevDiscrete = null;
    this.lastPrune = 0;
  }

  /** Called on every frame; decides itself what to keep. */
  onFrame(n, raw) {
    const s = this.getSettings().logging;
    if (!s.enabled) return;
    const now = n.t;
    if (s.logEvents) this._events(n, now);
    if (s.onlyWhenSeated && !n.ship.present) return;
    if (now - this.lastSampleAt < s.intervalMs) return;
    const d = {};
    for (const [k, f] of Object.entries(CHANNELS)) {
      const v = f(n);
      if (v != null && Number.isFinite(v)) d[k] = Math.round(v * 1000) / 1000;
    }
    const key = JSON.stringify(d);
    if (s.onlyOnChange && key === this.lastSampleKey) return;
    this.lastSampleAt = now;
    this.lastSampleKey = key;
    this.q.insSample.run(now, key, s.logFullFrames ? JSON.stringify(raw) : null);
    if (now - this.lastPrune > s.pruneEveryMin * 60000) this.prune();
  }

  _events(n, now) {
    const cur = {};
    for (const [k, f] of Object.entries(DISCRETES)) cur[k] = f(n);
    for (const [k, v] of Object.entries(n.ship.annunciators || {})) cur[`warn_${k}`] = v;
    if (this.prevDiscrete) {
      for (const [k, v] of Object.entries(cur)) {
        if (v !== this.prevDiscrete[k] && !(v == null && this.prevDiscrete[k] === undefined)) {
          this.q.insEvent.run(now, k.startsWith('warn_') ? 'warning' : 'state', k, v == null ? null : String(v));
        }
      }
    }
    this.prevDiscrete = cur;
    for (const e of n.events) this.q.insEvent.run(now, 'game', String(e), null);
  }

  /** Mark connection changes in the event log. */
  mark(name, value) {
    if (!this.getSettings().logging.logEvents) return;
    this.q.insEvent.run(Date.now(), 'system', name, value == null ? null : String(value));
    if (name === 'link' && value === 'lost') this.prevDiscrete = null;
  }

  prune() {
    const s = this.getSettings().logging;
    this.lastPrune = Date.now();
    if (s.retentionDays > 0) {
      this.db.prepare('DELETE FROM samples WHERE t < ?').run(Date.now() - s.retentionDays * 86400000);
    }
    const evDays = this.getSettings().retention?.flightEventsDays ?? s.retentionDays;
    if (evDays > 0) this.db.prepare('DELETE FROM events WHERE t < ?').run(Date.now() - evDays * 86400000);
    this.onPrune?.();
    if (s.maxDbMB > 0) {
      for (let i = 0; i < 20 && this.sizeBytes() > s.maxDbMB * 1048576; i++) {
        const { n } = this.q.bounds.get();
        if (!n) break;
        // Drop the oldest 10% of samples (and events before the new start).
        this.db.prepare('DELETE FROM samples WHERE rowid IN (SELECT rowid FROM samples ORDER BY t LIMIT ?)').run(Math.max(1, Math.floor(n / 10)));
        const { first } = this.q.bounds.get();
        if (first) this.db.prepare('DELETE FROM events WHERE t < ?').run(first);
        this.db.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM;');
      }
    }
    this.db.exec('PRAGMA wal_checkpoint(PASSIVE);');
  }

  sizeBytes() {
    let total = 0;
    for (const f of [this.file, `${this.file}-wal`]) {
      try { total += fs.statSync(f).size; } catch { /* missing */ }
    }
    return total;
  }

  stats() {
    const b = this.q.bounds.get();
    return { first: b.first, last: b.last, samples: b.n, events: this.q.evCount.get().n, sizeBytes: this.sizeBytes() };
  }

  /** Samples in [from, to], bucketed down to about `points` rows (min/max kept per bucket). */
  history(from, to, channels, points = 1500) {
    const rows = this.q.range.all(from, to);
    const want = channels?.length ? channels : Object.keys(CHANNELS);
    const out = { t: [], ...Object.fromEntries(want.map((c) => [c, []])) };
    if (!rows.length) return out;
    const bucketMs = Math.max(1, (to - from) / Math.max(10, points / 2));
    let bucket = null;
    const flush = () => {
      if (!bucket) return;
      // Emit min and max (in time order) so spikes survive downsampling.
      const pts = bucket.rows.length <= 2 ? bucket.rows : [bucket.rows[0], bucket.rows[bucket.rows.length - 1]];
      if (bucket.rows.length > 2) {
        for (const c of want) {
          let lo = null, hi = null;
          for (const r of bucket.rows) {
            const v = r.d[c];
            if (v == null) continue;
            if (lo == null || v < lo.v) lo = { v, t: r.t };
            if (hi == null || v > hi.v) hi = { v, t: r.t };
          }
          pts[0] = { ...pts[0], d: { ...pts[0].d, [c]: (lo && hi && lo.t > hi.t ? hi : lo)?.v ?? null } };
          pts[1] = { ...pts[1], d: { ...pts[1].d, [c]: (lo && hi && lo.t > hi.t ? lo : hi)?.v ?? null } };
        }
      }
      for (const r of pts) {
        out.t.push(r.t / 1000);
        for (const c of want) out[c].push(r.d[c] ?? null);
      }
    };
    let prevT = null;
    const gap = Math.max(bucketMs * 2, this.getSettings().logging.intervalMs * 5);
    for (const row of rows) {
      const r = { t: row.t, d: JSON.parse(row.d) };
      // Break the line where recording stopped (e.g. you left the seat).
      if (prevT != null && r.t - prevT > gap) {
        flush(); bucket = null;
        out.t.push((prevT + 1) / 1000);
        for (const c of want) out[c].push(null);
      }
      prevT = r.t;
      const b = Math.floor((r.t - from) / bucketMs);
      if (!bucket || bucket.b !== b) { flush(); bucket = { b, rows: [] }; }
      bucket.rows.push(r);
    }
    flush();
    return out;
  }

  events(from, to, limit = 500) {
    return this.q.events.all(from, to, limit);
  }

  rawAt(t) {
    const r = this.q.rawAt.get(t);
    return r ? { t: r.t, raw: JSON.parse(r.raw) } : null;
  }

  /** Iterate rows for CSV export. */
  *csv(from, to) {
    const cols = Object.keys(CHANNELS);
    yield ['time_iso', 't_ms', ...cols].join(',') + '\n';
    for (const row of this.q.range.iterate(from, to)) {
      const d = JSON.parse(row.d);
      yield [new Date(row.t).toISOString(), row.t, ...cols.map((c) => d[c] ?? '')].join(',') + '\n';
    }
  }

  clear() {
    this.db.exec('DELETE FROM samples; DELETE FROM events; VACUUM;');
    this.prevDiscrete = null;
  }

  close() {
    try { this.db.close(); } catch { /* closed */ }
  }
}
