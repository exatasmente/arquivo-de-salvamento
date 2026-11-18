// The director: a night is a list of scenes declared in data (data/story/nights.json, data/story/scenes.json); a scene is a list of beats
// that run one after the other (a goal, a line, a wait, a walk to a point, a use, a conversation on the radio, a quick reaction, a change in
// the Escuta or the flags). The game builds the world of the scene, the director says what happens in it. At the start of every scene it asks
// for a checkpoint (the card) and that is where a death returns to. Pure: the world and the screen are the hooks the game gives it.
//
//   hooks: { sceneStart(scene), checkpoint(), goal(text), say(who, text, dur, voice), voiceDur(voice, text), closeRadio(delay), cutscene(beat, done), nightEnd(id, summary, next), hurt(),
//            pocket(add, remove), thing(name, state), light(on), sfx(name), handRadio() }
//   beats: goal, say (with a recorded `voice`), wait, reach, use (one point, or `point: [..]` with `all`), await (a signal of the game: look, light, pocket, ...), radio, quick,
//          escuta, flag, pocket, thing, light, sfx, cutscene, tune, know, end, stub. Any beat can carry `if`.
export function matches(cond, ctx) {
  if (!cond) return true;
  if (cond.all) return cond.all.every((c) => matches(c, ctx));
  if (cond.any) return cond.any.some((c) => matches(c, ctx));
  if (cond.not) return !matches(cond.not, ctx);
  if (cond.flag !== undefined) return Boolean(ctx.flags[cond.flag]) === (cond.is ?? true);
  if (cond.handRadio !== undefined) return Boolean(ctx.handRadio) === cond.handRadio;
  if (cond.escuta) { const v = ctx.escuta.value; return (cond.escuta.gte === undefined || v >= cond.escuta.gte) && (cond.escuta.lt === undefined || v < cond.escuta.lt); }
  // the value the Escuta had when `escutaRead` was read, BEFORE the transmission that followed (the decision 4 reads it so): { escutaRead: 'd4', gte: 70 }
  if (cond.escutaRead !== undefined) { const v = ctx.escuta.readOf?.(cond.escutaRead); return v != null && (cond.gte === undefined || v >= cond.gte) && (cond.lt === undefined || v < cond.lt); }
  return true;
}

export function createDirector({ nights, scenes, run, escuta, trust, radio, quick, hooks = {} }) {
  const D = { goal: '', point: null, marker: null, done: false };
  let beats = [], i = -1, t = 0, wait = null, scene = null;
  const latched = new Set();                         // the signals seen since the scene began: a beat that waits for one that already came goes on at once
  const flags = () => run.flags;
  const ctx = () => ({ flags: run.flags, escuta, handRadio: hooks.handRadio?.() ?? false });
  const night = () => nights[run.night];

  function startScene() {
    scene = scenes[night().cenas[run.scene]];
    if (!scene) throw new Error(`no scene ${night().cenas[run.scene]} in ${run.night}`);
    beats = scene.beats ?? []; i = -1; t = 0; wait = null; latched.clear(); D.goal = ''; D.marker = null; D.done = false;
    hooks.sceneStart?.(scene);
    hooks.checkpoint?.();                                  // the start of every scene is saved: the death returns here
    next();
  }
  function next() {
    i++; t = 0; wait = null;
    while (i < beats.length && !matches(beats[i].if, ctx())) i++;
    if (i >= beats.length) return nextScene();
    enter(beats[i]);
  }
  function pointOf(id) { return scene.points?.find((p) => p.id === id) ?? null; }
  function enter(b) {
    switch (b.type) {
      case 'goal': D.goal = b.text ?? ''; hooks.goal?.(D.goal); return next();
      case 'say': { const dur = b.dur ?? (b.voice ? hooks.voiceDur?.(b.voice, b.text) : null) ?? 3; hooks.say?.(b.who, b.text, dur, b.voice); if (b.wait) { wait = { kind: 'time', left: dur }; return; } return next(); }
      case 'wait': wait = { kind: 'time', left: b.dur ?? 1 }; return;
      case 'reach': D.marker = pointOf(b.point)?.pos ?? null; wait = { kind: 'reach', point: pointOf(b.point) }; return;
      case 'use': { const ids = [].concat(b.point); D.marker = pointOf(ids[0])?.pos ?? null; wait = { kind: 'use', left: new Set(ids), any: !b.all }; return; }
      case 'await': D.marker = b.marker ? pointOf(b.marker)?.pos ?? null : null; if (latched.has(b.event)) return next(); wait = { kind: 'signal', name: b.event }; return;
      case 'blink': hooks.blink?.(b.on); return next();
      case 'radio': D.marker = pointOf(b.point)?.pos ?? null; radio.offer(b.channel, b.conversation); wait = { kind: 'conv', id: b.conversation, stay: Boolean(b.stay) }; return;
      case 'pocket': hooks.pocket?.(b.add ?? [], b.remove ?? []); return next();
      case 'thing': hooks.thing?.(b.name, b.state); return next();
      case 'light': hooks.light?.(b.on); return next();
      case 'sfx': hooks.sfx?.(b.name); return next();
      case 'quick': wait = { kind: 'quick', id: b.id, beat: b }; quick.start({ id: b.id, first: b.first, hint: b.hint }); return;   // (off: it answers at once)
      case 'escuta': if (b.n >= 0) escuta.raise(b.n, b.why ?? 'scene'); else escuta.lower(-b.n, b.why ?? 'scene'); return next();
      case 'flag': Object.assign(run.flags, b.set ?? {}); return next();
      case 'cutscene': wait = { kind: 'cutscene' }; hooks.cutscene?.(b, () => { if (wait?.kind === 'cutscene') next(); }); if (!hooks.cutscene) next(); return;
      case 'tune': radio.tuneTo(b.channel); return next();
      case 'know': radio.know(b.channel); return next();
      case 'end': return nextScene();
      case 'stub': wait = { kind: 'forever' }; return;
      default: return next();
    }
  }
  function nextScene() {
    run.scene++;
    if (run.scene >= night().cenas.length) {
      const summary = { night: run.night, escuta: escuta.value, trust: trust.state(), flags: { ...run.flags } };
      D.done = true; D.marker = null;
      const order = Object.keys(nights), k = order.indexOf(run.night), up = order[k + 1];
      hooks.nightEnd?.(run.night, summary, up && up !== 'demo' ? up : null);
      return;
    }
    startScene();
  }
  function apply(fx) {
    if (!fx) return;
    if (fx.escuta) escuta.raise(fx.escuta, 'reaction');
    if (fx.hurt) { run.hurt = true; hooks.hurt?.(); }
    if (fx.say) hooks.say?.(fx.say[0], fx.say[1], 3);
    if (fx.set) Object.assign(run.flags, fx.set);
  }

  Object.defineProperties(D, Object.getOwnPropertyDescriptors({
    get scene() { return scene; },
    get index() { return run.scene; },
    get night() { return night(); },
    /** Begins the night of the run: the Escuta of the night, the keyboard of the radio fresh, Jonas no longer hurt, and the first scene. */
    beginNight() { escuta.beginNight(nights[run.night].numero); radio.resetNight?.(); run.hurt = false; run.scene = 0; startScene(); },   // a limp lasts until the end of the night
    /** Enters the scene the run says (a loaded card: the Escuta stays as the card has it). */
    resume() { startScene(); },
    update(dt, { pos } = {}) {
      if (!wait || D.done) return;
      if (wait.kind === 'time') { wait.left -= dt; if (wait.left <= 0) next(); }
      else if (wait.kind === 'reach' && wait.point && pos && Math.hypot(pos[0] - wait.point.pos[0], pos[1] - wait.point.pos[1]) <= wait.point.radius) next();
    },
    /** The player used a point (E on it). Returns whether the director took it as its beat. */
    use(id) {
      if (wait?.kind !== 'use' || !wait.left.has(id)) return false;
      wait.left.delete(id);
      if (wait.any || !wait.left.size) next(); else { const ids = [...wait.left]; D.marker = pointOf(ids[0])?.pos ?? null; }
      return true;
    },
    /** A thing the game saw that a beat may be waiting for ('look', 'light', 'pocket', 'saida-fim', ...). Returns whether a beat took it. */
    signal(name) { latched.add(name); if (wait?.kind === 'signal' && wait.name === name) { D.marker = null; next(); return true; } return false; },
    /** The signal the current beat waits for, or null. */
    get waitName() { return wait?.kind === 'signal' ? wait.name : null; },
    /** Events of the radio and of the quick reaction, both given by the game. */
    event(e) {
      if (e.type === 'end' && wait?.kind === 'conv' && wait.id === e.id) { if (!wait.stay) hooks.closeRadio?.(1.6); D.marker = null; next(); }
      else if (e.type === 'quick' && wait?.kind === 'quick' && wait.id === e.id) { const b = wait.beat; apply(e.hit ? b.hit : b.miss); next(); }
    },
    /** The death: the scene starts again from its checkpoint (the game has put the card's state back in `run`). */
    restart() { quick.cancel(); startScene(); },
  }));
  return D;
}
