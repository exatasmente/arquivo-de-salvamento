// The reaction sequence (docs: "Câmera e ação variadas"): a scripted action made of steps, each with its own kind of command and its own window
// of time, answered by the person with whatever the device has. Pure: no three.js, no clock, no Math.random; the game gives it the step and
// what was pressed, and it answers with events and a `view()` the picture and the signs in the scenery are drawn from.
//
//   const seq = createSequence({ steps, options, emit });
//   seq.start();  seq.step(dt, { held, press, dir, react })   held: Use held; press: Use pressed this step; dir: -1 | 0 | 1 (left, right, pressed
//                                                              this step); react: the Reagir button / Space / X pressed this step
//   seq.view() -> { active, i, kind, el, u, progress, want, first, auto, gap, t, log, outcome }
//
// The kinds of command (the medium only changes which button does it):
//   hold   keep Use held while the window runs; `need` seconds of it fill the bar (it falls when let go). Missing it: noise.
//   dir    one press, left or right (`want`), while the dog is in the air; the other way, or nothing, and the dog knocks him down.
//   mash   hammer Use (or alternate left and right, or Reagir) until the bar is full; it falls slowly. Missing it: noise.
//   press  one press of Use (or Reagir) before the window closes. Missing it: noise (the splice closes anyway).
// A step: { kind, window, need?, first?, want?, after? }. `window` is in seconds; `first` doubles it (the lesson); the option "mais tempo" (quick: 'long')
// doubles it too; "desligada" (quick: 'off') makes every step a hit by itself (it still plays, shorter, and says so: auto). `after` is a pause after
// the step, for the picture (the dog landing, Jonas getting up).
// Events: { type: 'seq-start' }, { type: 'step-start', i, kind, want }, { type: 'step', i, kind, hit, auto, why }, { type: 'seq-end', outcome, misses }
// outcome: 'done' (the splice is closed) or 'knocked' (the dog got him: the scene starts again).
export const SEQ = { missEscuta: 8, mashFall: 1.1, holdFall: 0.8, autoTime: { hold: null, dir: null, mash: 1.2, press: 0.6 } };

export function createSequence({ steps, options = {}, emit = () => {} }) {
  let s = null;
  const winOf = (st) => (st.window ?? 1.2) * (st.first ? 2 : 1) * (options.quick === 'long' ? 2 : 1);
  const view = () => {
    if (!s) return { active: false };
    const st = s.steps[s.i], cur = s.gap ? null : st;
    return {
      active: !s.over, over: s.over, i: s.i, kind: st?.kind, want: st?.want, first: Boolean(st?.first), auto: s.auto, gap: s.gap, t: s.t, el: s.el, total: s.win,
      u: cur ? Math.max(0, 1 - s.el / s.win) : 0, progress: s.prog, log: s.log.map((x) => ({ ...x })), outcome: s.outcome, overAt: s.overAt ?? null, misses: s.misses, count: s.steps.length,
      press: s.pressAt, dodge: s.dodge,
    };
  };
  function begin(i) {
    s.i = i; s.el = 0; s.prog = 0; s.gap = false; s.pressAt = null; s.dodge = null;
    const st = s.steps[i]; s.win = winOf(st); s.auto = options.quick === 'off';
    if (s.auto && SEQ.autoTime[st.kind]) s.win = Math.min(s.win, SEQ.autoTime[st.kind] * (st.first ? 2 : 1));
    emit({ type: 'step-start', i, kind: st.kind, want: st.want ?? null, first: Boolean(st.first), auto: s.auto });
  }
  function finish(hit, why) {
    const st = s.steps[s.i];
    if (st.kind === 'dir' && hit && s.auto && !s.dodge) s.dodge = { side: st.want < 0 ? 'left' : 'right', at: s.win * 0.45 };       // (by itself: he dodges the right way half way through)
    s.log.push({ i: s.i, kind: st.kind, hit, at: s.t, why: why ?? null });
    if (!hit && st.kind !== 'dir') s.misses++;
    emit({ type: 'step', i: s.i, kind: st.kind, hit, auto: s.auto, why: why ?? null });
    if (!hit && st.kind === 'dir') { s.over = true; s.overAt = s.t; s.outcome = 'knocked'; s.gap = true; s.gapLeft = 1.4; emit({ type: 'seq-end', outcome: 'knocked', misses: s.misses }); return; }
    s.gap = true; s.gapLeft = st.after ?? 0.4;
  }
  return {
    get active() { return Boolean(s) && !s.over; },
    get running() { return Boolean(s); },
    start() { s = { steps, i: 0, el: 0, t: 0, prog: 0, gap: false, gapLeft: 0, over: false, outcome: null, misses: 0, log: [], win: 1, auto: false, pressAt: null, dodge: null }; emit({ type: 'seq-start' }); begin(0); },
    /** The window of a step as it will run (the tests and the game read it). */
    windowOf: (st) => winOf(st),
    step(dt, { held = false, press = false, dir = 0, react = false } = {}) {
      if (!s) return;
      s.t += dt;
      if (s.gap) {
        s.gapLeft -= dt;
        if (s.over) return;
        if (s.gapLeft <= 0) { if (s.i + 1 >= s.steps.length) { s.over = true; s.overAt = s.t; s.outcome = 'done'; emit({ type: 'seq-end', outcome: 'done', misses: s.misses }); return; } begin(s.i + 1); }
        return;
      }
      if (s.over) return;
      const st = s.steps[s.i];
      s.el += dt;
      const end = () => s.el >= s.win;
      if (s.auto) { if (end()) finish(true, 'auto'); else s.prog = Math.min(1, s.el / s.win); return; }
      switch (st.kind) {
        case 'hold': {
          const need = st.need ?? s.win * 0.7;
          s.prog = Math.max(0, Math.min(1, s.prog + (held ? dt / need : -dt * SEQ.holdFall / need)));
          if (end()) finish(s.prog >= 0.999 || s.prog * need >= need * 0.97, s.prog >= 0.97 ? null : 'late');
          break;
        }
        case 'dir': {
          if (dir !== 0) { s.dodge = { side: dir < 0 ? 'left' : 'right', at: s.el }; finish(dir === st.want, dir === st.want ? null : 'wrong'); }
          else if (end()) finish(false, 'late');
          break;
        }
        case 'mash': {
          const need = st.need ?? 8, taps = (press ? 1 : 0) + (dir !== 0 ? 1 : 0) + (react ? 1 : 0);
          s.prog = Math.max(0, Math.min(1, s.prog + taps / need - dt * SEQ.mashFall / need));
          if (s.prog >= 1) finish(true); else if (end()) finish(false, 'late');
          break;
        }
        case 'press': {
          if (press || react) { s.pressAt = s.el; finish(true); }
          else if (end()) finish(false, 'late');
          break;
        }
        default: finish(true);
      }
    },
    cancel() { s = null; },
    view,
  };
}
