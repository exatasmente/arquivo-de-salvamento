// The cutscene player. A cutscene is a pure function of time (see common.js); this module
//  - builds the stage (the scenes, the creatures and the first-person arms, built once and cached),
//  - draws one frame of a cutscene at a time t (used by the game and by the film mode),
//  - plays a cutscene live (playCutscene), with sound, the overlay and the skip.
//
// Game use (the only real clock in here is the play loop, as in main.js):
//   configureCutscenes({ render, audio, root, ring, seed, groups })   // once, after createRender
//   playCutscene('casa', { onEnd: (info) => ..., skippable: true })    // info: { skipped }
//   cutsceneDuration('casa')   // seconds
//   isCutsceneActive()         // the game does not step or draw while true
//   skipCutscene()             // for the game's own "hold pause" skip
// While a cutscene plays it owns the camera, the lights and the visibility of what is in
// render.scene; at the end it gives the visibility back and the game re-applies its lights
// (enterCell / startFight already do).
import * as THREE from 'three';
import { loadOpts } from '../hud.js';
import { createRing } from '../ring.js';
import { drawOverlay, flashLevel, OVERLAY_SCALE } from './common.js';
import casa from './casa.js';
import pomar from './pomar.js';
import flashes from './flashes.js';
import celaAcordar from './cela-acordar.js';
import treinoFim from './treino-fim.js';
import entradaRingue from './entrada-ringue.js';
import familia from './familia.js';
import fimCampanha from './fim-campanha.js';
import treinoAula from './treino-aula.js';
import celaTempo from './cela-tempo.js';
import pomarCerco from './pomar-cerco.js';
import casaFome from './casa-fome.js';
import ringuePlateia from './ringue-plateia.js';

export const CUTSCENES = { casa, pomar, flashes, 'cela-acordar': celaAcordar, 'treino-fim': treinoFim, 'entrada-ringue': entradaRingue, familia, 'fim-campanha': fimCampanha, 'treino-aula': treinoAula, 'cela-tempo': celaTempo, 'pomar-cerco': pomarCerco, 'casa-fome': casaFome, 'ringue-plateia': ringuePlateia };
/** The cutscenes the game plays (the ones with `filmOnly` are reels for the film mode only). */
export const cutsceneNames = () => Object.keys(CUTSCENES).filter((n) => !CUTSCENES[n].filmOnly);
export function cutsceneDuration(nome) {
  const d = CUTSCENES[nome];
  if (!d) throw new Error(`unknown cutscene: ${nome}`);
  return d.duration;
}

// ---------------------------------------------------------------------------------------------
// Stage: builds and poses. `r` is the object of createRender.
export function createStage(r, { seed = 1, ring = null, groups = null, blocks = null } = {}) {
  const insts = {};
  const saved = new Map();      // visibility of what was in the scene before the stage took over
  let current = null, entered = false, fov0 = 62, ownRing = null;
  const camera = r.camera;
  if (!camera.parent) r.scene.add(camera); // the arms ride on the camera: it must be in the scene

  const ctx = {
    r, THREE, seed, groups, blocks,
    get ring() { return ring ?? (ownRing ??= createRing(r, seed)); },
  };

  function inst(name) {
    if (insts[name]) return insts[name];
    const def = CUTSCENES[name];
    if (!def) throw new Error(`unknown cutscene: ${name}`);
    const i = insts[name] = def.build(ctx);
    if (i.group && !i.group.parent) r.scene.add(i.group);
    i.show?.(false); if (!i.show && i.group) i.group.visible = false;
    return i;
  }

  /** Hide what the game had on screen (keeps the camera) and remember it. */
  function enter() {
    if (entered) return;
    entered = true; fov0 = camera.fov;
    for (const c of r.scene.children) {
      if (c === camera) continue;
      saved.set(c, c.visible); c.visible = false;
    }
    for (const c of camera.children) { saved.set(c, c.visible); c.visible = false; }
  }
  function leave() {
    if (!entered) return;
    if (current) hide(current);
    for (const [o, v] of saved) o.visible = v;
    saved.clear(); entered = false; camera.fov = fov0; camera.updateProjectionMatrix(); camera.rotation.set(0, 0, 0);
    camera.position.set(0, 0, 0);
  }
  function hide(name) {
    const i = insts[name]; if (!i) return;
    if (i.show) i.show(false); else if (i.group) i.group.visible = false;
    if (i.arms) camera.remove(i.arms.root);
  }
  function show(name) {
    if (current === name) return insts[name];
    if (current) hide(current);
    const i = inst(name);
    current = name;
    if (i.show) i.show(true); else if (i.group) i.group.visible = true;
    if (i.arms) { camera.add(i.arms.root); i.arms.root.visible = true; }
    i.lights?.apply();
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
    const base = camera.aspect < 1 ? 84 : 62;
    camera.fov = base * (f.fovK ?? 1); camera.updateProjectionMatrix();
    const ev = f.flashes ?? [];
    const rect = ev.filter((e) => !e.glare), glare = ev.filter((e) => e.glare);
    const lvl = flashLevel(rect, t), gl = flashLevel(glare, t);
    return {
      t, fade: noFade ? 0 : f.fade ?? 0,
      flash: flashMode === 'flash' ? lvl : 0,
      dark: flashMode === 'dark' ? Math.max(lvl, gl * 0.9) : 0,
      glare: flashMode === 'flash' ? gl : 0, glareAt: f.glareAt,
      daze: Math.max(f.daze ?? 0, extraDaze), blur: f.blur ?? 0,
      noise: f.noise ?? 0, card: f.card ?? null, dim: f.dim ?? 0, shop: f.shop ?? null, hud: f.hud ?? null, label: f.label ?? null,
    };
  }
  function draw() { r.renderer.render(r.scene, camera); }
  function dispose() { leave(); }

  return { ctx, inst, show, frame, draw, enter, leave, dispose, get current() { return current; }, get ring() { return ctx.ring; } };
}

// ---------------------------------------------------------------------------------------------
// Live play.
let cfg = {};
let active = null;
export function configureCutscenes(c) { cfg = { ...cfg, ...c }; }
export const isCutsceneActive = () => Boolean(active);
export function skipCutscene() { if (active && active.skippable) active.finish(true); }

const CSS_ID = 'rinha-cutscene-css';
function ensureCss() {
  if (document.getElementById(CSS_ID)) return;
  const s = document.createElement('style'); s.id = CSS_ID;
  s.textContent = `
    body.cutscene #app > *:not(#c):not(#cs-overlay):not(#cs-skip) { display: none !important; }
    #cs-overlay { position: absolute; left: 0; top: 0; pointer-events: none; image-rendering: pixelated; image-rendering: crisp-edges; image-rendering: pixelated; z-index: 8; }
    #cs-skip { position: absolute; right: max(12px, env(safe-area-inset-right)); bottom: max(12px, env(safe-area-inset-bottom)); z-index: 9; font: bold 13px "Courier New", monospace; color: #e8dfc4; background: rgba(8,10,16,.66); border: 2px solid #c9a24a; box-shadow: 2px 2px 0 #000; padding: 10px 14px; cursor: pointer; touch-action: none; opacity: .75; }
    #cs-skip:hover { opacity: 1; }`;
  document.head.appendChild(s);
}

const SKIP_GRACE = 0.6; // seconds in which a key held from the previous screen does not skip

/**
 * Plays a cutscene. opts: { onEnd(info), skippable = true, render, audio, root, ring, seed,
 * groups, blocks, reduceFlash }. info.skipped tells whether the person skipped it.
 */
export function playCutscene(nome, opts = {}) {
  const def = CUTSCENES[nome];
  if (!def) throw new Error(`unknown cutscene: ${nome}`);
  if (active) active.finish(true);
  const c = { ...(window.__rinha ?? {}), ...cfg, ...opts };
  const render = c.render, audio = c.audio, root = c.root ?? document.getElementById('app');
  if (!render) throw new Error('playCutscene: no render (call configureCutscenes({ render }) first)');
  const skippable = opts.skippable !== false;
  ensureCss();
  if (cfg.stageFor !== render) { cfg.stage = createStage(render, { seed: c.seed ?? 1, ring: c.ring ?? null, groups: c.groups ?? null }); cfg.stageFor = render; }
  const stage = cfg.stage;
  stage.ctx.blocks = c.blocks ?? null;
  stage.ctx.groups = c.groups ?? stage.ctx.groups;
  stage.inst(nome); // build before the clock starts (the first frame must not stall)
  stage.leave();

  const ov = document.createElement('canvas'); ov.id = 'cs-overlay'; root.appendChild(ov);
  const g = ov.getContext('2d');
  let btn = null;
  const state = { t: 0, ended: false, sfxAt: 0, started: false, lastPad: false };
  const reduce = c.reduceFlash ?? loadOpts().reduceFlash;
  document.body.classList.add('cutscene');
  const canvas = render.canvas;
  // the game's own draw() must not repaint over the cutscene: its render.draw is silenced until the end
  const gameDraw = render.draw; render.draw = () => {};

  if (skippable) {
    btn = document.createElement('div'); btn.id = 'cs-skip'; btn.textContent = 'PULAR >>'; root.appendChild(btn);
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); if (state.t > SKIP_GRACE) finish(true); });
  }
  const onKey = (e) => {
    if (!skippable || state.t < SKIP_GRACE) return;
    if (e.code === 'Enter' || e.code === 'Space' || e.code === 'Escape') { e.preventDefault(); finish(true); }
  };
  addEventListener('keydown', onKey, true);

  if (audio) { audio.cue?.(def.cue); }

  function pad() {
    if (!skippable || typeof navigator === 'undefined' || !navigator.getGamepads) return;
    let down = false;
    for (const p of navigator.getGamepads()) if (p && (p.buttons[0]?.pressed || p.buttons[1]?.pressed || p.buttons[9]?.pressed)) down = true;
    if (down && !state.lastPad && state.t > SKIP_GRACE) finish(true);
    state.lastPad = down;
  }

  function fireSfx(t0, t1) {
    if (!audio) return;
    for (const e of def.sfx ?? []) {
      if (e.t < t0 || e.t >= t1) continue;
      if (e.crowd !== undefined) audio.crowd?.(e.crowd);
      else if (e.flash) audio.flash?.();
      else audio.play?.(e.name, e.opts);
    }
  }

  let raf = 0, last = null;
  function tick(now) {
    if (state.ended) return;
    const dt = last === null ? 0 : Math.min(0.1, (now - last) / 1000); last = now;
    const t0 = state.t; state.t = Math.min(def.duration, state.t + dt);
    pad();
    if (state.ended) return;
    fireSfx(t0 === 0 && !state.started ? -1 : t0, state.t >= def.duration ? Infinity : state.t); state.started = true;
    const mode = reduce ? 'dark' : 'flash';
    const st = stage.frame(nome, state.t, { flashMode: mode });
    // the 3D canvas keeps the size the game gave it
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
    removeEventListener('keydown', onKey, true);
    ov.remove(); btn?.remove();
    canvas.style.filter = '';
    render.draw = gameDraw;
    document.body.classList.remove('cutscene');
    stage.leave();
    active = null;
    opts.onEnd?.({ skipped: Boolean(skipped), name: nome });
  }

  active = { finish, skippable };
  raf = requestAnimationFrame(tick);
  return { skip: () => { if (skippable) finish(true); }, stop: () => finish(true), get active() { return !state.ended; } };
}
