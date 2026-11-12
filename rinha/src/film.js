// Film mode (`?film` in the URL). Exposes on `window` a small scene contract for the video
// renderer, so the video is filmed from the cutscenes of the game itself:
//
//   setup({ width, height, seed, groups }) -> { views, actions, anchors }   (names; durations in `info`)
//   shot({ from, to, actions, prev, duration, t0 })                          (a stretch of a cutscene)
//   frame(tLocal) -> data URL (JPEG) of the whole picture at width x height
//   report() -> { frames, offscreen, ... }
//
// A view is a named stretch of a cutscene ("cela.riscos"). A shot from `from` to `to` plays from
// the start of `from` to the end of `to` (consecutive views of one cutscene), stretched or
// squeezed to `duration`. Everything is a function of the time: no real clock, no Math.random.
// The picture is the PS1 render at low internal resolution, enlarged without smoothing, plus the
// cutscene overlay (fade, flashes, static, the memory card); never the game HUD.
//
// `groups` is the tally of the cell wall (six counts, left to right). The game decides it; the
// film host passes it in setup (or `?groups=` in the URL) and, without it, the wall shows a neutral
// tally. The answers of the secrets are not in this repository.
//
// `build(opts)` is the same thing as a plain function: it returns { views, actions, anchors, tick }
// for a host that does not use the window functions.
import { createRender } from './render.js';
import { createStage, CUTSCENES } from './cutscenes/player.js';
import { drawOverlay, OVERLAY_SCALE } from './cutscenes/common.js';

/** Actions: optional variations of a view. They switch on at the start of the shot or at "name@0.6". */
export const ACTIONS = {
  clarao: 'Os clarões do trecho aparecem (no máximo 3 por segundo, nunca branco total). Sem esta ação o trecho sai sem clarão',
  escurecer: 'A versão "Reduzir clarões": cada clarão vira um escurecimento curto',
  desorientacao: 'A visão balança e embaça, como depois de um golpe (cabeça tonta)',
  chiado: 'Chiado de transmissão perdida por cima do trecho',
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
    id: 'rinha',
    label: 'Rinha',
    description: 'O jogo Rinha por dentro, em primeira pessoa e no visual PS1: as cenas de abertura (casa, pomar, galpões, cela, treino, entrada no ringue) e as cenas curtas do fim (família, venda para a Rinha Grande). Cada vista é um trecho nomeado de uma cutscene do próprio jogo; um plano vai do começo de uma vista ao fim de outra da mesma cena, esticado ou comprimido à duração pedida. Não há HUD de jogo, só o HUD de cutscene (clarão, escurecimento, chiado, tela do cartão de memória).',
    views,
    actions: ACTIONS,
    anchors,
  };
}

export function build({ width = 1920, height = 1080, seed = 1, groups = null, canvas = null, blocks = null } = {}) {
  const el = canvas ?? document.createElement('canvas');
  const render = createRender(el);
  render.resize(width, height);
  const stage = createStage(render, { seed, groups, blocks });
  const views = listViews();
  const out = document.createElement('canvas'); out.width = width; out.height = height;
  const g = out.getContext('2d');
  const ov = document.createElement('canvas'), og = ov.getContext('2d');
  ov.width = Math.round(render.size.w * OVERLAY_SCALE); ov.height = Math.round(render.size.h * OVERLAY_SCALE);
  let shot = null, ambientT = 0;

  /** One picture of cutscene `cn` at time t: returns the output canvas. flags: { clarao, escurecer, desorientacao, chiado }. */
  function paint(cn, t, flags = {}, t0 = 0) {
    const flashMode = flags.clarao ? 'flash' : flags.escurecer ? 'dark' : 'none';
    const st = stage.frame(cn, t, { ambient: t + t0, flashMode, extraDaze: flags.desorientacao ? 0.55 : 0 });
    if (flags.chiado) st.noise = Math.max(st.noise, 0.45);
    if (flags.desorientacao) st.blur = Math.max(st.blur, 0.6);
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
    shot: startShot, frame, report, paint, stage, render, get time() { return ambientT; },
  };
}

export function installFilm() {
  if (window.__film) return window.__film;
  const q = new URLSearchParams(location.search);
  let film = null;
  window.setup = async (p = {}) => {
    const groupsQ = q.get('groups');
    film = build({
      width: p.width ?? 1920, height: p.height ?? 1080, seed: p.seed ?? (Number(q.get('seed')) || 1),
      groups: p.groups ?? (groupsQ ? groupsQ.split(',').map(Number) : null),
    });
    document.getElementById('app')?.remove();
    const gl = film.render.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    window.__film.current = film;
    return { gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown', views: Object.keys(film.views), actions: Object.keys(film.actions), anchors: Object.keys(film.anchors), durations: Object.fromEntries(Object.entries(film.views).map(([k, v]) => [k, v.duration])) };
  };
  window.shot = (s) => film.shot(s);
  window.frame = (t) => film.frame(t);
  window.report = () => film.report();
  window.__film = { manifest, build, listViews, current: null };
  return window.__film;
}

if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('film')) installFilm();
