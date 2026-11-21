// Shared layouts (stored on the server so every device sees them).
import { api } from './api.js';
import { defaultLayout } from './defaultLayout.js';
import { prefs } from './prefs.svelte.js';
import { tele } from './telemetry.svelte.js';
import { toast } from './toast.svelte.js';

export const layout = $state({ value: defaultLayout(), loaded: false, dirty: false });

// Take the server's copy when it arrives (and whenever another device saves).
$effect.root(() => {
  $effect(() => {
    const v = tele.layouts;
    if (v === undefined) return;
    if (!layout.dirty) layout.value = valid(v) ? structuredClone($state.snapshot(v)) : defaultLayout();
    layout.loaded = true;
  });
});

function valid(v) {
  return v && Array.isArray(v.profiles) && v.profiles.length > 0;
}

export function profile() {
  return layout.value.profiles.find((p) => p.id === prefs.profile) || layout.value.profiles[0];
}

export async function saveLayout() {
  try {
    await api('/api/layouts', { method: 'PUT', body: { layouts: $state.snapshot(layout.value) } });
    layout.dirty = false;
    toast('Layout saved');
  } catch (e) {
    toast(`Could not save layout: ${e.message}`, 'warn');
  }
}

export function resetLayout() {
  layout.value = defaultLayout();
  layout.dirty = true;
}

export function importLayout(obj) {
  if (!valid(obj)) throw new Error('Not a layout file');
  layout.value = obj;
  layout.dirty = true;
}
