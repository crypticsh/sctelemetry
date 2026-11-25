// Reads Game.log one line at a time and keeps track of:
//   - the game run (start, version, build, channel) and when it ended
//   - the shard you joined and when you left it
//   - where you are: a port (city/station), else a planet or moon, else a
//     planet's jurisdiction, else the system; armistice; the jurisdiction name
//   - quantum travel (target, start, calibrating, travelling, arrived)
//   - the newest of these as one short line ("Landed at Ruin Station")
//
// Only derived facts leave this module (place ids, shard id, short event
// text). Log lines themselves are never stored or sent.

import { EventEmitter } from 'node:events';

const BURST_S = 3; // planet loads closer together than this are streaming, not where you are
const PORT_HINT_S = 600; // an ATC wake-up counts as a hint for this long
const QT_FORGET_S = 900; // a quantum trip with no arrival is forgotten after this long

const RE_TS = /^<(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?)Z>/;
const RE_JOIN = /<Join PU>.*?shard\[([^\]]+)\]/;
const RE_PLANET = /<Planet CPU Maps Loaded> Planet '([^']+)'/;
const RE_NOTICE = /<SHUDEvent_OnNotification> Added notification "([^"]*)/;
const RE_ATC = /<ATC_Reset_VehiclesBeingStoredCleared> ATC '([^']+)'/;
const RE_INV = /<Update Inventory Location>.*?Landing \[(\d+)\] -> \[(\d+)\]\. Location \[(\d+)\] -> \[(\d+)\]/;
const RE_JURIS = /^Entered (.+?) Jurisdiction/i;
const RE_LOCINV = /<RequestLocationInventory> Player\[[^\]]*\] requested inventory for Location\[([^\]]+)\]/;
const RE_HANDLE = /<Legacy login response>.*?Handle\[([^\]]+)\]/;
const RE_QT_SELECT = /<Player Selected Quantum Target - Local>.*?selected point (\S+) as their destination/;
const RE_QT_START = /<Calculate Route>.*?Projected Start Location is (.+?) for route to destination (\S+)/;
const RE_QT_ARRIVED = /<Quantum Drive Arrived - Arrived at Final Destination>/;
const RE_ATTACH = /<AttachmentReceived> Player\[([^\]]*)\] Attachment\[[^,\]]*, ([^,\]]+), \d+\] Status\[[^\]]*\] Port\[([^\]]+)\]/;
// Body parts and face details are attachments too; they are not gear.
const NOT_GEAR = /^(body_|head_|pu_protos_head|shared_scalp|brows_|hair_|default_lensdisplay|fps_defaultradar)/i;
const MAKERS = { kegr: 'Kegr', rsi: 'RSI', klwe: 'Klaus & Werner', grin: 'Greycat', crlf: 'CureLife', behr: 'Behring', kast: 'Kastak Arms', gmni: 'Gemini', ksar: 'Kastak Arms', apar: 'Apocalypse Arms', hdgw: 'Hedeby Gunworks', vgl: 'Virgil', lbco: 'Lightning Bolt Co.', sasu: 'Sakura Sun', cds: 'Clark Defense Systems', grav: 'Gyson', banu: 'Banu' };
export function prettyItem(cls) {
  const words = String(cls).split('_').filter((w) => w && !/^\d+$/.test(w));
  const maker = MAKERS[words[0]?.toLowerCase()];
  if (maker) words.shift();
  const rest = words.map((w) => (w.length <= 3 && /^[a-z]+$/i.test(w) && w === w.toUpperCase() ? w : w[0].toUpperCase() + w.slice(1))).join(' ');
  return (maker ? maker + ' ' : '') + rest;
}
// Shops, commodity orders, freight elevator, ship (4.x lines, build 13220821).
const RE_SHOP_REQ = /<CEntityComponentShopUIProvider::SendShop(Buy|Sell)Request>.*?shopId\[(\d+)\] shopName\[([^\]]*)\].*?client_price\[([\d.]+)\].*?itemName\[([^\]]+)\] quantity\[(\d+)\]/;
const RE_SHOP_RESP = /<CEntityComponentShopUIProvider::RmShopFlowResponse>.*?shopId\[(\d+)\].*?result\[([^\]]+)\] type\[([^\]]+)\]/;
const RE_COMM = /<CEntityComponentCommodityUIProvider::SendCommodity(Sell|Buy)Request>.*?shopId\[(\d+)\] shopName\[([^\]]*)\].*?amount\[([\d.]+)\] resourceGUID\[([^\]]+)\].*?quantity\[(\d+)\]/;
const RE_FREIGHT = /<CEntityComponentFreightElevatorUIProvider::Fill(\w+)Request>.*?Entities: (\d+), Location: (\d+)/;
const RE_PLATFORM = /<CSCLoadingPlatformManager::OnLoadingPlatformStateChanged>.*?Loading Platform Manager \[LoadingPlatformManager_FreightElevator[^\]]*\] Platform state changed to (\w+)/;
const RE_QT_SHIP = /<(?:Player Selected Quantum Target - Local|Quantum Drive Arrived[^>]*|Player Requested Fuel to Quantum Target[^>]*)>.*?\| NOT AUTH \| ([A-Za-z]+_[A-Za-z0-9_]+?)_(\d{6,})\[/;
const RE_FUEL = /<Calculate Route>.*?Successfully calculated route to (\S+) fuel estimate ([\d.]+)/;
const RE_SHIP_CALL = /<CEntityComponentShipListProvider::SetVehicleSpawningInformations>/;
const RE_SHIP_LEAVE = /<Vehicle Control Flow>.*?releasing control token for '([A-Za-z]+_[A-Za-z0-9_]+?)_\d{6,}'/;
const RE_FLEET = /<VehicleListQuery>.*?Retrieved (\d+) entitlements/;
// HUD notices that are tutorials or chatter, not events worth keeping.
const NOTICE_SKIP = /^(Medical Device|You have joined channel|You have left channel|Hint|Tip)\b/i;

const SHIP_MAKERS = { ANVL: 'Anvil', AEGS: 'Aegis', DRAK: 'Drake', RSI: 'RSI', CRUS: 'Crusader', ORIG: 'Origin', MISC: 'MISC', ARGO: 'ARGO', CNOU: 'C.O.', TMBL: 'Tumbril', BANU: 'Banu', ESPR: 'Esperia', KRIG: 'Kruger', XIAN: 'Aopoa', GAMA: 'Gatac', MRAI: 'Mirai', GRIN: 'Greycat' };
export function prettyShip(cls) {
  const [maker, ...rest] = String(cls).split('_');
  return [SHIP_MAKERS[maker] || maker, ...rest].join(' ');
}
export function prettyShop(name) {
  return String(name).replace(/^SCShop_/, '').split('_').filter((w) => w && !/^\d+$/.test(w))
    .map((w) => ({ NewBab: 'New Babbage', NewBabbage: 'New Babbage' }[w] || w)).join(' ');
}
// Names players know for a few common items (class name -> shop name).
const ITEM_NAMES = { crlf_consumable_healing_01: 'MedPen (Hemozal)', kegr_fire_extinguisher_01: 'Fire Extinguisher' };
export const itemName = (cls) => ITEM_NAMES[cls] || prettyItem(cls);

const RE_QT_CAL = /^Quantum Travel Calibration (Started|Complete) By (.*?):?\s*$/i;
// Run information
const RE_VERSION = /^<[^>]+> FileVersion: (\S+)/;
const RE_BRANCH = /^<[^>]+> Branch: (\S+)/;
const RE_BUILD = /build_version\[(\d+)\]/;
const RE_EXE = /^<[^>]+> Executable: (.+)$/;
const RE_ENV = /\[Trace\] Environment:\s+(\S+)/;
const RE_FRONTEND = /Requesting game mode Frontend_Main/;
const RE_QUIT = /CCIGBroker::FastShutdown|<SystemQuit>|SystemQuit/;

const JURISDICTION = { 'hurston dynamics': 'Hurston', 'crusader industries': 'Crusader', arccorp: 'ArcCorp', microtech: 'microTech' };
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const plain = (s) => String(s).replace(/_+/g, ' ').trim().slice(0, 60);

export function lineTime(line) {
  const m = RE_TS.exec(line);
  if (!m) return null;
  const t = Date.parse(m[1] + 'Z');
  return Number.isFinite(t) ? t / 1000 : null;
}

/**
 * Emits (all times in seconds since epoch, from the log):
 *  run        { key, started, version, branch, build, channel, env }   (again when details arrive)
 *  runEnd     { key, ended }
 *  shard      { shard, at }
 *  shardEnd   { at }
 *  place      { id, at }            the best place changed (id may be null)
 *  event      { at, kind, text }    short human line; kind: session | place | quantum | zone
 *  change                           anything in snapshot() changed
 */
export class Tracker extends EventEmitter {
  constructor(places) {
    super();
    this.places = places;
    this.handle = null;
    this.resetRun();
  }

  resetRun() {
    this.loadout = null; // { at, items: [{ port, item, name }] }
    this.ship = null; // { cls, name, since }
    this.fleet = null; // number of ships on the account
    this.shopReq = new Map(); // shopId -> pending buy/sell
    this.freight = null; // { at, state, entities }
    this.lastAttach = 0;
    this.run = null; // { key, started, ... }
    this.lastTs = 0;
    this.ended = null;
    this.resetShard();
  }

  resetShard() {
    this.shard = null;
    this.shardSince = null;
    this.system = null;
    this.jurArea = null;
    this.body = null;
    this.port = null;
    this.armistice = false;
    this.landing = null;
    this.rawId = null;
    this.portHint = null;
    this.landingPorts = new Map();
    this.pending = null; // [logTs, body, wallTs]
    this.burstUntil = 0;
    this.jurisdiction = null;
    this.monitored = null;
    this.qt = null;
    this.event = null;
    this.lastPlace = undefined;
    this.lastLanded = null;
    this.lastLandedAt = 0;
    this.leftSince = 0;
  }
  // (the loadout is kept across shard changes: it belongs to the character)

  // ------------------------------------------------------------------ feeding

  feed(line) {
    if (line.endsWith('\r')) line = line.slice(0, -1);
    const ts = lineTime(line);
    if (ts == null) return;
    this.settle(ts);
    this.lastTs = ts;
    if (!this.run) this.startRun(ts); // a Game.log is one game run; the follower starts a new tracker per file
    if (this.qt && ts - this.qt.since > QT_FORGET_S) { this.qt = null; this.changed(); }

    let m;
    if (this.runInfo(line)) return;
    if ((m = RE_JOIN.exec(line))) {
      if (this.shard) this.leaveShard(ts, false);
      this.resetShard();
      this.shard = m[1].slice(0, 64);
      this.shardSince = ts;
      this.emit('shard', { shard: this.shard, at: ts });
      this.say(ts, 'session', `Joined shard ${this.shard}`);
      return this.placeCheck(ts);
    }
    if (RE_FRONTEND.test(line)) {
      if (this.shard) this.leaveShard(ts, true);
      return;
    }
    if (RE_QUIT.test(line)) {
      this.endRun(ts);
      return;
    }
    if ((m = RE_HANDLE.exec(line))) { this.handle = m[1]; return; }
    if ((m = RE_SHOP_REQ.exec(line))) {
      this.shopReq.set(m[2], { at: ts, kind: m[1].toLowerCase(), shopId: m[2], shop: prettyShop(m[3]), item: m[5], name: itemName(m[5]), qty: +m[6], price: +m[4], result: 'pending' });
      return;
    }
    if ((m = RE_SHOP_RESP.exec(line))) {
      const t = this.shopReq.get(m[1]);
      if (t) {
        this.shopReq.delete(m[1]);
        t.result = m[2].toLowerCase() === 'success' ? 'ok' : m[2];
        this.emit('trade', t);
        if (t.result === 'ok') this.say(ts, 'shop', `${t.kind === 'buy' ? 'Bought' : 'Sold'} ${t.name} for ${Math.round(t.price).toLocaleString('en-US')} aUEC`);
        else this.say(ts, 'shop', `${t.kind === 'buy' ? 'Purchase' : 'Sale'} of ${t.name} failed (${m[2]})`);
      }
      return;
    }
    if ((m = RE_COMM.exec(line))) {
      const o = { at: ts, kind: m[1].toLowerCase(), shopId: m[2], shop: prettyShop(m[3]), amount: +m[4], guid: m[5], count: +m[6], place: this.best()?.id ?? null };
      this.emit('order', o);
      this.say(ts, 'shop', `Commodity ${o.kind} order placed at ${o.shop}: ${Math.round(o.amount).toLocaleString('en-US')} aUEC`);
      return;
    }
    if ((m = RE_FREIGHT.exec(line))) {
      this.freight = { at: ts, state: 'requested', entities: +m[2], place: this.best()?.id ?? null };
      this.emit('freight', { ...this.freight });
      this.say(ts, 'cargo', `Freight elevator request: ${m[2]} item${m[2] === '1' ? '' : 's'}`);
      return;
    }
    if ((m = RE_PLATFORM.exec(line))) {
      const st = m[1];
      if (this.freight && ts - this.freight.at < 600 && ['RaisingPlatform', 'OpenIdle', 'LoweringPlatform', 'ClosedIdle'].includes(st)) {
        this.freight.state = st;
        if (st === 'OpenIdle') this.say(ts, 'cargo', 'Freight elevator open');
        if (st === 'LoweringPlatform') this.freight.lowered = true;
        if (st === 'ClosedIdle' && this.freight.lowered) this.say(ts, 'cargo', 'Freight elevator back down');
        this.changed();
      }
      return;
    }
    if ((m = RE_FUEL.exec(line))) {
      if (this.qt && this.qt.target === m[1]) { this.qt.fuel = +m[2]; this.changed(); }
      return;
    }
    if ((m = RE_FLEET.exec(line))) { this.fleet = +m[1]; return; }
    if (RE_SHIP_CALL.test(line)) { this.say(ts, 'ship', 'Ship requested to the hangar'); return; }
    if ((m = RE_SHIP_LEAVE.exec(line))) { this.say(ts, 'ship', `Left the ${prettyShip(m[1])}`); return; }
    if ((m = RE_QT_SHIP.exec(line))) this.setShip(ts, m[1]); // and keep going: the same line has the quantum info
    if ((m = RE_ATTACH.exec(line))) return this.attachment(ts, m[1], m[2], m[3]);
    if ((m = RE_LOCINV.exec(line))) return this.landedAt(ts, m[1]);
    if ((m = RE_QT_SELECT.exec(line))) return this.qtTarget(ts, m[1]);
    if ((m = RE_QT_START.exec(line))) {
      if (this.qt && this.qt.target === m[2]) { this.qt.from = this.places.namedPlace(m[1]) || this.qt.from; this.changed(); }
      return;
    }
    if (RE_QT_ARRIVED.test(line)) {
      if (this.qt) {
        this.emit('trip', { at: ts, from: this.qt.from, to: this.qt.to, toLabel: this.qt.toLabel, target: this.qt.target, since: this.qt.since, fuel: this.qt.fuel ?? null, ship: this.ship?.name ?? null });
        const to = this.qt.to;
        this.say(ts, 'quantum', 'Arrived' + (to ? ' at ' + this.places.nameOf(to) : this.qt.toLabel ? ' at ' + this.qt.toLabel : ''));
        if (to && ['planet', 'moon'].includes(this.places.kindOf(to))) this.setBody(to);
      }
      this.qt = null;
      return this.placeCheck(ts);
    }
    if ((m = RE_PLANET.exec(line))) {
      const id = this.places.body(m[1]);
      if (id) this.planet(ts, id);
      return;
    }
    if ((m = RE_NOTICE.exec(line))) return this.notice(ts, m[1]);
    if ((m = RE_ATC.exec(line))) {
      const id = this.places.port(m[1]);
      if (id) {
        this.portHint = [ts, id];
        if (this.landing && !this.landingPorts.has(this.landing)) this.landingPorts.set(this.landing, id);
        if (this.armistice || this.landing) this.setPort(id);
        this.placeCheck(ts);
      }
      return;
    }
    if ((m = RE_INV.exec(line))) {
      const [, , landingTo, , locTo] = m;
      this.rawId = locTo !== '0' ? locTo : null;
      if (landingTo !== '0') {
        this.landing = landingTo;
        const id = this.landingPorts.get(landingTo) || this.freshHint(ts);
        if (id) { this.landingPorts.set(landingTo, id); this.setPort(id); }
      } else {
        if (this.landing && this.port) { this.say(ts, 'place', 'Left ' + (this.places.nameOf(this.port) || 'the landing area')); this.leftSince = ts; }
        this.landing = null;
        if (!this.armistice) this.port = null;
      }
      this.placeCheck(ts);
    }
  }

  runInfo(line) {
    let m;
    if ((m = RE_VERSION.exec(line))) return this.runSet({ version: m[1] });
    if ((m = RE_BRANCH.exec(line))) return this.runSet({ branch: m[1] });
    if ((m = RE_BUILD.exec(line))) return this.runSet({ build: m[1] });
    if ((m = RE_ENV.exec(line))) return this.runSet({ env: m[1] });
    if ((m = RE_EXE.exec(line))) {
      const parts = m[1].trim().split(/[\\/]/);
      const i = parts.findIndex((p) => p.toLowerCase() === 'bin64');
      return this.runSet({ channel: i > 0 ? parts[i - 1].toUpperCase() : null });
    }
    return false;
  }

  runSet(info) {
    if (!this.run) return true;
    let diff = false;
    for (const [k, v] of Object.entries(info)) if (v && this.run[k] !== v) { this.run[k] = v; diff = true; }
    if (diff) this.emit('run', { ...this.run });
    return true;
  }

  startRun(ts) {
    if (this.run && !this.ended) this.endRun(this.lastTs || ts);
    this.resetRun();
    this.run = { key: String(Math.round(ts * 1000)), started: ts, version: null, branch: null, build: null, channel: null, env: null };
    this.lastTs = ts;
    this.emit('run', { ...this.run });
    this.say(ts, 'session', 'Game started');
  }

  endRun(ts) {
    if (!this.run || this.ended) return;
    if (this.shard) this.leaveShard(ts, false);
    this.ended = ts;
    this.emit('runEnd', { key: this.run.key, ended: ts });
    this.say(ts, 'session', 'Game closed');
  }

  leaveShard(ts, toMenu) {
    this.emit('shardEnd', { at: ts });
    if (toMenu) this.say(ts, 'session', 'Left shard (main menu)');
    const keepEvent = this.event;
    this.resetShard();
    this.event = keepEvent;
    this.placeCheck(ts);
  }

  /** Settle a lone planet load once nothing else came for a while (wall clock, for live following). */
  tick() {
    if (this.pending && Date.now() / 1000 - this.pending[2] >= BURST_S) {
      this.setBody(this.pending[1]);
      this.placeCheck(this.pending[0]);
    }
  }

  settle(ts) {
    if (this.pending && ts - this.pending[0] >= BURST_S) {
      const at = this.pending[0];
      this.setBody(this.pending[1]);
      this.placeCheck(at);
    }
  }

  setBody(id) {
    this.body = id;
    this.system = this.places.systemOf(id);
    this.pending = null;
  }

  planet(ts, id) {
    if (ts < this.burstUntil) { this.burstUntil = ts + BURST_S; return; }
    if (this.pending && ts - this.pending[0] < BURST_S) { this.pending = null; this.burstUntil = ts + BURST_S; return; }
    this.pending = [ts, id, Date.now() / 1000];
  }

  notice(ts, text) {
    const t = text.trim();
    let m = RE_QT_CAL.exec(t);
    if (m) {
      // Everyone aboard sees the pilot's calibration, so passengers travel too.
      if (!this.qt) this.qt = { from: this.port || this.body || this.jurArea, to: null, toLabel: null, target: null, state: 'plotted', since: ts };
      this.qt.state = m[1].toLowerCase() === 'started' ? 'spool' : 'travel';
      this.qt.since = ts;
      const who = m[2].trim();
      const by = !who || (this.handle && who.toLowerCase() === this.handle.toLowerCase()) ? '' : ` (pilot ${who.slice(0, 32)})`;
      const to = this.places.nameOf(this.qt.to) || this.qt.toLabel;
      this.say(ts, 'quantum', (this.qt.state === 'spool' ? 'Quantum calibrating' : 'Quantum travel') + (to ? ' to ' + to : '') + by);
      return;
    }
    m = RE_JURIS.exec(t);
    if (m) {
      const who = m[1].trim();
      this.jurisdiction = who.slice(0, 40);
      this.say(ts, 'zone', `Entered ${this.jurisdiction} jurisdiction`);
      if (who.toUpperCase() === 'UEE') {
        this.jurArea = null;
        this.system ||= 'stanton';
      } else {
        const id = this.places.planetsByName.get(norm(JURISDICTION[who.toLowerCase()] || who));
        if (id) {
          this.jurArea = id;
          this.system = this.places.systemOf(id);
          if (this.body && !this.places.within(this.body, id)) this.body = null;
        }
      }
      return this.placeCheck(ts);
    }
    const low = t.toLowerCase();
    if (/^(entered|entering) monitored space/.test(low)) { this.monitored = true; this.say(ts, 'zone', 'Entered monitored space'); return; }
    if (/^(left|leaving|exited) monitored space/.test(low)) { this.monitored = false; this.say(ts, 'zone', 'Left monitored space'); return; }
    if (low.startsWith('entering armistice zone')) {
      this.armistice = true;
      this.say(ts, 'zone', 'Entered armistice zone');
      const id = (this.landing && this.landingPorts.get(this.landing)) || this.freshHint(ts);
      if (id) this.setPort(id);
      this.placeCheck(ts);
    } else if (low.startsWith('leaving armistice zone')) {
      this.armistice = false;
      this.say(ts, 'zone', 'Left armistice zone');
      if (!this.landing) this.port = null;
      this.placeCheck(ts);
    } else if (!NOTICE_SKIP.test(t)) {
      // Anything else the HUD shows (hangar ready, bleeding, medical bed...): keep the headline.
      // "Bleeding: You are bleeding…" → "Bleeding"; but keep the reason when it matters
      // ("Quantum Travel: Your destination is obstructed…").
      const [h, ...more] = t.replace(/:\s*$/, '').split(/:\s/);
      const head = (/^quantum travel$/i.test(h.trim()) && more.length ? `${h.trim()}: ${more.join(': ').split('.')[0]}` : h.trim()).slice(0, 80);
      if (head && !(this.event && this.event.text === head && ts - this.event.at < 30)) this.say(ts, /bleed|medical|injur|emergency|health/i.test(t) ? 'health' : 'notice', head);
    }
  }

  landedAt(ts, name) {
    const id = this.places.namedPlace(name);
    if (id) {
      if (this.landing) this.landingPorts.set(this.landing, id);
      this.setPort(id);
    }
    this.qt = null;
    // The game asks for the same location's inventory again and again while you use
    // kiosks or the hangar; only a new landing area is news.
    const label = id ? this.places.nameOf(id) : plain(name);
    if (this.lastLanded !== label || ts - this.lastLandedAt > 1800 || this.leftSince > this.lastLandedAt) this.say(ts, 'place', 'Landed at ' + label);
    this.lastLanded = label;
    this.lastLandedAt = ts;
    this.placeCheck(ts);
  }

  qtTarget(ts, target) {
    if (this.qt && this.qt.target === target && this.qt.state !== 'plotted') return; // repeated while spooling
    const to = this.places.namedPlace(target);
    const toLabel = to ? null : target.startsWith('PartyMemberMarker') ? 'a party member' : target.startsWith('MISSION_') ? 'a mission marker' : null;
    this.qt = { from: this.port || this.body || this.jurArea, to, toLabel, target, state: 'plotted', since: ts };
    this.changed();
  }

  /** Items put on the character when it spawns, one burst per spawn. */
  attachment(ts, who, cls, port) {
    if (this.handle && who.toLowerCase() !== this.handle.toLowerCase()) return;
    if (NOT_GEAR.test(cls)) return;
    if (!this.loadout || ts - this.lastAttach > 5) this.loadout = { at: ts, items: [] };
    this.lastAttach = ts;
    this.loadout.items.push({ port, item: cls, name: prettyItem(cls) });
    this.changed();
  }

  setShip(ts, cls) {
    if (this.ship?.cls === cls) return;
    this.ship = { cls, name: prettyShip(cls), since: ts };
    this.say(ts, 'ship', `Flying the ${this.ship.name}`);
  }

  freshHint(ts) {
    return this.portHint && ts - this.portHint[0] <= PORT_HINT_S ? this.portHint[1] : null;
  }

  setPort(id) {
    this.port = id;
    this.system = this.places.systemOf(id);
  }

  say(ts, kind, text) {
    this.event = { at: ts, kind, text: text.slice(0, 80) };
    this.emit('event', { ...this.event });
    this.changed();
  }

  changed() { this.emit('change'); }

  placeCheck(ts) {
    const id = this.best()?.id ?? null;
    if (id !== this.lastPlace) {
      this.lastPlace = id;
      this.emit('place', { id, at: ts });
    }
    this.changed();
  }

  best() {
    if (this.port) return { id: this.port, confidence: 'exact', source: 'port' };
    if (this.body) return { id: this.body, confidence: 'near', source: 'planet' };
    if (this.jurArea) return { id: this.jurArea, confidence: 'area', source: 'jurisdiction' };
    if (this.system) return { id: this.system, confidence: 'system', source: 'system' };
    return null;
  }

  // ------------------------------------------------------------------ reading

  snapshot() {
    const b = this.best();
    const qt = this.qt && (this.qt.state === 'spool' || this.qt.state === 'travel') ? this.qt : null;
    return {
      run: this.run ? { ...this.run, ended: this.ended, lastAt: this.lastTs } : null,
      shard: this.shard,
      shardSince: this.shardSince,
      place: b?.id ?? null,
      placeName: this.places.nameOf(b?.id),
      path: b ? this.places.path(b.id) : [],
      confidence: b?.confidence ?? null,
      source: b?.source ?? null,
      armistice: this.armistice,
      jurisdiction: this.jurisdiction,
      rawId: this.rawId,
      transit: qt ? { from: qt.from, fromName: this.places.nameOf(qt.from), to: qt.to, toName: this.places.nameOf(qt.to) || qt.toLabel, state: qt.state, since: qt.since } : null,
      plotted: this.qt && this.qt.state === 'plotted' ? { to: this.qt.to, toName: this.places.nameOf(this.qt.to) || this.qt.toLabel } : null,
      event: this.event,
      loadout: this.loadout,
      ship: this.ship,
      fleet: this.fleet,
      monitored: this.monitored,
      freight: this.freight,
      plottedFuel: this.qt?.fuel ?? null,
    };
  }
}
