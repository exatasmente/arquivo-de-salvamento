// The rules of the exit to the avenue (night 1, scene 4) that are not the dog's own (those are machines.js and stealth.js): what Jonas's noise
// does to the Escuta, the splice of the cable held with the dog coming, and the voice of Tânia on the hand radio. Pure: no three.js, no clock, no
// Math.random; the game gives it the positions and the step, and it answers with events.
//
//   const street = createStreet({ escuta, durOf });
//   street.noise({ pos, loud, kind, src })            the bus's noise events (the game's own steps carry src: 'jonas')
//   street.update(dt, { player: { pos, run, crouch }, dogs: [{ id, state, pos }], handRadio, trustTania, pocket, cut: [x, z] })  -> [events]
//   street.work(dt, held, handRadio) -> { progress, state }   the splice: held while next to the cut, a reaction at the middle with the dog coming
//   street.resolveQuick(hit)
//   street.finish(handRadio)          the action sequence (src/systems/emenda.js) closed the splice: done
// Events: { type: 'heard-by-dog', id }, { type: 'run-near' }, { type: 'say', id }, { type: 'splice-quick' }, { type: 'spliced' }
export const RULES = { heard: 5, runNear: 3, runNearM: 15, spliceTime: 4.2, quickAt: 0.45, bout: 1.5, voiceGap: 0.6 };
const JONAS_NOISE = new Set(['step', 'run', 'crouch', 'voice', 'hide']);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function createStreet({ escuta, durOf = () => 3 }) {
  let clock = 0, last = null, still = 0, coolRun = 0, busyUntil = 0;
  const prev = new Map(), said = new Set();
  const sp = { progress: 0, state: 'idle' };          // idle | quick | resumed | done
  const out = [], pending = [];                      // `out`: what update() says this step; `pending`: what work() said (the game takes it with take())

  function sayOnce(id, to = out) { if (said.has(id) || clock < busyUntil) return false; said.add(id); busyUntil = clock + durOf(id) + RULES.voiceGap; to.push({ type: 'say', id }); return true; }

  return {
    get clock() { return clock; },
    get splice() { return { ...sp }; },
    get said() { return [...said]; },
    noise(n) { if (n?.src === 'jonas' && JONAS_NOISE.has(n.kind)) last = { at: clock, kind: n.kind, pos: n.pos }; },
    update(dt, { player, dogs = [], handRadio = false, trustTania = 2, pocket = [], cut = null, dogNear = null }) {
      clock += dt; out.length = 0;
      // a dog that goes from calm to suspicious right after a noise of Jonas's: it heard him (a decoy or a fall is not his noise)
      for (const d of dogs) {
        const p = prev.get(d.id);
        if (p === 'calm' && d.state === 'suspicious' && last && clock - last.at < 0.35) {
          escuta.raise(RULES.heard, 'dog-heard'); out.push({ type: 'heard-by-dog', id: d.id, kind: last.kind }); last = null;
        }
        prev.set(d.id, d.state);
      }
      // running within 15 m of a dog: +3, once for each bout of running
      coolRun = Math.max(0, coolRun - dt);
      if (player.run && !player.crouch) {
        still = 0;
        const near = dogs.some((d) => dist(d.pos, player.pos) < RULES.runNearM);
        if (near && coolRun === 0) { escuta.raise(RULES.runNear, 'run-near'); out.push({ type: 'run-near' }); coolRun = 1e9; }
      } else { still += dt; if (still > RULES.bout) coolRun = 0; }
      // Tânia on the hand radio: only when it is on and she trusts him (trust 2 or 3), in order, one at a time
      if (handRadio && trustTania >= 2) {
        const d = dogNear ?? Math.min(Infinity, ...dogs.map((x) => dist(x.pos, player.pos)));
        const chase = dogs.some((x) => x.state === 'chase');
        if (!said.has('s01')) { if (clock > 1.2) sayOnce('s01'); }
        else if (!said.has('s02')) { if (d < 9 && !chase) sayOnce('s02'); }
        else if (!said.has('s03')) { if (d > 11 && !chase) sayOnce('s03'); }
        else if (!said.has('s04')) { if (cut && dist(cut, player.pos) < 9) sayOnce('s04'); }
        else if (!said.has('s05')) { if (cut && dist(cut, player.pos) < 4 && pocket.includes('isca')) sayOnce('s05'); }
      }
      return out.slice();
    },
    /** One step of the splice. `held`: the button down, next to the cut. Progress stays when let go; the reaction stops it until it is answered. */
    work(dt, held, radio = false) {
      if (sp.state === 'done' || sp.state === 'quick') return { ...sp };
      if (held) sp.progress = Math.min(1, sp.progress + dt / RULES.spliceTime);
      if (sp.state === 'idle' && sp.progress >= RULES.quickAt) { sp.state = 'quick'; pending.push({ type: 'splice-quick' }); if (radio) sayOnce('s06', pending); }
      if (sp.progress >= 1) { sp.state = 'done'; pending.push({ type: 'spliced' }); if (radio) { busyUntil = 0; sayOnce('s07', pending); } }
      return { ...sp };
    },
    /** The action sequence closed the splice (scene 4): done, as if the hold had gone to the end. */
    finish(radio = false) { if (sp.state === 'done') return; sp.progress = 1; sp.state = 'done'; pending.push({ type: 'spliced' }); if (radio) { busyUntil = 0; sayOnce('s07', pending); } },
    resolveQuick(hit) { if (sp.state === 'quick') sp.state = 'resumed'; return hit; },
    /** The events produced by `work` since the last update (the game calls this right after it). */
    take() { return pending.splice(0); },
    reset() { clock = 0; last = null; still = 0; coolRun = 0; busyUntil = 0; prev.clear(); said.clear(); sp.progress = 0; sp.state = 'idle'; out.length = 0; pending.length = 0; },
  };
}
