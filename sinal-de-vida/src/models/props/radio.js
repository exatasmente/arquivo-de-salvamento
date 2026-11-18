// The station radio as a piece with parts that move (assets/props/radio.glb, made by tools/models/radio.py; the places of the parts
// are tools/models/radio_layout.py, and the numbers below repeat it). No rule of the game is here: the game says what the radio
// shows and this draws it.
//
//   const radio = buildRadio(r, { tint });   // { root, ready, parts, ... }; root stands on y = 0, front toward +Z, in metres
//   radio.setDial(21)                        // the selector turns to the channel (a click of 30 degrees a channel) and the pointer
//                                            //   runs along the scale (channels 1 to 99); setDial(21, { now: true }) jumps
//   radio.setDisplay('CANAL 21\nSENHA:')     // the liquid crystal display: two rows of 16 characters, dot matrix
//   radio.drawDisplay((ctx, w, h) => { … })  // or draw it yourself on its canvas (512 x 160)
//   radio.setLed('tx' | 'rx', 0..1)          // the two lights
//   radio.setVu(0..1)                        // the meter's needle (it follows with a little weight)
//   radio.pressKey(i)                        // a key sinks and comes back; pressKey(i, true | false) holds or lets go
//   radio.pressColor(i)                      // the same for a colour button; setColorLit(i, bool) lights it
//   radio.setSeq([0, 3, null, '#ffffff'])    // the row of eight lights: an index of COLORS, a colour, or null (off), from the left
//   radio.setPtt(0..1)                       // the microphone's talk bar
//   radio.micTo('hand', jonas)               // the microphone leaves the hook for his hand (the socket `grip_r` of models/jonas.js),
//   radio.micTo('hook')                      //   or goes back; the coiled cord follows. Call it at the clip's mark (JONAS_MARKS)
//   radio.update(dt)                         // every frame: eases what is moving, follows the hand, bends the cord
//   radio.settle()                           // everything at its target at once (a film frame, a cut)
//   radio.anchor(name, v)                    // the place of a part in the world (for a camera, a hint)
//
// Parts (radio.parts[name], each a node whose origin is its pivot; x along the panel to the right, y up the panel, z out of it):
//   dial (turns about z), needle (slides along x), display, led_tx, led_rx, vu_needle (turns about z), key_0..key_11 (1 2 3 / 4 5 6 /
//   7 8 9 / * 0 #; sink along -z), color_0..color_4 (blue, green, violet, cyan, pink; sink along -z), seq_0..seq_7, speaker, mic_hook,
//   mic (children mic_ptt, mic_cord_end), mic_cord. A light has a child `<name>_on`, the lens lit, which this module fades in.
import * as THREE from 'three';
import { GLTFLoader } from '../../../vendor/three/GLTFLoader.js';

export const COLORS = ['#4a7bd8', '#4fb36a', '#8c5ad0', '#3ec4d0', '#e07aa8'];      // blue, green, violet, cyan, pink
export const KEY_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
export const KEY_LETTERS = ['', 'ABC', 'DEF', 'GHI', 'JKL', 'MNO', 'PQRS', 'TUV', 'WXYZ', '', '', ''];
/** The size of the piece (metres) and what its parts do. */
export const RADIO = {
  size: [0.48, 0.205, 0.24],
  channels: [1, 99], dialStep: Math.PI / 6, needleTravel: 0.057,
  keyTravel: 0.004, colorTravel: 0.004, pttTravel: 0.003, vuSwing: (42 * Math.PI) / 180,
  display: { cols: 16, rows: 2, width: 512, height: 160 },
};
const NIGHT = '#8c92a6';              // the other props of the base are tinted so (place.js)
const LED_HEX = { tx: '#ff3a24', rx: '#4dff7a' };
const PRESS = { down: 0.05, hold: 0.07, up: 0.11 };

const url = new URL('../../../assets/props/radio.glb', import.meta.url).href;
let loading = null;
/** Starts loading the file (once). The film mode should wait for it before the first frame. */
export function loadRadio() {
  loading ??= new GLTFLoader().loadAsync(url).catch((err) => { console.info('radio: the file did not load, a plain box stays', err?.message ?? err); return null; });
  return loading;
}
export const radioReady = loadRadio();

// ---- the display's dot matrix: 5 x 7, columns, bit 0 at the top -------------------------------------------------------------------
const F = {
  0: [62, 81, 73, 69, 62], 1: [0, 66, 127, 64, 0], 2: [66, 97, 81, 73, 70], 3: [33, 65, 69, 75, 49], 4: [24, 20, 18, 127, 16], 5: [39, 69, 69, 69, 57],
  6: [60, 74, 73, 73, 48], 7: [1, 113, 9, 5, 3], 8: [54, 73, 73, 73, 54], 9: [6, 73, 73, 41, 30], A: [126, 17, 17, 17, 126], B: [127, 73, 73, 73, 54],
  C: [62, 65, 65, 65, 34], D: [127, 65, 65, 34, 28], E: [127, 73, 73, 73, 65], F: [127, 9, 9, 9, 1], G: [62, 65, 73, 73, 122], H: [127, 8, 8, 8, 127],
  I: [0, 65, 127, 65, 0], J: [32, 64, 65, 63, 1], K: [127, 8, 20, 34, 65], L: [127, 64, 64, 64, 64], M: [127, 2, 12, 2, 127], N: [127, 4, 8, 16, 127],
  O: [62, 65, 65, 65, 62], P: [127, 9, 9, 9, 6], Q: [62, 65, 81, 33, 94], R: [127, 9, 25, 41, 70], S: [70, 73, 73, 73, 49], T: [1, 1, 127, 1, 1],
  U: [63, 64, 64, 64, 63], V: [31, 32, 64, 32, 31], W: [63, 64, 56, 64, 63], X: [99, 20, 8, 20, 99], Y: [7, 8, 112, 8, 7], Z: [97, 81, 73, 69, 67],
  '*': [20, 8, 62, 8, 20], '#': [20, 127, 20, 127, 20], ':': [0, 54, 54, 0, 0], '-': [8, 8, 8, 8, 8], _: [64, 64, 64, 64, 64], '.': [0, 96, 96, 0, 0],
  '/': [32, 16, 8, 4, 2], '>': [0, 65, 34, 20, 8], '<': [8, 20, 34, 65, 0], '?': [2, 1, 81, 9, 6], '!': [0, 0, 95, 0, 0], '+': [8, 8, 62, 8, 8],
  '=': [20, 20, 20, 20, 20], ',': [0, 80, 48, 0, 0], '█': [127, 127, 127, 127, 127],
};
const plain = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

function drawText(ctx, w, h, text, lit) {
  const { cols, rows } = RADIO.display, pitch = 5, cw = 6 * pitch, ch = 9 * pitch;
  const x0 = (w - cols * cw + pitch) / 2, y0 = (h - rows * ch + 2 * pitch) / 2;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  if (lit) { g.addColorStop(0, '#a9b98a'); g.addColorStop(1, '#93a577'); } else { g.addColorStop(0, '#6f7a60'); g.addColorStop(1, '#626d55'); }
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  const lines = plain(text).split('\n').slice(0, rows);
  for (let row = 0; row < rows; row++) for (let c = 0; c < cols; c++) {
    const glyph = F[(lines[row] ?? '')[c]] ?? null;
    for (let i = 0; i < 5; i++) for (let j = 0; j < 7; j++) {
      const on = glyph ? (glyph[i] >> j) & 1 : 0;
      ctx.fillStyle = on ? 'rgba(22, 30, 18, 0.92)' : 'rgba(22, 30, 18, 0.055)';
      ctx.fillRect(x0 + c * cw + i * pitch, y0 + row * ch + j * pitch, pitch - 1, pitch - 1);
    }
  }
}

const ease = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };

export function buildRadio(r, opts = {}) {
  const T = r.THREE ?? THREE, root = new T.Group(), parts = {};
  const tint = opts.tint ?? NIGHT;
  const stand = new T.Mesh(new T.BoxGeometry(...RADIO.size), r.mat('#3a4046'));
  stand.position.y = RADIO.size[1] / 2; root.add(stand);
  const api = { root, parts, ready: false };

  // ---- what the game asked for (targets) and where things are (current)
  const st = {
    dial: { v: 21, to: 21 }, vu: { v: 0, to: 0 }, led: { tx: { v: 0, to: 0 }, rx: { v: 0, to: 0 } }, ptt: { v: 0, to: 0 },
    keys: Array.from({ length: 12 }, () => ({ v: 0, held: false, pulse: -1 })), colors: Array.from({ length: 5 }, () => ({ v: 0, held: false, pulse: -1, lit: 0, litTo: 0 })),
    seq: Array.from({ length: 8 }, () => null),
    mic: { mode: 'hook', who: null, k: 1, dur: 0.3, from: new T.Matrix4() },
  };
  let rest = null, display = null, cord = null, lit = opts.lit ?? true, text = opts.text ?? '';
  const mats = { on: new Map() };
  const m4 = new T.Matrix4(), m4b = new T.Matrix4(), v3 = new T.Vector3(), v3b = new T.Vector3(), q4 = new T.Quaternion(), q4b = new T.Quaternion(), s3 = new T.Vector3();

  function onMat(hex) {            // a lit lens: the painted lens, shown as it is whatever the light of the scene
    let m = mats.on.get(hex);
    if (!m) { m = r.mat(hex, { map: mats.map, emissive: 1, fogged: 0.5, transparent: true, depthWrite: false }); mats.on.set(hex, m); }
    return m;
  }
  const ownOn = (hex) => r.mat(hex, { map: mats.map, emissive: 1, fogged: 0.5, transparent: true, depthWrite: false });

  function attach(gltf) {
    const scene = gltf.scene.clone(true);
    let base = null;
    scene.traverse((o) => { parts[o.name] = o; if (o.isMesh && o.name === 'body') base = o.material; });
    const map = base?.map ?? null, normalMap = base?.normalMap ?? null;
    for (const t of [map, normalMap]) if (t) { t.colorSpace = T.NoColorSpace; t.flipY = false; t.anisotropy = 4; t.needsUpdate = true; }
    mats.map = map;
    mats.base = r.mat(tint, { map, emissive: opts.emissive ?? 0.1, ...(normalMap ? { normalMap, normalScale: 1 } : {}) });
    // the display: its own canvas
    const cv = document.createElement('canvas'); cv.width = RADIO.display.width; cv.height = RADIO.display.height;
    const tex = new T.CanvasTexture(cv); tex.flipY = false; tex.colorSpace = T.NoColorSpace; tex.anisotropy = 4;
    display = { cv, ctx: cv.getContext('2d'), tex, mat: r.mat('#ffffff', { map: tex, emissive: 0.75, fogged: 0.4 }) };
    scene.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      if (o.name === 'display') o.material = display.mat;
      else if (o.name.endsWith('_on')) { o.visible = false; o.renderOrder = 2; o.material = ownOn(o.name.startsWith('led_tx') ? LED_HEX.tx : o.name.startsWith('led_rx') ? LED_HEX.rx : '#ffffff'); o.material.opacity = 0; }
      else o.material = mats.base;
    });
    // how every moving part sits at rest, and its own axes in the root's space
    rest = {};
    scene.updateMatrixWorld(true);
    for (const [name, o] of Object.entries(parts)) {
      rest[name] = { pos: o.position.clone(), quat: o.quaternion.clone(), x: new T.Vector3(1, 0, 0).applyQuaternion(o.quaternion), z: new T.Vector3(0, 0, 1).applyQuaternion(o.quaternion), world: o.matrixWorld.clone() };
    }
    // the cord: its vertices at rest (y runs along it), to bend between the socket and the microphone
    const c = parts.mic_cord;
    if (c) {
      c.geometry = c.geometry.clone();
      const p = c.geometry.attributes.position, a = Float32Array.from(p.array);
      let len = 0; for (let i = 1; i < a.length; i += 3) len = Math.max(len, a[i]);
      cord = { mesh: c, restArr: a, len, a: rest.mic_cord.pos.clone(), last: new T.Vector3(1e9, 0, 0) };
      c.position.set(0, 0, 0); c.quaternion.identity();     // from here on its vertices are in the root's space
    }
    root.remove(stand); root.add(scene);
    api.ready = true;
    redraw(); api.settle();
  }

  function redraw(fn) {
    if (!display) return;
    if (fn) fn(display.ctx, display.cv.width, display.cv.height); else drawText(display.ctx, display.cv.width, display.cv.height, text, lit);
    display.tex.needsUpdate = true;
  }

  // ---- the microphone and its cord
  function micTarget(out) {
    const m = st.mic;
    if (m.mode === 'hand' && m.who) {
      const sock = typeof m.who.socket === 'function' ? m.who.socket('grip_r') : m.who;
      if (sock) {
        sock.updateWorldMatrix(true, false); root.updateWorldMatrix(true, false);
        m4.copy(root.matrixWorld).invert().multiply(sock.matrixWorld).decompose(v3, q4, s3);
        return out.compose(v3, q4, s3.set(1, 1, 1));
      }
    }
    return out.compose(rest.mic.pos, rest.mic.quat, s3.set(1, 1, 1));
  }
  function placeMic() {
    const mic = parts.mic, m = st.mic;
    micTarget(m4b);
    if (m.k < 1) {
      const u = ease(m.k);
      m.from.decompose(v3, q4, s3); m4b.decompose(v3b, q4b, s3);
      v3.lerp(v3b, u); v3.y += Math.sin(u * Math.PI) * 0.012 * (m.mode === 'hook' ? 1 : 0.4);    // it lifts a little on the way, clear of the hook
      q4.slerp(q4b, u);
      mic.position.copy(v3); mic.quaternion.copy(q4);
    } else m4b.decompose(mic.position, mic.quaternion, s3);
    mic.updateMatrix();
  }
  const cb = { a: new T.Vector3(), b: new T.Vector3(), c: new T.Vector3(), p: new T.Vector3(), t: new T.Vector3(), n: new T.Vector3(), bn: new T.Vector3(), ref: new T.Vector3() };
  function bendCord() {
    if (!cord || !parts.mic_cord_end) return;
    const { a, b, c, p, t, n, bn, ref } = cb;
    a.copy(cord.a);
    b.copy(parts.mic_cord_end.position).applyMatrix4(parts.mic.matrix);
    if (b.distanceToSquared(cord.last) < 1e-10) return;
    cord.last.copy(b);
    const d = a.distanceTo(b);
    // a coiled cord hangs in a soft belly between its two ends, a little out of the panel; it never goes under the table
    c.copy(a).add(b).multiplyScalar(0.5);
    c.y -= 0.03 + 0.1 * d; c.z += 0.02 + 0.06 * d;
    c.y = Math.max(c.y, (4 * 0.012 - a.y - b.y) / 2);
    const pos = cord.mesh.geometry.attributes.position, src = cord.restArr;
    for (let i = 0; i < src.length; i += 3) {
      const u = Math.max(0, Math.min(1, src[i + 1] / cord.len)), w = 1 - u;
      p.set(w * w * a.x + 2 * w * u * c.x + u * u * b.x, w * w * a.y + 2 * w * u * c.y + u * u * b.y, w * w * a.z + 2 * w * u * c.z + u * u * b.z);
      t.set(2 * w * (c.x - a.x) + 2 * u * (b.x - c.x), 2 * w * (c.y - a.y) + 2 * u * (b.y - c.y), 2 * w * (c.z - a.z) + 2 * u * (b.z - c.z)).normalize();
      ref.set(0, 0, 1); if (Math.abs(t.z) > 0.92) ref.set(1, 0, 0);
      n.crossVectors(ref, t).normalize(); bn.crossVectors(t, n);
      pos.setXYZ(i / 3, p.x + n.x * src[i] + bn.x * src[i + 2], p.y + n.y * src[i] + bn.y * src[i + 2], p.z + n.z * src[i] + bn.z * src[i + 2]);
    }
    pos.needsUpdate = true;
    cord.mesh.geometry.computeVertexNormals();
    cord.mesh.geometry.computeBoundingSphere();
  }

  // ---- everything from the state
  const [CH0, CH1] = RADIO.channels;
  function apply() {
    if (!rest) return;
    const ch = st.dial.v;
    parts.dial.quaternion.copy(rest.dial.quat).multiply(q4.setFromAxisAngle(v3.set(0, 0, 1), -(ch - 1) * RADIO.dialStep));
    const du = ((Math.max(CH0, Math.min(CH1, ch)) - 50) / 49) * RADIO.needleTravel;
    parts.needle.position.copy(rest.needle.pos).addScaledVector(rest.needle.x, du);
    parts.vu_needle.quaternion.copy(rest.vu_needle.quat).multiply(q4.setFromAxisAngle(v3.set(0, 0, 1), RADIO.vuSwing * (1 - 2 * st.vu.v)));
    for (const k of ['tx', 'rx']) { const o = parts[`led_${k}_on`], v = st.led[k].v; o.visible = v > 0.01; o.material.opacity = v; }
    st.keys.forEach((k, i) => { const n = `key_${i}`; parts[n].position.copy(rest[n].pos).addScaledVector(rest[n].z, -RADIO.keyTravel * k.v); });
    st.colors.forEach((k, i) => {
      const n = `color_${i}`, o = parts[`${n}_on`];
      parts[n].position.copy(rest[n].pos).addScaledVector(rest[n].z, -RADIO.colorTravel * k.v);
      o.visible = k.lit > 0.01; o.material.opacity = k.lit;
    });
    st.seq.forEach((hex, i) => { const o = parts[`seq_${i}_on`]; o.visible = Boolean(hex); if (hex) { o.material = onMat(hex); o.material.opacity = 1; } });
    if (parts.mic_ptt) parts.mic_ptt.position.copy(rest.mic_ptt.pos).addScaledVector(rest.mic_ptt.z, -RADIO.pttTravel * st.ptt.v);
    placeMic(); bendCord();
  }

  const toward = (o, dt, rate) => { o.v += (o.to - o.v) * Math.min(1, dt * rate); if (Math.abs(o.to - o.v) < 1e-4) o.v = o.to; };
  function pressStep(k, dt) {
    if (k.pulse >= 0) {
      k.pulse += dt;
      const { down, hold, up } = PRESS, t = k.pulse;
      k.v = t < down ? ease(t / down) : t < down + hold ? 1 : t < down + hold + up ? 1 - ease((t - down - hold) / up) : 0;
      if (t >= down + hold + up) k.pulse = -1;
    } else k.v += ((k.held ? 1 : 0) - k.v) * Math.min(1, dt * 30);
  }
  api.update = (dt = 0) => {
    // the selector goes a click at a time: about a tenth of a second a channel, never more than half a second in all
    const d = st.dial.to - st.dial.v, sp = Math.max(10, Math.abs(d) * 2.2) * dt;
    st.dial.v = Math.abs(d) <= sp ? st.dial.to : st.dial.v + Math.sign(d) * sp;
    st.vu.v += (st.vu.to - st.vu.v) * Math.min(1, dt * 16);
    toward(st.led.tx, dt, 26); toward(st.led.rx, dt, 26); toward(st.ptt, dt, 30);
    for (const k of st.keys) pressStep(k, dt);
    for (const k of st.colors) { pressStep(k, dt); k.lit += (k.litTo - k.lit) * Math.min(1, dt * 22); }
    if (st.mic.k < 1) st.mic.k = Math.min(1, st.mic.k + dt / st.mic.dur);
    apply();
  };
  api.settle = () => {
    st.dial.v = st.dial.to; st.vu.v = st.vu.to; st.led.tx.v = st.led.tx.to; st.led.rx.v = st.led.rx.to; st.ptt.v = st.ptt.to; st.mic.k = 1;
    for (const k of st.keys) { k.pulse = -1; k.v = k.held ? 1 : 0; }
    for (const k of st.colors) { k.pulse = -1; k.v = k.held ? 1 : 0; k.lit = k.litTo; }
    apply();
  };

  // ---- the calls
  const c01 = (x) => Math.max(0, Math.min(1, Number(x) || 0));
  api.setDial = (ch, o = {}) => { st.dial.to = Math.max(CH0, Math.min(CH1, Number(ch) || CH0)); if (o.now) { st.dial.v = st.dial.to; apply(); } };
  /** Where the selector is now (a channel, with its fraction while it turns). */
  Object.defineProperty(api, 'dial', { get: () => st.dial.v });
  api.setDisplay = (s, o = {}) => { text = s ?? ''; if (o.lit !== undefined) lit = Boolean(o.lit); redraw(); };
  api.drawDisplay = (fn) => redraw(fn);
  api.setLed = (which, v) => { const l = st.led[which]; if (l) l.to = c01(v === true ? 1 : v); };
  api.setVu = (v) => { st.vu.to = c01(v); };
  const press = (list) => (i, held) => { const k = list[i]; if (!k) return; if (held === undefined) { k.pulse = 0; k.held = false; } else { k.held = Boolean(held); k.pulse = -1; } };
  api.pressKey = press(st.keys);
  api.pressColor = press(st.colors);
  api.setColorLit = (i, on) => { const k = st.colors[i]; if (k) k.litTo = on ? 1 : 0; };
  api.setSeq = (list = []) => { for (let i = 0; i < 8; i++) { const v = list[i]; st.seq[i] = v === null || v === undefined || v === false ? null : typeof v === 'number' ? COLORS[v] ?? null : String(v); } if (rest) apply(); };
  api.setPtt = (v) => { st.ptt.to = c01(v === true ? 1 : v); };
  api.micTo = (where, who = null, o = {}) => {
    const mode = where === 'hand' && who ? 'hand' : 'hook';
    if (rest) st.mic.from.copy(parts.mic.matrix);
    st.mic.mode = mode; st.mic.who = mode === 'hand' ? who : null;
    st.mic.dur = o.seconds ?? (mode === 'hand' ? 0.3 : 0.22); st.mic.k = o.now || !rest ? 1 : 0;
    if (rest) apply();
  };
  Object.defineProperty(api, 'mic', { get: () => st.mic.mode });
  api.anchor = (name, out = new T.Vector3()) => { const o = parts[name]; if (!o) return out.set(0, 0, 0); root.updateWorldMatrix(true, true); return out.setFromMatrixPosition(o.matrixWorld); };

  loadRadio().then((g) => { if (g) attach(g); });
  return api;
}
