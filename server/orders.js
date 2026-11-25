// Commodity orders waiting to go down the freight elevator.
// Added automatically from Game.log (the commodity kiosk's sell/buy request)
// or by hand. The log names the commodity only by an id, so names you give
// are remembered for that id and used for every later order.

// Ids seen in real logs, named by the player who placed the order.
const KNOWN = {
  '3e5fdc37-cb59-4fd3-8168-e3c538ab9722': 'Hadanite',
  '7310c15d-359c-42b4-b61e-7da3d0da3384': 'Feynmaline',
};

export const STATUSES = ['open', 'sent', 'done', 'cancelled'];

export class Orders {
  constructor(db, getSettings = () => ({})) {
    this.db = db;
    this.getSettings = getSettings;
    db.exec(`CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY, created REAL NOT NULL, updated REAL NOT NULL,
      kind TEXT NOT NULL DEFAULT 'sell', item TEXT NOT NULL, qty REAL, unit TEXT DEFAULT 'unit',
      price REAL, location TEXT, place_id TEXT, status TEXT NOT NULL DEFAULT 'open', note TEXT, source TEXT DEFAULT 'manual',
      guid TEXT, shop TEXT, log_key TEXT UNIQUE);
      CREATE TABLE IF NOT EXISTS commodity_names (guid TEXT PRIMARY KEY, name TEXT NOT NULL);`);
    const ins = db.prepare('INSERT OR IGNORE INTO commodity_names (guid, name) VALUES (?, ?)');
    for (const [g, n] of Object.entries(KNOWN)) ins.run(g, n);
  }

  list() {
    return this.db.prepare(`SELECT * FROM orders ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'sent' THEN 1 ELSE 2 END, created DESC`).all();
  }

  clean(o, partial = false) {
    const out = {};
    const str = (v, n) => (v == null ? null : String(v).trim().slice(0, n) || null);
    if (!partial || 'kind' in o) out.kind = o.kind === 'buy' ? 'buy' : 'sell';
    if (!partial || 'item' in o) {
      out.item = str(o.item, 60);
      if (!out.item) throw new Error('Item is required');
    }
    if (!partial || 'qty' in o) out.qty = o.qty === '' || o.qty == null ? null : Math.max(0, Math.min(1e9, Number(o.qty) || 0)) || null;
    if (!partial || 'unit' in o) out.unit = ['unit', 'scu', 'cscu'].includes(o.unit) ? o.unit : 'unit';
    if (!partial || 'price' in o) out.price = o.price === '' || o.price == null ? null : Math.max(0, Number(o.price) || 0);
    if (!partial || 'location' in o) out.location = str(o.location, 80);
    if (!partial || 'place_id' in o) out.place_id = str(o.place_id, 120);
    if (!partial || 'note' in o) out.note = str(o.note, 200);
    if ('status' in o) {
      if (!STATUSES.includes(o.status)) throw new Error('Unknown status');
      out.status = o.status;
    }
    return out;
  }

  add(o) {
    const c = this.clean(o);
    const now = Date.now() / 1000;
    const r = this.db
      .prepare('INSERT INTO orders (created, updated, kind, item, qty, unit, price, location, place_id, status, note, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(now, now, c.kind, c.item, c.qty, c.unit, c.price, c.location, c.place_id, c.status || 'open', c.note, o.source === 'log' ? 'log' : 'manual');
    return Number(r.lastInsertRowid);
  }

  nameFor(guid) {
    return guid ? this.db.prepare('SELECT name FROM commodity_names WHERE guid = ?').get(guid)?.name || null : null;
  }

  /** An order the commodity kiosk sent (from Game.log). Re-reading the log never adds it twice. */
  addFromLog(o, runKey, placeName, old = false) {
    const name = this.nameFor(o.guid);
    const now = Date.now() / 1000;
    const r = this.db.prepare(`INSERT OR IGNORE INTO orders (created, updated, kind, item, qty, unit, price, location, place_id, status, note, source, guid, shop, log_key)
      VALUES (?, ?, ?, ?, NULL, 'unit', ?, ?, ?, ?, ?, 'log', ?, ?, ?)`)
      .run(o.at, now, o.kind, name || 'Unknown commodity', o.amount, placeName || o.shop, o.place, old ? 'done' : 'open', old ? 'From an older log' : null, o.guid, o.shop, `${runKey}:${o.at}:${o.guid}`);
    return r.changes > 0;
  }

  update(id, o) {
    // Naming an order's commodity names that commodity id from now on (and fixes other unnamed orders).
    if (o.item) {
      const row = this.db.prepare('SELECT guid FROM orders WHERE id = ?').get(id);
      if (row?.guid) {
        this.db.prepare('INSERT OR REPLACE INTO commodity_names (guid, name) VALUES (?, ?)').run(row.guid, String(o.item).trim().slice(0, 60));
        this.db.prepare("UPDATE orders SET item = ? WHERE guid = ? AND item = 'Unknown commodity'").run(String(o.item).trim().slice(0, 60), row.guid);
      }
    }
    const c = this.clean(o, true);
    const keys = Object.keys(c);
    if (!keys.length) return;
    this.db.prepare(`UPDATE orders SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated = ? WHERE id = ?`).run(...keys.map((k) => c[k]), Date.now() / 1000, id);
  }

  remove(id) {
    this.db.prepare('DELETE FROM orders WHERE id = ?').run(id);
  }

  prune() {
    const days = this.getSettings().retention?.ordersDays;
    if (days > 0) this.db.prepare("DELETE FROM orders WHERE status IN ('done', 'cancelled') AND updated < ?").run(Date.now() / 1000 - days * 86400);
  }

  count() {
    return this.db.prepare('SELECT COUNT(*) n, MIN(created) first FROM orders').get();
  }

  purgeClosed() {
    this.db.exec("DELETE FROM orders WHERE status IN ('done', 'cancelled')");
  }
}
