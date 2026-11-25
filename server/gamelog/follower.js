// Follows the game's Game.log (read only, never written): reads it from the
// start, then picks up new lines once a second. A new game start writes a new
// Game.log, which starts a new run. Also imports the finished logs the game
// keeps in logbackups/ so your play history goes back further.

import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { Tracker } from './tracker.js';

export class GameLogFollower extends EventEmitter {
  constructor({ file, places, sessions, poll = 1000 }) {
    super();
    Object.assign(this, { file, places, sessions, poll });
    this.error = null;
    this.tracker = null;
    this.link = null;
    this.pos = 0;
    this.ident = null;
    this.buf = '';
    this.timer = null;
    this.lastTouch = 0;
  }

  start() {
    this.stopped = false;
    this.loop();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
  }

  newTracker() {
    this.tracker?.removeAllListeners();
    this.tracker = new Tracker(this.places);
    this.link = this.sessions.attach(this.tracker, 'live');
    for (const ev of ['change', 'event', 'shard', 'shardEnd', 'runEnd']) this.tracker.on(ev, (e) => this.emit(ev, e));
    this.emit('change');
  }

  loop() {
    if (this.stopped) return;
    try {
      this.readMore();
      this.error = null;
    } catch (e) {
      this.error = e.code === 'ENOENT' ? 'No Game.log yet (start the game once)' : e.message;
    }
    this.timer = setTimeout(() => this.loop(), this.poll);
  }

  readMore() {
    const st = fs.statSync(this.file);
    const ident = st.birthtimeMs || st.ctimeMs;
    if (this.ident == null || Math.abs(ident - this.ident) > 1 || st.size < this.pos) {
      // First look, or the game started again and wrote a new file.
      this.ident = ident;
      this.pos = 0;
      this.buf = '';
      this.newTracker();
    }
    if (st.size > this.pos) {
      const fd = fs.openSync(this.file, 'r');
      try {
        const len = Math.min(st.size - this.pos, 8 << 20);
        const b = Buffer.alloc(len);
        fs.readSync(fd, b, 0, len, this.pos);
        this.pos += len;
        const lines = (this.buf + b.toString('utf8')).split('\n');
        this.buf = lines.pop();
        const db = this.sessions.db;
        db.exec('BEGIN');
        try {
          for (const line of lines) this.tracker.feed(line);
          db.exec('COMMIT');
        } catch (e) {
          db.exec('ROLLBACK');
          throw e;
        }
      } finally {
        fs.closeSync(fd);
      }
    }
    this.tracker.tick();
    if (Date.now() - this.lastTouch > 15000) {
      this.lastTouch = Date.now();
      // While the game is running, open sessions last until now, not just the last log line.
      this.link.touch(this.isRunning?.() ? Date.now() / 1000 : 0);
    }
  }

  /** Seconds since the last log line (a running game writes often). */
  quietFor() {
    return this.tracker?.lastTs ? Date.now() / 1000 - this.tracker.lastTs : Infinity;
  }

  /** Import every finished log in <channel>/logbackups that is new or changed. */
  importBackups() {
    const dir = path.join(path.dirname(this.file), 'logbackups');
    let files = [];
    try {
      files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.log'));
    } catch {
      return { imported: 0, skipped: 0, folder: dir, error: 'No logbackups folder' };
    }
    let imported = 0, skipped = 0;
    for (const f of files) {
      const full = path.join(dir, f);
      try {
        const st = fs.statSync(full);
        if (this.sessions.alreadyImported(full, st)) { skipped++; continue; }
        const key = this.sessions.importText(fs.readFileSync(full, 'utf8'), this.places, full, st);
        // The live Game.log owns its own run; don't let an older copy replace it.
        if (key && key === this.link?.key) { this.pos = 0; this.ident = null; }
        imported++;
      } catch (e) {
        console.error(`logbackups: ${f}: ${e.message}`);
      }
    }
    return { imported, skipped, folder: dir };
  }
}
