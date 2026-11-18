// The Escuta (docs: kb design, "A Escuta (números)"): how much the machines have heard of Jonas, from 0 to 100, kept from one
// night to the next. Pure: no three.js, no clock. The game and the tests drive it with the same calls.
//
//   const e = createEscuta(saved)                 // saved: { value, log, reads } or nothing
//   e.transmit(seconds) -> points added           // +2 per second of the button held, rounded per transmission
//   e.raise(n, why) / e.lower(n, why)             // any other source (a heard choice +10, a missed reaction +8, a silence -3)
//   e.beginNight(n)                               // night 1 starts at 10; every other night opens 10 lower
//   e.read(name) / e.readOf(name)                 // the value as it is BEFORE a transmission (the thresholds are read first)
//   e.atLeast(50)                                 // a threshold
export const ESCUTA = {
  max: 100, min: 0, first: 10, nightDrop: 10,
  perSecond: 2, silence: 3, heard: 10, miss: 8, noise: 5, runNear: 3, waitDog: 15, unmask: 15,
  mid: 50, high: 70,
};

const clamp = (v) => Math.max(ESCUTA.min, Math.min(ESCUTA.max, Math.round(v)));
/** The points of one transmission of `seconds` of button held (the recorded lines of the design: 3.4 s is 7, 2.0 s is 4, 7.0 s is 14). */
export const transmitCost = (seconds) => Math.round(Math.max(0, seconds) * ESCUTA.perSecond + 1e-9);

export function createEscuta(saved = {}) {
  const s = { value: saved.value ?? ESCUTA.first, log: [...(saved.log ?? [])], reads: { ...(saved.reads ?? {}) } };
  const listeners = new Set();
  function change(delta, why) {
    const before = s.value;
    s.value = clamp(before + delta);
    const applied = s.value - before;
    s.log.push({ why, delta: applied, value: s.value });
    if (s.log.length > 200) s.log.shift();
    for (const fn of listeners) fn({ why, delta: applied, value: s.value, before });
    return applied;
  }
  return {
    get value() { return s.value; },
    get log() { return s.log; },
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    transmit(seconds, why = 'transmit') { return change(transmitCost(seconds), why); },
    raise(n, why = 'raise') { return change(Math.abs(n), why); },
    lower(n, why = 'lower') { return change(-Math.abs(n), why); },
    silence() { return change(-ESCUTA.silence, 'silence'); },
    beginNight(n) { if (n <= 1) { s.value = ESCUTA.first; s.log.push({ why: 'night 1', delta: 0, value: s.value }); } else change(-ESCUTA.nightDrop, `night ${n}`); return s.value; },
    read(name) { s.reads[name] = s.value; return s.value; },
    readOf(name) { return s.reads[name] ?? null; },
    atLeast(n) { return s.value >= n; },
    get level() { return s.value >= ESCUTA.high ? 'high' : s.value >= ESCUTA.mid ? 'mid' : 'low'; },
    state() { return { value: s.value, log: s.log.slice(-60), reads: { ...s.reads } }; },
  };
}
