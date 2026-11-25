// What you are doing where you are, from the telemetry: landed, flying,
// space, on_foot or eva. Joined with the Game.log place it reads
// "Flying at Cellin, 940 m above the ground".

export const HOLD_MS = 2000; // the game flips "landed" a few times while settling

/** One state word for a normalized frame, or null when it says nothing useful. */
export function stateOf(n) {
  if (!n) return null;
  const loco = String(n.player?.locomotion || '').replace(/^ACTOR_LOCOMOTION_STATE_/, '').toLowerCase();
  if (loco === 'seated' && n.ship?.present && n.ship.className) {
    if (n.ship.landed === true) return 'landed';
    return n.ship.altitude != null ? 'flying' : 'space';
  }
  if (loco === 'eva') return 'eva';
  if (loco && loco !== 'unspecified' && loco !== 'seated') return 'on_foot';
  return null;
}

/** Holds the state until a different one has lasted HOLD_MS. */
export class Steady {
  constructor(hold = HOLD_MS) { this.hold = hold; this.state = null; this.next = null; }
  feed(state, now = Date.now()) {
    if (state === this.state) this.next = null;
    else if (this.state == null && state != null) { this.state = state; this.next = null; }
    else if (!this.next || this.next[0] !== state) this.next = [state, now];
    else if (now - this.next[1] >= this.hold) { this.state = state; this.next = null; }
    return this.state;
  }
}

const altText = (m) => (m >= 10000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

/** One line: "Landed at Ruin Station", "Flying at Cellin, 940 m above the ground". */
export function describe(state, confidence, place, altitude) {
  if (!state || !place) return null;
  const wide = confidence === 'area' || confidence === 'system';
  const where = wide ? `in the ${place} area` : `at ${place}`;
  switch (state) {
    case 'landed': return `Landed ${where}`;
    case 'flying': return `Flying ${where}` + (altitude != null ? `, ${altText(altitude)} above the ground` : '');
    case 'space': return wide ? `In space ${where}` : `In space near ${place}`;
    case 'on_foot': return wide ? `On foot ${where}` : confidence === 'exact' ? `On foot at ${place}` : `On foot on or near ${place}`;
    case 'eva': return wide ? `On EVA ${where}` : `On EVA near ${place}`;
    default: return null;
  }
}
