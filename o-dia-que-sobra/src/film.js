// Film mode (`?film` in the URL). Exposes on `window` a small scene contract for the video renderer, so
// the video is filmed from the cutscenes of the game itself (the two of the opening and the scripted
// shifts, which are the game played with nobody, with a fixed seed and forced events):
//
//   setup({ width, height, seed }) -> { views, actions, anchors }   (names; durations in `durations`)
//   shot({ from, to, actions, prev, duration, t0 })                  (a stretch of a cutscene)
//   frame(tLocal) -> data URL (JPEG) of the whole picture at width x height
//   report() -> { frames, offscreen, ... }
//   __film.sounds(from, to) -> { natural, events: [{ u, name, opts }] }   (the sound events of a stretch)
//
// A view is a named stretch of a cutscene ("chegada.placa"). A shot from `from` to `to` plays from the
// start of `from` to the end of `to` (consecutive views of one cutscene), stretched or squeezed to
// `duration`. Everything is a function of the time: no real clock, no Math.random. The picture is the
// PS1 render at low internal resolution, enlarged without smoothing, plus the cutscene overlay (fade,
// flashes, static, the dialogue box, the clipboard, the screens); never the game HUD.
//
// `build(opts)` is the same thing as a plain function: it returns { views, actions, anchors, tick } for
// a host that does not use the window functions.
import { createRender } from './render.js';
import { createStage, CUTSCENES } from './cutscenes/player.js';
import { drawOverlay, OVERLAY_SCALE } from './cutscenes/common.js';

/** Actions: optional variations of a view. They switch on at the start of the shot or at "name@0.6". */
export const ACTIONS = {
  clarao: 'Os clarões do trecho aparecem (no máximo 3 por segundo, nunca branco total). Sem esta ação o trecho sai sem clarão',
  escurecer: 'A versão "Reduzir clarões": cada clarão vira um escurecimento curto e as lâmpadas só diminuem, nunca apagam',
  chiado: 'Chiado de transmissão perdida por cima do trecho',
  penumbra: 'A imagem escurece como se a luz do posto fraquejasse (cena mais escura, sem clarão)',
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
  const views = {}, anchors = listAnchors();
  for (const [k, v] of Object.entries(listViews())) views[k] = `${v.desc} (${v.duration.toFixed(1)} s)`;
  return {
    id: 'o-dia-que-sobra',
    label: 'O Dia que Sobra',
    description: 'O jogo O Dia que Sobra por dentro, em primeira pessoa e no visual PS1: as duas cenas do começo (a chegada a pé e o gerente) e os expedientes roteirizados da primeira semana (a rotina, as noites que passam, a bomba 4, o telefone, o corte no auge e o cartão de memória). Cada vista é um trecho nomeado de uma cutscene do próprio jogo; um plano vai do começo de uma vista ao fim de outra da mesma cena, esticado ou comprimido à duração pedida. Não há HUD de jogo, só o HUD de cutscene (caixa de diálogo, prancheta, clarão, escurecimento, chiado, telas do escritório e do cartão). Provisório até as fases 3 e 4: a tela de entrada do computador, a grade e a imagem das câmeras no monitor e o painel da bomba.',
    views,
    actions: ACTIONS,
    anchors,
  };
}

/** Long sounds that keep going across a cut: a stretch that starts inside them gets the rest of them (`opts.offset`). */
const BEDS = new Set(['rodovia', 'insetos', 'vento', 'fluorescente', 'geladeira', 'motor_carro', 'bomba_corre', 'telefone_toca', 'chuva', 'estatica_camera', 'respiracao', 'coracao', 'sol_presenca']);

/**
 * The sound events of a shot from view `from` to view `to` (the same stretch `shot()` plays) of one cutscene.
 * Returns { natural, events }: natural = t1 of `to` - t0 of `from`, in seconds of cutscene, and for each event of
 * the cutscene's `sfx` with a <= t < b: { u: (t - a) / natural, name, opts }. All durations in `opts` (dur, offset)
 * are seconds of cutscene: whoever places them on a scene of another length multiplies them, like u, by the ratio
 * scene duration / natural. A bed that started before a and still sounds at a comes with u = 0, opts.offset = a - t,
 * and the duration left, cut at b. The names are those of src/audio/; 'babble' carries { seed, text }.
 */
export function sounds(from, to = from) {
  const views = listViews(), va = views[from], vb = views[to];
  if (!va) throw new Error(`unknown view: ${from}`);
  if (!vb) throw new Error(`unknown view: ${to}`);
  if (va.cutscene !== vb.cutscene) throw new Error(`views of different cutscenes: ${from} -> ${to}`);
  const a = va.t0, b = vb.t1, natural = b - a;
  if (natural <= 0) throw new Error(`view ${to} comes before ${from}`);
  const sfx = CUTSCENES[va.cutscene].sfx ?? [];
  const r = (x) => +x.toFixed(4), events = [];
  for (const e of sfx) {
    const opts = { ...(e.opts ?? {}) };
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

export function build({ width = 1920, height = 1080, seed = 1, blocks = null, cast = null, canvas = null } = {}) {
  const el = canvas ?? document.createElement('canvas');
  const render = createRender(el);
  render.resize(width, height);
  const stage = createStage(render, { seed, blocks, cast: cast ?? preloadedCast });
  const views = listViews();
  const out = document.createElement('canvas'); out.width = width; out.height = height;
  const g = out.getContext('2d');
  const ov = document.createElement('canvas'), og = ov.getContext('2d');
  ov.width = Math.round(render.size.w * OVERLAY_SCALE); ov.height = Math.round(render.size.h * OVERLAY_SCALE);
  let shot = null, ambientT = 0;

  /** One picture of cutscene `cn` at time t: returns the output canvas. flags: { clarao, escurecer, chiado, penumbra }. */
  function paint(cn, t, flags = {}, t0 = 0) {
    const flashMode = flags.clarao ? 'flash' : flags.escurecer ? 'dark' : 'none';
    stage.ctx.reduceFlash = Boolean(flags.escurecer);
    const st = stage.frame(cn, t, { ambient: t + t0, flashMode });
    if (flags.chiado) st.noise = Math.max(st.noise, 0.45);
    if (flags.penumbra) st.dim = Math.max(st.dim, 0.5);
    stage.draw();
    g.imageSmoothingEnabled = false;
    g.filter = st.blur > 0.02 ? `blur(${(st.blur * width / 160).toFixed(1)}px)` : 'none';
    g.drawImage(render.renderer.domElement, 0, 0, width, height);
    g.filter = 'none';
    drawOverlay(og, ov.width, ov.height, st);
    g.drawImage(ov, 0, 0, width, height);
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
    shot = { cutscene: a.cutscene, a: a.t0, b: b.t1, duration: s.duration, t0: s.t0 ?? 0, actions: timed, frames: 0, from: s.from, to: s.to ?? s.from };
    return true;
  }
  function frame(tLocal) {
    if (!shot) throw new Error('frame() before shot()');
    const u = Math.min(1, Math.max(0, tLocal / shot.duration));
    const t = shot.a + (shot.b - shot.a) * u;
    const flags = {};
    for (const x of shot.actions) if (tLocal >= x.at * shot.duration) flags[x.name] = true;
    ambientT = t;
    paint(shot.cutscene, t, flags, shot.t0);
    shot.frames++;
    return out.toDataURL('image/jpeg', 0.92);
  }
  const report = () => ({ frames: shot?.frames ?? 0, offscreen: {}, shot: shot && { from: shot.from, to: shot.to, natural: +(shot.b - shot.a).toFixed(3) } });

  return {
    views: Object.fromEntries(Object.entries(views).map(([k, v]) => [k, { ...v }])),
    actions: Object.fromEntries(Object.entries(ACTIONS).map(([k, d]) => [k, { desc: d }])),
    anchors: listAnchors(),
    tick(t) { ambientT = t; },
    sounds,
    shot: startShot, frame, report, paint, stage, render, get time() { return ambientT; },
  };
}

/** data/cast.json, read once in `setup` (the film page serves it next to the sources); the cutscenes fall back to their own looks without it. */
let preloadedCast = null;
async function loadCast() {
  try { const res = await fetch(new URL('../data/cast.json', import.meta.url)); if (res.ok) preloadedCast = await res.json(); } catch { /* the cutscenes carry their own looks */ }
}

export function installFilm() {
  if (window.__film) return window.__film;
  const q = new URLSearchParams(location.search);
  let film = null;
  window.setup = async (p = {}) => {
    await loadCast();
    film = build({ width: p.width ?? 1920, height: p.height ?? 1080, seed: p.seed ?? (Number(q.get('seed')) || 1), blocks: p.blocks ?? null });
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
