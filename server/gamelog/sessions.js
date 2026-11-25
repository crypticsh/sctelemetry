// Play history from Game.log: game runs, shard sessions, places and the
// location event log, in the same SQLite file as the flight recorder.
// Everything is keyed by the run (the log's start time), so reading a log
// again (after a restart, or importing logbackups) replaces that run's rows
// instead of doubling them.

import { Tracker } from './tracker.js';

export class Sessions {
  constructor(db, getSettings = () => ({})) {
    this.db = db;
    this.getSettings = getSettings;
    db.exec(`
      CREATE TABLE IF NOT EXISTS runs (key TEXT PRIMARY KEY, started REAL NOT NULL, ended REAL, closed INTEGER DEFAULT 0,
        channel TEXT, version TEXT, branch TEXT, build TEXT, env TEXT, source TEXT);
      CREATE TABLE IF NOT EXISTS shards (id INTEGER PRIMARY KEY, run_key TEXT NOT NULL, shard TEXT, joined REAL NOT NULL, left_at REAL, closed INTEGER DEFAULT 0);
      CREATE INDEX IF NOT EXISTS shards_run ON shards (run_key);
      CREATE TABLE IF NOT EXISTS visits (id INTEGER PRIMARY KEY, run_key TEXT NOT NULL, shard_id INTEGER, place_id TEXT, name TEXT, entered REAL NOT NULL, left_at REAL);
      CREATE INDEX IF NOT EXISTS visits_run ON visits (run_key);
      CREATE TABLE IF NOT EXISTS log_events (run_key TEXT NOT NULL, t REAL NOT NULL, kind TEXT, text TEXT);
      CREATE INDEX IF NOT EXISTS log_events_t ON log_events (t);
      CREATE TABLE IF NOT EXISTS trades (run_key TEXT NOT NULL, t REAL NOT NULL, kind TEXT, shop TEXT, item TEXT, name TEXT, qty REAL, price REAL, result TEXT);
      CREATE INDEX IF NOT EXISTS trades_t ON trades (t);
      CREATE TABLE IF NOT EXISTS trips (run_key TEXT NOT NULL, started REAL, arrived REAL NOT NULL, from_id TEXT, to_id TEXT, to_name TEXT, fuel REAL, ship TEXT);
      CREATE INDEX IF NOT EXISTS trips_t ON trips (arrived);
      CREATE TABLE IF NOT EXISTS imported_logs (file TEXT PRIMARY KEY, size INTEGER, mtime REAL, run_key TEXT);
    `);
    const q = (s) => db.prepare(s);
    this.q = {
      delRun: [q('DELETE FROM runs WHERE key = ?'), q('DELETE FROM shards WHERE run_key = ?'), q('DELETE FROM visits WHERE run_key = ?'), q('DELETE FROM log_events WHERE run_key = ?'), q('DELETE FROM trades WHERE run_key = ?'), q('DELETE FROM trips WHERE run_key = ?')],
      insTrade: q('INSERT INTO trades (run_key, t, kind, shop, item, name, qty, price, result) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
      insTrip: q('INSERT INTO trips (run_key, started, arrived, from_id, to_id, to_name, fuel, ship) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
      insRun: q('INSERT INTO runs (key, started, ended, source) VALUES (?, ?, ?, ?)'),
      updRun: q('UPDATE runs SET channel = COALESCE(?, channel), version = COALESCE(?, version), branch = COALESCE(?, branch), build = COALESCE(?, build), env = COALESCE(?, env) WHERE key = ?'),
      touchRun: q('UPDATE runs SET ended = ? WHERE key = ? AND closed = 0'),
      endRun: q('UPDATE runs SET ended = ?, closed = 1 WHERE key = ?'),
      insShard: q('INSERT INTO shards (run_key, shard, joined, left_at) VALUES (?, ?, ?, ?)'),
      touchShard: q('UPDATE shards SET left_at = ? WHERE id = ? AND closed = 0'),
      endShard: q('UPDATE shards SET left_at = ?, closed = 1 WHERE id = ?'),
      insVisit: q('INSERT INTO visits (run_key, shard_id, place_id, name, entered, left_at) VALUES (?, ?, ?, ?, ?, ?)'),
      touchVisit: q('UPDATE visits SET left_at = ? WHERE id = ?'),
      insEvent: q('INSERT INTO log_events (run_key, t, kind, text) VALUES (?, ?, ?, ?)'),
      imported: q('SELECT size, mtime FROM imported_logs WHERE file = ?'),
      markImported: q('INSERT OR REPLACE INTO imported_logs (file, size, mtime, run_key) VALUES (?, ?, ?, ?)'),
    };
  }

  /**
   * Connect a tracker so everything it works out is written down.
   * Returns { touch(), close() }.
   */
  attach(tracker, source = 'live', hooks = this.hooks || {}) {
    let key = null, shardId = null, visitId = null;
    const s = this.q;
    // What to record (Settings → Data kept). Imports of old logs follow the same choices.
    const keep = (k) => this.getSettings().retention?.[k] !== false;
    const now = () => tracker.lastTs;
    tracker.on('run', (r) => {
      if (r.key !== key) {
        key = r.key;
        for (const d of s.delRun) d.run(key);
        if (keep('sessions')) s.insRun.run(key, r.started, r.started, source);
        shardId = visitId = null;
      }
      s.updRun.run(r.channel, r.version, r.branch, r.build, r.env, key);
    });
    tracker.on('runEnd', (r) => { s.endRun.run(r.ended, r.key); });
    tracker.on('shard', (e) => {
      if (!key || !keep('sessions')) return;
      shardId = Number(s.insShard.run(key, e.shard, e.at, e.at).lastInsertRowid);
    });
    tracker.on('shardEnd', (e) => {
      if (shardId != null) s.endShard.run(e.at, shardId);
      shardId = null;
    });
    tracker.on('place', (e) => {
      if (!key) return;
      if (visitId != null) s.touchVisit.run(e.at, visitId);
      visitId = e.id && keep('visits') ? Number(s.insVisit.run(key, shardId, e.id, tracker.places.nameOf(e.id), e.at, e.at).lastInsertRowid) : null;
    });
    tracker.on('trade', (t) => { if (key && keep('trades')) s.insTrade.run(key, t.at, t.kind, t.shop, t.item, t.name, t.qty, t.price, t.result); });
    tracker.on('trip', (t) => { if (key && keep('trips')) s.insTrip.run(key, t.since, t.at, t.from, t.to, tracker.places.nameOf(t.to) || t.toLabel || t.target, t.fuel, t.ship); });
    tracker.on('order', (o) => { if (key) hooks.onOrder?.(o, key, source); });
    tracker.on('event', (e) => { if (key && keep('locationEvents')) s.insEvent.run(key, e.at, e.kind, e.text); });
    return {
      /** Move the open run / shard / visit end to the newest log time. */
      touch(at) {
        if (!key || tracker.ended) return;
        const t = Math.max(now(), at || 0);
        s.touchRun.run(t, key);
        if (shardId != null) s.touchShard.run(t, shardId);
        if (visitId != null) s.touchVisit.run(t, visitId);
      },
      /** A finished log (backup): close what is still open at its last line. */
      close() {
        if (!key) return;
        const t = now();
        if (shardId != null) s.endShard.run(t, shardId);
        if (visitId != null) s.touchVisit.run(t, visitId);
        s.endRun.run(tracker.ended ?? t, key);
      },
      get key() { return key; },
    };
  }

  /** Read one finished log file (e.g. from logbackups) into the history. Returns the run key or null. */
  importText(text, places, file, stat) {
    const t = new Tracker(places);
    t.handle = this.handle || null;
    this.db.exec('BEGIN');
    try {
      const link = this.attach(t, 'backup');
      for (const line of text.split('\n')) t.feed(line);
      t.settle(Infinity);
      link.close();
      if (file) this.q.markImported.run(file, stat?.size ?? 0, stat?.mtimeMs ?? 0, link.key);
      this.db.exec('COMMIT');
      return link.key;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  alreadyImported(file, stat) {
    const r = this.q.imported.get(file);
    return !!r && r.size === stat.size && Math.abs(r.mtime - stat.mtimeMs) < 1;
  }

  // ------------------------------------------------------------------ queries

  /** Runs (with their shards) overlapping [from, to] (seconds). */
  history(from, to) {
    const runs = this.db.prepare('SELECT * FROM runs WHERE ended >= ? AND started <= ? ORDER BY started DESC').all(from, to);
    const shards = this.db.prepare('SELECT * FROM shards WHERE left_at >= ? AND joined <= ? ORDER BY joined').all(from, to);
    const byRun = new Map(runs.map((r) => [r.key, { ...r, shards: [] }]));
    for (const s of shards) byRun.get(s.run_key)?.shards.push(s);
    return [...byRun.values()];
  }

  totals() {
    const r = this.db.prepare('SELECT COUNT(*) n, COALESCE(SUM(ended - started), 0) secs, MIN(started) first FROM runs').get();
    const s = this.db.prepare('SELECT COUNT(*) n, COALESCE(SUM(left_at - joined), 0) secs, COUNT(DISTINCT shard) shards FROM shards').get();
    const longest = this.db.prepare('SELECT shard, joined, left_at, (left_at - joined) secs FROM shards ORDER BY secs DESC LIMIT 1').get() || null;
    return { runs: r.n, playSecs: r.secs, first: r.first, shardSessions: s.n, shardSecs: s.secs, distinctShards: s.shards, longestShard: longest };
  }

  topPlaces(from, to, limit = 12) {
    return this.db.prepare(`SELECT place_id, name, COUNT(*) visits, SUM(MIN(left_at, ?) - MAX(entered, ?)) secs
      FROM visits WHERE left_at >= ? AND entered <= ? GROUP BY place_id ORDER BY secs DESC LIMIT ?`).all(to, from, from, to, limit);
  }

  trades(from, to, limit = 200) {
    return this.db.prepare('SELECT t, kind, shop, item, name, qty, price, result FROM trades WHERE t >= ? AND t <= ? ORDER BY t DESC LIMIT ?').all(from, to, limit);
  }

  trips(from, to, limit = 100) {
    return this.db.prepare('SELECT started, arrived, from_id, to_id, to_name, fuel, ship FROM trips WHERE arrived >= ? AND arrived <= ? ORDER BY arrived DESC LIMIT ?').all(from, to, limit);
  }

  events(from, to, limit = 300) {
    return this.db.prepare('SELECT t, kind, text FROM log_events WHERE t >= ? AND t <= ? ORDER BY t DESC LIMIT ?').all(from, to, limit);
  }

  /** Delete what is older than the retention settings. */
  prune() {
    const r = this.getSettings().retention || {};
    const cut = (days) => Date.now() / 1000 - days * 86400;
    if (r.locationEventsDays > 0) this.db.prepare('DELETE FROM log_events WHERE t < ?').run(cut(r.locationEventsDays));
    if (r.visitsDays > 0) this.db.prepare('DELETE FROM visits WHERE left_at < ?').run(cut(r.visitsDays));
    if (r.tradesDays > 0) this.db.prepare('DELETE FROM trades WHERE t < ?').run(cut(r.tradesDays));
    if (r.tripsDays > 0) this.db.prepare('DELETE FROM trips WHERE arrived < ?').run(cut(r.tripsDays));
    if (r.sessionsDays > 0) {
      const c = cut(r.sessionsDays);
      this.db.prepare('DELETE FROM shards WHERE run_key IN (SELECT key FROM runs WHERE closed = 1 AND ended < ?)').run(c);
      this.db.prepare('DELETE FROM runs WHERE closed = 1 AND ended < ?').run(c);
    }
  }

  counts() {
    const n = (sql) => this.db.prepare(sql).get();
    return {
      locationEvents: n('SELECT COUNT(*) n, MIN(t) first FROM log_events'),
      visits: n('SELECT COUNT(*) n, MIN(entered) first FROM visits'),
      sessions: n('SELECT COUNT(*) n, MIN(started) first FROM runs'),
      trades: n('SELECT COUNT(*) n, MIN(t) first FROM trades'),
      trips: n('SELECT COUNT(*) n, MIN(arrived) first FROM trips'),
    };
  }

  purge(kind) {
    if (kind === 'locationEvents') this.db.exec('DELETE FROM log_events');
    else if (kind === 'visits') this.db.exec('DELETE FROM visits');
    else if (kind === 'trades') this.db.exec('DELETE FROM trades');
    else if (kind === 'trips') this.db.exec('DELETE FROM trips');
    else if (kind === 'sessions') this.db.exec('DELETE FROM shards; DELETE FROM runs; DELETE FROM imported_logs');
  }

  clear() {
    this.db.exec('DELETE FROM runs; DELETE FROM shards; DELETE FROM visits; DELETE FROM log_events; DELETE FROM trades; DELETE FROM trips; DELETE FROM imported_logs;');
  }
}
