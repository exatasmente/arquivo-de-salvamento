// The run: everything the card keeps of a game in progress. `createRun` makes a fresh one; `serialize` is what is saved at the start
// of each scene (the point the death returns to). Pure data, no three.js.
export const RUN_VERSION = 3;

export function createRun({ seed = 1, night = 'noite-1' } = {}) {
  return {
    v: RUN_VERSION, seed: seed >>> 0, night, scene: 0, flags: {}, escuta: { value: 10 }, trust: {}, radio: {}, pocket: [], hurt: false,
    choices: [], at: 0,
  };
}
/** A deep copy, safe to keep as a checkpoint. */
export const copy = (o) => JSON.parse(JSON.stringify(o));
