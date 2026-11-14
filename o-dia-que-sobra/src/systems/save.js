// SaveSystem: the memory card as the game uses it. Saves at the end of the night; the card keeps
// the run (next night, money, what was seen) and a block per finished night.
// "Save now" (the pause) puts the middle of the night inside the run as `run.snap` (systems/snapshot.js): one per night,
// replaced by the next "save now" and dropped when the night ends (the run is then rewritten for the next night).
import { createCard, KEY } from '../save.js';

export function createSaveSystem(bus, { progression, storage }) {
  const card = createCard(storage);
  return {
    card, key: KEY,
    /** The storage this card lives in (the debug card has its own). */
    get storage() { return storage || (typeof localStorage !== 'undefined' ? localStorage : null); },
    hasRun: () => card.hasRun(),
    /** The saved moment of the night in progress, or null. */
    snap: () => card.data.run?.snap || null,
    /** Called when a night ends. `night` is its summary. Returns true if the card was written. */
    saveNight(night) {
      const run = { ...progression.toRun(), day: night.day + 1, week: progression.weekOf(night.day + 1), lastSeed: night.seed };
      const ok = card.save(run, night);
      bus.emit('card:saved', ok);
      return ok;
    },
    load() {
      const run = card.data.run;
      if (!run) return null;
      progression.fromRun(run);
      return run;
    },
    /** Writes the run as it is now, with no night record (the day off ended, a secret was found). The saved moment of this same night stays. */
    saveRun(extra = {}) {
      const prev = card.data.run;
      const run = { ...progression.toRun(), ...extra };
      if (!('snap' in extra) && prev?.snap && prev.day === run.day && prev.fase === run.fase) run.snap = prev.snap;
      return card.save(run);
    },
    /** "Save now": the run as it is and the middle of the night. */
    saveNow(snap, runExtra = {}) { return card.save({ ...progression.toRun(), ...runExtra, snap }); },
    wipe() { card.wipeRun(); },
  };
}
