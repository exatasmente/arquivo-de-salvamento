// Stealth: how loud each action is and how warm a person is to a dog's sensor. The numbers are in
// data/machines.json ("noise", "dog"). Nothing here keeps a clock or calls Math.random.
//
//   noiseOf(kind, { crouch, run }) -> loud (0..1)       the contract: emit('noise', { pos: [x, z], loud, kind })
//   noiseRadius(loud)                                    metres at which a dog hears a noise of that loud
//   heatOf({ blanket, wet, hidden }) -> 0..1             the `heat` of a person in machines.update's `people`
//   createStepper({ bus }) -> { update(dt, who) }        footstep noise at a stride (an optional helper)
import DATA from '../../data/machines.json' with { type: 'json' };

const N = DATA.noise;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

/**
 * The loud (0..1) of an action. kind: 'step' (walking: 'walk', crouched: 'crouch', running: 'run'), 'voice' (the
 * hand radio), 'hide' (getting into a hiding place), 'fall' (someone knocked down), 'door', 'craft', 'isca', 'emp'.
 * Standing still is not an action: it makes no noise. A "Silencioso" trait or the like goes in `quiet` (0..1).
 */
export function noiseOf(kind, { crouch = false, run = false, quiet = 0 } = {}) {
  let v;
  switch (kind) {
    case 'step': case 'walk': case 'run': case 'crouch':
      v = (kind === 'run' || run) && !crouch ? N.step.run : crouch || kind === 'crouch' ? N.step.crouch : N.step.walk; break;
    case 'voice': case 'radio': v = crouch ? N.voice.crouch : N.voice.stand; break;
    default: v = N[kind] ?? N.default;
  }
  return clamp01(v * (1 - clamp01(quiet) * 0.7));
}

/** Metres a dog hears `loud` from. */
export const noiseRadius = (loud) => clamp01(loud) * DATA.dog.hearRadius;

/** Heat a dog's sensor reads from a person, 0..1: a thermal blanket hides most of it, being wet (water) a lot. */
export function heatOf({ blanket = false, wet = false, hidden = false } = {}) {
  let h = 1;
  if (blanket) h *= 0.25;
  if (wet) h *= 0.5;
  if (hidden) h *= 0.5;
  return h;
}

/** Distance at which a dog finds a person by heat alone (`crouch` and `hidden` shrink it). */
export function heatRadius({ crouch = false, hidden = false, heat = 1 } = {}) {
  const D = DATA.dog;
  if (hidden) return D.hiddenHeatRadius * heat;
  return D.heatRadius * heat * (crouch ? D.heatCrouchK : 1);
}

/** A stride counter: emits a footstep noise every `stride` metres walked (a helper for the game's player). */
export function createStepper({ bus, stride = 1.45 } = {}) {
  let acc = 0;
  return {
    /** who: { pos: [x, z], dist (metres walked this step), crouch, run, quiet, kind = 'step' } */
    update(dt, who) {
      acc += who.dist ?? 0;
      if (acc >= (who.crouch ? stride * 0.7 : stride)) {
        acc = 0;
        bus.emit('noise', { pos: [who.pos[0], who.pos[1]], loud: noiseOf('step', who), kind: who.run && !who.crouch ? 'run' : who.crouch ? 'crouch' : 'step' });
      }
    },
    reset() { acc = 0; },
  };
}
