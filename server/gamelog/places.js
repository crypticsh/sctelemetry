// Places the Game.log tracker can name. Same shape as 7Hills Link's
// places.json ({ id, kind, name, parent, match[] }), so that file can be
// dropped into data/places.json to replace this built-in list.
//
// kind: system | planet | moon | city | station | lpoint | jump
// match: names the game writes for the place (planet loads, ATC ports,
// landing areas). Ports match as part of a longer name.

import fs from 'node:fs';

const P = (id, kind, name, match = []) => ({ id, kind, name, parent: id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : null, match });

const STANTON = [
  P('stanton', 'system', 'Stanton', ['OOC_Stanton', 'StantonStar']),
  P('stanton/hurston', 'planet', 'Hurston', ['OOC_Stanton_1_Hurston', 'Stanton1']),
  P('stanton/hurston/arial', 'moon', 'Arial', ['OOC_Stanton_1a_Ariel', 'Stanton1a']),
  P('stanton/hurston/aberdeen', 'moon', 'Aberdeen', ['OOC_Stanton_1b_Aberdeen', 'Stanton1b']),
  P('stanton/hurston/magda', 'moon', 'Magda', ['OOC_Stanton_1c_Magda', 'Stanton1c']),
  P('stanton/hurston/ita', 'moon', 'Ita', ['OOC_Stanton_1d_Ita', 'Stanton1d']),
  P('stanton/hurston/lorville', 'city', 'Lorville', ['Lorville']),
  P('stanton/hurston/everus-harbor', 'station', 'Everus Harbor', ['RR_HUR_LEO', 'Everus Harbor', 'EverusHarbor']),
  P('stanton/crusader', 'planet', 'Crusader', ['OOC_Stanton_2_Crusader', 'Stanton2']),
  P('stanton/crusader/cellin', 'moon', 'Cellin', ['OOC_Stanton_2a_Cellin', 'Stanton2a']),
  P('stanton/crusader/daymar', 'moon', 'Daymar', ['OOC_Stanton_2b_Daymar', 'Stanton2b']),
  P('stanton/crusader/yela', 'moon', 'Yela', ['OOC_Stanton_2c_Yela', 'Stanton2c']),
  P('stanton/crusader/yela/grim-hex', 'station', 'GrimHEX', ['GrimHex', 'Grim HEX', 'RR_CRU_Yela']),
  P('stanton/crusader/orison', 'city', 'Orison', ['Orison']),
  P('stanton/crusader/seraphim', 'station', 'Seraphim Station', ['RR_CRU_LEO', 'Seraphim Station', 'Seraphim']),
  P('stanton/arccorp', 'planet', 'ArcCorp', ['OOC_Stanton_3_ArcCorp', 'Stanton3']),
  P('stanton/arccorp/lyria', 'moon', 'Lyria', ['OOC_Stanton_3a_Lyria', 'Stanton3a']),
  P('stanton/arccorp/wala', 'moon', 'Wala', ['OOC_Stanton_3b_Wala', 'Stanton3b']),
  P('stanton/arccorp/area18', 'city', 'Area18', ['Area18']),
  P('stanton/arccorp/baijini', 'station', 'Baijini Point', ['RR_ARC_LEO', 'Baijini Point', 'BaijiniPoint']),
  P('stanton/microtech', 'planet', 'microTech', ['OOC_Stanton_4_Microtech', 'Stanton4']),
  P('stanton/microtech/calliope', 'moon', 'Calliope', ['OOC_Stanton_4a_Calliope', 'Stanton4a']),
  P('stanton/microtech/clio', 'moon', 'Clio', ['OOC_Stanton_4b_Clio', 'Stanton4b']),
  P('stanton/microtech/euterpe', 'moon', 'Euterpe', ['OOC_Stanton_4c_Euterpe', 'Stanton4c']),
  P('stanton/microtech/new-babbage', 'city', 'New Babbage', ['New Babbage', 'NewBabbage']),
  P('stanton/microtech/port-tressler', 'station', 'Port Tressler', ['RR_MIC_LEO', 'Port Tressler', 'PortTressler']),
];

// Lagrange rest stops (R&R stations): HUR-L1 … MIC-L5.
const LPOINTS = [];
for (const [planet, code, ls] of [['hurston', 'HUR', [1, 2, 3, 4, 5]], ['crusader', 'CRU', [1, 4, 5]], ['arccorp', 'ARC', [1, 2, 3, 4, 5]], ['microtech', 'MIC', [1, 2, 3, 4, 5]]]) {
  for (const l of ls) {
    LPOINTS.push({ ...P(`stanton/${code.toLowerCase()}-l${l}`, 'lpoint', `${code}-L${l}`, [`RR_${code}_L${l}`, `${code}-L${l}`, `${code}_L${l}`]), parent: 'stanton', station: true });
  }
}

const PYRO = [
  P('pyro', 'system', 'Pyro', ['OOC_Pyro', 'PyroStar']),
  P('pyro/pyro1', 'planet', 'Pyro I', ['pyro1', 'OOC_Pyro_1']),
  P('pyro/monox', 'planet', 'Monox', ['pyro2', 'OOC_Pyro_2']),
  P('pyro/bloom', 'planet', 'Bloom', ['pyro3', 'OOC_Pyro_3']),
  P('pyro/pyro4', 'planet', 'Pyro IV', ['pyro4', 'OOC_Pyro_4']),
  P('pyro/pyro5', 'planet', 'Pyro V', ['pyro5', 'OOC_Pyro_5']),
  P('pyro/pyro5/ignis', 'moon', 'Ignis', ['pyro5a']),
  P('pyro/pyro5/vatra', 'moon', 'Vatra', ['pyro5b']),
  P('pyro/pyro5/adir', 'moon', 'Adir', ['pyro5c']),
  P('pyro/pyro5/fairo', 'moon', 'Fairo', ['pyro5d']),
  P('pyro/pyro5/fuego', 'moon', 'Fuego', ['pyro5e']),
  P('pyro/pyro5/vuur', 'moon', 'Vuur', ['pyro5f']),
  P('pyro/terminus', 'planet', 'Terminus', ['pyro6', 'OOC_Pyro_6']),
  P('pyro/terminus/ruin-station', 'station', 'Ruin Station', ['RR_P6', 'Ruin Station', 'RuinStation']),
];

const NYX = [
  P('nyx', 'system', 'Nyx', ['OOC_Nyx', 'NyxStar']),
  P('nyx/nyx1', 'planet', 'Nyx I', ['Nyx1']),
  P('nyx/nyx2', 'planet', 'Nyx II', ['Nyx2']),
  P('nyx/nyx3', 'planet', 'Nyx III', ['Nyx3']),
  P('nyx/levski', 'city', 'Levski', ['Levski']),
];

export const BUILTIN = [...STANTON, ...LPOINTS, ...PYRO, ...NYX];

export const SYSTEMS = ['stanton', 'pyro', 'nyx', 'castra', 'magnus', 'terra'];
const cap = (s) => s[0].toUpperCase() + s.slice(1);

export const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

const RE_RR_JP = /^RR_JP_([A-Z][a-z]+)([A-Z][a-z]+)/;
const RE_EXT_JP = /^rs_ext_([a-z]+)-([a-z]+)_jp/i;

export class Places {
  constructor(list) {
    this.byId = new Map();
    this.bodies = new Map();
    this.byName = new Map();
    this.planetsByName = new Map();
    const ports = [], named = [];
    for (const p of list) {
      this.byId.set(p.id, p);
      const keys = (p.match || []).map(norm);
      if (p.kind === 'planet' || p.kind === 'moon') for (const k of keys) if (!this.bodies.has(k)) this.bodies.set(k, p.id);
      if (p.kind === 'city' || p.kind === 'station' || (p.kind === 'lpoint' && p.station)) {
        for (const k of keys) {
          if (k.length >= 5) ports.push([k, p.id]);
          if (k.length >= 4) named.push([k, p.id]);
        }
      }
      if (p.kind === 'planet') this.planetsByName.set(norm(p.name), p.id);
      for (const k of [p.name, ...(p.match || [])]) if (!this.byName.has(norm(k))) this.byName.set(norm(k), p.id);
    }
    this.ports = ports.sort((a, b) => b[0].length - a[0].length);
    this.named = named.sort((a, b) => b[0].length - a[0].length);
  }

  /** data/places.json (7Hills Link format) if present, else the built-in list. */
  static load(file) {
    if (file && fs.existsSync(file)) {
      try {
        const j = JSON.parse(fs.readFileSync(file, 'utf8'));
        const list = Array.isArray(j) ? j : j.places;
        if (Array.isArray(list) && list.length) return Object.assign(new Places(list), { origin: file });
      } catch { /* fall back */ }
    }
    return Object.assign(new Places(BUILTIN), { origin: 'built-in' });
  }

  body(gameName) { return this.bodies.get(norm(gameName)) || null; }

  port(text) {
    const t = norm(text);
    return this.ports.find(([k]) => t.includes(k))?.[1] || null;
  }

  /** RR_JP_PyroStanton (in Pyro, towards Stanton) or rs_ext_pyro-stan_jp1 → "pyro/jump-stanton". */
  gateway(text) {
    const m = RE_RR_JP.exec(text) || RE_EXT_JP.exec(text);
    if (!m) return null;
    const [a, b] = [m[1].toLowerCase(), m[2].toLowerCase()];
    const here = SYSTEMS.find((s) => s.startsWith(a)), there = SYSTEMS.find((s) => s.startsWith(b));
    if (!here || !there) return null;
    const id = `${here}/jump-${there}`;
    if (!this.byId.has(id)) this.byId.set(id, { id, kind: 'jump', name: `${cap(there)} Gateway`, parent: here, match: [] });
    return id;
  }

  /** A place from a name the game writes: gateway, port inside a longer name, planet/moon, any place name. */
  namedPlace(text) {
    text = String(text || '').trim();
    if (!text) return null;
    const n = norm(text);
    if (n.endsWith('system') && this.byId.has(n.slice(0, -6))) return n.slice(0, -6);
    const port = this.named.find(([k]) => n.includes(k))?.[1];
    return this.gateway(text) || port || this.bodies.get(n) || this.byName.get(n) || null;
  }

  nameOf(id) { return (id && this.byId.get(id)?.name) || null; }
  kindOf(id) { return (id && this.byId.get(id)?.kind) || null; }
  systemOf(id) { return id ? id.split('/')[0] : null; }
  within(id, area) { return !!(id && area && (id === area || id.startsWith(area + '/'))); }
  path(id) {
    const out = [];
    while (id) {
      const p = this.byId.get(id);
      if (!p) break;
      out.unshift(p.name);
      id = p.parent;
    }
    return out;
  }
}
