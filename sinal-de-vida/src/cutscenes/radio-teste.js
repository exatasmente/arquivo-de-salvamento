// The cutscene "radio-teste": Jonas seated at the workshop bench of the unfinished station, at night, talking on the radio with a
// voice he does not know. It exists to look at his face: the expressions coming in and out, the blink, where he looks, the mouth
// following the recorded speech.
//
// Nothing of its timing is written here. The lines (who speaks, when, for how long, the expression asked for) and the mouth of every
// frame come from data/cutscenes/radio-teste.json, which tools/cutscenes/radio-teste.py makes from the recorded scene: with a new
// recording, run the script again and the cuts, the acting and the views follow. What is fixed here is the staging: where he sits,
// where the camera goes for each kind of shot, and what he does on the lines the scene is built around (BEATS, by the id of the line).
//
// Everything is a function of the time t (seconds): no real clock, no Math.random. The model is the game's Jonas (models/person.js),
// posed by setPose({ action: 'sentado', face, faceWeight, mouth, t }); the head and the back are turned here, on top of the pose
// (the model has no bones for the eyes: he looks with the head).
import { buildScene } from '../scenes/galeria.js';
import { buildPerson } from '../models/person.js';
import LAYOUT from '../../data/scenes/galeria.json' with { type: 'json' };
import DATA from '../../data/cutscenes/radio-teste.json' with { type: 'json' };
// The performed face of the lines, by id (tools/capture/to-cutscene.mjs writes it: per frame, the morphs, the gaze and the turn of the head).
// A line that has it is acted with the captured face instead of the loudness of the voice; a line that does not stays as it was.
import FACE from '../../data/cutscenes/radio-teste.face.json' with { type: 'json' };

const P = Math.PI;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => { const u = b === a ? (x >= b ? 1 : 0) : clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };
const mix = (a, b, u) => a + (b - a) * u;
const mix3 = (a, b, u) => a.map((v, i) => v + (b[i] - v) * u);

// ---- the staging --------------------------------------------------------------------------------------------------------------
/** Where things are, in the gallery's metres (the bench of the workshop is at x -5, against the north wall). */
const SET = {
  jonas: { pos: [-4.75, -3.74], yaw: -0.3, y: 0.14 },   // seated on a stool a little taller than the benches (the bench of the workshop is a high one), turned a little to the radio at his right
  seat: [-5.05, -3.43],                          // under him: the sitting pose puts his hips behind and to the side of where he stands
  head: [-4.72, 1.36, -3.94],                    // about where his face is, for the cameras and for where he looks
  radio: [-4.02, 0.92, -4.42],
  lamp: [-3.5, 2.5, -4.35], lampDrop: 0.7,       // the work lamp hanging over the bench, in front of him and to his right
  shaft: [-4.6, 2.58, -4.1],                     // the ventilation shaft in the vault, over the bench, with its grate
};
/** What this cutscene adds to the gallery (copies of its own kinds of things), and the lamps of the workshop it puts out. */
const EXTRA = [
  { id: 'rt-banco', type: 'banco', pos: [SET.seat[0], 0, SET.seat[1]], rot: [0, SET.jonas.yaw, 0], scale: [1, 1.3, 1], params: { comprimento: 0.7 } },
  { id: 'rt-radio', type: 'radio', pos: SET.radio, rot: [0, -0.55, 0], params: { ligado: true } },
  { id: 'rt-lampada', type: 'lampada', pos: SET.lamp, rot: [0, 0, 0], params: { cor: '#ffc070', alcance: 5.5, queda: SET.lampDrop } },
  { id: 'rt-grade', type: 'parede', pos: [SET.shaft[0], SET.shaft[1], SET.shaft[2] - 0.5], rot: [P / 2, 0, 0], params: { comprimento: 1, altura: 1, espessura: 0.1, textura: 'grade', picto: 'nenhum' } },
];
const OUT = new Set(['lamp-oficina', 'lamp-oficina-2']);
const layout = () => ({
  ...LAYOUT,
  entities: [
    ...LAYOUT.entities.map((e) => (OUT.has(e.id) ? { ...e, params: { ...e.params, acesa: false } } : e)),
    ...EXTRA.map((e) => ({ scale: [1, 1, 1], ...e })),
  ],
});

// ---- the lines, from the data ---------------------------------------------------------------------------------------------------
const LINES = DATA.lines.map((l, i) => ({ ...l, i, end: l.start + l.dur }));
const TOTAL = DATA.total;
const FACE_FPS = FACE.fps ?? 30;
for (const l of LINES) l.capture = FACE.lines?.[l.id] ?? null;
const LAST = LINES[LINES.length - 1];
const byId = (id) => LINES.find((l) => l.id === id) ?? null;
/** What he does on the lines the scene is built around, by the id of the line in the data (a line that is not there is skipped). */
const BEATS = {
  lean: byId('05'),        // he leans to the radio
  down: byId('07'),        // his voice fails and he looks down
  freeze: byId('08'),      // he freezes and looks up, at the shaft
};
const FREEZE_AT = BEATS.freeze ? BEATS.freeze.start + BEATS.freeze.dur * 0.42 : Infinity;   // the voice has said "now": the rest is the dog
/** A per-frame track of the data, read at time t (between two frames, the mix of them). */
const track = (name) => (t) => {
  const a = DATA[name] ?? [], x = clamp(t * DATA.fps, 0, a.length - 1), i = Math.floor(x), j = Math.min(a.length - 1, i + 1);
  return (a[i] ?? 0) + ((a[j] ?? 0) - (a[i] ?? 0)) * (x - i);
};
/** The captured face of line `l` at time t (a mix of the two frames around it), or null outside the line. Fades in and out at the edges. */
const CAP_FADE = 0.12;
const series = (a, x) => { const i = Math.floor(x), j = Math.min(a.length - 1, i + 1); return (a[i] ?? 0) + ((a[j] ?? 0) - (a[i] ?? 0)) * (x - i); };
function capturedAt(t) {
  for (const l of LINES) {
    const c = l.capture; if (!c || l.who !== 'jonas') continue;
    const dur = c.n / FACE_FPS, u = t - l.start;
    if (u < 0 || u > dur) continue;
    const w = Math.min(smooth(0, CAP_FADE, u), 1 - smooth(dur - CAP_FADE, dur, u)), x = clamp(u * FACE_FPS, 0, c.n - 1);
    return {
      w, morphs: Object.fromEntries(Object.entries(c.morphs).map(([k, a]) => [k, series(a, x)])),
      gaze: { x: series(c.gaze.x, x), y: series(c.gaze.y, x) }, head: { yaw: series(c.head.yaw, x), pitch: series(c.head.pitch, x), roll: series(c.head.roll, x) },
    };
  }
  return null;
}
/** A face given live, in place of the recorded one (the capture tool's director view): { w: 0..1, morphs, gaze: { x, y }, head: { yaw, pitch, roll } }, or null. */
let LIVE = null;
export const setLive = (frame) => { LIVE = frame; };
const mouthAt = track('mouth'), narrowAt = track('narrow'), radioAt = track('radio');

// ---- the acting -------------------------------------------------------------------------------------------------------------------
/** How much of the expression of line `l` is on his face at time t: it comes in as he starts to speak (or a moment after the other voice starts) and goes out after the line. */
function faceWeightOf(l, t) {
  const a = l.who === 'jonas' ? l.start - 0.25 : l === BEATS.freeze ? FREEZE_AT - 0.1 : l.start + 0.35;
  const b = l.end + 0.3;
  const into = smooth(a, a + (l === BEATS.freeze ? 0.22 : 0.4), t);
  // the last expression stays to the end; the fright settles a little after its start (he holds his breath, the mouth half shut)
  if (l === LAST) return into * (1 - 0.3 * smooth(a + 0.5, a + 1.5, t));
  return into * (1 - smooth(b, b + 0.7, t));
}
/** Slow, small, never repeating soon: the sum of three sines. */
const drift = (t, a, b, c) => (Math.sin(t * a) + Math.sin(t * b + 1.7) * 0.6 + Math.sin(t * c + 4.1) * 0.35) / 1.95;
const aim = (target) => {
  // the turn (to his left is positive) and the tilt (up is positive) of the head that looks at `target`, from the body's front
  const d = [target[0] - SET.head[0], target[1] - SET.head[1], target[2] - SET.head[2]];
  const yawWorld = Math.atan2(-d[0], -d[2]);
  return { yaw: yawWorld - SET.jonas.yaw, pitch: Math.atan2(d[1], Math.hypot(d[0], d[2])) };
};
/** The pose leaves his head hanging (the tired stance on top of the sitting clip): this much brings the face up to talk. */
const CHIN = 0.2;
const LOOKS = { radio: aim(SET.radio), shaft: aim([SET.shaft[0], SET.shaft[1], SET.shaft[2]]) };

/** Everything Jonas does at time t. */
export function acting(t) {
  // the expression: the line whose expression is strongest now
  let face = null, faceWeight = 0;
  for (const l of LINES) { const w = faceWeightOf(l, t); if (w > faceWeight) { faceWeight = w; face = l.face; } }
  // before the voice says "now" he hears the last line as he heard the others: tense
  if (BEATS.freeze && t > BEATS.freeze.start + 0.3 && t < FREEZE_AT) { const w = smooth(BEATS.freeze.start + 0.3, BEATS.freeze.start + 0.7, t) * (1 - smooth(FREEZE_AT - 0.2, FREEZE_AT, t)); if (w > faceWeight) { face = 'tenso'; faceWeight = w; } }
  const still = 1 - smooth(FREEZE_AT - 0.15, FREEZE_AT + 0.2, t);            // 1 = alive, 0 = frozen
  const speaking = LINES.some((l) => l.who === 'jonas' && t > l.start - 0.1 && t < l.end + 0.1);
  // the head: mostly on the radio; small moves all the time, a little more while he speaks (the head nods with the loud syllables)
  const m = mouthAt(t);
  let yaw = LOOKS.radio.yaw * 0.7 + still * (drift(t, 0.61, 0.23, 1.07) * 0.05 + (speaking ? drift(t, 2.3, 1.1, 3.7) * 0.035 : 0));
  let pitch = CHIN + LOOKS.radio.pitch * 0.3 + still * (drift(t, 0.47, 0.19, 0.83) * 0.03 - m * 0.05);
  let lean = 0, turn = 0;
  // between the first lines he looks away from the radio for a moment, waiting (and comes back as the voice answers)
  const first = LINES[0], second = LINES[1];
  if (first && second) { const w = smooth(first.end + 0.15, first.end + 0.5, t) * (1 - smooth(second.start + 0.05, second.start + 0.35, t)); yaw += w * 0.28; pitch += w * 0.12; }
  if (BEATS.lean) { const l = BEATS.lean, next = LINES[l.i + 1]; lean = smooth(l.start - 0.2, l.start + 1.1, t) * (1 - smooth((next ?? l).end, (next ?? l).end + 1.2, t)); }
  if (BEATS.down) {
    const l = BEATS.down, w = smooth(l.start + l.dur * 0.25, l.end, t) * (1 - smooth(FREEZE_AT - 0.6, FREEZE_AT, t));
    yaw = mix(yaw, LOOKS.radio.yaw * 0.35, w); pitch = mix(pitch, -0.3, w);
  }
  if (BEATS.freeze) {
    // a start (the head comes up at once), a beat without moving, then the eyes go up to the shaft
    const up = smooth(FREEZE_AT + 0.45, FREEZE_AT + 1.0, t), jolt = smooth(FREEZE_AT - 0.1, FREEZE_AT + 0.08, t);
    yaw = mix(mix(yaw, LOOKS.radio.yaw * 0.6, jolt), LOOKS.shaft.yaw * 0.6, up); pitch = mix(mix(pitch, CHIN + 0.05, jolt), CHIN + Math.min(0.24, LOOKS.shaft.pitch * 0.6), up);
    lean -= jolt * 0.35; turn = up * 0.12;
  }
  // the performed face: it takes the place of the loudness-driven mouth, and its head turn is added to the scene's
  const cap = LIVE ?? capturedAt(t);
  if (cap) { yaw += cap.head.yaw * cap.w; pitch += cap.head.pitch * cap.w; }
  const breath = Math.sin(t * 1.75) * (0.5 + 0.5 * still);                    // breathing goes on, shallower when he freezes
  return { face, faceWeight, mouth: speaking ? m : 0, narrow: speaking && !cap ? narrowAt(t) : 0, speaking, cap, roll: cap ? cap.head.roll * cap.w : 0, yaw, pitch, lean, turn, breath, still };
}

// ---- the camera: cuts, each a kind of shot, laid out over the lines ------------------------------------------------------------------
const H = SET.head, R = SET.radio;
/** The kinds of shot: (u 0..1 inside the shot, t) -> { eye, at, lens (vertical field of view, degrees) }. */
const SHOT = {
  medio: (u) => ({ eye: mix3([-2.9, 1.5, -2.2], [-3.1, 1.46, -2.45], u), at: [-4.25, 1.12, -4.05], lens: 38 }),
  close: (u) => ({ eye: mix3([-4.0, 1.28, -4.78], [-4.06, 1.28, -4.76], u), at: [H[0], H[1] + 0.045, H[2]], lens: 22 }),
  perfil: (u) => ({ eye: mix3([-3.0, 1.34, -3.2], [-3.08, 1.33, -3.28], u), at: [H[0] + 0.38, H[1] - 0.13, H[2] - 0.3], lens: 36 }),
  ombro: (u) => ({ eye: mix3([-4.56, 1.72, -2.75], [-4.52, 1.7, -2.82], u), at: [R[0] - 0.1, R[1] + 0.1, R[2]], lens: 30 }),
  reacao: (u) => ({ eye: mix3([-4.55, 1.3, -4.84], [-4.52, 1.3, -4.82], u), at: [H[0], H[1] + 0.045, H[2]], lens: 21 }),
  forte: (u) => ({ eye: mix3([-4.3, 1.36, -4.84], [-4.32, 1.37, -4.8], u), at: [H[0], H[1] + 0.05, H[2]], lens: 14 }),
  poco: (u) => ({ eye: mix3([-5.6, 0.9, -3.0], [-5.5, 1.0, -3.1], u), at: [SET.shaft[0], SET.shaft[1] + 0.1, SET.shaft[2]], lens: 36 }),
};
const SHOT_DESC = {
  medio: 'plano médio de abertura: Jonas sentado à bancada, o rádio e a lâmpada de obra',
  close: 'close do rosto na fala dele',
  perfil: 'de lado, ele inclinado para o rádio',
  ombro: 'sobre o ombro, para o rádio, na fala da voz',
  reacao: 'close da reação dele, ouvindo',
  forte: 'close forte da reação final',
  poco: 'o poço de ventilação, escuro, com a grade',
};
/** The cuts, from the lines: [{ t0, t1, kind, line }]. A cut that would leave a shot shorter than MIN is dropped. */
function layCuts() {
  const MIN = 0.7, marks = [{ t: 0, kind: 'medio', line: null }];
  const add = (t, kind, line) => marks.push({ t, kind, line: line?.id ?? null });
  for (const l of LINES) {
    if (l.who === 'jonas') {
      add(l.start - 0.35, 'close', l);
      if (l === BEATS.lean) { add(l.start + l.dur * 0.38, 'perfil', l); add(l.start + l.dur * 0.72, 'close', l); }
    } else if (l === BEATS.freeze) { add(l.start - 0.15, 'ombro', l); add(FREEZE_AT - 0.75, 'forte', l); }
    else { add(l.start - 0.15, 'ombro', l); add(l.start + Math.max(0.75, l.dur * 0.36), 'reacao', l); }
  }
  add(Math.max(LAST.end + 0.6, TOTAL - 2.4), 'poco', null);
  marks.sort((a, b) => a.t - b.t);
  const kept = [];
  for (const m of marks) { if (m.t >= TOTAL - 0.3) continue; if (kept.length && m.t - kept[kept.length - 1].t < MIN) continue; kept.push(m); }
  return kept.map((m, i) => ({ t0: +Math.max(0, m.t).toFixed(3), t1: +(kept[i + 1]?.t ?? TOTAL).toFixed(3), kind: m.kind, line: m.line }));
}
export const CUTS = layCuts();
const cutAt = (t) => CUTS.find((c) => t >= c.t0 && t < c.t1) ?? (t < 0 ? CUTS[0] : CUTS[CUTS.length - 1]);
function camera(t) {
  const c = cutAt(t), u = clamp((t - c.t0) / (c.t1 - c.t0));
  return SHOT[c.kind](u, t);
}

// the views: the whole scene, and its three moments a video may want alone (their times come from the cuts)
const cutOf = (kind) => CUTS.find((c) => c.kind === kind) ?? CUTS[CUTS.length - 1];
const VIEW_TIMES = { cena: [0, TOTAL], abertura: [0, CUTS[0].t1], reacao: [cutOf('forte').t0, cutOf('forte').t1], poco: [cutOf('poco').t0, TOTAL] };
const VIEW_DESC = {
  cena: 'A cena inteira: Jonas sentado à bancada da oficina, de noite, fala pelo rádio com uma voz que não conhece (o áudio é o da cena gravada)',
  abertura: 'O plano médio de abertura: Jonas à bancada, o rádio, a lâmpada de obra, antes da primeira fala',
  reacao: 'O close forte da reação final: ele congela e olha para o alto',
  poco: 'O poço de ventilação escuro, com a grade, visto de baixo',
};
const views = Object.fromEntries(Object.entries(VIEW_TIMES).map(([k, [a, b]]) => [k, [+a.toFixed(3), +b.toFixed(3), VIEW_DESC[k]]]));

// ---- the scene ----------------------------------------------------------------------------------------------------------------------
const BONES = ['spine_02', 'spine_03', 'neck_01', 'Head'];

function build(r) {
  const T = r.THREE, sc = buildScene(r, { layout: layout() });
  const jonas = buildPerson(r, { role: 'jonas', seed: 1 });
  jonas.root.position.set(SET.jonas.pos[0], SET.jonas.y, SET.jonas.pos[1]); jonas.root.rotation.y = SET.jonas.yaw;
  sc.group.add(jonas.root);

  // the shaft over the workshop: a square duct of concrete coming down from the vault, dark inside (the grate is the entity rt-grade)
  const duct = new T.Mesh(new T.CylinderGeometry(0.72, 0.72, 1.3, 4, 1, true), r.mat('#26282c', { side: T.DoubleSide }));
  duct.rotation.y = P / 4; duct.position.set(SET.shaft[0], SET.shaft[1] + 0.63, SET.shaft[2]);
  const dark = new T.Mesh(new T.PlaneGeometry(1.02, 1.02), r.mat('#04060a', { emissive: 1 }));
  dark.rotation.x = P / 2; dark.position.set(SET.shaft[0], SET.shaft[1] + 1.2, SET.shaft[2]);
  sc.group.add(duct, dark);

  // the light of the scene: the work lamp is the warm key (an entity, with the lamps of the gallery); around it, the cold of the night
  const lamps = sc.place.lamps;
  const skyLight = { color: '#2a4274', range: 3.2 }, dial = { color: '#000000', range: 1.6 }, fill = { color: '#2c3a5c', range: 4 };
  lamps.set('rt-poco', { pos: [SET.shaft[0], SET.shaft[1] + 0.25, SET.shaft[2]], base: skyLight });
  lamps.set('rt-dial', { pos: [R[0] - 0.12, R[1] + 0.2, R[2] + 0.3], base: dial });
  lamps.set('rt-key', { pos: [SET.lamp[0], SET.lamp[1] - SET.lampDrop - 0.2, SET.lamp[2] + 0.05], base: { color: '#c8843c', range: 3.6 } });   // the bulb, close: what makes it the key
  lamps.set('rt-fill', { pos: [-5.9, 1.5, -4.3], base: fill });           // what the pale wall gives back on the side the lamp does not reach
  const apply = sc.lights.apply.bind(sc.lights);
  sc.lights.apply = () => { apply(); r.light({ ambient: '#2b3348', key: '#1c2233', keyDir: [-0.5, 1, 0.6], fog: '#05070a', fogNear: 6, fogFar: 24 }); };

  // the bones this cutscene turns on top of the pose (of every copy of the model: the close one and the far one)
  let bones = null, morphs = null, count = -1;
  const collect = () => {
    let n = 0; jonas.root.traverse(() => { n++; });
    if (n === count) return;
    count = n; headLampOff(); bones = Object.fromEntries(BONES.map((b) => [b, []])); morphs = [];
    jonas.root.traverse((o) => { if (o.isBone && bones[o.name]) bones[o.name].push(o); if (o.isMesh && o.morphTargetDictionary) morphs.push(o); });
  };
  const q = new T.Quaternion(), pq = new T.Quaternion(), ax = new T.Vector3();
  // The pose only writes a bone when its own value changes (a held clip leaves it alone), so what this cutscene adds to a bone is
  // taken back before the next pose: `left` is what it left in each bone, `base` what the pose had put there.
  const left = new Map(), base = new Map();
  const restore = () => { for (const [b, l] of left) if (b.quaternion.equals(l)) b.quaternion.copy(base.get(b)); left.clear(); };
  /** Turns a bone by `angle` about an axis given in the world, on top of what the pose left in it. */
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

  // the lamp on his head is off in this scene (the model paints it lit): its piece is drawn dull, here only
  const headLampOff = () => jonas.root.traverse((o) => {
    if (!o.isMesh || o.name !== 'lamp' || o.userData.rtOff) return;
    o.userData.rtOff = true; o.material = r.mat('#5c5a54', { map: o.material.userData?.engineSpec?.map ?? null, emissive: 0 });
  });

  const update = sc.update.bind(sc);
  sc.setDaylight(0);
  sc.update = (t, ctx) => {
    const a = acting(t);
    restore();
    const cap = a.cap;
    // with a performed face the expression comes from it: no preset, no mouth from the volume; the eyes and the blink are its too
    jonas.setPose(cap ? { action: 'sentado', face: a.face, faceWeight: a.faceWeight * (1 - cap.w), mouth: null, gaze: { x: cap.gaze.x * cap.w, y: cap.gaze.y * cap.w }, blink: cap.w > 0.5 ? cap.morphs.blink : undefined, t }
      : { action: 'sentado', face: a.face, faceWeight: a.faceWeight, mouth: a.speaking ? a.mouth : null, t });
    collect();
    if (cap) for (const m of morphs) for (const [k, v] of Object.entries(cap.morphs)) { const i = m.morphTargetDictionary[k]; if (i !== undefined && k !== 'blink') m.morphTargetInfluences[i] = mix(m.morphTargetInfluences[i], v, cap.w); }
    // the lips come together on the hissed and stopped consonants (the model takes the opening; this goes on top of it)
    if (a.narrow > 0) for (const m of morphs) { const i = m.morphTargetDictionary.mouth_narrow; if (i === undefined) continue; m.morphTargetInfluences[i] = Math.max(m.morphTargetInfluences[i], a.narrow * 0.75); }
    const y = SET.jonas.yaw, right = [Math.cos(y), 0, -Math.sin(y)], up = [0, 1, 0];
    // the back: breathing, the lean to the radio (and away from it in the start), a turn of the chest
    turn('spine_02', right, -(a.lean * 0.13)); turn('spine_02', up, a.turn * 0.4);
    turn('spine_03', right, -(a.lean * 0.11 + a.breath * 0.012)); turn('spine_03', up, a.turn * 0.6);
    // the head: half by the neck, half by the head (the lean of the back is given back to it, so the face stays up)
    const pitch = a.pitch + a.lean * 0.16;
    turn('neck_01', up, a.yaw * 0.45); turn('Head', up, a.yaw * 0.55);
    const hy = y + a.yaw, hr = [Math.cos(hy), 0, -Math.sin(hy)];
    turn('neck_01', hr, pitch * 0.4); turn('Head', hr, pitch * 0.6);
    turn('Head', [Math.sin(hy), 0, Math.cos(hy)], a.roll);
    // the radio's dial breathes with the other voice
    const v = radioAt(t), k = 0.25 + 0.75 * v;
    dial.color = '#' + new T.Color('#ffb040').multiplyScalar(k).getHexString();
    update(t, ctx);
  };
  sc.jonas = jonas;
  return sc;
}

export default {
  name: 'radio-teste', scene: 'radio-teste',
  build,
  views,
  anchors: { radio: 'O rádio sobre a bancada', rosto: 'O rosto de Jonas, sentado', poco: 'O poço de ventilação, no alto' },
  camera,
  /** One kind of shot by name, at u (0..1) of its length: { eye, at, lens }. */
  shot: (kind, u = 0.5) => SHOT[kind](u), shotKinds: Object.keys(SHOT),
  /** The recorded scene this cutscene is acted to (a path inside the game), its length, its lines and its cuts. */
  audio: DATA.audio, total: TOTAL, lines: LINES, cuts: CUTS, shotDesc: SHOT_DESC, acting,
  // The sound is the recorded scene (voices, the radio's filter, the hiss), not the game's synthesised kit: the video takes it as a file.
  sfx: [],
};
