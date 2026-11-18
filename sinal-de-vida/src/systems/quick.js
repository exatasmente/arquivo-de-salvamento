// The quick reaction (docs: "Reação rápida"): the Reagir button, always in the same place, with a ring that closes in 1.2 s (2.4 s with the
// option "more time"); pressing it before the ring closes is a hit. With the option "off" the reaction always succeeds (and says so).
// Pure: the HUD draws `view()`.
export const QUICK = { window: 1.2, long: 2.4 };

export function createQuick({ options = {}, emit = () => {} } = {}) {
  let cur = null;
  const windowOf = (first) => (options.quick === 'long' ? QUICK.long : QUICK.window) * (first ? 2 : 1);
  return {
    get active() { return Boolean(cur); },
    /** Starts one reaction. `first`: the lesson, with double the time and a warning on the screen. Returns false when it was resolved at once. */
    start({ id = 'reacao', first = false, hint = '' } = {}) {
      if (cur) return true;
      if (options.quick === 'off') { emit({ type: 'quick', id, hit: true, auto: true }); return false; }
      const total = windowOf(first);
      cur = { id, first, hint, total, left: total };
      emit({ type: 'quick-start', id, first });
      return true;
    },
    press() { if (!cur) return false; const c = cur; cur = null; emit({ type: 'quick', id: c.id, hit: true, auto: false, left: c.left }); return true; },
    step(dt) { if (!cur) return; cur.left -= dt; if (cur.left <= 0) { const c = cur; cur = null; emit({ type: 'quick', id: c.id, hit: false, auto: false }); } },
    cancel() { cur = null; },
    view() { return cur ? { id: cur.id, first: cur.first, hint: cur.hint, u: Math.max(0, cur.left / cur.total), left: cur.left, total: cur.total } : null; },
  };
}
