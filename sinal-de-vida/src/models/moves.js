// What Jonas is doing with his legs, as states, and the rules by which one gives place to another (2026-11-23: "precisamos ter um processo
// de transição entre animações e estados"). models/jonas.js plays clips by weights; this says, of those weights, which state he is in, which
// he is leaving, and how the change is made: how long the mix lasts and what keeps the two in step meanwhile. The techniques are the common
// ones (a mix kept in phase at the feet's contacts, a clip read by the ground covered, the feet held by two-bone IK while no gait carries
// them), not any one game's.
//
//   const moves = createMoves();
//   moves.step(shares, dt)   shares: { clip: weight } wanted now (before the mix) -> { state, from, k (0..1 of the change), rule, blend (seconds) }
//   moves.now()              the same, without stepping
//   moves.log                the last changes: [{ t, from, to, rule, listed }]
//
// States: 'idle', 'crouch_idle', 'start' (a start's clip), 'walk' (the slow and the brisk walk), 'run', 'crouch', 'stairs_up', 'stairs_down',
// 'turn' (on the spot), 'stop' (a stop's clip), 'act' (a whole-body action: the dodge and its roll, kneeling at work, a fall).
// A rule: { blend: seconds of the mix, sync: how the two are kept together }:
//   'phase'   both are loops that begin where the left foot comes down: they are mixed at the same phase, so the feet land together;
//   'ground'  the one coming in is read by the ground covered since he set off (a start's clip), and ends on the loop's own pose;
//   'quarter' the one coming in is the stop of the quarter of the cycle he is at: it begins as the loop's pose there;
//   'tread'   on stairs the phase is the treads covered: a step of the loop becomes a step of the stair at its next contact, the foot
//             that carries him held where it is meanwhile;
//   'hold'    nothing in common: the feet that are down are held where they are while the poses mix (and step if the new pose is too far);
//   'pose'    the two begin or end in the same pose (a turn on the spot and standing): a short mix is enough.
export const STATES = ['idle', 'crouch_idle', 'start', 'walk', 'run', 'crouch', 'stairs_up', 'stairs_down', 'turn', 'stop', 'act'];

/** The state a clip belongs to. */
export function stateOf(clip) {
  if (clip === 'idle' || clip === 'crouch_idle') return clip;
  if (clip === 'walk' || clip === 'brisk') return 'walk';
  if (clip === 'run' || clip === 'jog') return 'run';
  if (clip === 'crouch_walk') return 'crouch';
  if (/_start$/.test(clip)) return 'start';
  if (/_stop_\d$/.test(clip)) return 'stop';
  if (/turn_[lr]\d+$/.test(clip)) return 'turn';
  if (/^stairs_up/.test(clip)) return 'stairs_up';
  if (/^stairs_down/.test(clip)) return 'stairs_down';
  return 'act';
}

const R = (blend, sync) => ({ blend, sync });
const STAND = ['idle', 'crouch_idle'], GAIT = ['walk', 'run', 'crouch'], STAIR = ['stairs_up', 'stairs_down'];
/** from > to: the rule. What is not listed is not a change he is meant to make directly: it is made anyway, by DEFAULT, and the log says so. */
export const RULES = {};
const rule = (from, to, r) => { for (const a of [].concat(from)) for (const b of [].concat(to)) if (a !== b) RULES[`${a}>${b}`] = r; };
rule('idle', 'crouch_idle', R(0.18, 'hold')); rule('crouch_idle', 'idle', R(0.18, 'hold'));
rule(STAND, 'start', R(0.06, 'pose')); rule('start', GAIT, R(0.1, 'ground')); rule('start', STAND, R(0.15, 'hold')); rule('start', 'stop', R(0.1, 'hold'));
rule(STAND, GAIT, R(0.14, 'hold'));                                  // (a run from standing, or a walk with no start's clip)
rule(GAIT, GAIT, R(0.2, 'phase'));
rule(['walk', 'crouch'], 'stop', R(0.08, 'quarter')); rule('stop', STAND, R(0.12, 'pose')); rule('stop', GAIT, R(0.12, 'hold')); rule('stop', 'start', R(0.1, 'hold')); rule('stop', 'turn', R(0.1, 'hold'));
rule(GAIT, STAND, R(0.22, 'hold'));                                  // (a run pulled up, or a stop nobody told of)
rule(STAND, 'turn', R(0.06, 'pose')); rule('turn', STAND, R(0.06, 'pose')); rule('turn', 'start', R(0.08, 'pose')); rule('turn', GAIT, R(0.14, 'hold')); rule('turn', 'turn', R(0.08, 'pose'));
rule(GAIT, STAIR, R(0.12, 'tread')); rule(STAIR, GAIT, R(0.14, 'tread')); rule(STAIR, STAIR, R(0.16, 'tread'));
rule(STAIR, STAND, R(0.2, 'hold')); rule(STAND, STAIR, R(0.14, 'hold')); rule(STAIR, 'turn', R(0.12, 'hold')); rule('turn', STAIR, R(0.12, 'hold')); rule('start', STAIR, R(0.12, 'tread'));
rule(STATES.filter((s) => s !== 'act'), 'act', R(0.15, 'hold')); rule('act', STATES.filter((s) => s !== 'act'), R(0.2, 'hold'));
export const DEFAULT = R(0.12, 'hold');

/** The rule from a state to another, and whether it is one of the listed ones. */
export function ruleOf(from, to) { const r = RULES[`${from}>${to}`]; return { ...(r ?? DEFAULT), listed: Boolean(r) || from === to }; }

export function createMoves() {
  let state = 'idle', from = null, k = 1, rule = { ...DEFAULT, listed: true }, clock = 0;
  const log = [];
  return {
    log,
    /** `shares`: the weights wanted now. The state is that of the heaviest state's clips together; a change begins when another state outweighs it. */
    step(shares, dt = 0) {
      clock += dt;
      const by = {}; let top = state, best = -1;
      for (const [clip, w] of Object.entries(shares)) { const st = stateOf(clip); by[st] = (by[st] ?? 0) + w; }
      for (const [st, w] of Object.entries(by)) if (w > best + 1e-6) { best = w; top = st; }
      if (best > 0 && top !== state) {
        from = state; state = top; k = 0; rule = ruleOf(from, state);
        log.push({ t: +clock.toFixed(3), from, to: state, rule: rule.sync, blend: rule.blend, listed: rule.listed }); if (log.length > 40) log.shift();
      } else if (k < 1) { k = Math.min(1, k + dt / Math.max(0.01, rule.blend)); if (k >= 1) from = null; }
      return this.now();
    },
    now() { return { state, from, k, rule: rule.sync, blend: rule.blend, listed: rule.listed }; },
    reset(to = 'idle') { state = to; from = null; k = 1; },
  };
}
