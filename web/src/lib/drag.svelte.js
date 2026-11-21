// Pointer-based drag and drop for the layout editor (works with touch).
// Widgets drop onto [data-wslot] (panel + index) or [data-wpanel] (append).
// Panels drop onto [data-pslot] (rail side + index) or [data-prail] (append).

import { layout, profile } from './layout.svelte.js';
import { buzz } from './prefs.svelte.js';

export const drag = $state({ active: false, kind: null, id: null, label: '', x: 0, y: 0, target: null });

function findWidget(p, id) {
  for (const side of ['left', 'right']) {
    for (const panel of p.rails[side]) {
      const i = panel.widgets.findIndex((w) => w.id === id);
      if (i >= 0) return { panel, i };
    }
  }
  return null;
}

function findPanel(p, id) {
  for (const side of ['left', 'right']) {
    const i = p.rails[side].findIndex((x) => x.id === id);
    if (i >= 0) return { side, i };
  }
  return null;
}

export function panelById(p, id) {
  for (const side of ['left', 'right']) {
    const x = p.rails[side].find((pp) => pp.id === id);
    if (x) return x;
  }
  return null;
}

function targetAt(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  if (drag.kind === 'widget') {
    const slot = el.closest('[data-wslot]');
    if (slot) {
      const r = slot.getBoundingClientRect();
      const after = x > r.left + r.width / 2;
      return { panel: slot.dataset.panel, index: +slot.dataset.index + (after ? 1 : 0), el: slot, after };
    }
    const panel = el.closest('[data-wpanel]');
    if (panel) return { panel: panel.dataset.wpanel, index: Infinity, el: panel };
  } else {
    const slot = el.closest('[data-pslot]');
    if (slot) {
      const r = slot.getBoundingClientRect();
      const after = y > r.top + r.height / 2;
      return { side: slot.dataset.side, index: +slot.dataset.index + (after ? 1 : 0), el: slot, after };
    }
    const rail = el.closest('[data-prail]');
    if (rail) return { side: rail.dataset.prail, index: Infinity, el: rail };
  }
  return null;
}

export function startDrag(e, kind, id, label) {
  e.preventDefault();
  e.stopPropagation();
  Object.assign(drag, { active: true, kind, id, label, x: e.clientX, y: e.clientY, target: null });
  buzz(10);
  const move = (ev) => {
    drag.x = ev.clientX;
    drag.y = ev.clientY;
    const t = targetAt(ev.clientX, ev.clientY);
    drag.target = t ? { ...t, el: undefined, key: t.panel ? `${t.panel}:${t.index}` : `${t.side}:${t.index}` } : null;
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    if (drag.target) drop(drag.target);
    Object.assign(drag, { active: false, kind: null, id: null, target: null });
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

function drop(t) {
  const p = profile();
  if (drag.kind === 'widget') {
    const from = findWidget(p, drag.id);
    const to = panelById(p, t.panel);
    if (!from || !to) return;
    let idx = Math.min(t.index, to.widgets.length);
    const [w] = from.panel.widgets.splice(from.i, 1);
    if (from.panel === to && from.i < idx) idx--;
    to.widgets.splice(idx, 0, w);
  } else {
    const from = findPanel(p, drag.id);
    if (!from) return;
    const list = p.rails[t.side];
    let idx = Math.min(t.index, list.length);
    const [panel] = p.rails[from.side].splice(from.i, 1);
    if (from.side === t.side && from.i < idx) idx--;
    list.splice(idx, 0, panel);
  }
  layout.dirty = true;
  buzz(6);
}
