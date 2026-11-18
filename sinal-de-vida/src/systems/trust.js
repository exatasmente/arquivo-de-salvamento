// The trust of the two voices that answer on the network (Neide and Tânia), from 0 to 3, hidden, starting at 2.
// It rises 1 when Jonas answers within 3 s of the question; it falls 1 when he stays silent, lies, or transmits more than
// 6 s in one answer (she scolds). A fall wins over a rise. Pure.
export const TRUST = { min: 0, max: 3, start: 2, fast: 3, long: 6, voices: ['neide', 'tania'] };
const clamp = (v) => Math.max(TRUST.min, Math.min(TRUST.max, v));

export function createTrust(saved = {}) {
  const s = {}; for (const v of TRUST.voices) s[v] = clamp(saved[v] ?? TRUST.start);
  const known = (who) => who in s;
  return {
    get(who) { return s[who] ?? null; },
    /** An answer: `delay` is the time from the question to the start of the transmission, `seconds` how long the button was held. */
    reply(who, { delay = Infinity, seconds = 0, lie = false } = {}) {
      if (!known(who)) return 0;
      const before = s[who];
      if (lie || seconds > TRUST.long) s[who] = clamp(before - 1);
      else if (delay <= TRUST.fast) s[who] = clamp(before + 1);
      return s[who] - before;
    },
    silence(who) { if (!known(who)) return 0; const b = s[who]; s[who] = clamp(b - 1); return s[who] - b; },
    /** 'full' (2 or 3: the voice gives the hint, marks the dogs) or 'basic' (0 or 1). */
    tier(who) { return (s[who] ?? 0) >= 2 ? 'full' : 'basic'; },
    state() { return { ...s }; },
  };
}
