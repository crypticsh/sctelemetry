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
    this.qt = null;
    this.event = null;
    this.lastPlace = undefined;
  }

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
    if ((m = RE_LOCINV.exec(line))) return this.landedAt(ts, m[1]);
    if ((m = RE_QT_SELECT.exec(line))) return this.qtTarget(ts, m[1]);
    if ((m = RE_QT_START.exec(line))) {
      if (this.qt && this.qt.target === m[2]) { this.qt.from = this.places.namedPlace(m[1]) || this.qt.from; this.changed(); }
      return;
    }
    if (RE_QT_ARRIVED.test(line)) {
      if (this.qt) {
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
        if (this.landing && this.port) this.say(ts, 'place', 'Left ' + (this.places.nameOf(this.port) || 'the landing area'));
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
    }
  }

  landedAt(ts, name) {
    const id = this.places.namedPlace(name);
    if (id) {
      if (this.landing) this.landingPorts.set(this.landing, id);
      this.setPort(id);
    }
    this.qt = null;
    this.say(ts, 'place', 'Landed at ' + (id ? this.places.nameOf(id) : plain(name)));
    this.placeCheck(ts);
  }

  qtTarget(ts, target) {
    if (this.qt && this.qt.target === target && this.qt.state !== 'plotted') return; // repeated while spooling
    const to = this.places.namedPlace(target);
    const toLabel = to ? null : target.startsWith('PartyMemberMarker') ? 'a party member' : target.startsWith('MISSION_') ? 'a mission marker' : null;
    this.qt = { from: this.port || this.body || this.jurArea, to, toLabel, target, state: 'plotted', since: ts };
    this.changed();
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
    };
  }
}
