// TiesSystem: the three hidden measures of the story branches. They are numbers inside the run (`run.ties`, so the memory card keeps
// them and "save now" too) and are never shown as numbers: they show up in the world.
//
//   conf   the manager's trust, -10..10 (0 at the start). Changes what he says at 05:50 and the next week's goal (+-5%).
//   laco   the ties with the people who come back (cida, rafael, morador, caminhoneiro), -6..10. The tips of the regulars, and who is
//          there at the end.
//   sol    the Sun's attention, 0..10. Moves a little the sanity at which it comes closer and the one at which it chases (never in
//          week 2, which only watches: the thresholds are only read where the machine already allowed the state).
//
// Everything reads these through getters (`progression.ties`); the writers are `add` (from the branches and a few places in the
// systems) and `bus.emit('ties:change', { kind, id, value })` tells the listeners.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const LACO_IDS = ['cida', 'rafael', 'morador', 'caminhoneiro'];
const RANGE = { conf: [-10, 10], laco: [-6, 10], sol: [0, 10] };

export const freshTies = () => ({ conf: 0, sol: 0, laco: Object.fromEntries(LACO_IDS.map((id) => [id, 0])) });

/** A saved `ties` (or nothing, from an older card) as a clean object. */
export function cleanTies(t) {
  const out = freshTies();
  if (!t || typeof t !== 'object') return out;
  out.conf = clamp(Number(t.conf) || 0, ...RANGE.conf);
  out.sol = clamp(Number(t.sol) || 0, ...RANGE.sol);
  for (const id of LACO_IDS) out.laco[id] = clamp(Number(t.laco?.[id]) || 0, ...RANGE.laco);
  return out;
}

export function createTies(st, bus) {
  const T = () => st.ties;
  const round = (v) => Math.round(v * 100) / 100;
  return {
    get conf() { return T().conf; },
    get sol() { return T().sol; },
    laco: (id) => T().laco[id] || 0,
    /** kind: 'conf' | 'sol' | 'laco' (with id). */
    add(kind, delta, id) {
      if (!delta) return;
      const t = T();
      if (kind === 'laco') { if (!id || !(id in t.laco)) return; t.laco[id] = round(clamp(t.laco[id] + delta, ...RANGE.laco)); bus?.emit('ties:change', { kind, id, value: t.laco[id] }); }
      else if (kind === 'conf' || kind === 'sol') { t[kind] = round(clamp(t[kind] + delta, ...RANGE[kind])); bus?.emit('ties:change', { kind, value: t[kind] }); }
    },
    /** How the manager sounds: 'frio' (he doubts), 'neutro', 'caloroso' (he trusts). */
    tier() { const c = T().conf; return c <= -3 ? 'frio' : c >= 3 ? 'caloroso' : 'neutro'; },
    /** The change of the next week's goal that the manager's trust asks for: -0.05, 0 or +0.05. */
    metaStep() { const c = T().conf; return c >= 3 ? -0.05 : c <= -3 ? 0.05 : 0; },
    /**
     * The extra tip a regular may leave for the ties: { chance, min, max } in cents, or null. Two points of tie and it begins; it saturates at 70%.
     * (The regular's own tip, if the cast gives one, stays: the caller uses this one first and the old one when this does not fall.)
     */
    tip(recId) {
      const l = T().laco[recId] || 0;
      if (l < 1) return null;
      return { chance: Math.min(0.7, 0.1 * l + 0.05), min: 100, max: 200 + Math.round(40 * l) };
    },
    /** How far the Sun's attention moves the two sanity limits: { approach, chase } (added to 40 and to 20). From -3 to +12, and from -2 to +6. */
    solShift() { const s = T().sol; return { approach: clamp(Math.round((s - 2) * 1.5), -3, 12), chase: clamp(Math.round((s - 2) * 0.8), -2, 6) }; },
    /** The sign's smile turned to the highway or the road: true when the attention is high (the end of the campaign reads it). */
    solHigh: () => T().sol >= 6,
    snapshot: () => JSON.parse(JSON.stringify(T())),
  };
}
