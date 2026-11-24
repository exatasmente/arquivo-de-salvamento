// The chase through the building as the game plays it: the sequence of its commands (systems/sequence.js) over the beats of systems/fuga.js,
// the dog and the things the scene poses (the door, the glass, the lure, the hatch of the grate), the sounds, the saved points, the death
// and the way back. The picture itself is a pure function of what this records (fuga.js: chasePose); src/game.js draws it as it draws
// the splice, from `st.seq.pose`.
//   const chase = createChaseRun(ctx);  chase.start({ from, retry });  chase.step(it, look);  chase.sign();  chase.spot(cam);  chase.drop(C)
import { createSequence } from './systems/sequence.js';
import * as FU from './systems/fuga.js';
import { buildDog } from './models/dog.js';
import { buildDecoy } from './models/decoy.js';
import { buildCloth } from './models/predio/index.js';
import { kitOf } from './models/kit.js';
import { buildHalo } from './scenes/halo.js';

/** The sounds a beat names that have no recording of their own yet: what is played for each (a sound that exists), and how loud. */
const SOUND = {
  'porta-abre': ['queda-corpo', 0.5], 'porta-bate': ['impacto-lixeira', 0.55], 'vidro-estoura': ['vidro-aramado', 1], 
  'porta-range': ['cabo-puxa', 0.35], 'janela-sobe': ['cabo-puxa', 0.5], 'degrau-cede': ['impacto-lixeira', 0.8], corrimao: ['passo-grade', 0.9], 'trava-solta': ['cabo-solta', 0.9],
  'escada-desce': ['impacto-lixeira', 0.7], 'grade-range': ['cabo-puxa', 0.5], 'grade-fecha': ['impacto-lixeira', 0.9], 'pano-puxa': ['cabo-puxa', 0.4], 'pano-voa': ['cabo-puxa', 0.55],
};
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

export function createChaseRun(ctx) {
  const { r, st, app, audio, ui, bus, options, STEP } = ctx;
  const sc = () => st.world.sc;
  function start(opts = {}) {
    const S4 = ctx.S4(), run = ctx.run(); if (!S4) return;
    const id = S4.cfg.dogs[0].id, from = FU.BEAT[opts.from] ? opts.from : FU.BEATS[0].id, steps = FU.stepsOf(from);
    const rec = { steps: steps.map((s) => ({ id: s.id, cmd: s.kind !== 'beat' })), starts: [], wins: [], ends: [], hits: [], prog: 0, aim: null, moved: [], failAt: null, slowK: 0 };
    const C = { kind: 'fuga', variant: 'fuga', steps, rec, id, phase: 'act', t: 0, ct: 0, prevDown: false, prevSx: 0, pose: null, dead: false, fade: 0, sfxAt: 0, said: new Set(), props: null, slowK: 0, timeScale: 1, blood: null, sparks: null, goreOn: true, over: null,
      from, snd: FU.soundState(), mirror: null, decoy: null, halo: null, room: null, amb: null, beat: null, lastStep: null };
    C.sq = createSequence({ steps, options, emit: (e) => onStep(C, e) });
    st.seq = S4.seq = C;
    app.dataset.ctx = 'walk'; app.dataset.seq = '1'; app.dataset.fuga = '1'; ui.cut(false);
    // the splice was closed before he ran: a run that comes back to a saved point finds the cable as it left it
    sc().ents.setParam(S4.cfg.cable, 'emendado', true); sc().setThing?.('paineis', 'limpo'); run.flags.emendaFechada = true;
    C.sq.start();
    rec.branch = FU.BEAT[from].branch ?? null;
    C.pose = FU.chasePose(rec, 0, { cam: ctx.cam?.() }); place(C, 0);
    if (opts.retry) st.fadeIn = ctx.FADE_IN * 1.4;
  }
  function onStep(C, e) {
    const rec = C.rec, run = ctx.run();
    if (e.type === 'step-start') {
      rec.starts[e.i] = C.t; rec.wins[e.i] = C.sq.view().total; rec.prog = 0;
      const b = FU.BEAT[e.id], first = C.steps.findIndex((s) => s.id === e.id) === e.i;
      // a saved point: the card holds the beat, and a death comes back to it (not the one this run began at: it is already there)
      if (first && b.cp && e.id !== C.from && ctx.director().scene) { run.cp = { scene: ctx.director().scene.id, at: 'saida-emenda', fuga: e.id }; ctx.checkpoint(); }
      if (e.kind !== 'beat') { audio.play(C.steps[e.i].slow ? 'camera-lenta' : 'reacao-abre', { gain: C.steps[e.i].slow ? 0.7 : 0.5 }); }
    } else if (e.type === 'step') {
      rec.ends[e.i] = C.t; rec.hits[e.i] = e.hit;
      if (e.kind === 'beat') return;
      audio.play(e.hit ? 'reacao-acerto' : 'reacao-erro', { gain: 0.7 });
      C.lastStep = { kind: e.kind, hit: e.hit, auto: e.auto, at: C.t, id: e.id, why: e.why };
      // the choice in the flat: the steps of the way he took come after it
      if (e.kind === 'choose' && e.hit) { C.steps = [...C.steps.slice(0, e.i + 1), ...FU.branchSteps(e.choice)]; rec.steps = C.steps.map((s) => ({ id: s.id, cmd: s.kind !== 'beat' })); rec.branch = e.choice; run.flags.fugaCaminho = e.choice; }
    } else if (e.type === 'still-moved') {
      // he moved under the dog: it hears, the Escuta goes up, and it stays longer (never the attack: it does not fit down the shaft)
      rec.moved.push(C.t); ctx.escuta().raise(FU.STILL_ESCUTA, 'reaction'); ui.heard(ctx.now()); audio.play('reacao-erro', { gain: 0.6 });
      C.lastStep = { kind: 'still', hit: false, at: C.t, id: e.id };
    } else if (e.type === 'seq-end') {
      if (e.outcome === 'done') { C.done = true; return; }
      rec.failAt = C.t; C.goreOn = ctx.gore();
    }
  }
  /** Puts in the scene what the pose says: the building, the hatch of the grate, the dog and its glass twin, the lure, the room of the sound. */
  function place(C, dt) {
    const P = C.pose, S4 = ctx.S4(), w = sc();
    w.fuga?.apply(P.fx);
    C.hatch ??= w.group.getObjectByName('grade-folha') ?? false; if (C.hatch) C.hatch.rotation.z = P.fx.hatch ?? 0;      // (looked for once: the street is thousands of objects)
    S4.machines.puppet(C.id, { ...P.dog, y: P.dog.y ?? 0 });
    if (P.mirror) {
      C.mirror ??= (() => { const m = buildDog(r, { seed: 3 }); w.group.add(m.root); return m; })();
      const m = C.mirror; m.root.visible = true; m.root.position.set(P.mirror.pos[0], (P.mirror.h ?? FU.GROUND(P.mirror.pos)) + (P.mirror.y ?? 0), P.mirror.pos[1]); m.root.rotation.order = 'YXZ'; m.root.rotation.y = P.mirror.yaw; m.root.scale.set(1, 1, -1);
      m.update(dt, { speed: P.mirror.speed ?? 0, state: P.mirror.state, sensorColor: P.mirror.sensor });
    } else if (C.mirror) C.mirror.root.visible = false;
    if (P.decoy && !P.decoy.hidden) {
      C.decoy ??= (() => { const d = buildDecoy(r, { seed: 7 }); w.group.add(d.root); d.setReducedFlashes?.(options.flashes); return d; })();
      const d = C.decoy; d.root.visible = true; d.root.position.set(P.decoy.pos[0], P.decoy.h ?? 0, P.decoy.pos[1]); d.root.rotation.y = P.decoy.spin ?? 0; d.setActive(Boolean(P.decoy.active)); d.update(dt, { active: Boolean(P.decoy.active), t: C.t });
    } else if (C.decoy) C.decoy.root.visible = false;
    if (P.cloth || C.cloth) { C.cloth ??= (() => { const c = buildCloth(kitOf(r)); w.group.add(c.root); return c; })(); C.cloth.set(P.cloth); }
    // the dog's light, to be read from the street when it is at the window
    if (P.halo) { C.halo ??= (() => { const h = buildHalo(r); w.group.add(h.sprite); return h; })(); C.halo.sprite.visible = true; C.halo.sprite.position.set(P.dog.pos[0], (P.dog.h ?? 0) + 0.7, P.dog.pos[1] + 0.25); C.halo.set(P.dog.hidden ? null : P.dog.sensor, r.camera.aspect < 1 ? 1.5 : 1.0); }
    else C.halo?.set(null);
    if (P.room !== C.room) {
      C.room = P.room; audio.setRoom(P.room);
    }
    // the bed of the place: the building's, the flat's own room tone, the shaft's, the street's
    const amb = FU.BEAT[P.beat].amb ?? (P.room === 'predio' ? 'ambiente-predio' : P.room === 'poco' ? 'ambiente-poco' : 'ambiente-rua');
    if (amb !== C.amb) { C.amb = amb; st.ambience?.stop(); st.ambience = audio.start(amb, { gain: 0.9 }); }
  }
  /** The sounds of the beat that is on, each from the thing that makes it (systems/fuga.js: soundStep says which and where). */
  function sounds(C, dt, v) {
    for (const e of FU.soundStep(C.snd, C.rec, C.pose, C.t, dt, { mash: v.kind === 'mash' && !v.gap && C.tapped })) { const [real, g] = SOUND[e.name] ?? [e.name, 1]; audio.play(real, { gain: e.gain * g, ...(e.pos ? { pos: e.pos } : {}) }); }
  }
  function scale(C) {
    const v = C.sq.view(), on = v.active && !v.gap && v.slow && C.rec.failAt == null, EMS = ctx.SLOW;
    C.slowK += ((on ? 1 : 0) - C.slowK) * Math.min(1, STEP * (on ? EMS.easeIn : EMS.easeOut));
    C.slowK = clamp(C.slowK); if (C.slowK < 0.002 && !on) C.slowK = 0;
    C.rec.slowK = C.slowK;
    return 1 - C.slowK * (1 - EMS.scale);
  }
  function step(it, lk = { yaw: 0, pitch: 0 }) {
    const C = st.seq, rec = C.rec, k = scale(C), dt = STEP * k;
    C.timeScale = k; C.t += dt;
    const down = it.press.down, edgeUse = down && !C.prevDown; C.prevDown = down;
    const sx = Math.abs(it.mx) > 0.6 ? Math.sign(it.mx) : 0; let dir = it.dir; if (!dir && sx && sx !== C.prevSx) dir = sx; C.prevSx = sx;
    const react = it.react || st.reactNow; st.reactNow = false;
    const ax = clamp(-lk.yaw * 30 + it.mx, -1, 1), move = Math.abs(lk.yaw) + Math.abs(lk.pitch) > 0.004 || Math.hypot(it.mx, it.mz ?? 0) > 0.3;
    C.tapped = edgeUse || Boolean(dir) || react;
    if (rec.failAt == null && !C.done) C.sq.step(dt, { held: down, press: edgeUse, dir, react, ax, move });
    const v = C.sq.view();
    if (v.active && !v.gap) { rec.prog = v.progress; if (v.kind === 'aim') rec.aim = v.aim; }
    C.pose = FU.chasePose(rec, C.t, { cam: ctx.cam?.() });
    place(C, dt); sounds(C, dt, v);
    ctx.player.pos = [...C.pose.jonas.pos];
    if (rec.failAt != null) { if (death(C, edgeUse || react)) return; }
    else if (C.done && C.sq.view().over) { end(C); return; }
    const S4 = ctx.S4(); S4.machines.update(dt, { people: [] }); S4.gear.update(dt);
    ctx.director().update(dt, { pos: ctx.player.pos });
  }
  /** The attack: the sound, the blood (only if the option is on), then the black, the game over, and the way back to the saved point. True when it has gone back. */
  function death(C, again) {
    const A = FU.ATTACK, on = C.goreOn, T = on ? A : A.off, k = FU.attackAt(C.rec, C.t), P = C.pose;
    if (k >= 0 && !C.said.has('hit')) {
      C.said.add('hit');
      const dpos = [P.dog.pos[0], (P.dog.h ?? FU.GROUND(P.dog.pos)) + 0.6, P.dog.pos[1]];
      if (P.fx.cupboard > 1.2) audio.play('armario-racha', { gain: 0.9, pos: dpos });          // (the cupboard's door, torn off)
      if (on) { audio.play('cao-ataque', { gain: 0.95, pos: dpos }); C.blood = ctx.gore() && P.knock ? ctx.buildBlood(P.knock.C, ctx.run().seed, P.knock.h) : null; }
      else audio.play('abafado', { gain: 0.9 });
    }
    if (C.blood && k >= 0) C.blood.update(k);
    C.fade = on ? clamp((k - A.fadeAt) / 0.6) : clamp((k - A.off.fadeAt) / A.off.fade);
    if (k >= T.overAt && !C.over) { C.over = { at: C.t }; audio.play('fim-de-jogo', { gain: 0.8 }); ui.gameOver({ why: 'O cão pegou o Jonas.', hint: ctx.fmt('{use}: voltar ao último ponto salvo') }); }
    if ((k >= T.reloadAt || (C.over && C.t - C.over.at > 0.8 && again)) && !C.dead) { C.dead = true; bus.emit('person:down', { id: 'jonas', by: C.id }); return true; }
    return false;
  }
  /** He is down the shaft and the dog has gone: the street has it back on its route, and the story goes on below. */
  function end(C) {
    const S4 = ctx.S4(), P = C.pose;
    S4.machines.release(C.id, { pos: P.dog.pos, yaw: P.dog.yaw }); S4.machines.grace('jonas', 30);
    ctx.run().cp = null;
    ctx.done();
  }
  /** What the chase put in the scene goes with it (the building stays as the chase left it). */
  function drop(C) {
    for (const m of [C.mirror, C.decoy, C.cloth]) if (m) { m.root.removeFromParent(); }
    if (C.halo) { C.halo.sprite.removeFromParent(); }
    C.blood?.dispose();
    const w = st.world?.sc; if (C.hatch) C.hatch.rotation.z = 0;
    w?.fuga?.apply({ ...(C.pose?.fx ?? {}), space: 'fora', aim: null });
    delete app.dataset.fuga;
  }
  /** The command of the step that is on, in the scenery where the beat puts it: [x, y, z] and what the sign says (src/ui.js: sign). */
  function sign(device, glyphs) {
    const C = st.seq, P = C?.pose; if (!P) return null;
    const v = C.sq.view(), auto = v.auto ? 'automático' : '', s = P.sign;
    const recent = C.lastStep && C.t - C.lastStep.at < 0.8 ? C.lastStep : null;
    if (s && v.active && !v.gap && C.rec.failAt == null) {
      const arrows = device === 'touch' ? '' : device === 'gamepad' ? '◀|▶' : '←|→', one = (a) => (device === 'touch' ? '' : device === 'gamepad' ? a : a === '▶' ? '→' : '←');
      if (s.choose) return { at: s.at, spec: { keys: arrows, word: auto || s.word.replace('{use}', glyphs.use), u: v.u, pulse: true } };
      const keys = s.still ? '' : s.keys ? arrows : s.arrow ? one(s.arrow) : s.react ? glyphs.react : glyphs.use;
      return { at: s.at, spec: { keys, word: auto || s.word, arrow: s.arrow ?? '', u: v.u, progress: s.bar ? v.progress : undefined, pulse: !s.hold && !s.still } };
    }
    if (recent && P.cam) {
      const f = [P.cam.at[0] - P.cam.eye[0], P.cam.at[1] - P.cam.eye[1], P.cam.at[2] - P.cam.eye[2]], L = Math.hypot(...f) || 1, at = [P.cam.eye[0] + f[0] / L * 3, P.cam.eye[1] + f[1] / L * 3 - 0.4, P.cam.eye[2] + f[2] / L * 3];
      return { at, spec: { word: recent.auto ? 'automático' : recent.hit ? 'ok' : recent.kind === 'still' ? 'o cão ouviu' : 'o cão pegou', tone: recent.hit ? 'hit' : 'miss' } };
    }
    return null;
  }
  /** The one light that is aimed: his head lamp, or the dog's sensor when the beat says so (systems/fuga.js: lampOf). */
  const spot = (cam) => (st.seq?.pose ? FU.lampOf(st.seq.pose, cam) : { on: false });
  return { start, step, sign, spot, drop, beats: FU.BEATS };
}
