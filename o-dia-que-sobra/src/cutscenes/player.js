// The cutscene player. A cutscene is a pure function of time (see common.js); this module
//  - builds the stage (the one posto, Heitor's arms, the figures of each cutscene, built once and cached),
//  - draws one frame of a cutscene at a time t (used by the game and by the film mode),
//  - plays a cutscene live (playCutscene), with sound, the overlay and the skip (hold for 1 s).
//
// Game use (the only real clock in here is the play loop, as in main.js):
//   configureCutscenes({ render, audio, seed })                // once, after createRender; audio: the object of audio/index.js, or a function that returns it (or null)
//   playCutscene('chegada', { onEnd: (info) => ..., skippable: true })   // info: { skipped, name }
//   cutsceneDuration('chegada')   // seconds
//   isCutsceneActive()            // the game does not step or draw while true
//   skipCutscene()                // skips at once (the game's own "hold" gesture)
// While a cutscene plays it owns the camera, the lights, the fog and the visibility of what is in
// render.scene; at the end it gives the visibility back and the game applies its lights again (its
// LightingSystem does it every frame). The game stops its ambient loops before it starts one.
import * as THREE from 'three';
import { drawOverlay, flashLevel, OVERLAY_SCALE, heitorArms } from './common.js';
import { createWorld } from './stagecraft.js';
import abertura from './abertura.js';
import chegada from './chegada.js';
import gerente from './gerente.js';
import rotina from './rotina.js';
import noites from './noites.js';
import bomba4 from './bomba4.js';
import telefone from './telefone.js';
import corte from './corte.js';
import cartao from './cartao.js';

export const CUTSCENES = { abertura, chegada, gerente, rotina, noites, bomba4, telefone, corte, cartao };
/** The cutscenes the game plays (the ones with `filmOnly` are reels for the film mode only). */
export const cutsceneNames = () => Object.keys(CUTSCENES).filter((n) => !CUTSCENES[n].filmOnly);
export function cutsceneDuration(nome) {
  const d = CUTSCENES[nome];
  if (!d) throw new Error(`unknown cutscene: ${nome}`);
  return d.duration;
}

const OPT_KEY = 'o-dia-que-sobra.opts';
const reduceFlashOpt = () => { try { return Boolean(JSON.parse(localStorage.getItem(OPT_KEY) || '{}').reduceFlash); } catch { return false; } };

// ---------------------------------------------------------------------------------------------
// Stage: builds and poses. `r` is the object of createRender.
export function createStage(r, { seed = 1, blocks = null, cast = null, reduceFlash = false } = {}) {
  const insts = {};
  const saved = new Map();      // visibility of what was in the scene before the stage took over
  let current = null, entered = false, fov0 = 64, world = null, hands = null;
  const camera = r.camera;
  if (!camera.parent) r.scene.add(camera); // the arms ride on the camera: it must be in the scene
  const owned = new Set();

  const ctx = {
    r, THREE, seed, blocks, cast, reduceFlash,
    world() { if (!world) { world = createWorld(r, { seed }); r.scene.add(world.group); owned.add(world.group); } return world; },
    hands() { return hands ??= heitorArms(r); },
  };

  function inst(name) {
    if (insts[name]) return insts[name];
    const def = CUTSCENES[name];
    if (!def) throw new Error(`unknown cutscene: ${name}`);
    const i = insts[name] = def.build(ctx);
    if (i.group && !i.group.parent) { r.scene.add(i.group); owned.add(i.group); }
    i.show?.(false); if (!i.show && i.group) i.group.visible = false;
    return i;
  }
  function enter() {
    if (entered) return;
    entered = true; fov0 = camera.fov;
    for (const c of r.scene.children) {
      if (c === camera || owned.has(c)) continue;
      saved.set(c, c.visible); c.visible = false;
    }
    for (const c of camera.children) { saved.set(c, c.visible); c.visible = false; }
  }
  function hide(name) {
    const i = insts[name]; if (!i) return;
    if (i.show) i.show(false); else if (i.group) i.group.visible = false;
    if (world) world.group.visible = false;
    if (hands) camera.remove(hands.arms.root);
  }
  function leave() {
    if (!entered) return;
    if (current) { hide(current); current = null; }
    for (const [o, v] of saved) o.visible = v;
    saved.clear(); entered = false; camera.fov = fov0; camera.updateProjectionMatrix(); camera.rotation.set(0, 0, 0);
    camera.position.set(0, 0, 0);
    r.spot({ on: false }); r.light({ fog: '#07080d', fogNear: 10, fogFar: 40 });
  }
  function show(name) {
    if (current === name) return insts[name];
    if (current) hide(current);
    const i = inst(name);
    current = name;
    if (i.show) i.show(true); else if (i.group) i.group.visible = true;
    if (i.world !== false) ctx.world().group.visible = true;
    if (i.hands) { const h = ctx.hands(); camera.add(h.arms.root); h.arms.root.visible = true; }
    return i;
  }

  const _eye = new THREE.Vector3(), _look = new THREE.Vector3();
  /**
   * Poses cutscene `name` at time `t` (seconds from its start) and aims the camera.
   * flashMode: 'flash' (the screen flashes), 'dark' (they become a short darkening) or 'none'.
   * Returns the overlay state for drawOverlay.
   */
  function frame(name, t, { ambient = t, flashMode = 'flash', extraDaze = 0, noFade = false } = {}) {
    enter();
    const i = show(name);
    const f = i.pose(t, ambient);
    _eye.set(...f.eye); _look.set(...f.look);
    camera.position.copy(_eye); camera.up.set(0, 1, 0); camera.lookAt(_look);
    if (f.roll) camera.rotateZ(f.roll);
    const base = camera.aspect < 1 ? 84 : 64;
    camera.fov = base * (f.fovK ?? 1); camera.updateProjectionMatrix();
    if (i.world !== false) ctx.world().pose(ambient, f.world ? { eye: f.eye, ...f.world } : { eye: f.eye }, { reduce: flashMode === 'dark' || reduceFlash });
    if (f.late) f.late(f); // what needs the posto already posed (the pictures of the monitor)
    const ev = f.flashes ?? [];
    const lvl = flashLevel(ev.filter((e) => !e.glare), t), gl = flashLevel(ev.filter((e) => e.glare), t);
    return {
      t, fade: noFade ? 0 : f.fade ?? 0,
      flash: flashMode === 'flash' ? lvl : 0,
      dark: flashMode === 'dark' ? Math.max(lvl, gl * 0.9) : 0,
      glare: flashMode === 'flash' ? gl : 0, glareAt: f.glareAt,
      daze: Math.max(f.daze ?? 0, extraDaze), blur: f.blur ?? 0,
      noise: f.noise ?? 0, dim: f.dim ?? 0, dialog: f.dialog ?? null, sheet: f.sheet ?? null, screen: f.screen ?? null, card: f.card ?? null,
    };
  }
  function draw() { r.renderer.render(r.scene, camera); }
  function dispose() { leave(); }

  return { ctx, inst, show, frame, draw, enter, leave, dispose, get current() { return current; } };
}

// ---------------------------------------------------------------------------------------------
// Live play.
let cfg = {};
let active = null;
export function configureCutscenes(c) { cfg = { ...cfg, ...c }; }
export const isCutsceneActive = () => Boolean(active);
export function skipCutscene() { if (active && active.skippable) active.finish(true); }

const CSS_ID = 'odq-cutscene-css';
function ensureCss() {
  if (document.getElementById(CSS_ID)) return;
  const s = document.createElement('style'); s.id = CSS_ID;
  s.textContent = `
    body.cutscene #app > *:not(#c):not(#cs-overlay):not(#cs-skip) { display: none !important; }
    #cs-overlay { position: absolute; left: 0; top: 0; pointer-events: none; image-rendering: pixelated; image-rendering: crisp-edges; image-rendering: pixelated; z-index: 8; }
    #cs-skip { position: absolute; right: max(12px, env(safe-area-inset-right)); bottom: max(12px, env(safe-area-inset-bottom)); z-index: 9; font: bold 13px "Courier New", monospace; color: #e8dfc4; background: rgba(8,10,16,.66); border: 2px solid #c9a24a; box-shadow: 2px 2px 0 #000; padding: 10px 14px; cursor: pointer; touch-action: none; user-select: none; opacity: .75; overflow: hidden; }
    #cs-skip i { position: absolute; left: 0; bottom: 0; height: 4px; width: 0; background: #e0a526; }`;
  document.head.appendChild(s);
}

const HOLD = 1.0;          // seconds to hold to skip
const SKIP_GRACE = 0.5;    // a key held from the previous screen does not count

/**
 * Plays a cutscene. opts: { onEnd(info), skippable = true, render, audio, root, seed, blocks, reduceFlash }.
 * Skip: hold Esc, the Start button of the pad or the "PULAR" button for one second.
 */
export function playCutscene(nome, opts = {}) {
  const def = CUTSCENES[nome];
  if (!def) throw new Error(`unknown cutscene: ${nome}`);
  if (active) active.finish(true);
  const c = { ...cfg, ...opts };
  const render = c.render, root = c.root ?? document.getElementById('app');
  if (!render) throw new Error('playCutscene: no render (call configureCutscenes({ render }) first)');
  const getAudio = () => (typeof c.audio === 'function' ? c.audio() : c.audio) ?? null;
  const skippable = opts.skippable !== false;
  ensureCss();
  const reduce = c.reduceFlash ?? reduceFlashOpt();
  if (cfg.stageFor !== render) { cfg.stage = createStage(render, { seed: c.seed ?? 1, blocks: c.blocks ?? null, reduceFlash: reduce }); cfg.stageFor = render; }
  const stage = cfg.stage;
  stage.ctx.blocks = c.blocks ?? null; stage.ctx.reduceFlash = reduce;
  stage.inst(nome); // build before the clock starts (the first frame must not stall)
  stage.leave();

  const ov = document.createElement('canvas'); ov.id = 'cs-overlay'; root.appendChild(ov);
  const g = ov.getContext('2d');
  let btn = null, bar = null;
  const state = { t: 0, ended: false, held: 0, holding: false, padHolding: false, keyHolding: false, started: false };
  document.body.classList.add('cutscene');
  const canvas = render.canvas;
  const gameDraw = render.draw; render.draw = () => {}; // the game's own draw must not repaint over the cutscene

  if (skippable) {
    btn = document.createElement('div'); btn.id = 'cs-skip'; btn.textContent = 'SEGURE PARA PULAR'; bar = document.createElement('i'); btn.appendChild(bar); root.appendChild(btn);
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); state.holding = true; btn.setPointerCapture?.(e.pointerId); });
    const up = () => { state.holding = false; };
    btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up); btn.addEventListener('lostpointercapture', up);
  }
  const onKeyDown = (e) => { if (skippable && e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); state.keyHolding = true; } };
  const onKeyUp = (e) => { if (e.code === 'Escape') state.keyHolding = false; };
  addEventListener('keydown', onKeyDown, true); addEventListener('keyup', onKeyUp, true);

  const sfx = (def.sfx ?? []).slice().sort((a, b) => a.t - b.t);
  function fireSfx(t0, t1) {
    const audio = getAudio(); if (!audio) return;
    for (const e of sfx) {
      if (e.t < t0 || e.t >= t1) continue;
      try {
        if (e.name === 'babble') audio.babble?.(e.opts.seed, e.opts.text);
        else audio.play?.(e.name, e.opts);
      } catch (err) { console.warn('cutscene sound', e.name, err.message); }
    }
  }
  function padStart() {
    if (!skippable || typeof navigator === 'undefined' || !navigator.getGamepads) return false;
    for (const p of navigator.getGamepads()) if (p && p.buttons[9]?.pressed) return true;
    return false;
  }

  let raf = 0, last = null;
  function tick(now) {
    if (state.ended) return;
    const raw = last === null ? 0 : (now - last) / 1000, dt = Math.min(0.1, raw); last = now;
    const t0 = state.t; state.t = Math.min(def.duration, state.t + dt);
    // hold to skip
    const holding = state.t > SKIP_GRACE && (state.holding || state.keyHolding || padStart());
    state.held = holding ? state.held + Math.min(0.25, raw) : Math.max(0, state.held - Math.min(0.25, raw) * 2); // the hold runs on real time, the picture on capped time
    if (bar) bar.style.width = Math.round(Math.min(1, state.held / HOLD) * 100) + '%';
    if (state.held >= HOLD) { finish(true); return; }
    fireSfx(t0 === 0 && !state.started ? -1 : t0, state.t >= def.duration ? Infinity : state.t); state.started = true;
    const st = stage.frame(nome, state.t, { flashMode: reduce ? 'dark' : 'flash' });
    const a = getAudio(); if (a?.listener) { const cam = render.camera, d = new THREE.Vector3(); cam.getWorldDirection(d); a.listener([cam.position.x, cam.position.y, cam.position.z], [d.x, d.y, d.z]); }
    const w = Math.round(render.size.w * OVERLAY_SCALE), h = Math.round(render.size.h * OVERLAY_SCALE);
    if (ov.width !== w || ov.height !== h) { ov.width = w; ov.height = h; }
    ov.style.width = render.size.cssW + 'px'; ov.style.height = render.size.cssH + 'px';
    canvas.style.filter = st.blur > 0.02 ? `blur(${(st.blur * 2.4).toFixed(2)}px)` : '';
    stage.draw();
    drawOverlay(g, w, h, st);
    if (state.t >= def.duration) { finish(false); return; }
    raf = requestAnimationFrame(tick);
  }

  function finish(skipped) {
    if (state.ended) return;
    state.ended = true; cancelAnimationFrame(raf);
    removeEventListener('keydown', onKeyDown, true); removeEventListener('keyup', onKeyUp, true);
    ov.remove(); btn?.remove();
    canvas.style.filter = '';
    render.draw = gameDraw;
    document.body.classList.remove('cutscene');
    stage.leave();
    if (skipped) getAudio()?.stopLoops?.(0.3);
    active = null;
    opts.onEnd?.({ skipped: Boolean(skipped), name: nome });
  }

  active = { finish, skippable };
  raf = requestAnimationFrame(tick);
  return { skip: () => { if (skippable) finish(true); }, stop: () => finish(true), get active() { return !state.ended; } };
}
