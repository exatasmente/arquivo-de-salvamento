// The game, version 2, phase A (the narrative core): a night is a list of scenes declared in data (data/story/), each with fixed camera
// planes, Jonas walking in third person between the points that matter, first person to examine, the radio of the station where the
// conversations happen, the Escuta and the trust, the quick reaction, and the memory card saved at the start of every scene.
// This file joins the pieces; the rules are in src/systems/ (escuta, trust, radio, quick, director, shots, run), all pure and tested
// without three.js (test/core.test.mjs). `?demo=1` plays the short scene of demonstration (made-up content, text only).
import { createRender } from './render.js';
import { createAudio, createAudioContext } from './audio/index.js';
import { createVoices } from './audio/voices.js';
import { createCard } from './save.js';
import { createLook } from '../vendor/engine/input.js';
import { createInput } from './systems/input.js';
import { createTouch } from './systems/touch.js';
import { createPlayer, hits } from './systems/player.js';
import { shotCamera, examineCamera, followOffset, LOOK } from './systems/camera.js';
import { createInteract } from './systems/interact.js';
import { loadBody } from './systems/body.js';
import { createUI } from './ui.js';
import { createScreens } from './screens.js';
import { createDesk } from './desk.js';
import { createHands } from './hands.js';
import { createEscuta } from './systems/escuta.js';
import { createTrust } from './systems/trust.js';
import { createRadio } from './systems/radio.js';
import { createQuick } from './systems/quick.js';
import { createShoulder } from './systems/shoulder.js';
import { createSequence } from './systems/sequence.js';
import * as EM from './systems/emenda.js';
import { mulberry32 } from '../vendor/engine/rng.js';
import { createDirector } from './systems/director.js';
import { pickShot, shotYaw } from './systems/shots.js';
import { createRun, copy } from './systems/run.js';
import { resolveStory, durOf } from './systems/voicedata.js';
import { createStreet } from './systems/street.js';
import { createMachines } from './systems/machines.js';
import { createGear } from './systems/gear.js';
import { noiseOf, heatOf } from './systems/stealth.js';
import { flashAt } from './systems/cores.js';
import { matches } from './systems/director.js';
import { bus } from './bus.js';
import { buildDog } from './models/dog.js';
import { routeAt } from './systems/route.js';
import { buildHalo } from './scenes/halo.js';
import LAYOUT from '../data/scenes/galeria.json' with { type: 'json' };
import RUA_LAYOUT from '../data/scenes/rua.json' with { type: 'json' };
import NIGHTS from '../data/story/nights.json' with { type: 'json' };
import SCENES from '../data/story/scenes.json' with { type: 'json' };
import CONVERSATIONS_RAW from '../data/story/conversations.json' with { type: 'json' };
import MARCAS from '../data/story/marcas.json' with { type: 'json' };
import FALAS from '../data/story/falas-noite1.json' with { type: 'json' };
import RADIO from '../data/story/radio.json' with { type: 'json' };
import SECRETS from '../data/story/secrets.json' with { type: 'json' };

const STEP = 1 / 60, FADE_IN = 0.7;
const SEQ_ESCUTA = 8;          // missing a step of the sequence that is not the dodge: the same number of any reaction missed in the street (design: +8)
const SOUNDS = { galeria: { ambience: 'ambiente', step: 'passo', room: 'galeria' }, rua: { ambience: 'ambiente-rua', step: 'passo-rua', room: 'rua' } };
/** The voice of the recording of the dam (the message that repeats on the channel 47): the person chooses between Lia's and the operator's. */
export const REPRESA_VOICE = 'r-represa';          // or 'r-represa-alt' (the operator's)
const GLYPHS = {
  keyboard: { walk: 'WASD', look: 'o mouse ou as setas', use: 'E', light: 'F', pocket: 'I', aim: 'segure o botão direito do mouse', fire: 'clique com o esquerdo', hand: 'R', crouch: 'C', react: 'Espaço', tune: '← →', run: 'Shift', menu: 'Esc' },
  gamepad: { walk: 'o analógico esquerdo', look: 'o analógico direito', use: 'A', light: 'Y', pocket: 'direcional ↓', aim: 'segure LT', fire: 'aperte RT', hand: 'direcional ↑', crouch: 'B', react: 'X', tune: 'LB RB', run: 'L3', menu: 'Start' },
  touch: { walk: 'o direcional', look: 'arrastar à direita', use: 'Usar', light: 'Lanterna', pocket: 'Bolso', aim: 'segure o botão Item', fire: 'solte o dedo', hand: 'Rádio', crouch: 'Agachar', react: 'Reagir', tune: 'o seletor', run: 'Correr', menu: '☰' },
};
const DURATIONS_URL = new URL('../assets/audio/n1/durations.json', import.meta.url).href;
const WALK_HURT = 0.7;
const OPTIONS0 = { quick: 'normal', patience: false, flashes: false, volume: 9, captions: true, sens: 1, invert: false, gore: true };

export async function boot() {
  const q = new URLSearchParams(location.search);
  const canvas = document.getElementById('c'), app = document.getElementById('app');
  const r = createRender(canvas);
  const fit = () => r.resize(innerWidth, innerHeight);
  fit(); addEventListener('resize', fit);
  const card = createCard();
  const T3 = r.THREE;
  const options = { ...OPTIONS0, ...(card.data.meta?.opts ?? {}) };
  if (options.sound === false) options.volume = 0;           // the old on/off switch of an earlier card
  delete options.sound;
  const saveOptions = () => card.setMeta({ opts: { ...options } });
  /** The one check of everything that may be gore (docs: the option "Sangue e violência gráfica"): blood, wounds, the attack shown. Nothing of the kind is made when it is off. */
  const gore = () => options.gore !== false;
  const now = () => performance.now() / 1000;
  const qseed = q.get('semente') ? Number(q.get('semente')) >>> 0 : null;
  const freshSeed = () => qseed ?? (((Date.now() * 2654435761) >>> 0) % 1000000);
  // the lengths of the recorded lines (assets/audio/n1/durations.json, measured by tools/voice/durations.mjs) and the conversations that depend on them
  const DURATIONS = await fetch(DURATIONS_URL).then((x) => (x.ok ? x.json() : {})).catch(() => ({}));
  const raw = JSON.parse(JSON.stringify(CONVERSATIONS_RAW));
  Object.assign(raw['n1-represa'].nodes.r, { id: REPRESA_VOICE, voice: REPRESA_VOICE });
  const CONVERSATIONS = resolveStory(raw, DURATIONS, MARCAS);
  const dur = (id, text) => durOf(id, DURATIONS, text);
  const actx = createAudioContext();
  const audio = createAudio(actx, { seed: card.data.run?.seed ?? 1 });
  const voices = createVoices(actx, { durations: DURATIONS, volume: options.volume / 10 });
  const setVolume = () => { audio.setVolume?.(options.volume / 10); voices.setVolume(options.volume / 10); };
  setVolume();

  // ---- the state of the game ------------------------------------------------------------------------------------------------
  let run = null, escuta = null, trust = null, radio = null, director = null;
  const player = createPlayer(), look = createLook(), S = {};
  const input = createInput({ canvas, look, S });
  const touch = createTouch({ root: app, S, look, onTap: (x, y) => desk?.tap(x, y) });
  const interact = createInteract();
  const cam3 = createShoulder();                                  // the camera over the shoulder of the street scenes (scene.camera === 'ombro')
  const st = {
    cut: null, phase: 'title', ctx: 'screen', screen: null, scene: null, world: null, shot: -1, moveYaw: 0, moveLatched: false, fadeIn: 0, goal: '',
    seq: null, camMode: 'plano', examine: null, peek: { yaw: 0, pitch: 0 }, handRadio: false, closeLeft: 0, footAcc: 0, ambience: null, chiado: null, blipAt: 0, lastLine: '', follow: null, reactNow: false, view: null,
  };
  const body = await loadBody(r, { seed: 1, role: 'jonas' });
  r.scene.add(body.root);
  const quick = createQuick({ options, emit: onQuick });
  const sceneOf = (id) => SCENES[id];
  const titleOf = (night, i) => { const n = NIGHTS[night]; return n ? `${n.titulo} · ${SCENES[n.cenas[i]]?.title ?? ''}` : ''; };

  // ---- the interface ----------------------------------------------------------------------------------------------------------
  const ui = createUI(app, { flashes: () => options.flashes, onReact: () => { st.reactNow = true; } });
  ui.setCaptions(options.captions);
  const device = () => input.device;
  const G = {
    card, options, audio,
    run: () => run, sceneTitle: () => (run ? titleOf(run.night, run.scene) : ''), titleOf,
    onScreen(name, open) { st.screen = open ? name : null; if (!open && st.phase === 'play') app.dataset.ctx = ctxName(); if (open) { app.dataset.ctx = 'screen'; if (document.pointerLockElement === canvas) document.exitPointerLock?.(); } },
    actions: null,
  };
  const screens = createScreens(app, G);
  const desk = createDesk({ r, root: app, audio, ui, body, getRadio: () => radio, getWorld: () => st.world, getPlayer: () => player, options, input, device });
  const hands = createHands({ r, body, audio, ui, getPlayer: () => player, ground: (x, z) => st.world?.sc.ground?.(x, z) ?? 0, getRadio: () => radio, channels: RADIO.channels });
  hands.load();                                     // the notebook's file arrives while the title is up

  // ---- the world of a scene -------------------------------------------------------------------------------------------------
  const targets = new Map();
  const hooks = { sound: { play: (n, o) => audio.play(n, o), start: (n, o) => audio.start(n, o) }, target() { return () => {}; } };
  const glyph = (k) => (GLYPHS[device()] ?? GLYPHS.keyboard)[k];
  // "Correr ({run})" on touch would read "Correr (Correr)": a word followed by its own button name drops the parenthesis.
  const fmt = (text) => String(text ?? '')
    .replace(/(\S+) \(\{(\w+)\}\)/g, (m, word, k) => { const g = glyph(k); return g && word.toLowerCase().slice(0, 4) === g.toLowerCase().slice(0, 4) ? word : m; })
    .replace(/\{(\w+)\}/g, (m, k) => glyph(k) ?? m);
  const ctxOf = () => ({ flags: run.flags, escuta, handRadio: st.handRadio });
  async function loadWorld(scene) {
    const extra = scene.entities ?? [], key = `${scene.world}:${extra.map((e) => e.id).join(',')}`;
    if (st.world?.key === key) return st.world;
    if (st.world) { st.world.sc.group.removeFromParent(); st.world.sc.group.traverse((o) => { o.geometry?.dispose?.(); }); }
    const mod = await import(`./scenes/${scene.world}.js`);
    const base = scene.world === 'rua' ? RUA_LAYOUT : LAYOUT;
    const layout = { ...base, entities: [...base.entities, ...extra] };
    const sc = mod.buildScene(r, { layout, hooks });
    r.scene.add(sc.group); sc.lights.apply();
    st.world = { key, name: scene.world, sc, limit: mod.SIZE / 2 - 0.4, ...SOUNDS[scene.world] };
    audio.setRoom?.(st.world.room);
    st.ambience?.stop(); st.ambience = audio.start(st.world.ambience, { gain: 0.9 });
    return st.world;
  }
  function placeTargets(scene) {
    targets.clear();
    for (const p of scene.points ?? []) {
      if (p.kind === 'mark') continue;
      targets.set(p.id, { id: p.id, p, pos: p.pos, label: p.label, radius: p.radius ?? 1, hold: p.kind === 'hold', fire: () => usePoint(p) });
    }
  }
  /** Which points are on offer now: the ones whose condition holds and that were not used up. */
  function refreshTargets() { for (const t of targets.values()) t.off = Boolean(t.done) || (t.p.if ? !matches(t.p.if, ctxOf()) : false); }

  // ---- the street of the first exit: the dog that patrols, the decoy, the broken dog that blinks, the splice ------------------------------------
  let S4 = null;
  function teardownStreet() {
    if (!S4) return;
    for (const off of S4.offs) off();
    S4.machines.dispose(); S4.gear.dispose(); S4.broken?.root.parent?.remove(S4.broken.root); S4.broken?.halo.sprite.parent?.remove(S4.broken.halo.sprite);
    if (S4.aimLine) { r.scene.remove(S4.aimLine); S4.aimLine.geometry.dispose(); }
    dropSequence();
    S4 = null; st.aiming = false;
  }
  function setupStreet(scene, w) {
    teardownStreet();
    const cfg = scene.street; if (!cfg) return;
    const sc = w.sc, hard = Boolean(run.flags.saiAgora);
    const patrols = (cfg.dogs ?? []).map((d) => ({ id: d.id, path: hard ? d.hard : d.easy }));
    const proxy = { group: sc.group, colliders: sc.colliders, ground: sc.ground, patrols };
    const machines = createMachines({ r, scene: proxy, bus, seed: run.seed, audio });
    machines.setReduceFlash(options.flashes);
    const gear = createGear({ r, scene: proxy, bus, audio });
    const street = createStreet({ escuta, durOf: (id) => dur(id, '') });
    const offs = [bus.on('noise', (n) => street.noise(n)), bus.on('person:down', (e) => { if (e?.id === 'jonas') die(); }), bus.on('isca:land', () => director?.signal('isca'))];
    let broken = null; const cols = [];
    if (cfg.broken) {
      broken = buildDog(r, { seed: 9 }); sc.group.add(broken.root);
      broken.update(10, { state: 'desligado' });                      // it is already down (the fall played long ago): switched off, lying on the asphalt
      broken.halo = buildHalo(r); sc.group.add(broken.halo.sprite);
      broken.root.position.set(cfg.broken.pos[0], sc.ground?.(cfg.broken.pos[0], cfg.broken.pos[1]) ?? 0, cfg.broken.pos[1]); broken.root.rotation.y = cfg.broken.yaw ?? 0;
      // it lies on the pavement and is a body: a box the size of the dog (1.4 x 0.6 m, turned as it lies) keeps Jonas from walking through it
      const yaw = cfg.broken.yaw ?? 0, hl = 0.7, hw = 0.3, hx = Math.abs(Math.sin(yaw)) * hl + Math.abs(Math.cos(yaw)) * hw, hz = Math.abs(Math.cos(yaw)) * hl + Math.abs(Math.sin(yaw)) * hw;
      cols.push({ min: [cfg.broken.pos[0] - hx, cfg.broken.pos[1] - hz], max: [cfg.broken.pos[0] + hx, cfg.broken.pos[1] + hz] });
    }
    // the cut of the cable is as the layout left it (cut, not spliced)
    if (cfg.cable) { sc.ents.setParam(cfg.cable, 'emendado', false); sc.setThing?.('paineis', 'sujo'); }
    S4 = { machines, gear, street, offs, broken, cols, flashT: null, hinted: false, cfg, dead: false };
    st.aiming = false;
  }
  const bodyHex = (hex, k) => { const c = new T3.Color(hex).lerp(new T3.Color('#101014'), 1 - k); return `#${c.getHexString()}`; };
  function dropFrom(list, item) { const i = list.indexOf(item); if (i >= 0) list.splice(i, 1); }

  /** Walks into a scene: the world, the spawn, the first plane, the fade in. The director calls this at the start of each scene. */
  let sceneSeq = 0;
  async function enterScene(scene) {
    const seq = ++sceneSeq;
    st.scene = scene; st.goal = ''; st.examine = null; st.cut = null; ui.cut(false); app.dataset.cutfx = ''; st.shot = -1; interact.reset(); placeTargets(scene); st.aiming = false; st.camMode = scene.camera ?? 'plano'; app.dataset.hide = ''; delete app.dataset.hide; delete app.dataset.seq;
    st.ready = (async () => {
      const w = await loadWorld(scene);
      if (seq !== sceneSeq) return;
      const sp = scene.spawn ?? { pos: [0, 0], yaw: 0 };
      player.place(sp.pos, sp.yaw); player.crouch = false; player.run = false;
      if (scene.light !== undefined) player.light = scene.light; else player.light = player.light ?? false;
      st.shot = pickShot(scene.shots, player.pos, -1); st.moveLatched = false; st.follow = null; cam3.place(player.body);
      st.fadeIn = FADE_IN; st.flashed = 0;
      for (const m of Object.values(scene.setup ?? {})) w.sc.setThing?.(m[0], m[1]);
      setupStreet(scene, w);
      app.dataset.ctx = ctxName();
    })();
    return st.ready;
  }

  // ---- what the person is doing: the context of the input ---------------------------------------------------------------------------
  function ctxName() {
    if (st.cut) return 'cut';
    if (st.seq?.phase === 'cine') return 'cut';
    if (st.screen) return 'screen';
    if (desk?.active) return 'radio';
    if (hands?.active) return 'hands';
    if (st.examine) return 'examine';
    return 'walk';
  }
  function inputCtx() { const c = ctxName(); return c === 'radio' ? desk.sub : c; }

  // ---- the points of a scene --------------------------------------------------------------------------------------------------------
  function say(who, text, d, voice) {
    ui.say(who, fmt(text), d);
    if (voice) { st.handVoice?.stop(); st.handVoice = voices.play(voice, { filter: 'radio', gain: 0.9 }); }
  }
  function usePoint(p) {
    audio.play('bip', { gain: 0.6 });
    const used = director?.use(p.id);
    if (p.kind === 'radio') { openRadio(p); return; }
    if (p.kind === 'examine' || (p.kind === 'take' && p.examine)) startExamine(p);
    if (used || p.always) applyPoint(p, used);
  }
  /** What a point does when it is used (and the story was waiting for it): say something, hand over an item, change a thing of the world. */
  function applyPoint(p) {
    if (p.say) say(p.say.who ?? '', p.say.text, p.say.dur ?? (p.say.voice ? dur(p.say.voice, p.say.text) : 3), p.say.voice);
    if (p.give && !run.pocket.includes(p.give)) { run.pocket.push(p.give); ui.toast(`Pegou: ${p.give}`, now()); audio.play('pega', { gain: 0.6 }); }
    for (const item of p.take ?? []) dropFrom(run.pocket, item);
    if (p.put) for (const item of [].concat(p.put)) if (!run.pocket.includes(item)) run.pocket.push(item);
    if (p.thing) st.world?.sc.setThing?.(p.thing[0], p.thing[1]);
    if (p.set) Object.assign(run.flags, p.set);
    if (p.sfx) audio.play(p.sfx, { gain: 0.8 });
    if (p.once) { const t = targets.get(p.id); if (t) t.done = true; }
  }
  /** After the hands or the radio: back to walking, and the button that closed it must be let go before it can use anything (E would open the notebook again). */
  function backToWalking() { app.dataset.ctx = ctxName(); ui.sayClear(); interact.reset(); interact.st.needRelease = true; }
  function startExamine(p) {
    if (!p.examine) return;
    if (p.examine.fp) {                      // first person on his hands: the notebook (Jonas takes it out and turns its pages)
      if (!hands.start(p.examine.fp, { face: p.pos, onEnd: backToWalking })) return;
      interact.reset(); app.dataset.ctx = 'hands';
      if (p.give && !run.pocket.includes(p.give)) { run.pocket.push(p.give); ui.toast(`Pegou: ${p.give}`, now()); }
      if (document.pointerLockElement === canvas) document.exitPointerLock?.();
      return;
    }
    st.examine = { point: p, look: { yaw: 0, pitch: 0 } }; st.peek = { yaw: 0, pitch: 0 };
    audio.play('corte', { gain: 0.5 }); app.dataset.ctx = 'examine'; interact.reset();
    if (p.examine.text) ui.say('', fmt(p.examine.text), 7);
    if (p.give && !run.pocket.includes(p.give)) { run.pocket.push(p.give); ui.toast(`Pegou: ${p.give}`, now()); }
    try { canvas.requestPointerLock?.()?.catch?.(() => {}); } catch { /* needs a gesture */ }
  }
  function endExamine() { st.examine = null; audio.play('corte', { gain: 0.5 }); ui.sayClear(); app.dataset.ctx = ctxName(); if (document.pointerLockElement === canvas) document.exitPointerLock?.(); }

  // ---- a cutscene: the planes one after the other, a few lines, skipped by holding Esc or Start (a button on touch) -------------------------------
  const lerp3 = (a, b, u) => a.map((v, i) => v + (b[i] - v) * u);
  const ease = (u) => u * u * (3 - 2 * u);
  async function startCut(b, done) {
    const c = { b, done, t: 0, plan: [], total: 0, lines: [], sfx: [], actors: [], loading: true, shots: b.shots ?? st.scene.shots, voices: [] };
    st.cut = c;
    ui.cut(true); ui.cutHint(touch.visible ? '' : device() === 'gamepad' ? 'Segure Start por 1 s para pular' : 'Segure Esc por 1 s para pular');
    app.dataset.ctx = 'cut'; app.dataset.cutfx = b.overlay ?? ''; interact.reset();
    await st.ready;
    if (b.world && st.world?.name !== b.world) await loadWorld({ world: b.world, entities: b.entities ?? [] });
    if (st.cut !== c) return;
    c.plan = (b.plan ?? []).map((p) => ({ ...p, shotObj: c.shots.find((s) => s.id === p.shot) ?? c.shots[0] }));
    c.total = c.plan.reduce((a, p) => a + p.dur, 0) + (b.tail ?? 0);
    c.lines = (b.lines ?? []).map((l) => ({ ...l, shown: false }));
    c.sfx = (b.sfx ?? []).map((x) => ({ ...x, played: false }));
    c.actors = (b.actors ?? []).map((a) => { const d = buildDog(r, { seed: a.seed ?? 3 }); st.world.sc.group.add(d.root); return { a, d }; });
    c.loading = false; st.shot = Math.max(0, st.shot);
  }
  function cutPlan() { const c = st.cut; let t = c.t; for (const p of c.plan) { if (t < p.dur) return { p, u: t / p.dur }; t -= p.dur; } const p = c.plan.at(-1); return p ? { p, u: 1 } : null; }
  /** The camera of the cutscene now: the shot of the plan, moving from its eye to `eye2` and its target to `at2` when it has them. */
  function cutCamera() {
    const cp = cutPlan(); if (!cp) return null;
    const s = cp.p.shotObj, u = ease(Math.min(1, cp.u));
    const eye = s.eye2 ? lerp3(s.eye, s.eye2, u) : s.eye, at = s.at2 ? lerp3(s.at, s.at2, u) : s.at;
    const dir = [at[0] - eye[0], at[1] - eye[1], at[2] - eye[2]];
    return { eye, at, dir, fov: s.fov ?? null, aim: { pos: eye, dir } };
  }
  function stepCut(it) {
    const c = st.cut;
    if (c.loading) { if (it.skip) { c.t = 1e9; } else return; }
    c.t += STEP;
    for (const l of c.lines) if (!l.shown && c.t >= l.t) {
      l.shown = true;
      const from = typeof l.from === 'string' ? (MARCAS[l.from.slice(1).split('.')[0]]?.[l.from.split('.')[1]] ?? 0) : (l.from ?? 0);
      // how long a caption stays is how long its recording is (from the point it starts at); only a line with no voice has a length of its own
      if (l.who !== undefined || l.text) ui.say(l.who ?? '', fmt(l.text), l.dur ?? (l.voice ? Math.max(1, dur(l.voice, l.text) - from) : 3));
      if (l.voice) c.voices.push(voices.play(l.voice, { filter: l.filter ?? 'radio', from }));
    }
    for (const x of c.sfx) if (!x.played && c.t >= x.t) { x.played = true; audio.play(x.name, { gain: x.gain ?? 0.7 }); }
    for (const { a, d } of c.actors) {
      const u = Math.max(0, Math.min(1, (c.t - a.t0) / Math.max(0.01, a.t1 - a.t0))), { pos: p, yaw } = routeAt(a, u);   // (its way may have corners: `via`)
      d.root.visible = c.t >= a.t0 - 0.01;
      d.root.position.set(p[0], st.world.sc.ground?.(p[0], p[1]) ?? 0, p[1]);
      d.root.rotation.y = yaw;
      d.update(STEP, { speed: u > 0 && u < 1 ? a.speed ?? 1.1 : 0, state: a.state ?? 'calma' });
    }
    const cp = cutPlan(); if (cp) { const idx = c.plan.indexOf(cp.p); if (idx !== c.idx) { if (c.idx !== undefined) audio.play('corte', { gain: 0.4 }); c.idx = idx; } }
    if (it.skip || c.t >= c.total) endCut();
  }
  function endCut() {
    const c = st.cut; st.cut = null; ui.cut(false); ui.sayClear(); app.dataset.ctx = ctxName(); app.dataset.cutfx = '';
    for (const v of c.voices) v.stop();
    for (const { d } of c.actors) d.root.parent?.remove(d.root);
    st.shot = pickShot(st.scene.shots, player.pos, -1); st.follow = null; c.done?.();
  }

  // ---- the radio ---------------------------------------------------------------------------------------------------------------------
  function openRadio(p) {
    if (desk.active) return;
    if (!desk.open(p?.entity ?? p?.id ?? 'radio-bancada')) { ui.toast('O rádio não está aqui', now()); return; }
    app.dataset.ctx = 'radio'; interact.reset(); ui.sayClear();
    if (document.pointerLockElement === canvas) document.exitPointerLock?.();
  }
  /** Jonas puts the microphone back and gets up (the radio core leaves first: a question with patience counts as silence). */
  function leaveRadio() { if (desk.active && desk.phase === 'on') desk.leave(); }
  /** At once, with no animation: a new game, the title, the end of a night. */
  function closeRadio() { if (!desk) return; if (desk.active) desk.reset(); hands?.end(); input.capture(false); st.closeLeft = 0; st.radioVoice?.stop(); st.txVoice?.stop(); if (st.phase === 'play') app.dataset.ctx = ctxName(); }
  function onRadio(e) {
    if (e.type === 'heard') { ui.heard(now()); audio.play('ouvido', { gain: 0.7 }); }
    else if (e.type === 'line') { st.radioVoice?.stop(); st.radioVoice = e.id && DURATIONS[e.id] ? voices.play(e.id, { filter: e.id === REPRESA_VOICE || e.id === 'r-represa-alt' ? 'tape' : 'radio' }) : null; }
    else if (e.type === 'ask') st.radioVoice?.stop();
    else if (e.type === 'open') { const c = radio.conv; if (c?.phase === 'line' && !(st.radioVoice && !st.radioVoice.stopped)) {   // (opening on a line that has just started: its voice is already playing, once)
       const n = c.def.nodes[c.node]; if (n.voice && DURATIONS[n.voice]) st.radioVoice = voices.play(n.voice, { filter: n.voice === REPRESA_VOICE ? 'tape' : 'radio', from: Math.min(c.t, DURATIONS[n.voice] - 0.05) }); } }
    else if (e.type === 'close') { st.radioVoice?.stop(); st.txVoice?.stop(); }
    else if (e.type === 'tx-start') { audio.play('radio-tx', { gain: 0.35 }); st.txVoice?.stop(); st.txVoice = e.voice && DURATIONS[e.voice] ? voices.play(e.voice, { filter: 'none', gain: 1 }) : null; }
    else if (e.type === 'tx-end') { audio.play('radio-solta', { gain: 0.4 }); st.txVoice?.stop(); st.txVoice = null; }
    else if (e.type === 'keys') audio.play(e.ok ? 'cartao' : 'ui-no', { gain: 0.5 });
    else if (e.type === 'silence') audio.play('ui-no', { gain: 0.25 });
    else if (e.type === 'end') {
      st.radioVoice?.stop();
      const label = `${CONVERSATIONS[e.id]?.titulo?.split(':')[0] ?? e.id}: ${e.outcome}${e.silences ? `, calou ${e.silences}x` : ''}`;
      if (!/^n1-(recado|represa)$/.test(e.id)) run.choices.push({ id: e.id, outcome: e.outcome, silences: e.silences, label });
    }
    if (e.type === 'end') director?.event(e);
  }

  // ---- the quick reaction -----------------------------------------------------------------------------------------------------------
  function onQuick(e) {
    if (e.type === 'quick-start') audio.play('reacao-abre', { gain: 0.6 });
    else if (e.type === 'quick') {
      audio.play(e.hit ? 'reacao-acerto' : 'reacao-erro', { gain: 0.7 });
      if (e.auto) ui.toast('Reação automática (a opção está desligada)', now());
      else if (!e.hit) ui.toast('Tarde demais', now());
      director?.event(e);
    }
  }
  // ---- the splice as an action sequence (scene 4): the cutscene of the dog arriving, then the reaction, step by step (src/systems/sequence.js, emenda.js) ------
  /** The things the sequence puts on the pavement: the grate where the dog's leap jammed the loose end of the cable, and the strand of cable itself. */
  function buildSeqProps(variant) {
    const g = new T3.Group(), ground = st.world.sc.ground?.(EM.CABLE.grate[0], EM.CABLE.grate[1]) ?? 0.15;
    const out = { group: g, tail: null, set() {}, dispose() { g.removeFromParent(); g.traverse((o) => { o.geometry?.dispose?.(); }); } };
    if (variant === 'curta') { st.world.sc.group.add(g); return out; }
    const frame = new T3.Mesh(new T3.BoxGeometry(1.0, 0.05, 0.64), r.mat('#202228')); frame.position.set(EM.CABLE.grate[0], ground + 0.02, EM.CABLE.grate[1]); g.add(frame);
    const hole = new T3.Mesh(new T3.BoxGeometry(0.9, 0.02, 0.54), r.mat('#050507')); hole.position.set(EM.CABLE.grate[0], ground + 0.05, EM.CABLE.grate[1]); g.add(hole);
    for (let i = -4; i <= 4; i++) { const b = new T3.Mesh(new T3.BoxGeometry(0.045, 0.045, 0.6), r.mat('#6a6e76')); b.position.set(EM.CABLE.grate[0] + i * 0.105, ground + 0.07, EM.CABLE.grate[1]); g.add(b); }
    const mat = r.mat('#17171b');
    const tail = new T3.Mesh(new T3.BufferGeometry(), mat); tail.frustumCulled = false; g.add(tail);
    out.tail = tail;
    out.set = (pts) => {
      if (!pts) { tail.visible = false; return; }
      tail.visible = true;
      const curve = new T3.CatmullRomCurve3(pts.map((p) => new T3.Vector3(p[0], p[1], p[2])));
      const geo = new T3.TubeGeometry(curve, 20, 0.05, 6, false); tail.geometry.dispose(); tail.geometry = geo;
    };
    st.world.sc.group.add(g);
    return out;
  }
  /** The blood of the attack (the person's decision of 2026-11-17, only in this game): drops in the air, a pool on the pavement, blots on him. Made only when `gore()` is on, and never otherwise. */
  function buildBlood(at, seed) {
    const g = new T3.Group(); g.name = 'sangue';
    const gy = st.world.sc.ground?.(at[0], at[1]) ?? 0.15;
    const dropMat = r.mat('#6a0e14'), darkMat = r.mat('#450910');
    const drops = Array.from({ length: EM.BLOOD.n }, () => { const m = new T3.Mesh(new T3.SphereGeometry(0.024, 5, 4), dropMat); m.visible = false; g.add(m); return m; });
    const flat = (mat, sides) => { const m = new T3.Mesh(new T3.CircleGeometry(1, sides), mat); m.rotation.x = -Math.PI / 2; m.visible = false; g.add(m); return m; };
    const pool = flat(darkMat, 14), stains = [flat(darkMat, 9), flat(dropMat, 9), flat(darkMat, 8)];
    st.world.sc.group.add(g);
    return {
      group: g, parts: drops.length + 1 + stains.length,
      update(tau) {
        const b = EM.bloodAt(tau, at, seed);
        b.pts.forEach((p, i) => { const m = drops[i]; if (!p) { m.visible = false; return; } m.visible = true; m.position.set(p[0], gy + p[1] - 0.2, p[2]); });
        pool.visible = b.pool > 0.01; pool.scale.set(Math.max(0.01, b.pool), Math.max(0.01, b.pool * 0.75), 1); pool.position.set(at[0] + 0.1, gy + 0.03, at[1] + 0.05);
        stains.forEach((m, i) => { const s = b.stains[i]; m.visible = s.r > 0.01; m.scale.set(Math.max(0.01, s.r), Math.max(0.01, s.r), 1); m.position.set(s.x, gy + 0.3 + i * 0.01, s.z); });
      },
      dispose() { g.removeFromParent(); g.traverse((o) => { o.geometry?.dispose?.(); }); },
    };
  }
  /** The sparks of the dog's shorted battery: a few hot points round the socket of its back, from the time (deterministic). */
  function buildSparks() {
    const g = new T3.Group(), mat = r.glow ? r.glow('#ffd070') : r.mat('#ffd070');
    const pts = Array.from({ length: 16 }, () => { const m = new T3.Mesh(new T3.BoxGeometry(0.07, 0.07, 0.07), mat); m.visible = false; g.add(m); return m; });
    st.world.sc.group.add(g);
    return {
      group: g,
      set(k, dog, t) {
        const rg = mulberry32(Math.floor(t * (options.flashes ? 4 : 24)) + 77);       // ("reduzir clarões": fewer, slower sparks)
        pts.forEach((m, i) => { if (!k || rg() > k) { m.visible = false; return; } const a = rg() * 6.28, d = 0.1 + rg() * 0.35, sy = Math.sin(dog.yaw ?? 0), cy = Math.cos(dog.yaw ?? 0); m.visible = true; m.position.set(dog.pos[0] + Math.cos(a) * d * 0.7 + sy * 0.45, 0.85 + rg() * 0.5, dog.pos[1] + Math.sin(a) * d * 0.7 + cy * 0.45); });
      },
      dispose() { g.removeFromParent(); g.traverse((o) => { o.geometry?.dispose?.(); }); },
    };
  }
  /** `opts`: { retry, variant, from }: the checkpoint brings him back to the start of the splice (the cutscene is skipped, the fade comes up from black). */
  function startSequence(opts = {}) {
    if (st.seq || !S4) return;
    const cfg = S4.cfg, sp = cfg.splice, id = cfg.dogs[0].id;
    const dg = S4.machines.list().find((x) => x.id === id), far = dg && dist2(dg.pos, sp.pos) > 14;
    const forced = q.get('emenda');
    // the decoy that took the dog far away makes it shorter and easier: the dog only passes at a distance and looks (two steps, no leap, no stuck cable)
    const variant = opts.variant ?? (forced === 'cheia' || forced === 'curta' ? forced : far ? 'curta' : 'cheia');
    const from = opts.from ?? (mulberry32(((run.seed >>> 0) ^ 0x5eed) >>> 0)() < 0.5 ? -1 : 1);           // from which side of the lane the dog leaps (the seed of the game)
    const noQuiet = !run.pocket.includes('isca-reserva');                                                  // the lure pressed against the sensor is the reserve one
    // the dodge is always to the left (south, away from the skip, where the dog is going to slide): the seed only decides which side of the lane the dog leaps from
    const steps = EM.STEPS[variant].map((x) => (x.kind === 'dir' ? { ...x, want: -1 } : x.kind === 'pick' ? { ...x, noQuiet } : x));
    const rec = { variant, from, starts: [], wins: [], hits: [], dodge: null, knockedAt: null, closedAt: null, freedAt: null, mash: 0, choice: null, slowK: 0 };
    const S = { variant, steps, rec, id, phase: 'cine', t: 0, ct: 0, prevDown: false, prevSx: 0, pose: null, dead: false, fade: 0, sfxAt: 0, shot: -1, said: new Set(), props: null, slowK: 0, timeScale: 1, blood: null, sparks: null, goreOn: true, over: null };
    S.sq = createSequence({ steps, options, emit: (e) => onSeq(e) });
    S.props = buildSeqProps(variant);
    st.seq = S4.seq = S;
    quick.cancel(); player.pos = [...EM.J]; player.body = 0; player.hidden = null; interact.reset();
    // the checkpoint of the splice: a death comes back here, not to the start of the exit (the card holds it, with what is in the pocket)
    if (!opts.retry && director.scene) { run.cp = { scene: director.scene.id, at: 'saida-emenda', variant, from }; checkpoint(); }
    ui.cut(true); ui.cutHint(touch.visible ? '' : device() === 'gamepad' ? 'Segure Start por 1 s para pular a cena' : 'Segure Esc por 1 s para pular a cena');
    app.dataset.ctx = 'cut'; delete app.dataset.seq;
    S.pose = EM.cinePose(variant, 0); S4.machines.puppet(id, S.pose.dog);
    if (opts.retry) { S.ct = EM.CINE[variant] - 1e-3; st.fadeIn = FADE_IN * 1.4; }        // (the dog is where the cutscene left it: it goes straight to the first command)
  }
  function dropSequence() {
    const S = st.seq; if (!S) return;
    S.props?.dispose(); S.blood?.dispose(); S.sparks?.dispose(); S4?.machines.puppet(S.id, null);
    st.seq = null; if (S4) S4.seq = null;
    ui.sign(null); ui.cut(false); ui.gameOver(null); delete app.dataset.seq; app.dataset.ctx = ctxName();
  }
  /** A step of the sequence is over, or begins: the sound, the consequence, what the picture will need (rec). */
  function onSeq(e) {
    const S = st.seq; if (!S) return; const rec = S.rec;
    if (e.type === 'step-start') {
      rec.starts[e.i] = S.t; rec.wins[e.i] = S.sq.view().total;
      if (e.kind === 'dir') { audio.play('cao-salta', { gain: 0.8 }); audio.play('camera-lenta', { gain: 0.7 }); }
      else if (e.i > 0) audio.play('reacao-abre', { gain: 0.5 });
      if (e.i === 3 && rec.choice?.id === 'quiet') audio.play('isca-perto', { gain: 0.8 });
    } else if (e.type === 'step') {
      rec.hits[e.i] = e.hit;
      audio.play(e.hit ? 'reacao-acerto' : 'reacao-erro', { gain: 0.7 });
      S.lastStep = { kind: e.kind, hit: e.hit, auto: e.auto, at: S.t, i: e.i };
      const fatal = S.sq.view().fatal, last = e.i === S.sq.view().count - 1;
      if (e.kind === 'dir') {
        const d = S.sq.view().dodge;
        if (e.hit) rec.dodge = { side: d.side, at: rec.starts[e.i] + d.at };
        else { rec.knockedAt = rec.starts[e.i] + rec.wins[e.i]; S.goreOn = gore(); }  // the dog gets to him when its leap ends
      } else if (e.kind === 'pick') {
        if (e.hit) { rec.choice = { id: e.choice, at: S.t }; if (e.choice === 'loud') rec.spent = true; }
      } else if (e.i === 3 && rec.choice && e.hit) {
        rec.b1End = S.t;
        if (rec.choice.id === 'quiet') {
          // the lure was spent at the sensor: the dog is deaf for a while
          rec.deafAt = S.t; dropFrom(run.pocket, 'isca-reserva'); run.flags.iscaGasta = true; audio.play('cao-surdo', { gain: 0.8 });
        } else {
          // the bare end of the cable in the socket of its back: the battery shorts, the dog falls switched off; the network sees one dog less
          rec.jabAt = S.t; run.flags.caoDesativado = true; audio.play('curto', { gain: 0.9 });
          escuta.raise(EM.ESCUTA_DISABLE, 'dog-disabled'); ui.heard(now()); ui.toast('A rede perdeu o sinal de um cão: a Escuta subiu', now());
        }
      } else if (!e.hit && !fatal) seqMiss();
      if (e.kind === 'mash' && e.hit) { rec.freedAt = S.t; audio.play('cabo-solta', { gain: 0.8 }); }
      if (e.kind === 'press' && last) closeSplice();                                 // (missed: it closes anyway, with the noise)
    } else if (e.type === 'seq-end') {
      if (e.outcome === 'done') { endSequence(); return; }
      S.goreOn = gore();
      if (e.outcome === 'bitten') {
        // it recovers and goes for him: from the skip to where he is (at the dog, if he was kneeling at it)
        const atDog = S.sq.view().log.at(-1)?.i === 3;
        rec.failAt = S.t; rec.knock = { S: [...EM.DUMP.hit], C: [...(atDog ? EM.DUMP.near[rec.choice.id] : EM.J)] }; rec.knockedAt = S.t + EM.ATTACK.bite;
      }
    }
  }
  /** Missing a step that is not the dodge: the noise, the Escuta (+8, as any reaction missed in the street), and the game goes on. */
  function seqMiss() {
    escuta.raise(SEQ_ESCUTA, 'reaction'); ui.heard(now());
    bus.emit('noise', { pos: [...EM.J], loud: 0.7, kind: 'fall', src: 'jonas-fall' });
  }
  function closeSplice() {
    const S = st.seq, rec = S.rec; rec.closedAt = S.t;
    S4.street.finish(st.handRadio);
    for (const e of S4.street.take()) if (e.type === 'say') say('Tânia', TANIA[e.id] ?? '', dur(e.id, TANIA[e.id]), e.id);        // ("Feito. Volta pela grade, devagar.", on the hand radio)
    st.world.sc.ents.setParam(S4.cfg.cable, 'emendado', true); st.world.sc.setThing?.('paineis', 'limpo');
    audio.play('consertar', { gain: 0.8 });
  }
  /** Jonas goes into the skip (the quiet way out): hidden, as if he had pressed the key at it. */
  function hideInSkip() {
    const h = st.world.sc.hides.find((x) => /cacamba/.test(x.id)); if (!h) return;
    st.hideFrom = [...EM.J]; player.pos = [h.pos[0], h.pos[2] ?? h.pos[1]]; player.hidden = h.id; player.crouch = true; player.run = false;
    cam3.place(Math.PI / 2);
  }
  /** The dog is let go and the story goes on: back down the shaft. The way it ended decides what is left in the street (a dog that is switched off, or one that went on along its route). */
  function endSequence() {
    const S = st.seq, dog = S.pose?.dog, ch = S.rec.choice?.id, id = S.id;
    if (ch === 'loud') { /* the dog stays down: the puppet is put back below */ }
    else S4.machines.release(id, { pos: dog?.pos, yaw: dog?.yaw });
    S4.machines.grace('jonas', ch === 'quiet' ? 30 : 8);
    player.crouch = false; player.body = -Math.PI / 2; cam3.place(-Math.PI / 2);          // he gets up facing east, where the shaft is
    dropSequence(); if (st.view) st.view.work = null;
    if (ch === 'loud') {
      // it lies where it fell, like the broken one; it is a body: a box the size of the dog keeps Jonas from walking through it
      S4.machines.puppet(id, { pos: [...EM.DUMP.hit], yaw: EM.DUMP.yaw, speed: 0, state: 'desligado', sensor: '#16161a', y: 0, pitch: 0 });
      S4.down = id; S4.cols.push({ min: [EM.DUMP.hit[0] - 0.7, EM.DUMP.hit[1] - 0.3], max: [EM.DUMP.hit[0] + 0.7, EM.DUMP.hit[1] + 0.3] });
    } else if (ch === 'quiet') hideInSkip();
    ui.toast('Cabo emendado: a bateria volta a carregar', now()); director.signal('saida-emenda');
  }
  /** The checkpoint came back (a death, or "Continuar"): Jonas is at the cable, the street is made, and the sequence starts at its first command. */
  function resumeSplice(cp) {
    if (!S4 || st.seq) return;
    if (director.waitName !== 'saida-emenda') return;
    startSequence({ retry: true, variant: cp.variant, from: cp.from });
  }
  /** The world is slow while the dodge is asked for, and eases back. */
  function seqScale(S) {
    const v = S.sq.view(), on = v.active && !v.gap && v.kind === 'dir';
    S.slowK += ((on ? 1 : 0) - S.slowK) * Math.min(1, STEP * (on ? EM.SLOW.easeIn : EM.SLOW.easeOut));
    S.slowK = Math.max(0, Math.min(1, S.slowK)); if (S.slowK < 0.002 && !on) S.slowK = 0;
    S.rec.slowK = S.slowK;
    return 1 - S.slowK * (1 - EM.SLOW.scale);
  }
  function stepSequence(it) {
    const S = st.seq, id = S.id;
    const scale = S.phase === 'act' ? seqScale(S) : 1, dt = STEP * scale;
    S.timeScale = scale;
    S.t += dt;
    if (S.phase === 'cine') {
      S.ct += STEP; const total = EM.CINE[S.variant];
      S.pose = EM.cinePose(S.variant, Math.min(S.ct, total - 1e-4));
      if (S.pose.shot !== S.shot) { if (S.shot >= 0) audio.play('corte', { gain: 0.4 }); if (S.pose.shot === 1) audio.play('cao-desconfiado', { gain: 0.9 }); S.shot = S.pose.shot; }
      if (S.pose.dog.speed > 0.5 && S.ct - S.sfxAt > 0.4) { S.sfxAt = S.ct; audio.play('cao-rolar', { pos: [S.pose.dog.pos[0], 1, S.pose.dog.pos[1]], gain: 0.7 }); }
      if (it.skip || S.ct >= total) {
        S.phase = 'act'; S.t = 0; ui.cut(false); app.dataset.ctx = 'walk'; app.dataset.seq = '1'; interact.reset(); ui.sayClear();
        S.sq.start();
      }
    } else {
      const down = it.press.down, edgeUse = down && !S.prevDown; S.prevDown = down;
      const sx = Math.abs(it.mx) > 0.6 ? Math.sign(it.mx) : 0; let dir = it.dir; if (!dir && sx && sx !== S.prevSx) dir = sx; S.prevSx = sx;
      const react = it.react || st.reactNow; st.reactNow = false;
      const v0 = S.sq.view();
      S.sq.step(dt, { held: down, press: edgeUse, dir, react });
      const v = S.sq.view(); S.rec.mash = v.kind === 'mash' && !v.gap ? v.progress : S.rec.mash;
      if (v.kind === 'mash' && !v.gap && (edgeUse || dir || react) && v.progress > v0.progress - 1) audio.play('cabo-puxa', { gain: 0.5 });
      S.pose = EM.actionPose(S.variant, S.rec, S.t);
      // the dog's sounds: the servo while it walks, the stinger of the leap, the skid into the skip
      const dg = S.pose.dog;
      if (dg.speed > 0.5 && S.t - S.sfxAt > 0.38) { S.sfxAt = S.t; audio.play('cao-rolar', { pos: [dg.pos[0], 1, dg.pos[1]], gain: 0.8 }); }
      const rk = S.rec;
      if (rk.starts[1] !== undefined && !S.said.has('slam') && rk.knockedAt == null && S.t >= rk.starts[1] + rk.wins[1] + EM.DUMP.slide) { S.said.add('slam'); audio.play('cao-bate', { gain: 0.9 }); bus.emit('noise', { pos: [...EM.DUMP.hit], loud: 0.6, kind: 'fall', src: id }); }
      // the dog's battery, when it is shorted
      if (S.pose.fx.dogSpark > 0 || S.sparks) { S.sparks ??= buildSparks(); S.sparks.set(S.pose.fx.dogSpark * (options.flashes ? 0.4 : 1), dg, S.t); }
      // the attack: the sound, the blood (only if the option is on), then the black, the game over, and the way back
      if (rk.knockedAt != null) {
        const k = S.t - rk.knockedAt, on = S.goreOn, A = EM.ATTACK, T = on ? A : A.off;
        if (k >= 0 && !S.said.has('hit')) {
          S.said.add('hit');
          if (on) { audio.play('cao-ataque', { gain: 0.95 }); S.blood = gore() ? buildBlood(rk.knock?.C ?? EM.J, run.seed) : null; }
          else audio.play('abafado', { gain: 0.9 });
        }
        if (S.blood && k >= 0) S.blood.update(k);
        S.fade = on ? Math.max(0, Math.min(1, (k - A.fadeAt) / 0.6)) : Math.max(0, Math.min(1, (k - A.off.fadeAt) / A.off.fade));
        if (k >= T.overAt && !S.over) { S.over = { at: S.t }; audio.play('fim-de-jogo', { gain: 0.8 }); ui.gameOver({ why: 'O cão pegou o Jonas.', hint: fmt('{use}: voltar ao último ponto salvo') }); }
        const again = S.over && S.t - S.over.at > 0.8 && (edgeUse || react);
        if ((k >= T.reloadAt || again) && !S.dead) { S.dead = true; bus.emit('person:down', { id: 'jonas', by: id }); return; }
      }
    }
    S4.machines.puppet(id, S.pose.dog);
    S4.machines.update(dt, { people: [] });
    S4.gear.update(dt);
    S.props?.set(S.pose.tail);
    director.update(dt, { pos: player.pos });
  }
  // ---- the run ------------------------------------------------------------------------------------------------------------------------
  function bind(saved) {
    run = saved; run.choices ??= []; run.pocket ??= []; run.flags ??= {};
    teardownStreet();
    escuta = createEscuta(run.escuta); trust = createTrust(run.trust);
    closeRadio(); st.handRadio = false;
    radio = createRadio({ escuta, trust, flags: run.flags, conversations: CONVERSATIONS, channels: RADIO.channels, secrets: SECRETS, options, saved: run.radio, emit: onRadio });
    director = createDirector({ nights: NIGHTS, scenes: SCENES, run, escuta, trust, radio, quick, hooks: {
      sceneStart: (scene) => { enterScene(scene).then(() => { const cp = run?.cp; if (cp && cp.scene === scene.id) resumeSplice(cp); }); },
      checkpoint: () => checkpoint(),
      goal: (t) => { st.goal = t; },
      say: (who, text, d, voice) => say(who, text, d, voice),
      voiceDur: (voice, text) => dur(voice, text),
      closeRadio: (delay) => { st.closeLeft = delay; },
      cutscene: (b, done) => { startCut(b, done); },
      nightEnd: (id, summary, next) => nightEnd(id, summary, next),
      hurt: () => { ui.toast('Jonas se feriu: manca até o fim da noite', now()); },
      pocket: (add, remove) => { for (const x of remove) dropFrom(run.pocket, x); for (const x of add) if (!run.pocket.includes(x)) run.pocket.push(x); },
      thing: (name, state) => { st.ready?.then(() => st.world?.sc.setThing?.(name, state)); },
      light: (on) => { player.light = Boolean(on); },
      sfx: (name) => audio.play(name, { gain: 0.8 }),
      blink: (on) => radio.setBlink(on),
      handRadio: () => st.handRadio,
    } });
  }
  function serialize() { run.escuta = escuta.state(); run.trust = trust.state(); run.radio = radio.state(); run.at = Date.now(); return run; }
  /** The start of every scene is saved: the card holds the state the scene began in, and a death returns to it. */
  function checkpoint() {
    const snap = copy(serialize());
    // the demonstration and the jumps (?cena=) never touch the card: their checkpoint stays in memory, so the person's game (block 1) and "Continuar" are left alone
    if (run.temp) { st.snap = snap; return; }
    card.save(snap);
    if (run.scene === 0 && /^noite-/.test(run.night)) card.nightStart(run.night, snap);
    if (st.phase === 'play') { ui.toast('Salvo no cartão (bloco 1)', now()); audio.play('cartao', { gain: 0.5 }); }
  }
  function nightEnd(id, summary, next) {
    const lines = [`Escuta ao fim: ${summary.escuta}`, ...run.choices.map((c) => c.label)];
    if (/^noite-/.test(id) && !run.temp) card.nightDone(id, { escuta: summary.escuta, trust: summary.trust, choices: run.choices.map((c) => c.label), flags: summary.flags });
    closeRadio(); st.phase = 'end'; teardownStreet();
    if (id === 'demo') screens.open('end', { title: 'Fim da demonstração', text: 'O núcleo narrativo funcionou do começo ao fim: andar, examinar, o rádio, calar, a reação rápida, o salvamento. As noites de verdade ainda estão em construção.', lines, again: 'Jogar a demonstração de novo', demo: true });
    else if (id === 'noite-1') screens.open('cardend', { night: 1, escuta: summary.escuta, lines, block: 13 });
    else screens.open('end', { title: `Fim da noite ${NIGHTS[id].numero}`, text: next ? 'O cartão guardou a noite. A próxima abre conforme a Escuta.' : 'O fim da última noite, com os finais, ainda está em construção.', lines, again: next ? `Começar a noite ${NIGHTS[next].numero}` : 'Voltar ao título', next });
  }
  const startRun = (night, seed = freshSeed(), temp = false) => {
    ui.sayClear(); closeRadio();
    const fresh = createRun({ seed, night }); if (temp || night === 'demo') fresh.temp = true;
    bind(fresh); st.phase = 'play'; screens.close(true); st.screen = null;
    audio.resume(); ui.cut(false); document.getElementById('hint')?.remove();
    director.beginNight();
    app.dataset.ctx = ctxName();
  };
  /** A jump to one scene (?cena=n1-saida): the state the scene needs is put by hand (query: sair=agora|esperar, escuta=N, contou=0|1, mao=1), and nothing of it is saved. */
  function startJump(sceneId) {
    const night = Object.keys(NIGHTS).find((k) => NIGHTS[k].cenas.includes(sceneId)); if (!night) return false;
    ui.sayClear(); closeRadio();
    const fresh = createRun({ seed: freshSeed(), night }); fresh.temp = true; fresh.scene = NIGHTS[night].cenas.indexOf(sceneId);
    const sc = SCENES[sceneId];
    fresh.pocket = [...(sc.jumpPocket ?? [])];
    if (q.get('sair')) fresh.flags.saiAgora = q.get('sair') === 'agora';
    else if (sc.jumpFlags) Object.assign(fresh.flags, sc.jumpFlags);
    if (q.has('contou')) { fresh.flags.contou = q.get('contou') !== '0'; if (fresh.flags.contou) fresh.flags.soubeComporta = true; }
    if (q.has('acabou')) fresh.flags.chamadaAcabou = q.get('acabou') !== '0';
    if (q.has('escuta')) fresh.escuta = { value: Math.max(0, Math.min(100, Number(q.get('escuta')))) };
    bind(fresh); st.phase = 'play'; screens.close(true); st.screen = null; audio.resume(); document.getElementById('hint')?.remove();
    if (q.get('mao') === '1') st.handRadio = true;
    director.resume(); app.dataset.ctx = ctxName();
    return true;
  }
  const loadRun = (saved) => {
    ui.sayClear(); closeRadio();
    bind(copy(saved)); st.phase = 'play'; screens.close(true); st.screen = null; audio.resume(); document.getElementById('hint')?.remove();
    director.resume(); app.dataset.ctx = ctxName();
  };
  G.actions = {
    newGame() { G.actions.askGore(() => startRun('noite-1')); },
    /** The first start: a short content notice and the choice of the option "Sangue e violência gráfica" (asked once, kept on the card), then what was asked for. */
    askGore(then) { if (card.data.meta?.goreAsked) then(); else screens.open('gore', { then }); },
    goreAnswer(on, then) { options.gore = Boolean(on); card.setMeta({ goreAsked: true, opts: { ...options } }); screens.close(true); then?.(); },
    again(args) { if (args?.demo) startRun('demo'); else if (args?.next) { run.night = args.next; run.scene = 0; st.phase = 'play'; director.beginNight(); card.save(copy(serialize())); } else G.actions.toTitle(); },
    continueGame() { card.reload(); if (card.hasRun()) G.actions.askGore(() => { loadRun(card.data.run); ui.toast('Partida carregada do bloco 1', now()); }); },
    loadNight(id) { const n = card.data.nights[id]; if (n?.start) { loadRun(n.start); ui.toast(`Recomeçando da noite ${NIGHTS[id].numero}`, now()); } },
    /** The death, or "recomeçar a cena": the state of the card (the start of the scene) comes back. */
    restartScene() {
      if (run?.temp && st.snap) { loadRun(st.snap); ui.toast('Voltou ao último ponto', now()); return; }
      card.reload(); if (card.hasRun()) { loadRun(card.data.run); ui.toast('Voltou ao último salvamento', now()); } },
    toTitle() { closeRadio(); teardownStreet(); st.phase = 'title'; showTitle(); },
    toggleOption(name) {
      if (name === 'quick') options.quick = { normal: 'long', long: 'off', off: 'normal' }[options.quick];
      else { options[name] = !options[name]; if (name === 'captions') ui.setCaptions(options.captions); if (name === 'flashes') S4?.machines.setReduceFlash(options.flashes); }
      saveOptions();
    },
    volume(d) { options.volume = Math.max(0, Math.min(10, options.volume + d)); setVolume(); saveOptions(); },
    sens(d) { options.sens = Math.max(0.4, Math.min(2.4, +(options.sens + d * 0.2).toFixed(1))); saveOptions(); },
    /** The first time the menu opens it says what it is (once, kept on the card). */
    menuTip() { if (card.data.meta?.menuTip) return false; card.setMeta({ menuTip: true }); return true; },
  };
  function showTitle() {
    st.phase = 'title'; ui.sayClear(); app.dataset.ctx = 'screen'; teardownStreet();
    enterScene(SCENES['demo-1']).then(() => { st.fadeIn = 0; });
    screens.open('title');
  }
  let dying = false;
  const die = () => { if (dying) return; dying = true; ui.toast('Jonas caiu', now()); setTimeout(() => { dying = false; }, 400); G.actions.restartScene(); };

  // ---- the street: the decoy, the hiding place, the splice ----------------------------------------------------------------------------------------
  function throwDecoy() {
    const p = player.pos, c = Math.cos(st.aimPitch), dv = [-Math.sin(st.aimYaw) * c, Math.sin(st.aimPitch), -Math.cos(st.aimYaw) * c];
    if (!S4.gear.use('isca', [p[0], 1.4, p[1]], dv)) return;
    dropFrom(run.pocket, 'isca'); ui.toast('Jogou a isca', now()); audio.play('pega', { gain: 0.5 });
  }
  function toggleHide(h) {
    if (player.hidden === h.id) { player.hidden = null; if (st.hideFrom) player.pos = st.hideFrom; audio.play('corte', { gain: 0.4 }); return; }
    // inside the hiding place: the dog cannot walk in, so it cannot come within the little reach it has on someone hidden
    st.hideFrom = [...player.pos]; player.pos = [h.pos[0], h.pos[2] ?? h.pos[1]];
    player.hidden = h.id; player.crouch = true; player.run = false;
    bus.emit('noise', { pos: [...player.pos], loud: noiseOf('hide'), kind: 'hide', src: 'jonas' });
    audio.play('pega', { gain: 0.4 });
  }
  /** The boxes that stop Jonas: the scene's, and in the street the ones of the things the scene puts there (the broken dog). */
  const worldColliders = () => (S4?.cols.length ? st.world.sc.colliders.concat(S4.cols) : st.world.sc.colliders);
  const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  function stepStreet(it, walked, wantRun, cand) {
    const cur = S4, { machines, gear, street, cfg } = S4;
    machines.update(STEP, { people: [{ id: 'jonas', pos: [...player.pos], crouch: player.crouch, hidden: Boolean(player.hidden), heat: 1 }] });
    if (S4 !== cur) return;                                // the dog knocked him down: the scene started again under us
    gear.update(STEP);
    const dogs = machines.list().filter((d) => d.id !== S4.down);                       // (a dog that was switched off is not one that hears, sees, or makes him run for it)
    // the splice of the cable: held next to the cut, once Tânia or the goal sent him there
    const sp = cfg.splice, working = sp && director.waitName === 'saida-emenda' && !player.hidden && dist2(player.pos, sp.pos) <= sp.radius;
    if (working) {
      const held = it.press.down && !quick.active && !interact.st.needRelease;
      const w = street.work(STEP, held, st.handRadio);
      st.view = { ...(st.view ?? {}), work: { progress: w.progress, state: w.state } };
    } else if (st.view) st.view.work = null;
    const evs = [...street.update(STEP, { player: { pos: player.pos, run: wantRun && walked > 0, crouch: player.crouch }, dogs, handRadio: st.handRadio, trustTania: trust.get('tania'), pocket: run.pocket, cut: sp?.pos ?? null }), ...street.take()];
    for (const e of evs) {
      if (e.type === 'say') {
        say('Tânia', TANIA[e.id] ?? '', dur(e.id, TANIA[e.id]), e.id);
        bus.emit('noise', { pos: [...player.pos], loud: noiseOf('voice', { crouch: player.crouch }), kind: 'voice', src: 'jonas' });
      } else if (e.type === 'splice-quick') {
        // the dog is coming: the cutscene of the dog arriving, and then the sequence of reaction (the decoy only makes it shorter: startSequence)
        startSequence();
      }
      else if (e.type === 'spliced') {
        st.world.sc.ents.setParam(cfg.cable, 'emendado', true); st.world.sc.setThing?.('paineis', 'limpo');
        audio.play('consertar', { gain: 0.8 }); ui.toast('Cabo emendado: a bateria volta a carregar', now()); director.signal('saida-emenda');
      } else if (e.type === 'heard-by-dog') ui.toast('Um cão ouviu: a Escuta subiu', now());
      else if (e.type === 'run-near') ui.toast('Correr perto de um cão faz barulho', now());
    }
    const near = Math.min(Infinity, ...dogs.map((d) => dist2(d.pos, player.pos)));
    if (!S4.hinted && near < 10) { S4.hinted = true; ui.toast(fmt('Agache ({crouch}) ou esconda-se: {use} na caçamba'), now()); }
    // the broken dog starts to blink when he comes close enough to see it
    if (S4.broken && cfg.broken) {
      if (S4.flashT === null && dist2(player.pos, cfg.broken.pos) < 9) S4.flashT = 0;
      if (S4.flashT !== null) S4.flashT += STEP;
    }
  }
  const TANIA = Object.fromEntries((FALAS.lines ?? []).filter((l) => l.who === 'tania').map((l) => [l.id, l.text]));

  // ---- the frame: the step ----------------------------------------------------------------------------------------------------------------
  const proj = new T3.Vector3();
  const project = (c) => { proj.set(c.pos[0], 1.0, c.pos[1]).project(r.camera); if (proj.z > 1) return null; return [(proj.x * 0.5 + 0.5) * innerWidth, (-proj.y * 0.5 + 0.5) * innerHeight]; };
  const clamp = (v, a) => Math.max(-a, Math.min(a, v));
  let lookAcc = 0;

  function step() {
    const ctx = inputCtx();
    const it = input.read(ctx === 'field' ? 'screen' : ctx);
    if (st.phase === 'title' || st.phase === 'end' || st.screen) { look.take(); if (st.screen) screens.nav(it.nav); return; }
    if (st.phase !== 'play' || !st.scene || !st.world || st.shot < 0) { look.take(); return; }
    const scene = st.scene, w = st.world;
    if (st.cut) { look.take(); stepCut(it); return; }
    if (st.seq?.phase === 'cine') { look.take(); stepSequence(it); return; }
    // the radio at the bench: Jonas does what the person asks (src/desk.js); the notebook and the pocket in his hands (src/hands.js)
    if (desk.active) {
      look.take();
      desk.step(it);
      if (st.closeLeft > 0 && desk.phase === 'on') { st.closeLeft -= STEP; if (st.closeLeft <= 0) { st.closeLeft = 0; leaveRadio(); } }
      director.update(STEP, { pos: player.pos });
      if (!desk.active) { backToWalking(); st.shot = pickShot(scene.shots, player.pos, -1); st.follow = null; }
      return;
    }
    if (hands.active) { look.take(); hands.step(it); director.update(STEP, { pos: player.pos }); if (!hands.active) app.dataset.ctx = ctxName(); return; }
    if (it.pause) { screens.open('menu'); return; }
    if (st.seq) { look.take(); stepSequence(it); return; }
    // the quick reaction
    if (it.react || st.reactNow) { st.reactNow = false; if (quick.active) quick.press(); }
    quick.step(STEP);
    refreshTargets();
    if (st.examine) {
      const l = look.take(), lim = LOOK.examine;
      st.examine.look.yaw = clamp(st.examine.look.yaw + l.yaw * options.sens, lim.yaw);
      st.examine.look.pitch = clamp(st.examine.look.pitch + l.pitch * options.sens * (options.invert ? -1 : 1), lim.pitch);
      if (it.light) { player.light = !player.light; audio.play('lanterna'); }
      if (it.back) endExamine();
      director.update(STEP, { pos: player.pos });
      return;
    }
    // the look inside the plane: a small nudge, back to the middle when let go
    const l = look.take(), lim = LOOK.shot;
    const ombro = st.camMode === 'ombro';
    if (ombro) cam3.step(STEP, { look: { yaw: l.yaw * options.sens, pitch: l.pitch * options.sens }, moving: player.moving, forward: -it.mz, body: player.body, hidden: Boolean(player.hidden), invert: options.invert });
    const moved = Math.abs(l.yaw) + Math.abs(l.pitch) > 1e-5;
    if (moved) { st.peek.yaw = clamp(st.peek.yaw + l.yaw * 0.5, lim.yaw); st.peek.pitch = clamp(st.peek.pitch + l.pitch * 0.5 * (options.invert ? -1 : 1), lim.pitch); lookAcc += Math.abs(l.yaw) + Math.abs(l.pitch); if (lookAcc > 0.08) { lookAcc = 0; director.signal('look'); } }
    else { st.peek.yaw -= st.peek.yaw * Math.min(1, STEP * 3); st.peek.pitch -= st.peek.pitch * Math.min(1, STEP * 3); }
    if (it.crouch && !player.hidden) { player.crouch = !player.crouch; if (player.crouch) player.run = false; }
    if (it.toggleRun) { player.run = !player.run; if (player.run) player.crouch = false; }
    if (it.light) { player.light = !player.light; audio.play('lanterna'); if (player.light) director.signal('light'); }
    if (it.handRadio) { st.handRadio = !st.handRadio; audio.play('radio-tx', { gain: 0.4 }); ui.toast(st.handRadio ? 'Rádio de mão ligado' : 'Rádio de mão desligado', now()); }
    if (it.pocket) { interact.reset(); hands.start('bolso', { items: run.pocket, onEnd: backToWalking }); app.dataset.ctx = 'hands'; director.signal('pocket'); return; }
    // the plane: it cuts when Jonas leaves its zone; the stick keeps meaning what it meant until it is let go
    const cur = st.shot, next = ombro ? cur : pickShot(scene.shots, player.pos, cur);
    if (next !== cur) {
      const stickOn = Math.hypot(it.mx, it.mz) > 0.2;
      if (stickOn) { st.moveLatched = true; st.moveYaw = shotYaw(scene.shots[cur]); }
      st.shot = next; st.follow = null; audio.play('corte', { gain: 0.4 });
    }
    if (st.moveLatched && Math.hypot(it.mx, it.mz) < 0.1) st.moveLatched = false;
    let dir = st.moveLatched ? st.moveYaw : shotYaw(scene.shots[st.shot]);
    // over the shoulder the stick walks relative to the camera, and keeps meaning what it meant when it was pushed until it is let go (the camera swings behind him meanwhile)
    if (ombro) { const on = Math.hypot(it.mx, it.mz) > 0.2; if (on && !st.moveLatched) { st.moveLatched = true; st.moveYaw = cam3.yaw; } else if (!on) st.moveLatched = false; dir = st.moveLatched ? st.moveYaw : cam3.yaw; }
    // aiming the decoy: held, the stick turns the throw, the look tilts it; the fire throws (on touch the item button's release is the fire)
    const canAim = S4 && run.pocket.includes('isca') && !player.hidden;
    if (canAim && it.aim && !st.aiming) { st.aiming = true; st.aimYaw = ombro ? cam3.yaw : player.body; st.aimPitch = 0.5; }
    if (st.aiming && !canAim) st.aiming = false;
    if (st.aiming && it.fire) { throwDecoy(); st.aiming = false; }
    else if (st.aiming && !it.aim) st.aiming = false;
    const hurtK = run.hurt ? WALK_HURT : 1;
    const wantRun = (it.run || player.run) && !player.crouch && !run.hurt && !st.aiming;
    let walked = 0;
    if (st.aiming) {
      const m = Math.hypot(it.mx, it.mz);
      if (ombro) st.aimYaw = cam3.yaw;
      else if (m > 0.3) { const c = Math.cos(dir), s = Math.sin(dir), dx = it.mx * c + it.mz * s, dz = -it.mx * s + it.mz * c; st.aimYaw = Math.atan2(-dx, -dz); }
      st.aimPitch = Math.max(0.2, Math.min(0.85, st.aimPitch + l.pitch * 0.8));
      let d = st.aimYaw - player.body; d = Math.atan2(Math.sin(d), Math.cos(d)); player.body += d * Math.min(1, STEP * 12);
      player.step(STEP, { mx: 0, mz: 0 }, dir, { colliders: worldColliders(), limit: w.limit }, {});
    } else {
      walked = player.step(STEP * hurtK, { mx: it.mx, mz: it.mz }, dir, { colliders: worldColliders(), limit: w.limit }, { run: wantRun });
    }
    if (walked > 0) {
      st.footAcc += walked;
      const stride = wantRun ? 1.45 : player.crouch ? 0.9 : 0.8;
      if (st.footAcc > stride) {
        st.footAcc = 0; audio.play(w.step, { gain: player.crouch ? 0.2 : wantRun ? 1.0 : 0.55 });
        if (S4) bus.emit('noise', { pos: [...player.pos], loud: noiseOf('step', { crouch: player.crouch, run: wantRun }), kind: wantRun ? 'run' : player.crouch ? 'crouch' : 'step', src: 'jonas' });
      }
    }
    // the interaction
    const cands = interact.list({ exits: [], hides: S4 ? w.sc.hides : [], targets }, player);
    const res = interact.update(STEP, { cands, p: player, facing: player.body, press: it.press, project: touch.visible && it.press.at ? project : null });
    if (res.fire?.target) res.fire.target.fire();
    else if (res.fire?.hide) toggleHide(res.fire.hide);
    st.view = { cand: res.cand, progress: interact.st.progress, hint: res.hint, work: null };
    if (S4) stepStreet(it, walked, wantRun, res.cand);
    director.update(STEP, { pos: player.pos });
  }

  // ---- the frame: the picture ------------------------------------------------------------------------------------------------------------
  let last = performance.now(), hintTap = 0;
  const t0 = last;
  document.addEventListener('visibilitychange', () => { if (document.hidden && st.phase === 'play' && !st.screen && !desk.active && !hands.active && !st.cut) screens.open('menu'); });
  const wake = () => { audio.resume(); document.getElementById('hint')?.remove(); };
  for (const ev of ['pointerup', 'keydown', 'click', 'touchend']) addEventListener(ev, wake, { passive: true });
  // over the shoulder the mouse looks round once the pointer is held (a click takes it; Esc gives it back with the menu)
  addEventListener('click', (e) => { if (e.target.closest?.('button, #screens')) return; if (st.camMode === 'ombro' && st.phase === 'play' && !st.screen && !st.seq && input.device === 'keyboard' && !touch.visible && document.pointerLockElement !== canvas) { try { canvas.requestPointerLock?.()?.catch?.(() => {}); } catch { /* needs a gesture */ } } });
  document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement !== canvas && st.examine && st.phase === 'play') endExamine(); });

  /** The command of the step that is on, in the scenery next to what it is about: the hand, the dog, the cable; the key cap of the device the person plays with. */
  const project3 = (x, y, z) => { proj.set(x, y, z).project(r.camera); if (proj.z > 1) return null; return [(proj.x * 0.5 + 0.5) * innerWidth, (-proj.y * 0.5 + 0.5) * innerHeight]; };
  function seqSign() {
    const S = st.seq, P = S?.pose; if (!P) return null;
    r.camera.updateMatrixWorld();
    const v = S.sq.view(), dev = device(), g = dev === 'touch' ? 'Usar' : (GLYPHS[dev] ?? GLYPHS.keyboard).use;
    const hand = [EM.J[0] - 0.1, 0.95, EM.J[1] - 0.35], cableMid = [(EM.CABLE.grate[0] + EM.CABLE.cut[0]) / 2, 0.5, EM.CABLE.grate[1] - 0.1];
    const auto = S.sq.view().auto ? 'automático' : '';
    let kind = v.kind, at = null, spec = null;
    const recent = S.lastStep && S.t - S.lastStep.at < 0.7 ? S.lastStep : null;
    if (v.active && !v.gap) {
      const u = v.u;
      if (kind === 'hold') { at = hand; spec = { keys: g, word: auto || 'segure', u, progress: v.progress, pulse: v.progress < 0.1 }; }
      else if (kind === 'dir') { const a = P.dog; at = [a.pos[0], 1.35 + (a.y ?? 0), a.pos[1]]; spec = { arrow: v.want < 0 ? '◀' : '▶', keys: dev === 'touch' ? '' : dev === 'gamepad' ? (v.want < 0 ? '◀' : '▶') : (v.want < 0 ? '←' : '→'), word: auto || 'esquive', u, pulse: true }; }
      else if (kind === 'mash') { at = cableMid; spec = { keys: g, word: auto || 'martele', u, progress: v.progress, pulse: true }; }
      else if (kind === 'press') { at = hand; spec = { keys: g, word: auto || 'aperte', u, pulse: true }; }
      else if (kind === 'pick') { const a = P.dog; at = [a.pos[0], 1.3, a.pos[1]]; spec = { keys: dev === 'touch' ? '' : dev === 'gamepad' ? '◀|▶' : '←|→', word: auto || (v.noQuiet ? 'desativar ▶' : 'desorientar ◀   ▶ desativar'), u, pulse: true }; }
      // the first command of a branch is at the dog, not at the cable
      if ((kind === 'hold' || kind === 'press') && v.i === 3 && S.rec.choice) { const a = P.dog; at = [a.pos[0], 0.95, a.pos[1]]; spec = { ...spec, word: auto || (kind === 'hold' ? 'encoste a isca' : 'enfie o cabo') }; }
    } else if (recent) {
      at = recent.kind === 'dir' || recent.kind === 'pick' || recent.i === 3 ? [P.dog.pos[0], 1.35, P.dog.pos[1]] : recent.kind === 'mash' ? cableMid : hand;
      spec = { word: recent.auto ? 'automático' : recent.hit ? 'ok' : recent.kind === 'dir' || recent.kind === 'pick' || recent.i === 3 ? 'o cão pegou' : 'barulho', tone: recent.hit ? 'hit' : 'miss' };
    }
    if (!spec || !at) return null;
    const p = project3(...at); if (!p) return null;
    return { ...spec, x: Math.max(60, Math.min(innerWidth - 60, p[0])), y: Math.max(90, Math.min(innerHeight - 40, p[1])) };
  }
  const baseFov = () => (r.camera.aspect < 1 ? 82 : 64);
  const aimGeo = new T3.BufferGeometry().setAttribute('position', new T3.BufferAttribute(new Float32Array(3 * 64), 3));
  const aimLine = new T3.Line(aimGeo, new T3.LineBasicMaterial({ color: 0xf2d68a })); aimLine.frustumCulled = false; aimLine.visible = false; r.scene.add(aimLine);
  let stepAcc = 0;
  function frame(tNow) {
    // (the captures give each picture its own length of time, `st.frameDt`: a software renderer is far too slow for the real one, and the video would play too fast)
    // (filming: the animation advances by the game time stepped since the last picture, not by one frame time for every rAF: the browser calls this many times between two pictures)
    const filming = st.manual && st.frameDt, dtReal = filming ? (st.simAcc ?? 0) : Math.min(0.25, (tNow - last) / 1000); last = tNow;
    if (filming) st.simAcc = 0;
    const animK = filming ? 1 : (st.seq?.timeScale ?? 1);
    stepAcc += dtReal;
    if (st.manual) stepAcc = 0;                       // the tests drive the steps themselves (a software renderer is far too slow for real time)
    try { while (stepAcc >= STEP) { step(); stepAcc -= STEP; } } catch (err) { console.error('step', err); stepAcc = 0; }
    if (filming) st.vt = (st.vt ?? 0) + dtReal;
    const t = st.manual && st.frameDt ? st.vt : (tNow - t0) / 1000;
    const w = st.world, scene = st.scene;
    if (w && scene && st.shot >= 0) {
      const shot = scene.shots[st.shot] ?? scene.shots[0];
      let cam = null;
      const cutting = st.phase === 'play' && st.cut && !st.cut.loading;
      const fp = st.phase === 'play' && hands.active ? hands.camera() : null, atDesk = st.phase === 'play' && desk.active ? desk.camera(r.camera.aspect, baseFov()) : null;
      if (st.debugCam) { const c = st.debugCam, dv = [c.at[0] - c.eye[0], c.at[1] - c.eye[1], c.at[2] - c.eye[2]]; cam = { eye: c.eye, at: c.at, dir: dv, fov: c.fov ?? null, aim: { pos: c.eye, dir: dv } }; }
      else if (cutting) cam = cutCamera();
      else if (fp) cam = fp;
      else if (atDesk) cam = atDesk;
      else if (st.phase === 'title') { const u = Math.sin(t * 0.12) * 0.5; cam = shotCamera({ ...shot, eye: [shot.eye[0] + u * 3, shot.eye[1], shot.eye[2]] }); }
      else if (st.examine) cam = examineCamera(st.examine.point.examine, st.examine.look);
      else if (st.seq && st.seq.pose) { const c = st.seq.pose.cam; const dv = [c.at[0] - c.eye[0], c.at[1] - c.eye[1], c.at[2] - c.eye[2]]; cam = { eye: c.eye, at: c.at, dir: dv, fov: c.fov ?? null, aim: { pos: c.eye, dir: dv } }; }
      else if (st.camMode === 'ombro' && st.phase === 'play') cam = cam3.pose(player.pos, worldColliders(), { hidden: Boolean(player.hidden), ground: w.sc.ground?.(player.pos[0], player.pos[1]) ?? 0 });
      else {
        const px = S.ptr && input.device === 'keyboard' ? (S.ptr[0] / innerWidth - 0.5) : 0, py = S.ptr && input.device === 'keyboard' ? (S.ptr[1] / innerHeight - 0.5) : 0;
        const want = followOffset(shot, player.pos, r.camera.aspect, baseFov());
        st.follow = st.follow === null ? want : st.follow + (want - st.follow) * Math.min(1, dtReal * 5);   // a cut starts already framed
        cam = shotCamera(shot, { yaw: st.peek.yaw - px * 0.1 + st.follow, pitch: st.peek.pitch - py * 0.05 }, player);
      }
      if (cam) {
        r.camera.position.set(...cam.eye); r.camera.lookAt(...cam.at);
        const want = cam.fov ?? baseFov(); if (Math.abs(r.camera.fov - want) > 0.01) { r.camera.fov = want; r.camera.updateProjectionMatrix(); }
        // Jonas: seen in the planes, not in his own eyes
        const hers = desk.active || hands.active;       // at the radio, or with his hands up: the step places and moves him (src/desk.js, src/hands.js)
        body.root.visible = (hers || !st.examine) && st.phase !== 'title' && !player.hidden && !(st.cut && st.cut.b.noJonas) && !cam.near;
        const sj = st.seq?.pose?.jonas;
        if (sj) { body.root.visible = !sj.hidden; body.root.position.set(sj.pos[0], w.sc.ground?.(sj.pos[0], sj.pos[1]) ?? 0, sj.pos[1]); body.root.rotation.y = sj.yaw; body.update(dtReal * animK, { speed: sj.speed ?? 0, crouch: (sj.crouch ?? 0) > 0.5, run: Boolean(sj.run), lamp: st.seq.phase === 'act' ? 'on' : 'off', action: sj.action ?? null, gaze: sj.gaze ?? { x: 0, y: 0 } }); }
        else if (!hers) { const g = w.sc.ground?.(player.pos[0], player.pos[1]) ?? 0; body.root.position.set(player.pos[0], g, player.pos[1]); body.root.rotation.y = player.body; }
        if (!sj && !hers && !st.examine) {
          // he looks at what matters: the thing in front of him (the point he can use), else straight ahead; the head lamp follows the flashlight
          const c = st.view?.cand; let gx = 0, gy = 0;
          if (c) { const a = Math.atan2(-(c.pos[0] - player.pos[0]), -(c.pos[1] - player.pos[1])); let d = a - player.body; d = Math.atan2(Math.sin(d), Math.cos(d)); gx = Math.max(-0.55, Math.min(0.55, d)); }
          if (st.cut?.b.look === 'up') { gx = 0; gy = 0.6; }
          st.gaze = (st.gaze ?? 0) + (gx - (st.gaze ?? 0)) * Math.min(1, dtReal * 6);
          body.update(dtReal * animK, { speed: player.speed, crouch: player.crouch, run: player.speed > 3.5, lamp: player.light ? 'on' : 'off', gaze: { x: st.gaze, y: gy } });
        }
        // the light: the flashlight; in a cutscene the beat may bring a light of its own (a sensor shining down the shaft)
        const sl = st.cut?.b.spot;
        if (sl && cutting) { const sw = st.cut.t, sway = options.flashes ? 0 : Math.sin(sw * 1.7) * 0.22; r.spot({ on: true, pos: sl.pos, dir: [sl.dir[0] + sway, sl.dir[1], sl.dir[2] + Math.cos(sw * 1.3) * 0.12 * (options.flashes ? 0 : 1)], color: sl.color ?? '#e8a42a', range: sl.range ?? 9, cos: Math.cos(sl.cone ?? 0.5) }); }
        else if (st.seq?.phase === 'act') {
          // in the reaction his head lamp is on the dog: the one thing he must see (and the picture must show)
          const dg = st.seq.pose.dog, j = EM.J, dv = [dg.pos[0] - j[0], 0.5 + (dg.y ?? 0) - 1.1, dg.pos[1] - j[1]];
          r.spot({ on: true, pos: [j[0], 1.1, j[1]], dir: dv, color: '#fff2d0', range: 14, cos: Math.cos(0.42) });
        }
        else r.spot({ on: player.light && st.phase === 'play' && !st.cut && !st.seq, pos: cam.aim.pos, dir: cam.aim.dir, color: '#fff2d0', range: 15, cos: Math.cos(0.5) });
        // the broken dog blinks the colours; the aim of the decoy is an arc
        if (S4?.broken) {
          const f = S4.flashT === null ? null : flashAt(S4.flashT);
          S4.broken.update(dtReal, { state: 'desligado', sensorColor: f ? bodyHex(f.hex, f.power) : '#16161a' });
          S4.broken.halo.follow(S4.broken); S4.broken.halo.set(f ? bodyHex(f.hex, f.power) : null, r.camera.aspect < 1 ? 1.8 : 1.25);     // (on a phone the light is bigger)
        }
        aimLine.visible = Boolean(S4 && st.aiming);
        if (aimLine.visible) {
          const p = player.pos, c = Math.cos(st.aimPitch), a = S4.gear.aim([p[0], 1.4, p[1]], [-Math.sin(st.aimYaw) * c, Math.sin(st.aimPitch), -Math.cos(st.aimYaw) * c]);
          const arr = aimGeo.attributes.position.array, n = Math.min(64, a.points.length);
          for (let i = 0; i < 64; i++) { const q = a.points[Math.min(i, n - 1)]; arr[i * 3] = q[0]; arr[i * 3 + 1] = q[1]; arr[i * 3 + 2] = q[2]; }
          aimGeo.attributes.position.needsUpdate = true;
        }
        w.sc.update(t, { listener: cam.eye, dir: cam.dir, hour: 21 });
        if (!st.manual || st.forceDraw > 0) { r.draw(); if (st.forceDraw > 0) st.forceDraw--; }   // (the tests draw on demand: a software renderer is slow)
      }
    }
    // the HUD
    const play = st.phase === 'play' && !st.screen && !st.cut;
    const d = { hud: play && st.seq?.phase !== 'cine', seq: Boolean(st.seq), goal: desk.active || hands.active || st.seq ? '' : fmt(st.goal), escuta: escuta?.value ?? 0, escutaAlways: true, hurt: Boolean(run?.hurt), quick: quick.view(), deskSay: desk.active && desk.saying };
    if (director?.marker && w && play && !st.seq && !st.examine && !desk.active && !hands.active) {
      const mk = director.marker; proj.set(mk[0], 1.3, mk[1]).project(r.camera);
      const behind = proj.z > 1; let x = (proj.x * 0.5 + 0.5) * innerWidth, y = (-proj.y * 0.5 + 0.5) * innerHeight;
      if (behind) { x = innerWidth - x; y = innerHeight - y; }
      const m = 34, edge = behind || x < m || x > innerWidth - m || y < m + 40 || y > innerHeight - m;
      d.marker = { x: Math.max(m, Math.min(innerWidth - m, x)), y: Math.max(m + 40, Math.min(innerHeight - m - 70, y)), edge, label: edge ? '▼' : '◆' };
    }
    // the Item button of the touch controls: only when there is a decoy to throw and a street to throw it in
    const hasItem = Boolean(S4 && run?.pocket.includes('isca') && play && !st.seq);
    if (hasItem !== (app.dataset.item === '1')) { if (hasItem) app.dataset.item = '1'; else delete app.dataset.item; }
    ui.frame(d, now());
    const v = st.view, held = desk.active ? desk.hint(device()) : hands.active ? hands.hint(device()) : null;
    const act = held ?? (v?.work ? { label: 'Emendar o cabo', hold: true } : v?.cand && play && !st.examine ? { label: v.cand.label, hold: v.cand.kind === 'hold' } : st.aiming ? { label: 'Lançar a isca', glyph: '' } : null);
    ui.setAction(st.seq ? null : act, device());
    ui.setProgress(play && !held && !st.seq ? (v?.work ? v.work.progress : (v?.progress ?? 0)) : 0);
    ui.sign(st.seq && st.seq.phase === 'act' ? seqSign() : null);
    const hiding = st.camMode === 'ombro' && Boolean(player.hidden) && play; if (hiding !== (app.dataset.hide === '1')) { if (hiding) app.dataset.hide = '1'; else delete app.dataset.hide; }
    ui.setLockHint(st.camMode === 'ombro' && play && !st.seq && input.device === 'keyboard' && !touch.visible && document.pointerLockElement !== canvas);
    touch.label(!st.seq && act ? act.label : 'Usar');
    touch.mark('run', player.run); touch.mark('crouch', player.crouch); touch.mark('light', player.light);
    if (v?.hint === 'hold' && now() - hintTap > 0.5 && play) { hintTap = now(); ui.toast(touch.visible ? 'Segure o botão' : 'Segure para usar', now()); }
    ui.fade(Math.max(st.fadeIn > 0 ? st.fadeIn / FADE_IN : 0, st.seq?.fade ?? 0));
    if (st.fadeIn > 0) st.fadeIn = Math.max(0, st.fadeIn - dtReal);
    ui.tick?.(now());
    requestAnimationFrame(frame);
  }

  const hintEl = document.getElementById('hint');
  const touchHint = () => { if (hintEl && touch.visible) hintEl.textContent = 'Toque para jogar · direcional à esquerda anda · arraste à direita para olhar · Reagir no canto'; };
  touchHint(); addEventListener('touchstart', () => setTimeout(touchHint, 0), { passive: true, once: true });

  // ---- the start: the title, or straight into a scene (?cena=n1-saida), the demonstration (?demo=1), a new game (?novo, ?noite=1) or the last one (?continuar) ----
  bind(createRun({ seed: freshSeed(), night: 'noite-1' }));
  const jump = q.get('cena');
  if (jump && SCENES[jump] && startJump(jump)) { /* the scene asked for */ }
  else if (q.has('demo')) { st.phase = 'play'; startRun('demo', q.get('semente') ? qseed : undefined); }
  else if (q.has('novo') || q.get('noite') === '1') startRun('noite-1');
  else if (q.has('continuar') && card.hasRun()) loadRun(card.data.run);
  else showTitle();
  requestAnimationFrame(frame);

  window.__game = {
    G, st, player, card, input, options, screens, ui, audio, voices, quick, body, r, bus, cam: cam3,
    gore, get run() { return run; }, get escuta() { return escuta; }, get trust() { return trust; }, get radio() { return radio; }, get desk() { return desk; }, get hands() { return hands; }, get director() { return director; }, get street() { return S4; }, get conversations() { return CONVERSATIONS; },
    // for the tests and the captures: nothing of the game's rules
    test: {
      teleport(x, z) { player.pos = [x, z]; },
      colliders: () => worldColliders(),
      die,
      manual(on = true) { st.manual = on; st.forceDraw = 0; },
      render() { st.forceDraw = 3; },
      step(n = 1) { for (let i = 0; i < n; i++) { step(); st.simAcc = (st.simAcc ?? 0) + STEP * (st.seq?.timeScale ?? 1); } },
      /** A camera put by hand ({ eye, at, fov }) for a picture; `camera(null)` gives the game its own back. */
      camera(c) { st.debugCam = c; },
      serialize,
    },
  };
}
