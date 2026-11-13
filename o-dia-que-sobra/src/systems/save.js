// SaveSystem: the memory card as the game uses it. Saves at the end of the night; the card keeps
// the run (next night, money, what was seen) and a block per finished night.
import { createCard } from '../save.js';

export function createSaveSystem(bus, { progression }) {
  const card = createCard();
  return {
    card,
    hasRun: () => card.hasRun(),
    /** Called when a night ends. `night` is its summary. Returns true if the card was written. */
    saveNight(night) {
      const run = { ...progression.toRun(), day: night.day + 1, lastSeed: night.seed };
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
    wipe() { card.wipeRun(); },
  };
}
