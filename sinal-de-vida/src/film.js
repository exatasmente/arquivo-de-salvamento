// Film mode (`?film` in the URL). Exposes on `window` the scene contract of the video renderer, so the video
// is filmed from the game itself: its scenes, as the scene editor left them, through its cutscenes.
//
//   setup({ width, height, seed }) -> { views, actions, anchors, durations }
//   shot({ from, to, actions, duration, t0 })   a stretch of one cutscene, from the start of view `from` to
//                                                the end of view `to`, stretched or squeezed to `duration`
//   frame(tLocal) -> data URL (JPEG) of the whole picture at width x height
//   report() -> { frames, offscreen, shot }
//   __film.sounds(from, to) -> { natural, events: [{ u, name, opts }] }
//
// Everything is a function of the time: no real clock, no Math.random. The picture is the game's render (the animacao look; ps2 is still there to compare) at its
// internal resolution (near the video's own for animacao, low and enlarged without smoothing for ps2); never a HUD.
import { createRender } from './render.js';
import { CUTSCENES } from './cutscenes/index.js';
import { filmEmitterEvents, worldPos } from './audio/film-sounds.js';
import GALERIA from '../data/scenes/galeria.json' with { type: 'json' };
import RUA from '../data/scenes/rua.json' with { type: 'json' };

/** Actions: optional variations of a view, switched on at the start of the shot or at "name@0.6". */
export const ACTIONS = {
  escuro: 'A luz do cenário cai pela metade, sem piscar',
};

export function listViews() {
  const out = {};
  for (const [cn, def] of Object.entries(CUTSCENES)) {
    for (const [vn, v] of Object.entries(def.views)) out[`${def.prefix ?? def.name ?? cn}.${vn}`] = { cutscene: cn, t0: v[0], t1: v[1], duration: +(v[1] - v[0]).toFixed(3), desc: v[2] ?? '' };
  }
  return out;
}
export function listAnchors() {
  const out = {};
  for (const [cn, def] of Object.entries(CUTSCENES)) for (const [an, desc] of Object.entries(def.anchors ?? {})) out[`${def.prefix ?? def.name ?? cn}.${an}`] = desc;
  return out;
}

/** The manifest of the film mode (src/film-manifest.json): its views, actions and anchors. */
export function manifest() {
  const views = {};
  for (const [k, v] of Object.entries(listViews())) views[k] = `${v.desc} (${v.duration.toFixed(1)} s)`;
  return {
    id: 'sinal-de-vida',
    label: 'Sinal de Vida',
    description: 'O jogo Sinal de Vida por dentro, no visual de animação (o ps2 segue no jogo para comparar): cada vista é um trecho nomeado de uma cutscene do próprio jogo, filmado do cenário como o editor de cenas o deixou. Um plano vai do começo de uma vista ao fim de outra da mesma cena, esticado ou comprimido à duração pedida. Sem HUD.',
    views,
    actions: ACTIONS,
    anchors: listAnchors(),
  };
}

/** Long sounds that keep going across a cut: a stretch that starts inside them gets the rest of them. */
const BEDS = new Set(['ambiente', 'ambiente-rua', 'ambiente-poco', 'ambiente-predio']);

/** The layout each cutscene films, for the sound of the objects in it (the two of the radio, with their own lamps and voices, have none). */
const LAYOUT_OF = { galeria: GALERIA, 'a-galeria': GALERIA, rua: RUA, noite1: RUA, emenda: RUA, fuga: RUA };

/** Where a sound of a cutscene is (its `pos`, or `at`: an actor of the cutscene, or the id of an entity of its layout), at cutscene time t; null: the camera's own. */
function placeOf(def, layout, e, t) {
  if (e.pos) return e.pos.length === 2 ? [e.pos[0], 1, e.pos[1]] : e.pos;
  if (typeof e.at !== 'string') return null;
  try { const a = def.actor?.(e.at, t); if (a) return a; } catch { /* no such actor in this view */ }
  const ent = layout?.entities.find((x) => x.id === e.at);
  if (ent) { const p = worldPos(ent); return [p[0], Math.max(p[1], 0.8), p[2]]; }
  return null;
}

/** The sound events of a shot from `from` to `to` (see the head of this file; the same rules as the shots). */
export function sounds(from, to = from) {
  const views = listViews(), va = views[from], vb = views[to];
  if (!va) throw new Error(`unknown view: ${from}`);
  if (!vb) throw new Error(`unknown view: ${to}`);
  if (va.cutscene !== vb.cutscene) throw new Error(`views of different cutscenes: ${from} -> ${to}`);
  const a = va.t0, b = vb.t1, natural = b - a;
  if (natural <= 0) throw new Error(`view ${to} comes before ${from}`);
  const r = (x) => +x.toFixed(4), events = [], def = CUTSCENES[va.cutscene], layout = LAYOUT_OF[va.cutscene] ?? null;
  // the listener and the objects of the scene that sound (components.sound of the layout's entities), from the camera of the stretch
  if (layout && def.camera) events.push(...filmEmitterEvents({ layout, camera: def.camera, a, b }));
  for (const e of def.sfx ?? []) {
    const opts = { ...(e.opts ?? {}) };
    if (e.t >= a && e.t < b) { const pos = placeOf(def, layout, e, e.t); if (pos) opts.pos = pos.map((v) => +v.toFixed(2)); }
    if (e.t >= a && e.t < b) {
      if (BEDS.has(e.name) && opts.dur !== undefined) opts.dur = r(Math.min(opts.dur, b - e.t));
      events.push({ u: r((e.t - a) / natural), name: e.name, opts });
    } else if (e.t < a && BEDS.has(e.name) && opts.dur !== undefined && e.t + opts.dur > a) {
      events.push({ u: 0, name: e.name, opts: { ...opts, dur: r(Math.min(e.t + opts.dur, b) - a), offset: r(a - e.t) } });
    }
  }
  events.sort((p, q) => p.u - q.u);
  return { natural: r(natural), events };
}

/**
 * The film mode as a plain function: the scenes of the cutscenes built once (each cutscene's `build`), and a `stage` that puts the
 * camera of cutscene `cn` at time t and draws (stage.draw is looked up on every frame: a camera adjustment of the video's
 * renderer wraps it).
 */
export function build({ width = 1920, height = 1080, canvas = null } = {}) {
  const el = canvas ?? document.createElement('canvas');
  const render = createRender(el);
  // The video has no phone to spare: the animated look draws at the video's own width (it is capped at 1920).
  if (render.look !== 'ps2') render.setLook(render.look, { pixels: Math.min(1920, width), pixelsPortrait: Math.min(1080, width) });
  render.resize(width, height);
  const scenes = {};
  for (const def of Object.values(CUTSCENES)) {
    if (scenes[def.scene]) continue;
    const sc = def.build(render);
    sc.group.visible = false;
    render.scene.add(sc.group);
    scenes[def.scene] = sc;
  }
  const views = listViews();
  const out = document.createElement('canvas'); out.width = width; out.height = height;
  const g = out.getContext('2d');
  let shot = null, shown = null;

  const stage = {
    /** Cutscene `cn` at time t: its scene shown, its lights on, the camera where the cutscene puts it. */
    frame(cn, t, flags = {}) {
      const def = CUTSCENES[cn], sc = scenes[def.scene];
      if (shown !== sc) { if (shown) shown.group.visible = false; sc.group.visible = true; shown = sc; }
      sc.lights.apply();
      if (flags.escuro) render.light({ ambient: '#1d1f25', key: '#5c5a64' });
      const cam = def.camera(t);
      // a cutscene may ask for a lens (`lens`, the vertical field of view in degrees: a close-up); without it, the game's own
      const lens = cam.lens ?? render.camera.baseFov;
      if (lens && render.camera.fov !== lens) { render.camera.fov = lens; render.camera.updateProjectionMatrix(); }
      render.camera.position.set(...cam.eye);
      render.camera.lookAt(...cam.at);
      sc.update(t, { listener: cam.eye, dir: [cam.at[0] - cam.eye[0], cam.at[1] - cam.eye[1], cam.at[2] - cam.eye[2]] });
    },
    draw() { render.draw(); },
  };

  function paint(cn, t, flags = {}) {
    stage.frame(cn, t, flags);
    stage.draw();
    g.imageSmoothingEnabled = render.look !== 'ps2';
    g.drawImage(render.renderer.domElement, 0, 0, width, height);
    return out;
  }

  function startShot(s) {
    const a = views[s.from], b = views[s.to ?? s.from];
    if (!a) throw new Error(`unknown view: ${s.from}`);
    if (!b) throw new Error(`unknown view: ${s.to}`);
    if (a.cutscene !== b.cutscene) throw new Error(`views of different cutscenes: ${s.from} -> ${s.to}`);
    if (b.t1 <= a.t0) throw new Error(`view ${s.to} comes before ${s.from}`);
    const timed = (s.actions ?? []).map((x) => { const [name, at] = String(x).split('@'); return { name, at: Math.min(0.95, Math.max(0, Number(at) || 0)) }; });
    for (const x of timed) if (!(x.name in ACTIONS)) throw new Error(`unknown action: ${x.name}`);
    shot = { cutscene: a.cutscene, a: a.t0, b: b.t1, duration: s.duration, actions: timed, frames: 0, from: s.from, to: s.to ?? s.from };
    return true;
  }
  function frame(tLocal) {
    if (!shot) throw new Error('frame() before shot()');
    const u = Math.min(1, Math.max(0, tLocal / shot.duration));
    const t = shot.a + (shot.b - shot.a) * u;
    const flags = {};
    for (const x of shot.actions) if (tLocal >= x.at * shot.duration) flags[x.name] = true;
    paint(shot.cutscene, t, flags);
    shot.frames++;
    return out.toDataURL('image/jpeg', 0.92);
  }
  const report = () => ({ frames: shot?.frames ?? 0, offscreen: {}, shot: shot && { from: shot.from, to: shot.to, natural: +(shot.b - shot.a).toFixed(3) } });

  return {
    views: Object.fromEntries(Object.entries(views).map(([k, v]) => [k, { ...v }])),
    actions: Object.fromEntries(Object.entries(ACTIONS).map(([k, d]) => [k, { desc: d }])),
    anchors: listAnchors(),
    sounds, shot: startShot, frame, report, paint, stage, render,
  };
}

export function installFilm() {
  if (window.__film) return window.__film;
  let film = null;
  window.setup = async (p = {}) => {
    film = build({ width: p.width ?? 1920, height: p.height ?? 1080 });
    document.getElementById('app')?.remove();
    const gl = film.render.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    window.__film.current = film;
    return { gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown', views: Object.keys(film.views), actions: Object.keys(film.actions), anchors: Object.keys(film.anchors), durations: Object.fromEntries(Object.entries(film.views).map(([k, v]) => [k, v.duration])) };
  };
  window.shot = (s) => film.shot(s);
  window.frame = (t) => film.frame(t);
  window.report = () => film.report();
  window.__film = { manifest, build, listViews, sounds, current: null };
  return window.__film;
}

if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('film')) installFilm();
