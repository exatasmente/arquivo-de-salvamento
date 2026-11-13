// SecurityCameraSystem: the six ceiling cameras of the monitor in the office. Each picture is a second render of
// the real posto from the camera's own anchor (cam1 .. cam6) into a 160 x 120 target, turned into black and white
// with a dotted (ordered) dither and the camera / clock stamp in the corner. The monitor shows one camera or the grid
// of six. Nothing is drawn while the monitor is closed; in the grid one camera is drawn per frame, in turn.
//
// What the cameras do to the truth (all functions of the game clock and the seeds, nothing reads a real clock):
//   fail(cam, { kind: 'chiado' | 'atraso' | 'queda', secs, level, delay })   snow / a picture some seconds old / signal lost
//   ghost(cam, { kind: 'figura' | 'carro' | 'voce', ... })                    something drawn only in the camera's render
// plus the failures that come by themselves: the sanity (snow, delay, drop-outs) and the breakers (no power, no picture).
//
// Wiring in game.js (see the report that comes with this file):
//   const cameras = createCameras(bus, { render, world, ui, time, sanity, input, data, player, interaction, office, lighting, progression });
//   step(): cameras.update(dt, simT)  (also while the monitor is open: `cameras.watching`)      draw(): cameras.draw() before render.draw()
//   the events get `cameras` in their context.
//
// There is one rule for the ids: an id that is not in CAMERAS is ignored everywhere (ghost, fail, shoot, open).
import { mulberry32 } from '../rng.js';
import { buildCustomer } from '../models/customer.js';
import { buildHuman } from '../models/human.js';
import { poseWalk } from '../look.js';

export const CAM_W = 160, CAM_H = 120;
const SCR_W = 320, SCR_H = 240;
/** The cameras the monitor lists, in order. `area` is the breaker area that feeds each one. */
export const CAMERAS = [
  { id: 'cam1', n: 1, nome: 'LOJA', area: 'loja', fov: 48, aim: [12.4, 1.15, 8.9] },   // the store camera frames the counter
  { id: 'cam2', n: 2, nome: 'BOMBAS 1-2', area: 'bombas', fov: 70 },
  { id: 'cam3', n: 3, nome: 'BOMBAS 3-4', area: 'bombas', fov: 70 },
  { id: 'cam4', n: 4, nome: 'ESTOQUE', area: 'estoque', fov: 76 },
  { id: 'cam5', n: 5, nome: 'SERVICO', area: 'servico', fov: 72 },
  { id: 'cam6', n: 6, nome: 'ESTACIONAMENTO', curto: 'ESTACION.', area: 'estacionamento', fov: 68 },
];
export const CAMERA_IDS = CAMERAS.map((c) => c.id);
const COUNT = CAMERAS.length;

const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// ---------------------------------------------------------------------------------------------- the stamp's font (3 x 5)
const FONT = {
  0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001', 5: '111100111001111',
  6: '111100111101111', 7: '111001001010010', 8: '111101111101111', 9: '111101111001111',
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100',
  G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '111101101101101', O: '010101101101010', P: '110101110100100', Q: '010101101111011', R: '110101110101101',
  S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111', ':': '000010000010000', '-': '000000111000000', '.': '000000000000010', '/': '001001010100100', ' ': '000000000000000',
};
/** Draws `str` with the 3 x 5 font at (x, y) on a 2D context; scale in pixels per dot; a dark outline keeps it readable on any picture. */
function drawText(g, str, x, y, scale = 1, color = '#d8ffd8', outline = true) {
  const put = (ox, oy, col) => {
    g.fillStyle = col;
    let cx = x + ox;
    for (const ch of str) {
      const bits = FONT[ch] || FONT[' '];
      for (let k = 0; k < 15; k++) if (bits[k] === '1') g.fillRect(cx + (k % 3) * scale, y + oy + Math.floor(k / 3) * scale, scale, scale);
      cx += 4 * scale;
    }
  };
  if (outline) for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) put(ox * Math.max(1, scale > 1 ? 1 : 1), oy, '#000');
  put(0, 0, color);
}
const textWidth = (str, scale = 1) => str.length * 4 * scale - scale;

export function createCameras(bus, { render, world, ui, time, sanity = null, input = null, data = null, player = null, interaction = null, office = null, lighting = null, progression = null }) {
  const THREE = render.THREE;
  const cams = CAMERAS.filter((c) => world.has(c.id));
  const N = cams.length;
  const props = world.posto?.props || {};
  const breakers = world.posto?.breakers || null;
  const idxOf = (id) => (id === 'all' ? -1 : typeof id === 'number' ? id - 1 : cams.findIndex((c) => c.id === id));
  const valid = (i) => i >= 0 && i < N;

  // ------------------------------------------------------------------ the render target and the shared uniforms
  const rt = new THREE.WebGLRenderTarget(CAM_W, CAM_H, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, generateMipmaps: false });
  rt.texture.colorSpace = THREE.NoColorSpace;
  const aux = new THREE.PerspectiveCamera(70, CAM_W / CAM_H, 0.3, 70);
  const px = new Uint8Array(CAM_W * CAM_H * 4);                       // the synchronous read
  const pxs = cams.map(() => new Uint8Array(CAM_W * CAM_H * 4));       // one buffer per camera for the asynchronous reads
  const inflight = cams.map(() => false);
  let sync = typeof render.renderer.readRenderTargetPixelsAsync !== 'function';
  const U = render.mat('#000000').uniforms;   // the same uniform objects every PS1 material shares
  const PL = U.uPointPos.value.length;
  const keep = {
    pos: Array.from({ length: PL }, () => new THREE.Vector3()), col: Array.from({ length: PL }, () => new THREE.Color()), range: new Float32Array(PL),
    amb: new THREE.Color(), res: new THREE.Vector2(), spotOn: 0,
  };
  const tmpC = new THREE.Color();

  // ------------------------------------------------------------------ pictures
  const pics = cams.map(() => {
    const canvas = document.createElement('canvas'); canvas.width = CAM_W; canvas.height = CAM_H;
    return { canvas, g: canvas.getContext('2d'), id: new ImageData(CAM_W, CAM_H), gray: new Uint8Array(CAM_W * CAM_H), t: -1, shots: 0 };
  });
  const hist = cams.map(() => []);   // [{ t, gray }] the last seconds of every camera, for the delayed picture
  const HIST_SECS = 14, HIST_MAX = 70;

  const scr = document.createElement('canvas'); scr.width = SCR_W; scr.height = SCR_H;
  const sg = scr.getContext('2d');
  const tex = new THREE.CanvasTexture(scr); tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.NoColorSpace;

  // ------------------------------------------------------------------ state
  let now = 0, seed = 1, frameN = 0, open = false, mode = 'grid', cur = 0, rr = 0, dirty = true, recAcc = 0;
  const faults = [];   // { id, cam (-1 all), kind, t1, level, delay }
  const ghosts = [];   // see ghost()
  const trail = [];    // the player's own recent path: { t, x, z, yaw, d, moving, crouch, area }
  let walked = 0, lastSamplePos = null;
  const stats = { shots: 0, shotMs: 0, composeMs: 0, lastDrawMs: 0 };
  let chiadoLoop = false, lastDevice = '';

  // ------------------------------------------------------------------ the conditions of a camera now
  const BASE_CHIADO = 0.035;
  const P_CHIADO = [0, 0.05, 0.12, 0.2, 0.3, 0.42], P_ATRASO = [0, 0, 0.05, 0.1, 0.15, 0.2], P_QUEDA = [0, 0, 0.0, 0.05, 0.08, 0.12];
  function condition(i, t = now) {
    const cam = cams[i];
    let chiado = BASE_CHIADO, delay = 0, down = false;
    if (breakers?.powered && !breakers.powered({ area: cam.area })) down = true;
    for (const f of faults) {
      if (t >= f.t1 || (f.cam !== -1 && f.cam !== i)) continue;
      if (f.kind === 'chiado') chiado = Math.max(chiado, f.level);
      else if (f.kind === 'atraso') delay = Math.max(delay, f.delay);
      else if (f.kind === 'queda') down = true;
    }
    const s = sanity ? sanity.stage : 0;
    if (s > 0) {
      const w = Math.floor(t / 12), h0 = hash(i * 131 + w * 17 + seed * 7), h1 = hash(i * 71 + w * 29 + seed * 3 + 5), h2 = hash(i * 53 + w * 13 + seed + 9);
      const at = hash(w * 5 + i + seed) * 8, local = t - w * 12;
      if (h0 < P_CHIADO[s] && local >= at && local < at + 1.5 + h1 * 2) chiado = Math.max(chiado, 0.35 + h2 * 0.5);
      if (h1 < P_ATRASO[s] && local >= at && local < at + 6) delay = Math.max(delay, 3 + h2 * 3);
      if (h2 < P_QUEDA[s] && local >= at && local < at + 2 + h0 * 2) down = true;
    }
    return { chiado, delay, down };
  }

  // ------------------------------------------------------------------ the lights the camera sees by
  const lightList = world.lights || [];
  const cand = [];
  function lightsFor(pos) {
    cand.length = 0;
    for (const l of lightList) {
      if (l.level !== undefined ? l.level <= 0.01 : !l.on) continue;
      if (lighting?.isOn && !lighting.isOn(l.id)) continue;
      if (l.burnt || (breakers?.powered && !breakers.powered(l))) continue;
      const d = Math.hypot(l.pos[0] - pos.x, l.pos[1] - pos.y, l.pos[2] - pos.z);
      if (d > l.range + 14) continue;
      cand.push({ l, k: l.level ?? 1, s: (d < l.range ? 3 : 0) + l.range / (d + 3) });
    }
    cand.sort((a, b) => b.s - a.s);
    for (let k = 0; k < PL; k++) {
      const e = cand[k];
      if (!e) { U.uPointColor.value[k].setRGB(0, 0, 0); U.uPointRange.value[k] = 1; continue; }
      U.uPointPos.value[k].set(e.l.pos[0], e.l.pos[1], e.l.pos[2]);
      U.uPointColor.value[k].set(e.l.color).multiplyScalar(e.k * 0.95);
      U.uPointRange.value[k] = e.l.range;
    }
  }

  // ------------------------------------------------------------------ ghosts: things drawn only in the cameras' render
  const heitorLook = { seed: 41, skin: '#c8a07a', hair: '#1f1a16', outfit: 'civil', glove: 'none', shirt: '#86652a', pants: '#2e3c4e', height: 1.75, build: 'mid' };
  function makeBody(spec) {
    if (spec.kind === 'figura') {
      const tipo = (data?.cast?.tipos || []).find((t) => t.id === (spec.tipo || 'frentista-antigo'));
      const h = buildCustomer(render, { categoria: 'sobrenatural', ...(tipo?.aparencia || { roupa: 'frentista-antigo', sobrenatural: 'frentista-antigo', acessorios: ['bone'] }) }, { seed: spec.seed ?? 12 });
      h.setPose(spec.pose || 'fixo', 0);
      return { root: h.root, update: (t, st) => { if (st.moving !== undefined) h.update(t, { pose: spec.pose || 'fixo', andando: st.moving ? 1 : 0, fase: st.phase }); }, moves: true };
    }
    if (spec.kind === 'carro') {
      const car = world.car(spec.seed ?? 3, spec.car || {});
      const root = car.root || car.group || car;
      return { root, update: () => {} };
    }
    if (spec.kind === 'voce') {
      const b = buildHuman(render, { ...heitorLook, ...(spec.look || {}) });
      return { root: b.root, update: (t, st) => { poseWalk(b.joints, st.phase || 0, st.moving ? 1 : 0); }, you: true };
    }
    return null;
  }
  /** Where a path is `u` seconds after it began: the sample at that time, with the walking phase. */
  function pathAt(path, u, loop) {
    const T = path[path.length - 1].t;
    if (loop && T > 0) u = u % (T + 1); else u = Math.min(u, T);
    let a = 0; while (a < path.length - 2 && path[a + 1].t <= u) a++;
    const p = path[a], q = path[Math.min(a + 1, path.length - 1)], k = q.t > p.t ? clamp((u - p.t) / (q.t - p.t), 0, 1) : 0;
    let dy = q.yaw - p.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
    return { x: p.x + (q.x - p.x) * k, z: p.z + (q.z - p.z) * k, yaw: p.yaw + dy * k, moving: p.moving || q.moving, crouch: p.crouch, phase: (p.d + ((q.d ?? p.d) - p.d) * k) * 3.3, ended: u >= T };
  }
  /**
   * Draws something only in the render of the cameras (the main view never shows it).
   *   cam: 'cam1'..'cam6', an array of them, or 'all'.
   *   figura: { x, z, yaw, tipo = 'frentista-antigo', pose = 'fixo', seed }   yaw is the heading of the figure (0 faces +z)
   *   carro:  { pump: 1..4 } or { x, z, yaw, seed, car: { color, ... } }
   *   voce:   { path, loop, speed } (a stretch of `cameras.segment`) or { x, z, yaw } standing; yaw as the player's (forward = (-sin, -cos))
   * Returns { set({ x, z, yaw, visible, cams }), remove(), root, alive, at() }.
   */
  function ghost(cam, spec) {
    const list = cam === 'all' ? cams.map((_, i) => i) : (Array.isArray(cam) ? cam : [cam]).map(idxOf).filter(valid);
    if (!list.length || !spec) return null;
    const body = makeBody(spec); if (!body) return null;
    // what only the cameras see is lit by the infrared of the camera: lifted, so that a dark uniform still reads on the grey picture
    body.root.traverse((o) => {
      const u = o.isMesh && o.material?.uniforms; if (!u) return;
      if (spec.kind === 'carro') { u.uEmissive.value = Math.max(u.uEmissive.value, 0.12); return; }
      u.uEmissive.value = Math.max(u.uEmissive.value, 0.3);
    });
    body.root.visible = false; render.scene.add(body.root);
    let p0 = spec.pump ? world.carSpot?.(spec.pump) : null;
    const g = {
      spec, body, root: body.root, cams: new Set(list), visible: true, alive: true, t0: now,
      x: p0 ? p0.pos.x : spec.x ?? 0, z: p0 ? p0.pos.z : spec.z ?? 0, yaw: p0 ? p0.yaw : spec.yaw ?? 0,
      set(o) { Object.assign(g, o.cams ? { cams: new Set(o.cams.map?.(idxOf) ?? [idxOf(o.cams)]) } : {}); for (const k of ['x', 'z', 'yaw', 'visible']) if (o[k] !== undefined) g[k] = o[k]; if (o.pose) { spec.pose = o.pose; } },
      remove() { if (!g.alive) return; g.alive = false; render.scene.remove(body.root); const k = ghosts.indexOf(g); if (k >= 0) ghosts.splice(k, 1); },
    };
    ghosts.push(g);
    return g;
  }
  function placeGhost(g, t) {
    const sp = g.spec;
    let st = { moving: false, phase: 0 };
    if (g.body.you) {
      if (sp.path) {
        const s = pathAt(sp.path, (t - g.t0) * (sp.speed || 1), sp.loop);
        g.body.root.position.set(s.x, 0, s.z); g.body.root.rotation.y = s.yaw + Math.PI; g.body.root.scale.set(1, s.crouch ? 0.72 : 1, 1); st = s; g.ended = s.ended;
      } else { g.body.root.position.set(g.x, 0, g.z); g.body.root.rotation.y = g.yaw + Math.PI; }
    } else { g.body.root.position.set(g.x, 0, g.z); g.body.root.rotation.y = g.yaw; }
    g.body.update(t, st);
  }

  // ------------------------------------------------------------------ the shot
  /** Renders camera i from its anchor and leaves its exposed grey picture in pics[i].gray. */
  function render1(i, t, wait = true) {
    const c = cams[i], a = world.anchor(c.id);
    aux.position.copy(a.pos); aux.fov = c.fov; aux.updateProjectionMatrix();
    if (c.aim) aux.lookAt(c.aim[0], c.aim[1], c.aim[2]); else aux.lookAt(a.pos.x + a.dir.x, a.pos.y + a.dir.y, a.pos.z + a.dir.z);
    aux.updateMatrixWorld(true);
    // keep the main view's state
    for (let k = 0; k < PL; k++) { keep.pos[k].copy(U.uPointPos.value[k]); keep.col[k].copy(U.uPointColor.value[k]); keep.range[k] = U.uPointRange.value[k]; }
    keep.amb.copy(U.uAmbient.value); keep.res.copy(U.uRes.value); keep.spotOn = U.uSpotOn.value;
    const camVis = render.camera.visible;
    lightsFor(a.pos);
    U.uAmbient.value.set(0x5a5e70); U.uRes.value.set(CAM_W, CAM_H); U.uSpotOn.value = 0;
    render.camera.visible = false;    // the hands ride on it
    for (const g of ghosts) { if (g.visible && g.cams.has(i)) { placeGhost(g, t); g.root.visible = true; } }
    const r = render.renderer, prev = r.getRenderTarget();
    r.setRenderTarget(rt); r.render(render.scene, aux);
    // the read is queued behind the render: asynchronous, the game never waits for the GPU (the picture lands a frame or two later)
    const later = wait ? (r.readRenderTargetPixels(rt, 0, 0, CAM_W, CAM_H, px), null) : r.readRenderTargetPixelsAsync(rt, 0, 0, CAM_W, CAM_H, pxs[i]);
    r.setRenderTarget(prev);
    for (const g of ghosts) g.root.visible = false;
    render.camera.visible = camVis;
    for (let k = 0; k < PL; k++) { U.uPointPos.value[k].copy(keep.pos[k]); U.uPointColor.value[k].copy(keep.col[k]); U.uPointRange.value[k] = keep.range[k]; }
    U.uAmbient.value.copy(keep.amb); U.uRes.value.copy(keep.res); U.uSpotOn.value = keep.spotOn;
    return later;
  }
  /** The exposed grey picture (a security camera with infrared: the dark is lifted) from the RGBA read-back. */
  function toGray(i, buf) {
    const gray = pics[i].gray;
    for (let y = 0; y < CAM_H; y++) {
      let s = (CAM_H - 1 - y) * CAM_W * 4, o = y * CAM_W;
      for (let x = 0; x < CAM_W; x++, s += 4, o++) gray[o] = clamp((0.3 * buf[s] + 0.59 * buf[s + 1] + 0.11 * buf[s + 2] - 14) * 2.3, 0, 255);
    }
  }
  function remember(i, t) {
    const h = hist[i], g = new Uint8Array(pics[i].gray);
    h.push({ t, gray: g });
    while (h.length > HIST_MAX || (h.length > 1 && h[0].t < t - HIST_SECS)) h.shift();
  }
  function histAt(i, tt) {
    const h = hist[i]; let best = h[0];
    for (const e of h) { if (e.t <= tt) best = e; else break; }
    return best ? best.gray : pics[i].gray;
  }
  const clockText = (minutes) => {
    const s = Math.floor(minutes * 60), hh = Math.floor(s / 3600) % 24, mm = Math.floor(s / 60) % 60, ss = s % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  };

  /** The picture of camera i with the failures on it and dithered, into pics[i].canvas (the stamp is drawn by the screen, at its own scale). `src` is the grey picture to use. */
  function develop(i, t, minutes, cond, src) {
    const P = pics[i], d = P.id.data, rnd = mulberry32((i * 7919 + Math.floor(t * 12) * 104729 + seed * 31) >>> 0);
    const lv = 7, gain = 255 / (lv - 1);
    const snow = cond.down ? 0.9 : cond.chiado;
    // a roll bar and a tear while there is snow
    const barY = snow > 0.2 ? Math.floor(((t * 41 + i * 23) % (CAM_H + 30))) - 15 : -99, barH = 6 + Math.floor(snow * 16);
    for (let y = 0; y < CAM_H; y++) {
      const inBar = y >= barY && y < barY + barH;
      const shift = inBar ? Math.floor((rnd() - 0.5) * 22 * snow) : (snow > 0.5 && rnd() < 0.05 ? Math.floor((rnd() - 0.5) * 10) : 0);
      for (let x = 0; x < CAM_W; x++) {
        let sx = x + shift; if (sx < 0) sx += CAM_W; else if (sx >= CAM_W) sx -= CAM_W;
        let L = cond.down ? 12 : src[y * CAM_W + sx];
        L += (rnd() - 0.5) * 14;
        if (snow > 0 && rnd() < snow * (inBar ? 1 : 0.6)) { const m = Math.min(0.95, snow * (inBar ? 1.1 : 0.9)); L = L * (1 - m) + rnd() * 255 * m; }
        L = clamp(Math.floor(L / 255 * (lv - 1) + (BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * 0.9 + 0.5) * gain, 0, 255);
        const o = (y * CAM_W + x) * 4;
        d[o] = L * 0.82; d[o + 1] = L; d[o + 2] = L * 0.86; d[o + 3] = 255;
      }
    }
    P.g.putImageData(P.id, 0, 0);
    const g = P.g;
    // scanlines, then the stamp
    g.fillStyle = 'rgba(0,0,0,0.13)'; for (let y = 1; y < CAM_H; y += 2) g.fillRect(0, y, CAM_W, 1);
    P.t = t; P.shots++; P.down = cond.down;
  }

  /**
   * Takes a picture of camera `id` at the clock `t` (the game clock by default) and returns the 160 x 120 canvas. Used by the monitor and by the
   * filming mode (which passes its own `t` and `minutes`): everything in it is a function of those and of the seed.
   */
  function shoot(id, { t = now, minutes = time.minutes } = {}) {
    const i = idxOf(id); if (!valid(i)) return null;
    const t0 = performance.now();
    const cond = condition(i, t);
    const tr = performance.now();
    if (!cond.down) { render1(i, t, true); toGray(i, px); remember(i, t); }
    stats.renderMs = performance.now() - tr;
    develop(i, t, minutes, cond, cond.delay > 0 && !cond.down ? histAt(i, t - cond.delay) : pics[i].gray);   // the stamp keeps the live clock: a late picture does not say so
    stats.shots++; stats.shotMs = performance.now() - t0; stats.developMs = stats.shotMs - stats.renderMs;
    return pics[i].canvas;
  }
  /** The same picture for the live monitor, without waiting for the GPU: the render is queued now, the picture is developed when the read arrives. */
  function shootLater(i) {
    if (sync) { shoot(cams[i].id); return; }
    if (inflight[i]) return;
    const t = now, minutes = time.minutes, cond = condition(i, t);
    if (cond.down) { shoot(cams[i].id); return; }
    const t0 = performance.now();
    inflight[i] = true;
    const p = render1(i, t, false);
    stats.renderMs = performance.now() - t0;
    p.then(() => {
      inflight[i] = false; if (!open) return;
      toGray(i, pxs[i]); remember(i, t);
      develop(i, t, minutes, cond, cond.delay > 0 ? histAt(i, t - cond.delay) : pics[i].gray);
      stats.shots++; stats.landed = performance.now();
    }, (e) => { inflight[i] = false; sync = true; console.warn('cameras: async read failed, going synchronous', e?.message); });
  }

  // ------------------------------------------------------------------ the monitor's screen
  /** The stamp of a camera: name and clock on top and below, a blinking REC; (x, y, w, h) is where its picture is on the screen, k the dot size. */
  function stamp(i, x, y, w, h, k, minutes, t) {
    const lab = `CAM ${cams[i].n} ${k === 1 ? cams[i].curto || cams[i].nome : cams[i].nome}`;
    if (pics[i].down) { const m = 'SEM SINAL'; drawText(sg, m, x + Math.floor((w - textWidth(m, k * 2)) / 2), y + Math.floor(h / 2) - 5 * k, k * 2); }
    drawText(sg, lab, x + 3 * k, y + 3 * k, k);
    drawText(sg, clockText(minutes), x + 3 * k, y + h - 8 * k, k);
    if (Math.floor(t * 1.5) % 2 === 0) { sg.fillStyle = '#d8ffd8'; sg.fillRect(x + w - 24 * k, y + 3 * k, 4 * k, 4 * k); drawText(sg, 'REC', x + w - 18 * k, y + 3 * k, k, '#d8ffd8', false); }
  }
  function compose(minutes = time.minutes, t = now) {
    const t0 = performance.now();
    sg.imageSmoothingEnabled = false;
    sg.fillStyle = '#030503'; sg.fillRect(0, 0, SCR_W, SCR_H);
    if (mode === 'single') { sg.drawImage(pics[cur].canvas, 0, 0, SCR_W, SCR_H); stamp(cur, 0, 0, SCR_W, SCR_H, 2, minutes, t); }
    else {
      const cw = Math.floor(SCR_W / 3), ch = SCR_H / 2;
      for (let i = 0; i < N; i++) {
        const x = (i % 3) * cw + (i % 3), y = Math.floor(i / 3) * ch + Math.floor(i / 3);
        sg.drawImage(pics[i].canvas, x, y, cw - 1, ch - 1);
        stamp(i, x, y, cw - 1, ch - 1, 1, minutes, t);
        if (i === cur) { sg.strokeStyle = '#d8ffd8'; sg.lineWidth = 2; sg.strokeRect(x + 1, y + 1, cw - 3, ch - 3); }
      }
    }
    sg.fillStyle = 'rgba(0,0,0,0.16)'; for (let y = 0; y < SCR_H; y += 3) sg.fillRect(0, y, SCR_W, 1);
    tex.needsUpdate = true;
    stats.composeMs = performance.now() - t0;
  }
  function idle() {
    sg.fillStyle = '#04070a'; sg.fillRect(0, 0, SCR_W, SCR_H);
    sg.fillStyle = '#143c28'; sg.fillRect(SCR_W - 18, SCR_H - 14, 6, 4);
    tex.needsUpdate = true;
  }
  idle();
  props.monitor?.setScreen?.(tex);

  // ------------------------------------------------------------------ the monitor as a screen
  let wrap = null, btnEls = null, h = null;
  const STYLE_ID = 'odq-cam-style';
  if (!document.getElementById(STYLE_ID)) {
    const st = document.createElement('style'); st.id = STYLE_ID;
    st.textContent = `
      .odqcam .box { padding: 10px 14px 12px; width: min(680px, 96vw); background: #14120e; border-color: #4a4638; }
      .odqcam h1 { font-size: 15px; letter-spacing: 3px; margin: 0 0 6px; color: #8fd08a; text-align: left; }
      .odqcam .vw { position: relative; margin: 0 auto; width: min(100%, 640px, calc(56vh * 4 / 3)); aspect-ratio: 4 / 3; border: 6px solid #22201a; background: #000; box-sizing: border-box; }
      .odqcam canvas { display: block; width: 100%; height: 100%; image-rendering: pixelated; image-rendering: crisp-edges; image-rendering: pixelated; }
      .odqcam .ov { position: absolute; inset: 0; display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(2, 1fr); }
      .odqcam .ov i { cursor: pointer; }
      .odqcam .bar { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin-top: 10px; }
      .odqcam .bar button { font: inherit; font-size: 14px; padding: 9px 12px; min-width: 52px; min-height: 44px; background: #1f1d18; color: #cfe8c8; border: 2px solid #4a4638; cursor: pointer; touch-action: manipulation; }
      .odqcam .bar button.reg { color: #ffe3a0; border-color: #8a7a3a; }
      .odqcam .bar button:active { background: #3a3628; }
      .odqcam small { margin-top: 8px; color: #8a9a7e; font-size: 11px; }
      @media (max-width: 520px) { .odqcam .bar button { font-size: 13px; padding: 8px 8px; min-width: 44px; } .odqcam h1 { font-size: 13px; } }`;
    document.head.appendChild(st);
  }
  const hint = () => {
    const d = input?.device?.() || 'keyboard';
    if (d === 'gamepad') return mode === 'grid' ? 'Direcional: escolhe a câmera · A: ver · SELECT: registrar ocorrência · B: sair' : 'Direcional: troca a câmera · A: voltar à grade · SELECT: registrar ocorrência · B: sair';
    if (d === 'touch') return mode === 'grid' ? 'Toque numa imagem para ampliar.' : 'Toque nos botões para trocar de câmera.';
    return mode === 'grid' ? 'Setas ou 1 a 6: escolhe a câmera · ENTER: ver · Q: registrar ocorrência · ESC: sair' : 'Setas ou 1 a 6: troca a câmera · ENTER: grade · Q: registrar ocorrência · ESC: sair';
  };
  function build() {
    wrap = document.createElement('div'); wrap.className = 'screen odqcam';
    wrap.innerHTML = `<div class="box"><h1>MONITOR · <span data-t></span></h1>
      <div class="vw"><div class="ov" data-ov>${cams.map((_, i) => `<i data-cell data-a="cell" data-i="${i}"></i>`).join('')}</div></div>
      <div class="bar">
        <button data-cell data-a="prev" aria-label="Câmera anterior">&#9664;</button>
        <button data-cell data-a="next" aria-label="Próxima câmera">&#9654;</button>
        <button data-cell data-a="view" data-v></button>
        ${office ? '<button class="reg" data-cell data-a="reg">REGISTRAR OCORRÊNCIA</button>' : ''}
        <button data-cell data-a="close">SAIR</button>
      </div><small data-h></small></div>`;
    wrap.querySelector('.vw').insertBefore(scr, wrap.querySelector('[data-ov]'));
    btnEls = { title: wrap.querySelector('[data-t]'), view: wrap.querySelector('[data-v]'), ov: wrap.querySelector('[data-ov]'), hint: wrap.querySelector('[data-h]') };
  }
  function refresh() {
    if (!wrap) return;
    btnEls.title.textContent = mode === 'grid' ? 'GRADE' : `CAM ${cams[cur].n} · ${cams[cur].nome}`;
    btnEls.view.textContent = mode === 'grid' ? `VER CAM ${cams[cur].n}` : 'GRADE';
    btnEls.ov.style.display = mode === 'grid' ? 'grid' : 'none';
    btnEls.hint.textContent = hint();
    dirty = true;
  }
  const sfx = (n) => bus.emit('sfx', n, {});
  function select(i, single = true) { cur = (i + N) % N; if (single) mode = 'single'; sfx('ui_mover'); refresh(); }
  function press(p) {
    if (p.k === 'nav') {
      if (mode === 'grid') cur = (cur + (p.dx || 0) + 3 * (p.dy || 0) + N) % N; else cur = (cur + (p.dx || p.dy || 0) + N) % N;
      sfx('ui_mover'); refresh();
    } else if (p.k === 'tab') select(cur + (p.d || 1), mode === 'single');
    else if (p.k === 'digit') { if (p.d >= 1 && p.d <= N) select(p.d - 1); }
    else if (p.k === 'confirm') toggle();
    else if (p.k === 'sheet') register();
    else if (p.k === 'back' || p.k === 'esc') close();
  }
  function toggle() { mode = mode === 'grid' ? 'single' : 'grid'; sfx('ui_ok'); refresh(); }
  function click(cell) {
    const a = cell.dataset.a;
    if (a === 'cell') { cur = Number(cell.dataset.i); mode = 'single'; sfx('ui_ok'); refresh(); }
    else if (a === 'prev') select(cur - 1, mode === 'single');
    else if (a === 'next') select(cur + 1, mode === 'single');
    else if (a === 'view') toggle();
    else if (a === 'reg') register();
    else if (a === 'close') close();
  }
  function register() {
    if (!office?.openRegister) return;
    const camId = cams[cur].id;
    stopView();
    office.openRegister({ cam: camId, back: () => openMonitor() });
  }
  function stopView() {
    open = false; setChiado(false); idle();
    if (player) player.st.frozen = false;
  }
  function close() { stopView(); sfx('ui_voltar'); ui.closeModal(); }
  function openMonitor() {
    if (!N) return;
    if (!wrap) build();
    for (const hh of hist) hh.length = 0;
    open = true; dirty = true; frameN = 0; rr = 0;
    if (player) { player.st.frozen = true; faceMonitor(); }
    // `ui.menu` is the only way into the modal layer the ui offers: take its handlers over.
    h = ui.menu({ title: 'MONITOR', items: [{ label: () => '', act() {} }], onBack: close });
    ui.el.modal.replaceChildren(wrap);
    h.handle = press; h.click = click; h.redraw = refresh;
    refresh();
    for (let i = 0; i < N; i++) { pics[i].g.fillStyle = '#050805'; pics[i].g.fillRect(0, 0, CAM_W, CAM_H); shootLater(i); }   // the first picture of every camera, a frame or two from now
    compose();
  }
  function faceMonitor() {
    const a = world.anchor('monitorTela'); if (!a) return;
    const e = player.eyePos(), dx = a.pos.x - e.x, dz = a.pos.z - e.z;
    player.st.yaw = Math.atan2(-dx, -dz); player.st.pitch = Math.atan2(a.pos.y - e.y, Math.hypot(dx, dz));
  }
  function setChiado(on) {
    if (on === chiadoLoop) return;
    chiadoLoop = on;
    bus.emit('loop', 'camera-chiado', 'estatica_camera', on ? { gain: 0.3 } : { on: false });
  }

  if (interaction && world.interactable?.('monitor')) {
    interaction.register({
      id: 'monitor-cameras', reach: 2.6, priority: 1,
      aim: () => ({ box: world.aimBox('monitor', 0.18) }),
      enabled: () => !open,
      label: () => ({ text: 'Olhar as câmeras' }),
      tap: () => { bus.emit('sfx', 'tecla', {}); openMonitor(); },
    });
  }

  // ------------------------------------------------------------------ every step and every frame
  const SAMPLE = 0.1, TRAIL_MAX = 3000;
  function update(dt, t) {
    now += dt;
    if (player) {
      recAcc += dt;
      if (recAcc >= SAMPLE) {
        recAcc -= SAMPLE;
        const s = player.st;
        if (lastSamplePos) walked += Math.hypot(s.x - lastSamplePos.x, s.z - lastSamplePos.z);
        lastSamplePos = { x: s.x, z: s.z };
        trail.push({ t: now, x: s.x, z: s.z, yaw: s.yaw, d: walked, moving: s.speed > 0.2, crouch: s.crouch, area: world.areaAt(s.x, 1, s.z)?.id || 'externa' });
        if (trail.length > TRAIL_MAX) trail.shift();
      }
    }
    for (let k = faults.length - 1; k >= 0; k--) if (now >= faults[k].t1) faults.splice(k, 1);
    if (open) {
      const c = condition(cur);
      setChiado(c.down || c.chiado > 0.25);
      const d = input?.device?.() || ''; if (d !== lastDevice) { lastDevice = d; refresh(); }   // the hint names the buttons of the device in hand
    }
    void t;
  }
  function draw() {
    if (!open) return;
    if (!wrap.isConnected) { stopView(); return; }   // something else took the modal (the end of the night)
    const t0 = performance.now();
    frameN++;
    if (mode === 'single') { if (dirty || frameN % 3 === 0) shootLater(cur); }
    else if (dirty || frameN % 2 === 0) { shootLater(rr); rr = (rr + 1) % N; }
    dirty = false;
    compose();
    stats.lastDrawMs = performance.now() - t0;
  }

  bus.on('shift:open', (day) => { reset(); seed = progression?.st?.seed ?? day ?? 1; });   // the night's seed (visible in the pause menu) drives the failures
  function reset() {
    for (const g of [...ghosts]) g.remove();
    faults.length = 0; trail.length = 0; walked = 0; lastSamplePos = null; recAcc = 0; now = 0;
    for (const hh of hist) hh.length = 0;
    if (open) stopView();
    setChiado(false);
  }

  return {
    ids: CAMERA_IDS.filter((id) => world.has(id)), names: cams.map((c) => c.nome),
    update, draw, shoot, reset, ghost,
    /** Opens / closes the monitor (opening it is what interacting with the monitor does). */
    open: openMonitor, close,
    get isOpen() { return open; },
    /** True while the game must keep running behind the monitor (the world does not stop when you look at the cameras). */
    get watching() { return open; },
    get view() { return { open, mode, cam: cams[cur]?.id }; },
    /** Is the player looking at this camera right now? (single: its picture; grid: any, when `grid`) */
    watchingCam: (id, { grid = true } = {}) => { const i = idxOf(id); return open && valid(i) && (mode === 'single' ? cur === i : grid); },
    /** Failures: { kind: 'chiado' | 'atraso' | 'queda', secs, level (snow, 0..1), delay (seconds behind) } on a camera or 'all'. */
    fail(cam, { kind = 'chiado', secs = 4, level = 0.7, delay = 4 } = {}) {
      const i = idxOf(cam); if (cam !== 'all' && !valid(i)) return null;
      const f = { cam: i, kind, t1: now + secs, level, delay }; faults.push(f);
      return { end() { f.t1 = 0; } };
    },
    condition: (id) => { const i = idxOf(id); return valid(i) ? condition(i) : null; },
    /** The player's own recent path, and a stretch of it to play back as a 'voce' ghost: { area, min, max } seconds -> [{ t, x, z, yaw, d, moving, crouch }] or null. */
    trail,
    segment({ area = 'estoque', min = 5, max = 16, notAfter = Infinity } = {}) {
      let end = -1;
      for (let k = trail.length - 1; k >= 0; k--) if (trail[k].area === area && trail[k].t <= notAfter) { end = k; break; }
      if (end < 0) return null;
      let start = end; while (start > 0 && trail[start - 1].area === area && trail[end].t - trail[start - 1].t <= max) start--;
      if (trail[end].t - trail[start].t < min) return null;
      const t0 = trail[start].t;
      return trail.slice(start, end + 1).map((s) => ({ ...s, t: s.t - t0 }));
    },
    get now() { return now; },
    setSeed(s) { seed = s; },
    texture: tex, screen: scr, stats, CAMERAS,
    /** Forces the synchronous read (tests, filming): the picture is ready when `shoot` returns. */
    setSync(v) { sync = Boolean(v) || typeof render.renderer.readRenderTargetPixelsAsync !== 'function'; },
    /** The screen of the monitor for the filming mode: `kind` 'grid' | 'cam', pictures taken at `t`. */
    film(t, { kind = 'grid', cam = 'cam1', minutes = time.minutes } = {}) {
      const prevMode = mode, prevCur = cur;
      for (const c of cams) shoot(c.id, { t, minutes });
      mode = kind === 'grid' ? 'grid' : 'single'; cur = Math.max(0, idxOf(cam)); compose(minutes, t);
      mode = prevMode; cur = prevCur;
      return scr;
    },
  };
}
