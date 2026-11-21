// Send an in-game action through the server (if actions are switched on).
import { toast } from './toast.svelte.js';

export async function trigger(name, holdMs = 0) {
  if (!name) return false;
  try {
    const r = await fetch('/api/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, holdMs }) });
    const j = await r.json();
    if (!r.ok) { toast(j.error || 'Action failed', 'warn'); return false; }
    return true;
  } catch (e) {
    toast(`Action failed: ${e.message}`, 'warn');
    return false;
  }
}

/** Run a widget's action, asking first if the widget is set to confirm. */
export function press(w, name) {
  if (!name) return Promise.resolve(false);
  if (w.confirm && !confirm(`Send "${name}" to the game?`)) return Promise.resolve(false);
  return trigger(name, w.holdMs || 0);
}
