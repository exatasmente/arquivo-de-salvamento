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
//   pick   the choice with a time (the dog stunned): left or right (`branches.quiet` / `branches.loud`); the choice replaces the steps that follow with the
//          ones of that branch. Nothing pressed in time: the dog recovers and gets him. The steps of a branch may carry `fatal` (missing them is that too).
//   beat   no command: a stretch of the scene that only plays (`window` seconds, never doubled), and then the next step.
//   aim    slow aim: a pointer (`from`, -1..1) moved by `ax` at `rate` per second; one press of Use or Reagir lets go: inside `zone` is a hit.
//   still  touch nothing while the window runs: a key, a button, the stick or the view moved starts the window again (`still-moved`, never the dog).
//   hold with `strict`: he must begin within `grace` seconds and never let go until `need` seconds are held (it ends there); `still`: nor move.
//   choose a choice of the scene with a time: left, right or Use (`options`: { left, right, use } -> the id of a branch); the steps that follow are
//          replaced by `branches[id]`. Nothing in time is the dog. With the reaction off it takes `auto` (the id it names).
//   doom   a stretch that only plays and ends badly whatever is pressed (a way that was a trap): the dog.
// A step may carry `id` (which beat of a scene it is), `slow` (the world is slow while it is asked for) and `fatal`.
// A step: { kind, window, need?, first?, want?, after? }. `window` is in seconds; `first` doubles it (the lesson); the option "mais tempo" (quick: 'long')
// doubles it too; "desligada" (quick: 'off') makes every step a hit by itself (it still plays, shorter, and says so: auto). `after` is a pause after
// the step, for the picture (the dog landing, Jonas getting up).
// Events: { type: 'seq-start' }, { type: 'step-start', i, kind, want }, { type: 'step', i, kind, hit, auto, why }, { type: 'seq-end', outcome, misses }
// outcome: 'done' (the splice is closed), 'knocked' (the dodge was missed) or 'bitten' (the dog recovered and got him): in both the dog attacks and the game is over.
export const SEQ = { missEscuta: 8, pickAuto: 'quiet', mashFall: 1.1, holdFall: 0.8, autoTime: { hold: null, dir: null, mash: 1.2, press: 0.6, pick: 0.8, aim: 1.8, choose: 1.2 } };

export function createSequence({ steps, options = {}, emit = () => {} }) {
  let s = null;
  const winOf = (st) => (st.kind === 'beat' || st.kind === 'doom' ? st.window ?? 0 : (st.window ?? 1.2) * (st.first ? 2 : 1) * (options.quick === 'long' ? 2 : 1));
  const view = () => {
    if (!s) return { active: false };
    const st = s.steps[s.i], cur = s.gap ? null : st;
    return {
      active: !s.over, over: s.over, i: s.i, kind: st?.kind, want: st?.want, first: Boolean(st?.first), auto: s.auto, gap: s.gap, t: s.t, el: s.el, total: s.win,
      u: cur ? Math.max(0, 1 - s.el / s.win) : 0, progress: s.prog, log: s.log.map((x) => ({ ...x })), outcome: s.outcome, overAt: s.overAt ?? null, misses: s.misses, count: s.steps.length,
      press: s.pressAt, dodge: s.dodge, choice: s.choice, fatal: Boolean(st?.fatal || st?.kind === 'pick'), noQuiet: Boolean(st?.noQuiet),
      id: st?.id ?? null, slow: Boolean(st?.slow), aim: s.aim, zone: st?.zone ?? null, moved: s.moved, strict: Boolean(st?.strict),
    };
  };
  function begin(i) {
    s.i = i; s.el = 0; s.prog = 0; s.gap = false; s.pressAt = null; s.dodge = null; s.aim = steps[i]?.from ?? 0; s.clear = false; s.moved = 0; s.began = false;
    const st = s.steps[i]; s.win = winOf(st); s.auto = options.quick === 'off' && st.kind !== 'beat' && st.kind !== 'doom'; s.aim = st.from ?? 0;
    if (s.auto && SEQ.autoTime[st.kind]) s.win = Math.min(s.win, SEQ.autoTime[st.kind] * (st.first ? 2 : 1));
    emit({ type: 'step-start', i, kind: st.kind, want: st.want ?? null, first: Boolean(st.first), auto: s.auto, id: st.id ?? null });
  }
  function finish(hit, why, pick = null) {
    const st = s.steps[s.i];
    if (st.kind === 'dir' && hit && s.auto && !s.dodge) s.dodge = { side: st.want < 0 ? 'left' : 'right', at: s.win * 0.45 };       // (by itself: he dodges the right way half way through)
    if (st.kind === 'choose' && hit) { s.choice = { id: pick, at: s.el }; s.steps.splice(s.i + 1, s.steps.length, ...(st.branches?.[pick] ?? []).map((x) => ({ ...x }))); }
    if (st.kind === 'pick' && hit) {
      // the choice: the steps that follow are the ones of the branch
      const id = pick ?? (s.auto ? (st.noQuiet ? 'loud' : SEQ.pickAuto) : null), br = st.branches?.[id] ?? [];
      s.choice = { id, at: s.el };
      s.steps.splice(s.i + 1, s.steps.length, ...br.map((x) => ({ ...x })));
    }
    s.log.push({ i: s.i, kind: st.kind, hit, at: s.t, why: why ?? null, choice: s.choice?.id ?? null });
    const deadly = st.kind === 'dir' || st.kind === 'pick' || st.kind === 'choose' || st.kind === 'doom' || st.fatal;                // (the dodge, the choice and the first command of a branch: missing them is the dog)
    if (!hit && !deadly) s.misses++;
    emit({ type: 'step', i: s.i, kind: st.kind, hit, auto: s.auto, why: why ?? null, choice: (st.kind === 'pick' || st.kind === 'choose') && hit ? s.choice.id : null, id: st.id ?? null });
    if (!hit && deadly) {
      const outcome = st.kind === 'dir' ? 'knocked' : 'bitten';
      s.over = true; s.overAt = s.t; s.outcome = outcome; s.gap = true; s.gapLeft = 1.4; emit({ type: 'seq-end', outcome, misses: s.misses }); return;
    }
    s.gap = true; s.gapLeft = st.after ?? (st.kind === 'beat' ? 0 : 0.4);
    // the dodge: the leap goes on after the press; the next step waits for the dog to land (the rest of the window, and what `after` asks for)
    if (st.kind === 'dir' && hit) s.gapLeft = Math.max(s.gapLeft, Math.max(0, s.win - s.el) + (st.landing ?? 0));
  }
  return {
    get active() { return Boolean(s) && !s.over; },
    get running() { return Boolean(s); },
    start() { s = { steps: steps.map((x) => ({ ...x })), i: 0, el: 0, t: 0, prog: 0, gap: false, gapLeft: 0, over: false, outcome: null, misses: 0, log: [], win: 1, auto: false, pressAt: null, dodge: null, choice: null }; emit({ type: 'seq-start' }); begin(0); },
    /** The window of a step as it will run (the tests and the game read it). */
    windowOf: (st) => winOf(st),
    step(dt, { held = false, press = false, dir = 0, react = false, ax = 0, move = false } = {}) {
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
      if (st.kind === 'beat') { if (end()) finish(true, 'beat'); return; }
      if (st.kind === 'doom') { if (end()) finish(false, 'trap'); return; }
      if (st.kind === 'choose' && s.auto) { if (end()) finish(true, 'auto', st.auto ?? Object.values(st.options)[0]); else s.prog = Math.min(1, s.el / s.win); return; }
      if (s.auto) {
        if (st.kind === 'aim') { const c = (st.zone[0] + st.zone[1]) / 2; s.aim += Math.sign(c - s.aim) * Math.min(Math.abs(c - s.aim), (Math.abs(c - (st.from ?? 0)) / (s.win * 0.8)) * dt); }
        if (end()) finish(true, 'auto'); else s.prog = Math.min(1, s.el / s.win); return;
      }
      switch (st.kind) {
        case 'hold': {
          const need = st.need ?? s.win * 0.7;
          if (st.strict) {
            // he holds his breath: begun in time, never let go, nothing else touched, until it is all held
            const grace = (st.grace ?? 1.2) * (options.quick === 'long' ? 2 : 1);
            if (st.still && s.began && (dir !== 0 || react || move)) { finish(false, 'moved'); break; }
            if (held) { s.began = true; s.prog = Math.min(1, s.prog + dt / need); if (s.prog >= 1) finish(true); }
            else if (s.began) finish(false, 'let go');
            else if (s.el >= grace) finish(false, 'late');
            break;
          }
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
        case 'pick': {
          const d = dir < 0 && st.noQuiet ? 0 : dir;               // (no lure in the pocket: the quiet way is not there)
          if (d !== 0) finish(true, null, d < 0 ? 'quiet' : 'loud');
          else if (end()) finish(false, 'late');
          break;
        }
        case 'press': {
          if (press || react) { s.pressAt = s.el; finish(true); }
          else if (end()) finish(false, 'late');
          break;
        }
        case 'choose': {
          const id = dir < 0 ? st.options.left : dir > 0 ? st.options.right : press ? st.options.use : null;
          if (id) finish(true, null, id); else if (end()) finish(false, 'late');
          break;
        }
        case 'aim': {
          s.aim = Math.max(-1, Math.min(1, s.aim + Math.max(-1, Math.min(1, ax)) * (st.rate ?? 0.5) * dt));
          if (press || react) { const ok = s.aim >= st.zone[0] && s.aim <= st.zone[1]; finish(ok, ok ? null : 'off'); }
          else if (end()) finish(false, 'late');
          break;
        }
        case 'still': {
          // (a button still down from the step before does not count until it is let go)
          if (!held) s.clear = true;
          const touched = press || react || dir !== 0 || move || (held && s.clear);
          if (touched && s.el > 0.25) { s.moved++; s.el = 0; s.clear = false; emit({ type: 'still-moved', i: s.i, n: s.moved, id: st.id ?? null }); }
          else if (end()) finish(true);
          break;
        }
        default: finish(true);
      }
    },
    cancel() { s = null; },
    view,
  };
}
