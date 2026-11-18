// The cutscene "radio-curto": a short vertical video (9:16) of Jonas at the workshop bench using the new station radio: he takes the
// microphone off its hook, turns the selector, presses the talk bar and says the first recorded line, waits, and hears the answer.
//
// It is filmed from the game (film mode) and takes the stage of "radio-teste" (the workshop at night, the work lamp) but not its old
// radio: the new one (models/props/radio.js) sits where his hands reach it (RADIO_SEAT), and he is posed with the radio clips.
// Everything is a function of the time t (seconds): no real clock, no Math.random. The sound is made by tools/cutscenes/radio-curto.mjs
// (the recorded lines of the mix `assets/audio/cena-radio.mp3`, plus the game's own synthesised radio sounds, at the times of EVENTS).
//
// No secret is on the screen: the display shows only channel numbers and "TRANSMITINDO", no key is pressed and no colour is lit.
import { buildScene } from '../scenes/galeria.js';
import { buildPerson } from '../models/person.js';
import { buildRadio, radioReady } from '../models/props/radio.js';
import { RADIO_SEAT, JONAS_MARKS } from '../models/jonas.js';
import { FILM } from '../models/glb.js';
import LAYOUT from '../../data/scenes/galeria.json' with { type: 'json' };
import DATA from '../../data/cutscenes/radio-teste.json' with { type: 'json' };
import FACE from '../../data/cutscenes/radio-teste.face.json' with { type: 'json' };

if (FILM) await radioReady;

const P = Math.PI;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => { const u = b === a ? (x >= b ? 1 : 0) : clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };
const mix = (a, b, u) => a + (b - a) * u;
const mix3 = (a, b, u) => a.map((v, i) => v + (b[i] - v) * u);

// ---- the timeline (seconds of the video) ------------------------------------------------------------------------------------------
const L1 = DATA.lines.find((l) => l.id === '01'), L2 = DATA.lines.find((l) => l.id === '02');
const CAP = FACE.lines['01'], FACE_FPS = FACE.fps ?? 30;
export const TIMELINE = {
  sit: 0.9,                         // he reaches for the microphone (radio_pegar_mic; the hand takes it at `grab`)
  turns: [5.4, 7.6, 9.5],           // the selector gestures (radio_seletor, 1 s each; the click is at 0.48 s)
  turnDir: [1, 1, -1],
  turnTo: [23, 26, 21],             // the channel after each click (21 is where it starts and ends)
  talk0: 13.5,                      // the talk bar goes down (radio_falar)
  say1: 14.2,                       // line 01 starts (data time L1.start)
  talk1: 18.0,                      // he lets it go
  say2: 19.4,                       // line 02 (the operator) starts
  total: 25.6, black: 25.0,
};
const T = TIMELINE;
/** How long the selector takes to go from one channel to the next: a quarter of a second and a little more for every channel it passes. */
function spinOf(i) { return 0.25 + 0.07 * Math.abs(T.turnTo[i] - (T.turnTo[i - 1] ?? 21)); }
const say1End = T.say1 + L1.dur, say2End = T.say2 + L2.dur;
/** Data (recorded scene) time of the video time t, inside each line. */
const ts1 = (t) => t - T.say1 + L1.start, ts2 = (t) => t - T.say2 + L2.start;
const track = (name, ts) => { const a = DATA[name] ?? [], x = clamp(ts * DATA.fps, 0, a.length - 1), i = Math.floor(x), j = Math.min(a.length - 1, i + 1); return (a[i] ?? 0) + ((a[j] ?? 0) - (a[i] ?? 0)) * (x - i); };
const series = (a, x) => { const i = Math.floor(x), j = Math.min(a.length - 1, i + 1); return (a[i] ?? 0) + ((a[j] ?? 0) - (a[i] ?? 0)) * (x - i); };

/** The sound events the audio tool lays down (game sounds, by name) besides the recorded lines. */
export const EVENTS = [
  { t: 1.52, name: 'bancada', gain: 0.25 },                                   // the microphone leaves its hook
  ...T.turns.flatMap((g, i) => { const n = Math.abs(T.turnTo[i] - (T.turnTo[i - 1] ?? 21)), k0 = g + JONAS_MARKS.radio_seletor.click; return Array.from({ length: n }, (_, k) => ({ t: k0 + spinOf(i) * ((k + 1) / n), name: 'ui-move', gain: 0.9 })); }),   // a notch of the selector for every channel it passes
  { t: T.talk0 + 0.25, name: 'radio-tx', gain: 0.35 },                        // the talk bar
  { t: T.talk1 + 0.05, name: 'radio-solta', gain: 0.5 },
  { t: T.say2 - 0.12, name: 'bip', gain: 0.5 },                               // the beep before the voice
];
export const HISS = { from: 0, to: T.total - 0.6 };

// ---- the staging -------------------------------------------------------------------------------------------------------------------
const U = 1.78 / 1.79;
const BENCH_TOP = 0.93;
const R = [-4.02, BENCH_TOP, -4.42];                 // where the radio's origin is on the bench
const YAW = 0.0;                                     // he faces the north wall; the radio is in front of him
const c = Math.cos(YAW), s = Math.sin(YAW);
const JPOS = [R[0] - (RADIO_SEAT[0] * U * c + RADIO_SEAT[2] * U * s), BENCH_TOP - RADIO_SEAT[1] * U, R[2] - (-RADIO_SEAT[0] * U * s + RADIO_SEAT[2] * U * c)];
const HEAD = [JPOS[0] - 0.01, 1.31, JPOS[2] - 0.07];         // about where his face is
const DX = R[0] - (-4.02);                           // the staging was first laid out with the radio at x -4.02
const sx = (a) => [a[0] + DX, a[1], a[2]];
const LAMP = [-3.5 + DX, 2.5, -4.35];
const EXTRA = [
  { id: 'rc-banco', type: 'banco', pos: [JPOS[0], 0, JPOS[2] + 0.31], rot: [0, YAW, 0], scale: [1, (JPOS[1] + 0.455) / 0.46, 1], params: { comprimento: 0.7 } },
  // the work lamp hangs high enough that its shade (the brown disc) is out of the close-ups of the radio; its light (rc-key) is where the bulb would be
  { id: 'rc-lampada', type: 'lampada', pos: [LAMP[0], 3.1, LAMP[2]], rot: [0, 0, 0], params: { cor: '#ffc070', alcance: 5.5, queda: 0.45 } },
];
const OUT = new Set(['lamp-oficina', 'lamp-oficina-2']);
const DROP = new Set(['muro-oficina-a', 'andaime-obra', 'betoneira-obra', 'pilar-2a']);      // the railing with its sign and the scaffold: out of the way of the close-ups
const GONE = (e) => DROP.has(e.id);
const layout = () => ({
  ...LAYOUT,
  entities: [...LAYOUT.entities.filter((e) => !GONE(e)).map((e) => (OUT.has(e.id) ? { ...e, params: { ...e.params, acesa: false } } : e)), ...EXTRA.map((e) => ({ scale: [1, 1, 1], ...e }))],
});

// ---- what he does -----------------------------------------------------------------------------------------------------------------
/** How much of each part of the relief (a light smile that reaches the cheeks and the corners, the eyes opening a little). */
const RELIEF = { smile: 0.9, cheek: 0.8, eyes: 0.3, corner: 0.7, head: 0.42, lips: 0.12, ...(globalThis.__relief ?? {}) };
const CROSS = 0.25;
/** The pose segments: [{ t0, action, base?, dir?, n }]; the selector gestures lie over the waiting body. */
const SEGS = (() => {
  const out = [{ t0: 0, action: 'sentado' }, { t0: T.sit, action: 'radio_pegar_mic' }, { t0: T.sit + 1.6, action: 'radio_esperar' }];
  T.turns.forEach((g, i) => { out.push({ t0: g, action: 'radio_seletor', base: 'radio_esperar', dir: T.turnDir[i] }); out.push({ t0: g + 1.0, action: 'radio_esperar' }); });
  out.push({ t0: T.talk0, action: 'radio_falar' }, { t0: T.talk1, action: 'radio_esperar' });
  return out.sort((a, b) => a.t0 - b.t0);
})();
function poseAt(t) {
  let i = SEGS.length - 1; while (i > 0 && t < SEGS[i].t0) i--;
  const g = SEGS[i], at = t - g.t0;
  const spec = { action: g.action, at, t, ...(g.base ? { base: g.base, dir: g.dir } : {}) };
  if (i > 0 && at < CROSS) {
    const p = SEGS[i - 1];
    spec.prev = { action: p.action, at: g.t0 - p.t0 + at, t, ...(p.base ? { base: p.base, dir: p.dir } : {}) };
    spec.mix = smooth(0, CROSS, at);
  }
  return spec;
}
const FACEW = (t) => ({
  tenso: smooth(T.talk0 - 0.6, T.talk0 + 0.4, t) * (1 - smooth(T.say2 - 0.8, T.say2 - 0.1, t)),
  alivio: smooth(T.say2 + 0.5, T.say2 + 1.5, t),
});
const drift = (t, a, b, k) => (Math.sin(t * a) + Math.sin(t * b + 1.7) * 0.6 + Math.sin(t * k + 4.1) * 0.35) / 1.95;
/** The performed face of line 01 at video time t, or null. */
function captured(t) {
  const u = t - T.say1; if (!CAP || u < -0.1 || u > CAP.n / FACE_FPS + 0.1) return null;
  const dur = CAP.n / FACE_FPS, w = Math.min(smooth(-0.1, 0.12, u), 1 - smooth(dur - 0.12, dur + 0.1, u)), x = clamp(u * FACE_FPS, 0, CAP.n - 1);
  return { w, morphs: Object.fromEntries(Object.entries(CAP.morphs).map(([k, a]) => [k, series(a, x)])), gaze: { x: series(CAP.gaze.x, x), y: series(CAP.gaze.y, x) }, head: { yaw: series(CAP.head.yaw, x), pitch: series(CAP.head.pitch, x), roll: series(CAP.head.roll, x) } };
}
export function acting(t) {
  const fw = FACEW(t), face = fw.alivio > fw.tenso ? 'alivio' : 'tenso', faceWeight = Math.max(fw.alivio, fw.tenso);
  const speaking = t > T.say1 - 0.1 && t < say1End + 0.1;
  const cap = captured(t);
  const yaw = drift(t, 0.61, 0.23, 1.07) * 0.03 + (cap ? cap.head.yaw * cap.w : 0);
  // the relief: the head comes up, he breathes in (the chest rises), lets the air out through the lips (the shoulders drop)
  const inhale = smooth(T.say2 + 1.5, T.say2 + 2.3, t) * (1 - smooth(T.say2 + 2.3, T.say2 + 2.6, t));
  const exhale = smooth(T.say2 + 2.3, T.say2 + 3.5, t);
  const puff = smooth(T.say2 + 2.35, T.say2 + 2.65, t) * (1 - smooth(T.say2 + 2.95, T.say2 + 3.35, t));
  const pitch = drift(t, 0.47, 0.19, 0.83) * 0.02 + smooth(T.say2 + 0.5, T.say2 + 1.6, t) * RELIEF.head + inhale * 0.07 + (cap ? cap.head.pitch * cap.w : 0);
  const lean = -0.9 * inhale + 0.3 * exhale;
  return { face, faceWeight, relief: fw.alivio, puff, lean, speaking, mouth: speaking ? track('mouth', ts1(t)) : 0, narrow: speaking && !cap ? track('narrow', ts1(t)) : 0, cap, roll: cap ? cap.head.roll * cap.w : 0, yaw, pitch, breath: Math.sin(t * 1.75) };
}

// ---- the radio's state at t ----------------------------------------------------------------------------------------------------------
const CLICK = JONAS_MARKS.radio_seletor.click;
export function dialAt(t) {
  let ch = 21;
  T.turns.forEach((g, i) => { const k = g + CLICK; ch = mix(ch, T.turnTo[i], smooth(k, k + spinOf(i), t)); });
  return ch;
}
const tuning = (t) => T.turns.some((g, i) => t >= g + CLICK && t < g + CLICK + spinOf(i) + 0.1);
export function radioAt(t) {
  const talking = t >= T.talk0 + 0.2 && t < T.talk1 + 0.15, hear = t >= T.say2 && t < say2End + 0.1;
  const wait = t >= T.talk1 + 0.3 && t < T.say2;
  const ch = Math.round(dialAt(t));
  const text = talking ? `CANAL ${ch}\nTRANSMITINDO` : tuning(t) ? 'CANAL --\n' : `CANAL ${ch}\n`;
  return {
    dial: dialAt(t), text,
    tx: talking ? 1 : 0, ptt: t >= T.talk0 + 0.3 && t < T.talk1 ? 1 : 0,
    rx: hear ? 1 : wait ? (Math.floor(t * 4.5) % 2 ? 1 : 0.1) : 0.12,
    vu: talking ? 0.2 + 0.72 * track('mouth', ts1(t)) : hear ? 0.12 + 0.55 * track('radio', ts2(t)) : 0.05 + 0.03 * Math.sin(t * 3),
    hand: t >= T.sit + JONAS_MARKS.radio_pegar_mic.grab,
  };
}

// ---- the camera: each shot a function of u (0..1 in the shot) ---------------------------------------------------------------------------
const J = HEAD, RD = R;
const SHOT = {
  // the dark workshop and the work lamp, from his left front, a long way back: the whole of him, the radio and the lamp above
  abertura: (u) => ({ eye: mix3(sx([-6.5, 1.75, -3.7]), sx([-6.2, 1.7, -3.85]), u), at: sx([-4.2, 1.28, -4.15]), lens: 50 }),
  // the hand on the selector, from the left, over the panel
  seletor: (u) => ({ eye: mix3(sx([-4.62, 1.42, -3.62]), sx([-4.52, 1.38, -3.7]), u), at: sx([-4.1, 1.07, -4.33]), lens: 44 }),
  // the display, close: the channel
  visor: (u) => ({ eye: mix3(sx([-4.85, 1.3, -3.85]), sx([-4.75, 1.27, -3.95]), u), at: sx([-4.0, 1.1, -4.34]), lens: 36 }),
  // the microphone in his hand and the lights of the radio
  mao: (u) => ({ eye: mix3(sx([-3.05, 1.3, -3.7]), sx([-3.15, 1.28, -3.75]), u), at: sx([-3.82, 1.12, -4.22]), lens: 34 }),
  // the face, from his left front, the microphone on the far side
  rosto: (u) => ({ eye: mix3(sx([-4.75, 1.5, -4.5]), sx([-4.68, 1.47, -4.42]), u), at: [J[0] - 0.04, J[1] + 0.03, J[2] + 0.06], lens: 32 }),
  // the radio waiting (the red light off, the green blinking)
  espera: (u) => ({ eye: mix3(sx([-3.0, 1.34, -3.55]), sx([-3.1, 1.32, -3.6]), u), at: sx([-3.98, 1.12, -4.32]), lens: 44 }),
  // the face, relieved: a slow push in
  alivio: (u) => ({ eye: mix3(sx([-4.85, 1.5, -4.55]), sx([-4.68, 1.46, -4.4]), u), at: [J[0] - 0.05, J[1] + 0.03, J[2] + 0.075], lens: mix(36, 28, u) }),
  preto: () => ({ eye: sx([-4.7, 1.46, -4.6]), at: [J[0], J[1], J[2]], lens: 20 }),
};
export const CUTS = [
  { t0: 0, kind: 'abertura' }, { t0: 4.8, kind: 'seletor' }, { t0: 8.5, kind: 'visor' }, { t0: 12.2, kind: 'mao' }, { t0: 14.0, kind: 'rosto' },
  { t0: 17.9, kind: 'espera' }, { t0: 20.9, kind: 'alivio' }, { t0: T.black, kind: 'preto' },
].map((c, i, a) => ({ ...c, t1: a[i + 1]?.t0 ?? T.total }));
const cutAt = (t) => CUTS.find((c) => t >= c.t0 && t < c.t1) ?? CUTS[CUTS.length - 1];
function camera(t) { const c = cutAt(t); return SHOT[c.kind](clamp((t - c.t0) / (c.t1 - c.t0)), t); }
const views = { curto: [0, T.total, 'Vídeo curto vertical: Jonas pega o microfone, gira o seletor, fala e ouve a resposta no rádio novo'] };

// ---- the scene ----------------------------------------------------------------------------------------------------------------------
const BONES = ['spine_02', 'spine_03', 'neck_01', 'Head'];
function build(r) {
  const Th = r.THREE, sc = buildScene(r, { layout: layout() });
  const jonas = buildPerson(r, { role: 'jonas', seed: 1 });
  jonas.root.position.set(...JPOS); jonas.root.rotation.y = YAW;
  const radio = buildRadio(r, { tint: '#b4b8c4' });
  radio.root.position.set(...R); radio.root.rotation.y = YAW;
  sc.group.add(jonas.root, radio.root);

  const lamps = sc.place.lamps;
  const dial = { color: '#ffb040', range: 1.4 };
  lamps.set('rc-dial', { pos: [R[0] - 0.02, R[1] + 0.25, R[2] + 0.28], base: dial });
  lamps.set('rc-key', { pos: [LAMP[0], LAMP[1] - 0.9, LAMP[2] + 0.05], base: { color: '#c8843c', range: 3.6 } });
  lamps.set('rc-fill', { pos: [-5.6 + DX, 1.6, -3.6], base: { color: '#2c3a5c', range: 4 } });
  const apply = sc.lights.apply.bind(sc.lights);
  sc.lights.apply = () => { apply(); r.light({ ambient: '#2b3348', key: '#1c2233', keyDir: [-0.5, 1, 0.6], fog: '#05070a', fogNear: 6, fogFar: 24 }); };

  let bones = null, morphs = null, count = -1;
  const collect = () => {
    let n = 0; jonas.root.traverse(() => { n++; });
    if (n === count) return;
    count = n; headLampOff(); bones = Object.fromEntries(BONES.map((b) => [b, []])); morphs = [];
    jonas.root.traverse((o) => { if (o.isBone && bones[o.name]) bones[o.name].push(o); if (o.isMesh && o.morphTargetDictionary) morphs.push(o); });
  };
  const q = new Th.Quaternion(), pq = new Th.Quaternion(), ax = new Th.Vector3();
  const left = new Map(), base = new Map();
  const restore = () => { for (const [b, l] of left) if (b.quaternion.equals(l)) b.quaternion.copy(base.get(b)); left.clear(); };
  const turn = (name, axis, angle) => {
    if (!angle) return;
    for (const b of bones[name]) {
      if (!left.has(b)) base.set(b, b.quaternion.clone());
      b.parent.getWorldQuaternion(pq);
      q.setFromAxisAngle(ax.set(...axis), angle);
      b.quaternion.premultiply(pq.clone().invert().multiply(q).multiply(pq));
      left.set(b, b.quaternion.clone());
    }
  };
  const headLampOff = () => jonas.root.traverse((o) => {
    if (!o.isMesh || o.name !== 'lamp' || o.userData.rcOff) return;
    o.userData.rcOff = true; o.material = r.mat('#5c5a54', { map: o.material.userData?.engineSpec?.map ?? null, emissive: 0 });
  });

  // a black plane before the last camera: from the black time on the picture is black, whatever the light
  const E = sx([-4.7, 1.46, -4.6]), dir = new Th.Vector3(HEAD[0] - E[0], HEAD[1] - E[1], HEAD[2] - E[2]).normalize();
  const blackout = new Th.Mesh(new Th.PlaneGeometry(8, 8), r.mat('#000000', { emissive: 1, fogged: 0 }));
  blackout.material.depthTest = false; blackout.material.transparent = true; blackout.renderOrder = 999; blackout.frustumCulled = false; blackout.visible = false;
  blackout.position.set(E[0] + dir.x * 0.5, E[1] + dir.y * 0.5, E[2] + dir.z * 0.5); blackout.lookAt(E[0], E[1], E[2]);
  sc.group.add(blackout);
  const update = sc.update.bind(sc);
  sc.setDaylight(0);
  let shown = null;
  sc.update = (t, ctx) => {
    // from the black time on nothing but the black plane is drawn
    const dark = t >= T.black;
    for (const o of sc.group.children) o.visible = o === blackout ? dark : !dark;
    const a = acting(t), cap = a.cap;
    restore();
    const spec = poseAt(t);
    const face = { face: a.face, faceWeight: a.face === 'alivio' ? 1 : a.faceWeight * (cap ? 1 - cap.w : 1), mouth: a.speaking ? a.mouth : a.relief > 0.01 ? RELIEF.lips * a.relief + 0.2 * a.puff : null, gaze: cap ? { x: cap.gaze.x * cap.w, y: cap.gaze.y * cap.w - 0.1 * (1 - cap.w) } : { x: 0, y: -0.12 }, blink: cap && cap.w > 0.5 ? cap.morphs.blink : undefined, morphs: a.relief > 0.01 ? { smile: RELIEF.smile * a.relief * (1 - 0.5 * a.puff), cheek: RELIEF.cheek * a.relief, eye_wide: RELIEF.eyes * a.relief, brow_up: 0.3 * a.relief, mouthSmileLeft: RELIEF.corner * a.relief, mouthSmileRight: RELIEF.corner * a.relief } : undefined, lips: a.puff > 0.01 ? { funnel: 0.6 * a.puff } : undefined };
    jonas.setPose({ ...spec, ...face });
    collect();
    if (cap) for (const m of morphs) for (const [k, v] of Object.entries(cap.morphs)) { const i = m.morphTargetDictionary[k]; if (i !== undefined && k !== 'blink') m.morphTargetInfluences[i] = mix(m.morphTargetInfluences[i], v, cap.w); }
    if (a.narrow > 0) for (const m of morphs) { const i = m.morphTargetDictionary.mouth_narrow; if (i !== undefined) m.morphTargetInfluences[i] = Math.max(m.morphTargetInfluences[i], a.narrow * 0.75); }
    const y = YAW + a.yaw, hr = [Math.cos(y), 0, -Math.sin(y)];
    // the back: the chest rises and falls with the breath, and the relief's sigh (lean < 0 is backward)
    turn('spine_02', [Math.cos(YAW), 0, -Math.sin(YAW)], -(a.lean * 0.13)); turn('spine_03', [Math.cos(YAW), 0, -Math.sin(YAW)], -(a.lean * 0.11 + a.breath * 0.01));
    turn('neck_01', [0, 1, 0], a.yaw * 0.45); turn('Head', [0, 1, 0], a.yaw * 0.55);
    turn('neck_01', hr, a.pitch * 0.4); turn('Head', hr, a.pitch * 0.6);
    turn('Head', [Math.sin(y), 0, Math.cos(y)], a.roll);
    // the radio: everything at its target, the microphone in his hand from the moment he takes it (a lift of 0.3 s on the way)
    const st = radioAt(t);
    radio.setDial(st.dial, { now: true }); radio.setLed('tx', st.tx); radio.setLed('rx', st.rx); radio.setVu(st.vu); radio.setPtt(st.ptt);
    if (st.text !== shown) { shown = st.text; radio.setDisplay(st.text); }
    const grab = T.sit + JONAS_MARKS.radio_pegar_mic.grab, k = t - grab;
    radio.micTo('hook', null, { now: true });
    radio.settle();
    if (k >= 0) { if (k >= 0.3) radio.micTo('hand', jonas, { now: true }); else { radio.micTo('hand', jonas, { seconds: 0.3 }); radio.update(k); } }
    dial.color = '#' + new Th.Color('#ffb040').multiplyScalar(0.25 + 0.5 * st.rx).getHexString();
    update(t, ctx);
  };
  sc.jonas = jonas; sc.radio = radio;
  return sc;
}

export default {
  name: 'radio-curto', scene: 'radio-curto',
  build, views, anchors: { radio: 'O rádio novo sobre a bancada', rosto: 'O rosto de Jonas, sentado' }, camera,
  shot: (kind, u = 0.5) => SHOT[kind](u), shotKinds: Object.keys(SHOT),
  total: T.total, cuts: CUTS, acting,
  // the sound is laid by tools/cutscenes/radio-curto.mjs from TIMELINE and EVENTS
  sfx: [],
};
