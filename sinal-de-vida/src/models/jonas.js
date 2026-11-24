// Jonas, the pilot of the new people: the CC0 base body (Quaternius) reshaped into a tired man of 44, dressed in modelled
// clothes, with the texture painted from the concept art (the light and the shadows are painted in it), hair made of locks,
// and the CC0 animation libraries (the same 65-bone skeleton).
// Same contract as the other people (see person.js): { root, update(dt, state), setPose(args), height, look, tris, ready, lod }.
//
// The skeleton is the Unreal-style one (pelvis, spine_01..03, neck_01, Head, clavicle_l, upperarm_l, lowerarm_l, hand_l,
// finger bones, thigh_l, calf_l, foot_l, ball_l). The clips are named as the game asks for them (see CLIPS in
// tools/models/jonas.py; 'mancar' and 'esconder' are CMU mocap retargeted). The face has morph targets on the body (the eyebrows are
// painted on the skin and move with it): blink, eye_wide, brow_up, brow_down, brow_worry, smile, frown, jaw_open, cheek,
// mouth_narrow, squint, look_down, look_up, and the lips on their own for speech: lips_close, lips_funnel, upper_lip_up,
// lower_lip_down, lips_press, mouth_left, mouth_right. The lips' edge turns into the mouth (tools/models/jonas_mouth.py). The
// mouth's inside (teeth one by one, gums, tongue) is its own piece; the lower half follows the jaw by the same jaw_open.
//
// The eyes are two globes under real lids (tools/models/jonas_face.py): each globe hangs on a bone of its own (eye_l, eye_r,
// children of the head), the lids are geometry that slides over it, the lashes (`lashes`, with the small highlights) and the
// shadow the lids lay on the globe (`lidshade`, drawn as dark glass) ride the lids' edges by the same morph targets. His tired
// look is the mesh itself: at rest the upper lid covers the top of the iris.
//
// Beyond the common contract, update and setPose take:
//   `mouth` (0..1): the opening of the mouth as the speech gives it; it takes the place of the automatic syllables of 'falando'.
//     The expression gives the base and the speech adds to it and takes from it: at 0 the lips shut, even over an expression that
//     holds the jaw open; at 1 the jaw is at 0.75 (it reads in a close shot) and the upper teeth show;
//   `viseme` ('a' | 'e' | 'i' | 'o' | 'u' | 'm' | 'f', or { a: 0.6, o: 0.4 }): the shape of the mouth for a sound, times `mouth` (1 if
//     not given): 'm' is also b and p (the lips shut), 'f' is also v (the lower lip to the upper teeth);
//   `lips` ({ close, funnel, press, upper, lower, left, right }, each 0..1): the lips' own targets, added to whatever else;
//   `morphs` ({ name: weight }): any morph target by its name, set last; the capture's names are taken too (jawOpen, mouthClose,
//     mouthFunnel, mouthPucker, mouthUpperUpLeft/Right, mouthLowerDownLeft/Right, mouthPressLeft/Right, mouthLeft, mouthRight,
//     mouthSmileLeft/Right, mouthFrownLeft/Right);
//   `faceAt` (seconds since the expression came on; update() counts it): the fright ('susto') opens the mouth wide for a moment and
//     then lets it settle to a small opening instead of holding it agape;
//   `faceWeight` (0..1): how much of the expression `face` is on;
//   `blink` (0..1): a fixed blink, in place of the automatic one;
//   `gaze` ({ x, y }, radians): where the eyes look, apart from the head. x > 0 is to his left, y > 0 is up; kept within
//     GAZE (x within ±0.55, y from -0.32 to 0.3). The lids follow: the upper one comes down as he looks down and lifts as he looks
//     up. update() eases toward it, setPose() sets it at once; without it the eyes look straight ahead. (`look` stays what it is
//     for every person, the turn of the head as a number; given as { x, y } it is taken as `gaze`.) setFace(args) takes the same;
//   `lamp` ('on' | 'off', or true | false): the head lamp. It is off until told otherwise and keeps the last state given. Off, its
//     glass is dark and dull; on, the lit glass (`lamp_glow`) shows, and the scene's light does not dim it;
//   the actions 'sentado' (seated, the sitting clip held, the hands on the table) and 'sentado_radio' (seated, the upper body of
//     the radio clip: the hand comes up beside the face), and 'esquivar' (once: the dive and the roll of the dodge of scene 4; the way
//     it covers over the floor is ROLL in systems/emenda.js);
//   `twist` (radians, + to his left): his body turned over his feet, the hips taking their share and the rest going up the spine to the head (a look over the shoulder that
//     leaves his knees and feet where they are).
// The feet (2026-11-19: they slid; three repairs were turned down): each way of going is a clip made for the speed it is played at
// (tools/models/jonas_gait.py), stepped by the ground the root covers: `phase` is 2 pi times the share of a loop played, and a foot that is
// down stays where it came down because the clip takes it back at the speed he goes, not because a leg is bent after it. The gait is
// chosen by the speed (GAIT: the slow walk, the brisk walk, the run). Beyond the common contract, update and setPose take:
//   `from` (metres since he set off from standing): for as far as the start clip goes, it plays in place of the loop;
//   `stop` ({ t, T, phase }: seconds since he began to stop, seconds the root takes to stand, the phase he was at): the stop's clip;
//   `turn` ({ a, k }: a turn on the spot of `a` radians, + to his left, at the share `k` of its time; systems/turn.js has the curve the
//     root must turn by): the clips of the turn;
//   `brisk`, `run` (0..1): the gait, as api.gaitAt(speed) gives it;
//   `ground`: what is under his feet where it is not the flat floor the root stands on: a function (x, z) -> height in the world, or a
//     profile along the way he faces, [[metres ahead of the root, height from there on], ...] (the treads of a stair). Each foot goes onto
//     its own ground and the hips to the lower foot (plant.js terrain): standing on the edge of a step, on a slope, on a stair;
//   `stairs` ({ dir: 1 up | -1 down, k: the treads covered (a flight begins at a whole number; a landing counts as so many treads too),
//     run: metres a tread is deep, pace: 'run' | 'walk' (by the speed if not given: over 1 m/s he runs), per: treads a step takes (1) }):
//     the stair's loop, its phase the treads covered, so that a foot comes down on the middle of every tread, running as walking.
// api.move() says the state he is in and the change under way (models/moves.js has the states and the rules); api.moves.log the last changes.
// update() works `from`, `brisk`, `run` and the phase out by itself from how the root moves; `stop` and `turn` it is told. api.walkStep
// steps a walking state by the ground covered, for the film (cutscenes/stage.js), which shows the same as the game.
//
// At the station radio (tools/models/jonas_radio.py; the radio is models/props/radio.js). He sits with the radio RADIO_SEAT in front
// of him: radio.root at jonas.root's place plus RADIO_SEAT (in his own axes: x to his right, z to his back; times his scale,
// look.h / 1.79), turned as he is. With the radio on a bench 0.93 m high his root is 0.144 m off the floor (a stool 0.60 m high).
//   whole body, seated:
//     'radio_pegar_mic'   (once) the right hand takes the microphone off its hook and brings it low in front of him;
//     'radio_esperar'     (loops) he waits with the microphone in his hand, the forearm on the bench, looking at the display;
//     'radio_falar'       (loops) the microphone under and to the right of his mouth, the talk bar squeezed; the mouth shows;
//     'radio_pendurar'    (once) he hangs it back and his hand comes to rest on the bench.
//   the left hand, over the body of `base` ('radio_esperar' by default, or 'radio_falar'), which goes on at its own time `t`:
//     'radio_seletor'     (once) it turns the selector a click; `dir: -1` turns it the other way;
//     'radio_tecla'       (once) the index presses the key `key` (0..11, as radio.js numbers them);
//     'radio_cor'         (once) the index presses the colour button `color` (0..4).
//   A once clip is read at `at` (seconds since it began); update() counts it. Going from one of these to another (and from or to
//   'sentado') is a cross-fade of a quarter of a second: update() does it; with setPose() give `prev: { action, at, t, … }` and
//   `mix` (0..1, how much of the new one). update() also slides the finger from one key or colour to the next, and plays the
//   same gesture again from its start when the number `n` it is given changes (the next key, the next click).
// From the chest up, over whatever the legs do (standing; or with `seated: true`, sitting):
//     'caderno_pegar'     (once) the left hand takes the notebook from the pouch at his belt and holds it open in front of him;
//     'caderno_folhear'   (once) the right hand turns a page;
//     'bolso_abrir'       (once) the right hand goes into the jacket's chest pocket, and both come up open with what was in it.
// JONAS_MARKS has, for each, its length and the moments the game hangs things on (the microphone changes hands at `grab` and
// `release`; the key is down at `press`); api.duration(name) is the length of any clip once the file has arrived.
// The outline: a dark line round his silhouette, as in a painted adventure game. It is a shell made here, not in the file: every
// skinned piece is drawn a second time, inside out (only its back faces), in one flat dark brown, with its vertices pushed out
// along their normals in the vertex shader (after the morph targets and the skin). Its width is a share of each vertex's distance
// to the camera, between a floor and a ceiling, so that it stays about as wide on the screen; within 20 cm of the camera it is not
// drawn (the camera at his eyes, in the first-person shots, would see the inside of the head's shell). The skin's vertices carry how much of it
// they take (`_outline` in the file: none inside the mouth and none round the eyes); the hair takes a thinner one; the eyes, the
// lashes, the mouth's inside and the lit lamp take none. Both the close and the far model have it.
//   api.setOutline({ on, width, min, max, color }): turns it on or off and sets it (width: metres of line per metre of distance;
//   min, max: metres). JONAS_OUTLINE holds what a new Jonas starts with.
// api.socket(name) is a bone of the model as it is drawn now: 'grip_r' and 'grip_l' are the sockets of the palms (x across the palm,
// y toward the thumb, z out of the palm: the microphone and the notebook are made to sit on them as they are), 'Head' the head.
import * as THREE from 'three';
import { loadModel, modelIfReady, FILM, cloneScene, filterClip, visibleTris } from './glb.js';
import { Layers, clamp01 } from './anim.js';
import { plantFeet, turnBoneWorld } from './plant.js';
import { createMoves } from './moves.js';

const FILE = 'jonas.glb', FILE_LOD = 'jonas_lod.glb';
const loading = loadModel(FILE), loadingLod = loadModel(FILE_LOD);
export const jonasReady = Promise.all([loading, loadingLod]);
if (FILM) await jonasReady;

const UPPER = /^(spine_02|spine_03|neck_01|Head|clavicle|upperarm|lowerarm|hand|index|middle|ring|pinky|thumb)/;
const isUpper = (n) => UPPER.test(n);
// His ways of going over the floor (tools/models/jonas_gait.py makes them from the library's clips, each for a speed of the game): the
// loops ('walk' the stick part of the way, 'brisk' the stick all the way, 'run', 'crouch_walk') all begin where the left foot comes down
// and carry him a known stride, so they are stepped by the ground covered and mixed only with their steps in time; the starts, the stops
// (one for each quarter of the cycle he may be at) and the turns on the spot (45 to 180 degrees, to either side) are clips of their own,
// read by the ground covered, the time of the stop and the share of the turn. Each clip carries its way in the `root` bone (root motion),
// which is read here and not played.
const TURN_DEG = [45, 90, 135, 180];
const TURN_CLIPS = TURN_DEG.flatMap((d) => [`turn_l${d}`, `turn_r${d}`]);
const WAY_CLIPS = ['walk', 'crouch'].flatMap((k) => [`${k}_start`, ...[0, 1, 2, 3].map((j) => `${k}_stop_${j}`)]).concat(TURN_CLIPS, TURN_CLIPS.map((n) => `crouch_${n}`));
// On stairs (2026-11-23): a loop for going up and one for going down, running and walking (a foot on every tread, the run by its cadence), stepped by the
// treads he covers (`stairs`), each foot put on its own tread by the ground under it (`ground`; plant.js terrain).
const STAIR_CLIPS = ['stairs_up_run', 'stairs_up_walk', 'stairs_down_run', 'stairs_down_walk'];
const LOCO = ['idle', 'walk', 'brisk', 'jog', 'run', 'crouch_idle', 'crouch_walk', ...WAY_CLIPS, ...STAIR_CLIPS];
const GAITS = ['walk', 'brisk', 'jog', 'run', 'crouch_walk'];
const OVERLAY = ['usar', 'radio'];
// Metres the body goes in one cycle of each gait, before the file arrives (then they are read from the clips' root motion).
const STRIDE = { walk: 1.17, brisk: 1.4, jog: 2.35, run: 4.5, crouch_walk: 1.4, mancar: 0.85 };
// The gait by the speed (m/s): the slow walk up to GAIT.brisk[0] and the brisk one from GAIT.brisk[1] (two walks with their steps in time:
// between the two they are mixed); the run from GAIT.run[1] (between a walk and the run nobody stays: the mix lasts the change).
// Between the brisk walk and the run there is the jog (the run with half its stride, made for 3.2 m/s: the chase's run indoors): from
// GAIT.jog[1] to GAIT.run[0] it is the jog alone.
export const GAIT = { brisk: [1.15, 1.45], jog: [1.95, 2.45], run: [3.75, 4.2] };
// The feet stay where they were put down (plant.js) while he stands, stops and turns: how they count as down, how far a held one may be
// from where the clip wants it before it steps, how long a step takes and how high it lifts. In a steady gait nothing holds them.
const FEET = { down: 0.03, up: 0.05, reach: 0.12, turn: 0.5, step: 0.2, lift: 0.08, pairs: 1, above: 0.3 };
const NO_PLANT = new Set(['derrubado', 'caido', 'repouso', 'dormir', 'sentado', 'sentado_radio', 'comer', 'corda']);   // lying, seated or hanging: the feet are not on the floor
// a turn of the body over the feet (`twist`, radians, + to his left: the look over the shoulder while he kneels), spread up the chain: a
// little in the hips (the legs bend to keep the feet where they are: plant.js keep), most of it up the spine, the rest in the neck and
// the head. It is laid on the pose the clips give in THIS frame: the bones it turns are put back first (see `touched` in compose).
const KNEEL = [0.75, 3.4];        // seconds of the clip 'manipular' (Fixing_Kneeling) in which he is down on his knee
const pingPong = (x, d) => { const m = ((x % (2 * d)) + 2 * d) % (2 * d); return m < d ? m : 2 * d - m; };
const TWIST = [['pelvis', 0.16], ['spine_01', 0.16], ['spine_02', 0.20], ['spine_03', 0.20], ['neck_01', 0.12], ['Head', 0.16]];
const TWIST_MAX = 1.15;          // radians in all: about 10 degrees of it in the hips, 37 up the spine, 18 in the neck and the head
const BLEND = 0.12;              // seconds one way of going takes to give place to another in the game (update)
const DUR = {};
const FINGER = /^(index|middle|ring|pinky|thumb)/;
// at the station radio: the whole body, and the left hand's gestures (each a mix of clips of the left arm alone)
const RADIO_BODY = ['radio_pegar_mic', 'radio_esperar', 'radio_falar', 'radio_pendurar'];
const RADIO_LOOP = ['radio_esperar', 'radio_falar'];
const lim = (x, a, b) => Math.max(a, Math.min(b, x));
const RADIO_HAND = {
  radio_seletor: (s) => [[(s.dir ?? 1) < 0 ? 'radio_seletor_menos' : 'radio_seletor', 1]],
  // the four corner keys (1, 3, *, #) mixed for the key asked for: u across the three columns, v down the four rows
  radio_tecla: (s) => {
    const i = lim(Math.round(s.key ?? 4), 0, 11), u = lim(s.keyU ?? (i % 3) / 2, 0, 1), v = lim(s.keyV ?? Math.floor(i / 3) / 3, 0, 1);
    return [['radio_tecla_a', (1 - u) * (1 - v)], ['radio_tecla_b', u * (1 - v)], ['radio_tecla_c', (1 - u) * v], ['radio_tecla_d', u * v]];
  },
  // the first, the middle and the last colour button, mixed
  radio_cor: (s) => { const k = lim(s.colorK ?? (s.color ?? 2), 0, 4) / 2; return [['radio_cor_a', Math.max(0, 1 - k)], ['radio_cor_b', 1 - Math.abs(1 - k)], ['radio_cor_c', Math.max(0, k - 1)]]; },
};
const RADIO_HAND_CLIPS = ['radio_seletor', 'radio_seletor_menos', 'radio_tecla_a', 'radio_tecla_b', 'radio_tecla_c', 'radio_tecla_d', 'radio_cor_a', 'radio_cor_b', 'radio_cor_c'];
const UPPER_ACTS = ['caderno_pegar', 'caderno_folhear', 'bolso_abrir'];      // from the chest up, once
const WITH_FINGERS = new Set([...RADIO_BODY, ...RADIO_HAND_CLIPS, ...UPPER_ACTS]);   // these clips pose the fingers themselves
const LEFT_ARM = /^(clavicle|upperarm|lowerarm|hand|index|middle|ring|pinky|thumb)\w*_l$/;
const isLeftArm = (n) => LEFT_ARM.test(n);
const isOvName = (n) => OVERLAY.includes(n) || UPPER_ACTS.includes(n);
const NEW_ACTS = new Set([...RADIO_BODY, ...Object.keys(RADIO_HAND), ...UPPER_ACTS]);
/** What the outline of a new Jonas starts with (see the head of this file). */
export const JONAS_OUTLINE = { on: true, width: 0.0042, min: 0.0008, max: 0.016, color: '#21140d' };
const OUTLINE_NEAR = 0.2;         // metres from the camera within which the outline is not drawn
// how much of the outline each piece takes (a piece not named takes none)
const OUTLINED = { SuperHero_Male: 1, jacket: 1, tee: 1, pants: 1, boots: 1, props: 0.8, strap: 0.7, lamp: 0.7, hair: 0.4 };
const CROSS = 0.25;               // seconds of the cross-fade into and between the new actions
/** Where the station radio stands for his hands to reach it: its origin, from his root, in his own axes and the model's metres (x to his right, y up, z to his back). */
export const RADIO_SEAT = [-0.10, 0.79, -0.42];
/** The lengths (seconds) of the new actions and the moments in them (the same numbers as tools/models/jonas_radio.py). */
export const JONAS_MARKS = {
  radio_pegar_mic: { dur: 1.6, grab: 0.62 }, radio_esperar: { dur: 3.0, loop: true }, radio_falar: { dur: 2.4, loop: true }, radio_pendurar: { dur: 1.5, release: 0.82 },
  radio_seletor: { dur: 1.0, grip: 0.36, click: 0.48, out: 0.62 }, radio_tecla: { dur: 0.7, hover: 0.24, press: 0.31, up: 0.46 }, radio_cor: { dur: 0.7, hover: 0.24, press: 0.31, up: 0.46 },
  caderno_pegar: { dur: 1.4, take: 0.5, open: 0.95 }, caderno_folhear: { dur: 1.2, start: 0.25, end: 0.8 }, bolso_abrir: { dur: 1.3, take: 0.5, show: 1.0 },
};
const ADDITIVE = ['hand_relax', 'tired', 'stance', 'sit_hands', 'radio_low'];   // (radio_low is in the file but not used: it did not bring the hand to the mouth)
// two-frame poses added on top of the clips
const SEATED = ['sentado', 'sentado_radio'];
const MODEL_H = 1.79;             // the model's height in its own metres, to the top of the hair
// How much of each material shows its painted texture as it is, whatever the light of the scene (0 = all lit by the scene):
// the light is painted in the texture, most of all on the skin, so the scene's light only tints it. A setting of his
// materials alone: the look of the game stays as it is.
const PAINTED = { skin: 0.42, hair: 0.25, cells: 0.1, eye: 0.34, lamp: 0.22 };
const PAINTED_CLOTH = 0.24;
const EYE_TINT = '#ffffff';       // the globes carry their own colour (a cream white, shaded toward the corners): no tint
const LID_SHADE = { color: '#160b08', opacity: 0.3 };      // the lids' shadow on the globe: each ribbon of `lidshade`, as dark glass
// How far the eyes turn (radians), and how much of the lids' own targets a full look down or up puts on
const GAZE = { x: 0.55, up: 0.3, down: 0.32 };

function clipsOf(gltf) {
  if (gltf.userData.jl) return gltf.userData.jl;
  const raw = Object.fromEntries(gltf.animations.map((c) => [c.name, c]));
  // the way each clip goes over the floor rides in its `root` bone (tools/models/jonas_gait.py): the metres forward, the phase of the loop
  // the pose belongs to (the root's height), which feet carry him (across: 1 the left, 2 the right, 3 both or not told) and the turn. It is read here and taken out of what plays (the game moves the root itself).
  const way = {};
  for (const [n, c] of Object.entries(raw)) {
    const p = c.tracks.find((t) => t.name === 'root.position');
    if (!p) continue;
    const k = p.times.length, d = new Float32Array(k), ph = new Float32Array(k), ct = new Uint8Array(k);
    for (let i = 0; i < k; i++) { d[i] = Math.abs(p.values[i * 3 + 2] - p.values[2]); ph[i] = p.values[i * 3 + 1]; ct[i] = Math.round(p.values[i * 3]); }
    let stop = k - 1; while (stop > 0 && d[stop - 1] >= d[k - 1] - 1e-4) stop--;
    way[n] = { t: p.times, d, ph, ct, len: d[k - 1], dur: c.duration, still: p.times[stop] };       // (still: from when on the root no longer moves)
  }
  // the fingers are left out of the clips (they came curled like claws): a relaxed hand is added instead, below
  const by = {};
  for (const [n, c] of Object.entries(raw)) by[n] = ADDITIVE.includes(n) || WITH_FINGERS.has(n) ? c : filterClip(c, n, (b) => b !== 'root' && !FINGER.test(b));
  const out = { lo: {}, up: {}, ov: {}, full: {}, way };
  for (const [n, c] of Object.entries(by)) DUR[n] = c.duration;
  // seated: the lower body of the sitting clip, held, under either its own upper body or the radio's
  if (by.sentar) { out.lo.sentar = filterClip(by.sentar, 'sentar:lo', (b) => !isUpper(b)); out.up.sentar = filterClip(by.sentar, 'sentar:up', isUpper); }
  for (const n of LOCO) if (by[n]) { out.lo[n] = filterClip(by[n], `${n}:lo`, (b) => !isUpper(b)); out.up[n] = filterClip(by[n], `${n}:up`, isUpper); }
  for (const n of OVERLAY) if (by[n]) out.ov[n] = filterClip(by[n], `ov:${n}`, isUpper);
  for (const [n, c] of Object.entries(by)) if (!LOCO.includes(n) && !OVERLAY.includes(n) && !WITH_FINGERS.has(n)) out.full[n] = c;
  for (const n of ADDITIVE) delete out.full[n];
  // at the radio: the body without the left arm, the left arm of the body, and the left arm's own gestures
  out.rb = {}; out.rl = {}; out.rh = {};
  for (const n of RADIO_BODY) if (by[n]) { out.rb[n] = filterClip(by[n], `rb:${n}`, (b) => !isLeftArm(b)); out.rl[n] = filterClip(by[n], `rl:${n}`, isLeftArm); }
  for (const n of RADIO_HAND_CLIPS) if (by[n]) out.rh[n] = filterClip(by[n], `rh:${n}`, isLeftArm);
  for (const n of UPPER_ACTS) if (by[n]) out.ov[n] = filterClip(by[n], `ov:${n}`, isUpper);
  DUR.radio_tecla = DUR.radio_tecla_a ?? JONAS_MARKS.radio_tecla.dur; DUR.radio_cor = DUR.radio_cor_a ?? JONAS_MARKS.radio_cor.dur;
  out.add = {};
  for (const n of ADDITIVE) if (by[n]) {
    const c = by[n].clone();
    THREE.AnimationUtils.makeClipAdditive(c, 0, c, 30);
    out.add[n] = c; DUR[n] = c.duration;
    delete out.full[n];
  }
  if (!by.mancar && by.walk) out.full.mancar = by.walk;      // an older file without the limp: the walk
  gltf.userData.jl = out;
  return out;
}

function standIn(r, look) {
  const T = r.THREE, g = new T.Group(), m = r.mat(look.topC), s = r.mat(look.skin);
  const add = (geo, mat, y) => { const o = new T.Mesh(geo, mat); o.position.y = y; o.userData.noCount = true; g.add(o); };
  add(new T.CapsuleGeometry(0.2, 0.9, 3, 8), m, 1.1);
  add(new T.SphereGeometry(0.12, 10, 8), s, 1.68);
  return g;
}

export function buildJonas(r, look) {
  const T = r.THREE, U = look.h / MODEL_H;
  const root = new T.Group(), counter = new T.Group();
  root.add(counter);
  const shadow = new T.Group();
  for (const [rad, op] of [[0.46, 0.14], [0.34, 0.16], [0.22, 0.18]]) {
    const m = new T.Mesh(new T.CircleGeometry(rad, 18), r.mat('#000000', { opacity: op, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.014; m.userData.noCount = true; shadow.add(m);
  }
  root.add(shadow);
  const stand = standIn(r, look);
  counter.add(stand);
  const api = { root, height: look.h, look, ready: false, lod: null, get tris() { return visibleTris(root); } };
  const rigs = { high: null, low: null };
  let rig = null, which = null, lastCall = null, lastLoco = null, tilted = null, touched = false, nowT = 0, lodTick = 0;
  let lampOn = false;
  const outline = { ...JONAS_OUTLINE, ...(look.outline ?? {}) }, outlineW = { value: new T.Vector4(0, 0, 0, 1) }, hulls = [];
  const glows = [], gazeQ = new T.Quaternion(), gazeE = new T.Euler(0, 0, 0, 'ZXY');
  const twistQ = new T.Quaternion(), UPY = new T.Vector3(0, 1, 0);

  let way = {}, restY = null;        // the ways of the clips (clipsOf), and how high the ball of his foot is when he stands
  let wasGoing = 0, rising = false;       // whether he is setting off (the gait coming in) or stopping
  const band = ([a, b], x) => { const k = clamp01((x - a) / (b - a)); return k * k * (3 - 2 * k); };
  const wrap = (t, d) => ((t % d) + d) % d;
  /** A value of a clip's way (`d`: metres, `ph`: phase) at a time of the clip. */
  const wayAt = (R, key, time) => { const t = R.t, n = t.length; if (time <= t[0]) return R[key][0]; if (time >= t[n - 1]) return R[key][n - 1]; let i = 1; while (t[i] < time) i++; const k = (time - t[i - 1]) / (t[i] - t[i - 1]); return R[key][i - 1] + (R[key][i] - R[key][i - 1]) * k; };
  /** The time of a clip at which it has gone `dist` metres (of the file). */
  const timeAt = (R, dist) => { const d = R.d, n = d.length; if (dist <= 0) return R.t[0]; if (dist >= d[n - 1]) return R.t[n - 1]; let i = 1; while (d[i] < dist) i++; const k = (dist - d[i - 1]) / Math.max(1e-6, d[i] - d[i - 1]); return R.t[i - 1] + (R.t[i] - R.t[i - 1]) * k; };
  /** Metres one cycle of a loop carries him (the clip's own root motion). */
  const strideOf = (n) => (way[n] ? way[n].len * U : (STRIDE[n] ?? 1.2) * U);
  /** The gait at a speed (m/s): { brisk: how much of his walk is the brisk one, run: how much he runs }. */
  const gaitAt = (sp) => ({ brisk: band(GAIT.brisk, Math.abs(sp)), jog: rig?.layers.has('lo:jog') === false ? 0 : band(GAIT.jog, Math.abs(sp)), run: band(rig?.layers.has('lo:jog') === false ? [2.3, 3.4] : GAIT.run, Math.abs(sp)) });
  /** How much each loop weighs for { brisk, run, crouch } (they add up to 1). */
  const sharesOf = ({ brisk = 0, jog = 0, run = 0, crouch = 0 }) => { const b = clamp01(brisk), r = clamp01(run), c = clamp01(crouch), q = clamp01(jog) * (1 - r); return { walk: (1 - c) * (1 - r) * (1 - q) * (1 - b), brisk: (1 - c) * (1 - r) * (1 - q) * b, jog: (1 - c) * q, run: (1 - c) * r, crouch_walk: c }; };
  /** Metres a cycle of the gait `g` ({ brisk, run, crouch }) carries him: the loops' own, by their weights. */
  const strideFor = (g) => { const w = sharesOf(g); return GAITS.reduce((a, n) => a + w[n] * strideOf(n), 0); };
  /** How far the phase goes on (radians) as he covers `moved` metres in the gait `g`: the clips are stepped by the ground, never by the clock. */
  const phaseStep = (phase, moved, dt, g) => (moved / Math.max(0.2, strideFor(g))) * 2 * Math.PI;
  /** The start clip of a gait ('walk_start' or 'crouch_start'), if the file has it: he sets off through it for as far as it goes. */
  const startOf = (g) => way[(g.crouch ?? 0) > 0.5 ? 'crouch_start' : 'walk_start'] ?? null;
  /**
   * One step of his walking, by the ground covered: `st` is { phase (radians), from (metres since he set off from standing), still (seconds
   * he has stood), stopPhase (the phase he was at when he began to stop, or null) }, changed and returned. Setting off, the phase is the
   * start clip's own for as far as that clip goes; then the loops' stride steps it. While he stops (`stopping`) it stays where it was.
   * The game (update) and the film (cutscenes/stage.js) both step him by this, so they show the same.
   */
  const walkStep = (st, moved, dt, g, stopping = false) => {
    const d = Math.abs(moved);
    if (stopping) { if (st.stopPhase == null) st.stopPhase = st.phase; } else st.stopPhase = null;
    if (d < 1e-5) { st.still = (st.still ?? 0) + dt; if (st.still > 0.1) st.from = 0; return st; }
    st.still = 0;
    const S = moved > 0 ? startOf(g) : null, len = S ? S.len * U : 0, was = st.from ?? 0;
    st.from = was + d;
    if (stopping) return st;
    if (S && was < len && (g.run ?? 0) + (g.jog ?? 0) < 0.5) {
      // (the clip ends on the loop: past its end, what is left over goes on by the stride)
      st.phase = st.from < len ? wayAt(S, 'ph', timeAt(S, st.from / U)) * 2 * Math.PI : S.ph[S.ph.length - 1] * 2 * Math.PI + phaseStep(0, st.from - len, dt, g);
    } else st.phase = (st.phase ?? 0) + phaseStep(st.phase ?? 0, moved, dt, g);
    return st;
  };
  /** The ground under a point of the world, from what the caller gave: a function (x, z) -> height, or a profile along the way he faces ([[metres ahead of the root, height], ...]); null if none. */
  const groundOf = (g) => {
    if (!g) return null;
    if (typeof g === 'function') return g;
    const e = root.matrixWorld.elements, yaw = root.rotation.y, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    return (x, z) => { const d = (x - e[12]) * fx + (z - e[14]) * fz; let h = g[0][1]; for (const [at, hh] of g) { if (at <= d) h = hh; else break; } return h; };
  };
  /** Which clips make a turn on the spot of `a` radians (+ to his left), and how much of each: [[name, weight]]. Under 25 degrees, none. */
  const turnClips = (a, crouched) => {
    const deg = Math.abs(a) * 180 / Math.PI, side = a > 0 ? 'l' : 'r', nm = (d) => `${crouched ? 'crouch_' : ''}turn_${side}${d}`;
    if (deg < 25 || !rig?.layers.has(`lo:${nm(90)}`)) return [];
    if (deg <= 45) return [[nm(45), 1]];
    if (deg <= 90) { const k = (deg - 45) / 45; return [[nm(45), 1 - k], [nm(90), k]]; }
    if (deg <= 112.5) return [[nm(90), 1]];
    if (deg <= 135) return [[nm(135), 1]];
    const k = Math.min(1, (deg - 135) / 45); return [[nm(135), 1 - k], [nm(180), k]];
  };

  function attach(gltf, kind, clipsFrom) {
    const clips = clipsOf(clipsFrom ?? gltf);   // the far model carries no animation: it plays the close one's
    const inst = cloneScene(gltf.scene);
    inst.rotation.y = Math.PI;                 // the model faces +Z; the game's people face -Z
    inst.scale.setScalar(U);
    const morphs = [];
    inst.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      const old = o.material, map = old?.map;
      if (map) { map.colorSpace = T.NoColorSpace; map.needsUpdate = true; map.flipY = false; }
      const emissive = PAINTED[(old?.name ?? '').replace(/\.\d+$/, '')] ?? PAINTED_CLOTH;
      // the fine relief (seams, stitching, folds, wrinkles): the glTF normal texture, for a look that takes one
      const normalMap = old?.normalMap ?? null;
      if (normalMap) { normalMap.colorSpace = T.NoColorSpace; normalMap.flipY = false; normalMap.needsUpdate = true; }
      const extra = normalMap ? { normalMap, normalScale: old.normalScale?.x ?? 1 } : {};
      if (o.name === 'lidshade') { o.material = r.mat(LID_SHADE.color, { opacity: LID_SHADE.opacity, transparent: true, depthWrite: false }); o.userData.noCount = true; }
      else if (o.name === 'lamp_glow') { o.material = r.mat('#ffffff', { map, emissive: 1, fogged: 0.6 }); o.visible = lampOn; glows.push(o); }
      else o.material = map ? r.mat(o.name === 'eyes' ? EYE_TINT : '#ffffff', o.name === 'hair' ? { map, emissive, side: T.DoubleSide } : { map, emissive, ...extra }) : r.mat('#20140f');
      if (o.morphTargetInfluences && o.morphTargetDictionary) morphs.push(o);
    });
    // the outline's shell: each outlined piece once more, inside out, dark, pushed out along its normals
    const pieces = [];
    inst.traverse((o) => { if (o.isSkinnedMesh && OUTLINED[o.name]) pieces.push(o); });
    for (const o of pieces) {
      const g = o.geometry, k = OUTLINED[o.name];
      if (!g.attributes.outlineW) {
        const own = g.attributes._outline, a = new Float32Array(g.attributes.position.count);
        for (let i = 0; i < a.length; i++) a[i] = k * (own ? own.getX(i) : 1);
        g.setAttribute('outlineW', new T.BufferAttribute(a, 1));
      }
      // the shell's own triangles: the piece's, without those that take no outline at all (an open leaf like the collar, seen from
      // behind, would show its shell as a dark patch even with no width)
      if (!g.userData.hull) {
        const w = g.attributes.outlineW, src = g.index, keep = [];
        const n = src ? src.count : g.attributes.position.count;
        for (let i = 0; i < n; i += 3) {
          const a0 = src ? src.getX(i) : i, a1 = src ? src.getX(i + 1) : i + 1, a2 = src ? src.getX(i + 2) : i + 2;
          if (w.getX(a0) > 0.001 || w.getX(a1) > 0.001 || w.getX(a2) > 0.001) keep.push(a0, a1, a2);
        }
        const hg = new T.BufferGeometry();
        for (const [name, at] of Object.entries(g.attributes)) hg.setAttribute(name, at);
        hg.morphAttributes = g.morphAttributes; hg.morphTargetsRelative = g.morphTargetsRelative;
        hg.setIndex(keep);
        g.userData.hull = hg;
      }
      const hm = r.mat(outline.color, { emissive: 1, fogged: 1, side: T.BackSide });
      hm.onBeforeCompile = (sh) => {            // (again whenever the look changes: the look writes the shader anew)
        sh.uniforms.uOutline = outlineW;
        // after the skin: each vertex goes out along its own normal by a share of its distance to the camera (x: metres per metre,
        // y: the floor, z: the ceiling, w: 1 / the model's scale). What is nearer the camera than uOutlineNear is not drawn: the
        // camera at his eyes (the first-person shots) would look at the inside of the head's shell.
        sh.vertexShader = 'uniform vec4 uOutline; attribute float outlineW; varying float vOutD;\n' + sh.vertexShader.replace('#include <skinning_vertex>',
          `#include <skinning_vertex>
  { vec4 wp_ = modelMatrix * vec4(transformed, 1.0); vOutD = distance(wp_.xyz, cameraPosition);
    transformed += normalize(objectNormal) * (clamp(vOutD * uOutline.x, uOutline.y, uOutline.z) * outlineW * uOutline.w); }`);
        sh.fragmentShader = 'varying float vOutD;\n' + sh.fragmentShader.replace(/void\s+main\s*\(\s*\)\s*\{/, (m) => `${m} if (vOutD < ${OUTLINE_NEAR.toFixed(2)}) discard;`);
      };
      hm.customProgramCacheKey = () => 'jonas-outline';
      const h = new T.SkinnedMesh(g.userData.hull, hm);
      h.name = `${o.name}_outline`; h.bind(o.skeleton, o.bindMatrix);
      h.position.copy(o.position); h.quaternion.copy(o.quaternion); h.scale.copy(o.scale);
      if (o.morphTargetInfluences) { h.morphTargetInfluences = o.morphTargetInfluences; h.morphTargetDictionary = o.morphTargetDictionary; }
      h.frustumCulled = false; h.userData.noCount = true; h.visible = outline.on;
      o.parent.add(h); hulls.push(h);
    }
    // the two globes' bones, and how each sits at rest: the look turns them from there
    const eyes = ['eye_l', 'eye_r'].map((n) => inst.getObjectByName(n)).filter(Boolean).map((bone) => ({ bone, rest: bone.quaternion.clone() }));
    const layers = new Layers(inst);
    for (const [n, c] of Object.entries(clips.lo)) layers.add(`lo:${n}`, c);
    for (const [n, c] of Object.entries(clips.up)) layers.add(`up:${n}`, c);
    for (const [n, c] of Object.entries(clips.ov)) layers.add(`ov:${n}`, c);
    for (const [n, c] of Object.entries(clips.full)) layers.add(`full:${n}`, c);
    for (const [n, c] of Object.entries(clips.add)) layers.add(`add:${n}`, c, true);
    for (const k of ['rb', 'rl', 'rh']) for (const [n, c] of Object.entries(clips[k])) layers.add(`${k}:${n}`, c);
    inst.visible = false;
    counter.add(inst);
    const rg = rigs[kind] = { inst, layers, morphs, eyes, sockets: new Map(), feet: null, twist: null, touched: [], shares: null, onK: 1, hip: null, moves: null, stairAhead: {} };
    way = clips.way;
    const bone = (n) => inst.getObjectByName(n);
    // how high the ball of his foot is when he stands (the far model plays the close one's clips: measured once)
    const src = clipsFrom ?? gltf;
    if (src.userData.restY === undefined) {
      src.userData.restY = null;
      const toes = ['ball_l', 'ball_r'].map(bone);
      if (toes.every(Boolean) && layers.has('lo:idle')) {
        layers.apply({ 'lo:idle': [1, 0] }); counter.updateMatrixWorld(true);
        const inv = new T.Matrix4().copy(counter.matrixWorld).invert(), p = new T.Vector3();
        src.userData.restY = Math.min(...toes.map((b) => b.getWorldPosition(p).applyMatrix4(inv).y));
        layers.apply({});
      }
    }
    restY = src.userData.restY;
    const legs = ['l', 'r'].map((x) => ({ hip: bone(`thigh_${x}`), knee: bone(`calf_${x}`), foot: bone(`foot_${x}`), toe: bone(`ball_${x}`), bend: 1 }));
    if (legs.every((l) => l.hip && l.knee && l.foot && l.toe)) rg.feet = plantFeet(T, root, legs, { ...FEET, rest: restY ?? 0.04 });
    rg.twist = TWIST.map(([n, k]) => [bone(n), k]).filter(([b]) => b);
    // the bones turned here after the clips (the twist; the legs, by the feet): what the clips gave them is kept, to put back
    rg.touched = [...new Set([...rg.twist.map(([b]) => b), ...(rg.feet ? legs.flatMap((l) => [l.hip, l.knee, l.foot]) : [])])].map((b) => [b, b.quaternion.clone()]);
    // (the hips are moved too, by the ground under his feet: their place is kept the same way)
    const hipBone = bone('pelvis'); rg.hip = hipBone ? { bone: hipBone, pos: hipBone.position.clone() } : null;
    rg.moves = createMoves();
    // how far ahead of the root the left foot comes down in each of the stairs' loops (metres): the phase is set from it, so it lands on a tread's middle
    if (!src.userData.stairAhead) {
      src.userData.stairAhead = {};
      const toe = bone('ball_l');
      for (const n of STAIR_CLIPS) if (toe && layers.has(`lo:${n}`)) {
        layers.apply({ [`lo:${n}`]: [1, 0], [`up:${n}`]: [1, 0] }); counter.updateMatrixWorld(true);
        src.userData.stairAhead[n] = -toe.getWorldPosition(new T.Vector3()).applyMatrix4(new T.Matrix4().copy(counter.matrixWorld).invert()).z;
      }
      layers.apply({});
    }
    rg.stairAhead = src.userData.stairAhead;
    if (!api.ready) { counter.remove(stand); api.ready = true; }
    choose(true);
  }

  function choose(force) {
    let want = rigs.high ? 'high' : 'low';
    if (rigs.high && rigs.low && !FILM && !api.forceLod) {
      const cam = r.camera, p = root.matrixWorld.elements;
      const d = Math.hypot(cam.position.x - p[12], cam.position.y - p[13], cam.position.z - p[14]);
      want = d > (which === 'low' ? 13 : 16) ? 'low' : 'high';
    }
    if (api.forceLod) want = api.forceLod;
    if (!rigs[want]) want = rigs.high ? 'high' : 'low';
    if (want === which && !force) return;
    if (which && rigs[which]) rigs[which].inst.visible = false;
    which = want; rig = rigs[which]; rig.inst.visible = true; api.lod = which;
    rig.feet?.reset();
    if (lastCall) compose(lastCall);
  }

  const dur = (n) => DUR[n] ?? 1;
  function resolve(action, atIn, phase, speed, t) {
    const at = atIn ?? 0;
    const loop = (n, tt) => ({ layer: OVERLAY.includes(n) ? 'ov' : 'full', clip: n, time: wrap(tt, dur(n)) });
    const once = (n, tt) => ({ layer: 'full', clip: n, time: Math.max(0, Math.min(dur(n) - 0.004, tt)) });
    const turn = (n) => ({ layer: 'full', clip: n, time: wrap(phase / (2 * Math.PI), 1) * dur(n) });
    switch (action) {
      case 'usar': case 'radio': return loop(action, t);
      case 'sentado': case 'sentado_radio': return { layer: 'seat', clip: action, time: 0 };
      case 'radio_pegar_mic': case 'radio_esperar': case 'radio_falar': case 'radio_pendurar': case 'radio_seletor': case 'radio_tecla': case 'radio_cor':
        return rig?.layers.has('rb:radio_esperar') ? { layer: 'radio', clip: action, time: 0 } : { layer: 'seat', clip: 'sentado', time: 0 };     // (an older file: he just sits)
      case 'caderno_pegar': case 'caderno_folhear': case 'bolso_abrir': return rig?.layers.has(`ov:${action}`) ? { layer: 'ov', clip: action, time: Math.max(0, Math.min(dur(action) - 0.004, at)) } : null;
      case 'mirar': case 'comer': return loop(action, t);
      // kneeling at work: the library's loop stands up and kneels again every 4 s; he goes down once (from half way: he comes to it
      // crouched) and then stays down, the hands working back and forth over the stretch of the clip where he kneels
      case 'manipular': { const [a, b] = KNEEL, k = (atIn ?? t + a) + 0.2; return { layer: 'full', clip: action, time: k < a ? k : a + pingPong(k - a, b - a) }; }
      case 'arremessar': case 'derrubado': case 'levantar': case 'esquivar': return once(action, at);
      case 'esconder': return DUR.esconder ? once('esconder', at) : loop('crouch_idle', t);
      case 'sair': return null;
      case 'mancar': return turn('mancar');
      case 'corda': return speed > 0.05 ? turn('corda_subir') : speed < -0.05 ? turn('corda_descer') : once('corda_subir', 0);
      case 'caido': return once('caido', 99);
      case 'repouso': case 'dormir': return once('levantar', 0);
      default: return null;
    }
  }

  // the expressions, as weights of the morph targets (see tools/models/jonas_face.py)
  const FACES = {
    tenso: { brow_down: 1, squint: 0.7, frown: 0.7, cheek: 0.35, mouth_narrow: 0.3, lips_press: 0.45 },
    alivio: { smile: 1, brow_up: 0.55, brow_worry: 0.3, cheek: 0.9, squint: 0.5 },
    susto: { jaw_open: 0.3, mouth_narrow: 0.3, lips_funnel: 0.12, eye_wide: 1, brow_up: 1, brow_worry: 0.45, squint: 0 },     // (the gasp itself is added below, and passes)
    exausto: { blink: 0.45, brow_worry: 0.6, frown: 0.5, brow_down: 0.12 },
  };
  // the shapes of the mouth for the sounds of speech (m is also b and p; f is also v)
  const VISEMES = {
    a: { jaw_open: 0.62, upper_lip_up: 0.3, lower_lip_down: 0.28 },
    e: { jaw_open: 0.36, smile: 0.32, upper_lip_up: 0.38, lower_lip_down: 0.22 },
    i: { jaw_open: 0.17, smile: 0.58, upper_lip_up: 0.34, lower_lip_down: 0.1 },
    o: { jaw_open: 0.46, lips_funnel: 0.78, mouth_narrow: 0.3 },
    u: { jaw_open: 0.22, lips_funnel: 1, mouth_narrow: 0.55 },
    m: { jaw_open: 0.13, lips_close: 1, lips_press: 0.45 },
    f: { jaw_open: 0.17, lips_close: 0.42, upper_lip_up: 0.9 },
  };
  // the capture's names for the same targets (a left and a right one share theirs)
  const ALIAS = {
    jawOpen: ['jaw_open', 1], mouthClose: ['lips_close', 1], mouthFunnel: ['lips_funnel', 1], mouthPucker: ['mouth_narrow', 1], mouthLeft: ['mouth_left', 1], mouthRight: ['mouth_right', 1],
    mouthUpperUpLeft: ['upper_lip_up', 0.5], mouthUpperUpRight: ['upper_lip_up', 0.5], mouthLowerDownLeft: ['lower_lip_down', 0.5], mouthLowerDownRight: ['lower_lip_down', 0.5],
    mouthPressLeft: ['lips_press', 0.5], mouthPressRight: ['lips_press', 0.5], mouthSmileLeft: ['smile', 0.5], mouthSmileRight: ['smile', 0.5], mouthFrownLeft: ['frown', 0.5], mouthFrownRight: ['frown', 0.5],
  };
  const sstep = (a, b, x) => { const u = clamp01((x - a) / (b - a)); return u * u * (3 - 2 * u); };
  // (his eyes at rest are the mesh's own: the lids need no weight to look tired)
  const gazeOf = (s) => { const g = s.gaze ?? (s.look && typeof s.look === 'object' ? s.look : null); return g ? { x: Math.max(-GAZE.x, Math.min(GAZE.x, g.x ?? 0)), y: Math.max(-GAZE.down, Math.min(GAZE.up, g.y ?? 0)) } : { x: 0, y: 0 }; };
  // a blink every few seconds, from the clock only (so a filmed shot is the same every time): a quick close and open
  function blinkAt(t) {
    const p = ((t % 3.7) + 3.7) % 3.7, q = ((t + 1.3) % 6.1 + 6.1) % 6.1;
    const b = (x, d) => (x < d ? Math.sin((x / d) * Math.PI) : 0);
    return Math.max(b(p, 0.17), b(q, 0.15) * 0.9);
  }
  function setFace(s) {
    if (!rig) return;
    const face = s.face, w = clamp01(s.faceWeight ?? s.faceW ?? 1), t = s.t ?? 0;
    const f = { jaw_open: 0, smile: 0, brow_down: 0, brow_up: 0, brow_worry: 0, blink: 0, eye_wide: 0, frown: 0, cheek: 0, mouth_narrow: 0, squint: 0, look_down: 0, look_up: 0,
      lips_close: 0, lips_funnel: 0, upper_lip_up: 0, lower_lip_down: 0, lips_press: 0, mouth_left: 0, mouth_right: 0 };
    if (FACES[face]) for (const [k, v] of Object.entries(FACES[face])) f[k] = f[k] + (v - f[k]) * w;
    // the fright: a gasp that passes. With `faceAt` the mouth opens wide for a moment and settles; without it, it is half way
    if (face === 'susto') f.jaw_open += w * (s.faceAt != null ? 0.42 * (1 - sstep(0.3, 1.1, s.faceAt)) : 0.14);
    else if (face === 'falando' || s.action === 'radio' || s.action === 'sentado_radio') {
      // syllables: the jaw opens and closes, and the mouth goes from wide to round and back (the vowels), each at its own pace
      const k = face ? w : 1, m = Math.abs(Math.sin(t * 9.0)) * Math.abs(Math.sin(t * 5.3 + 1));
      const round = Math.max(0, Math.sin(t * 3.1 + 0.7));
      f.jaw_open = k * (0.08 + 0.56 * m);
      f.mouth_narrow = k * 0.5 * round * (0.4 + 0.6 * m);
      f.lips_funnel = k * 0.45 * round * m;
      f.upper_lip_up = k * 0.32 * m * (1 - round); f.lower_lip_down = k * 0.18 * m * (1 - round);
      f.brow_up = 0.12 * Math.abs(Math.sin(t * 2.1));
      f.smile = 0.1 * m * (1 - round);
    }
    // the speech: `mouth` (0..1) is how open it is, `viseme` which sound's shape it has. The expression gives the base (it keeps
    // part of its own jaw) and the speech adds to it and takes from it: at 0 the lips shut over whatever the expression holds open.
    if (s.mouth != null || s.viseme) {
      const m = clamp01(s.mouth ?? 1), speaking = face === 'falando' || s.action === 'radio' || s.action === 'radio_falar';
      if (speaking) { f.jaw_open = 0; f.mouth_narrow = 0; f.smile = 0; }
      const rest = f.jaw_open * 0.45;
      let open = 0.03 + 0.72 * m;
      const shape = {};
      if (s.viseme) {
        const mix = typeof s.viseme === 'string' ? { [s.viseme]: 1 } : s.viseme;
        open = 0;
        for (const [name, k] of Object.entries(mix)) { const v = VISEMES[name]; if (!v) continue; for (const [key, x] of Object.entries(v)) shape[key] = (shape[key] ?? 0) + x * k * m; }
        open = shape.jaw_open ?? 0; delete shape.jaw_open;
      } else {
        shape.upper_lip_up = 0.34 * m; shape.lower_lip_down = 0.2 * m;                              // the upper teeth show as he speaks
        shape.mouth_narrow = 0.3 * m * (0.5 + 0.5 * Math.sin(t * 2.3));
      }
      f.jaw_open = rest + (1 - rest) * open;
      for (const [key, x] of Object.entries(shape)) f[key] = Math.max(f[key] ?? 0, x);
      // shut: the lips close over the jaw the expression still holds a little open
      f.lips_close = Math.max(f.lips_close, (1 - sstep(0.02, 0.2, open)) * Math.min(1, f.jaw_open / 0.3));
    }
    if (s.lips) {
      const L = s.lips, put = (k, x) => { if (x != null) f[k] = Math.max(f[k], clamp01(x)); };
      put('lips_close', L.close); put('lips_funnel', L.funnel); put('lips_press', L.press); put('upper_lip_up', L.upper); put('lower_lip_down', L.lower); put('mouth_left', L.left); put('mouth_right', L.right);
    }
    // closed lips need the jaw's own opening to close over, and no more: lips_close is made for a jaw at 0.3
    f.lips_close = Math.min(f.lips_close, f.jaw_open / 0.3 + 0.02);
    f.blink = Math.max(f.blink, blinkAt(t)) * (1 - f.eye_wide);
    f.squint *= 1 - f.eye_wide;
    if (s.blink != null) f.blink = clamp01(s.blink);         // a fixed blink (the film and the contact sheets)
    // the look: the two globes turn together on their bones (about the bone's own axes: z is up, x is across), and the lids
    // follow, less so the more they are already closed
    const g = gazeOf(s), open = 1 - f.blink;
    f.look_down = clamp01(-g.y / GAZE.down) * open * (1 - 0.5 * f.squint);
    f.look_up = clamp01(g.y / GAZE.up) * open * (1 - f.eye_wide);
    gazeQ.setFromEuler(gazeE.set(g.y, 0, g.x));
    for (const e of rig.eyes) e.bone.quaternion.copy(e.rest).multiply(gazeQ);
    if (s.morphs) {            // any target by its name, last (the capture's names too)
      const acc = {};
      for (const [k, x] of Object.entries(s.morphs)) { const al = ALIAS[k]; if (al) acc[al[0]] = (acc[al[0]] ?? 0) + x * al[1]; else acc[k] = x; }
      Object.assign(f, acc);
    }
    if (s.lamp !== undefined && s.lamp !== null) lampOn = s.lamp === 'on' || s.lamp === true;
    for (const o of glows) o.visible = lampOn;
    for (const m of rig.morphs) for (const [k, i] of Object.entries(m.morphTargetDictionary)) if (k in f) m.morphTargetInfluences[i] = f[k];
  }
  api.setFace = (a = {}) => { lastLoco = { ...(lastLoco ?? {}), ...a }; compose({ ...(lastCall ?? {}), ...a }); };

  function compose(s) {
    lastCall = s._dt || s._reset || s._blend ? { ...s, _dt: 0, _reset: false, _blend: s._blend === undefined ? undefined : 0 } : s;   // (composed again, the same call holds the feet where they are)
    if (!rig) return;
    if (!(++lodTick % 20)) { lodTick = 0; const w = which; choose(false); if (w !== which) return; }
    const { phase = 0, walk = 0, run = 0, crouch = 0, action = null, at = 0, speed = 0, t = 0 } = s;
    if (outline.on) outlineW.value.set(outline.width * (r.camera.fov ?? 50) / 50, outline.min, outline.max, 1 / U);   // a longer lens makes the same line wider on the screen
    const act = resolve(action, s.at === undefined ? undefined : at, phase, speed, t);      // (no `at`: a pose of the film, already into it)
    const kindOf = (a) => (!a ? null : a.layer === 'ov' ? 'ov' : 'full');
    // the action he is leaving, while it fades into this one (`prev`, with `mix` of the new one): only between two of a kind
    const before = s.prev && s.prev.action ? resolve(s.prev.action, s.prev.at ?? 0, phase, speed, s.prev.t ?? t) : null;
    const mixNow = before && kindOf(before) === kindOf(act) ? clamp01(s.mix ?? 1) : 1;
    const isFull = kindOf(act) === 'full', isOv = kindOf(act) === 'ov';
    const fa = isFull ? (s.fa ?? 1) : 0, oa = isOv ? (s.oa ?? 1) : 0;
    // ---- how he goes over the floor: standing, a start, the loops, a stop, a turn on the spot (they add up to 1)
    const cr = clamp01(crouch), kind = cr > 0.5 ? 'crouch' : 'walk', g = { brisk: s.brisk ?? 0, jog: s.jog ?? 0, run, crouch: cr };
    const u = wrap(phase / (2 * Math.PI), 1), sh = sharesOf(g);
    const wl = {}, tl = {};
    const put1 = (n, w, time) => { if (!(w > 1e-4) || !rig.layers.has(`lo:${n}`)) return; wl[n] = (wl[n] ?? 0) + w; tl[n] = time; };
    // a stop: the clip of the quarter of the cycle he was at when he began to stop, read by the time of the stop (its first part, while the
    // root still moves, stretched to the time the root takes); it gives place to standing at its end
    let wStop = 0;
    const SP = s.stop && s.stop.clip !== false ? way[`${kind}_stop_${Math.round(wrap((s.stop.phase ?? phase) / (2 * Math.PI), 1) * 4) % 4}`] : null;
    if (SP) {
      const st = s.stop, T = Math.max(0.05, st.T ?? SP.still), time = st.t < T ? st.t * SP.still / T : SP.still + (st.t - T);
      wStop = clamp01(st.t / 0.08) * (1 - band([SP.dur - 0.12, SP.dur], time));
      put1(`${kind}_stop_${Math.round(wrap((st.phase ?? phase) / (2 * Math.PI), 1) * 4) % 4}`, wStop, Math.min(SP.dur - 0.004, time));
    }
    // a start: for as far as its clip goes (it begins as he stands and ends on the loop), then the loops
    const S0 = s.from > 0 && !SP && run + g.jog < 0.5 ? startOf(g) : null, sLen = S0 ? S0.len * U : 0;
    const wStart = S0 && s.from < sLen && !(s.stairs && rig.layers.has('lo:stairs_up_run')) ? 1 - band([sLen - 0.2, sLen], s.from) : 0;
    // (under a stop's clip there is the gait only while the clip comes in: it ends in standing, not back in the walk)
    const amt = SP ? clamp01(walk) * (1 - clamp01(s.stop.t / 0.08)) : wStart > 0 ? Math.max(clamp01(walk), band([0, 0.03], s.from)) : clamp01(walk);
    const going = amt * (1 - wStop), standing = (1 - amt) * (1 - wStop);
    if (wStart > 0) put1(`${kind}_start`, going * wStart, Math.min(S0.dur - 0.004, timeAt(S0, s.from / U)));
    // on stairs: the stair's loop in place of the gaits, its phase the treads covered (a foot comes down on the middle of a tread)
    const ST = s.stairs && amt > 0 ? s.stairs : null, per = ST?.per ?? 1;
    const stairClip = ST ? `stairs_${(ST.dir ?? 1) < 0 ? 'down' : 'up'}_${ST.pace ?? (Math.abs(speed) > 1.0 ? 'run' : 'walk')}` : null, onStairs = Boolean(stairClip && rig.layers.has(`lo:${stairClip}`));
    const stairU = onStairs ? wrap(((ST.k ?? 0) + (rig.stairAhead[stairClip] ?? 0.3) / (ST.run ?? 0.3) - 0.5) / (2 * per), 1) : 0;
    if (onStairs) put1(stairClip, going, stairU * dur(stairClip));
    else for (const n of GAITS) put1(n, going * (1 - wStart) * sh[n], u * dur(n));
    // a turn on the spot: the clips of the angle, at the share of the turn made
    const turning = s.turn && Math.abs(s.turn.a ?? 0) > 0 ? turnClips(s.turn.a, cr > 0.5) : [];
    const wTurn = turning.length ? Math.min(1, clamp01(s.turn.k ?? 0) / 0.08, (1 - clamp01(s.turn.k ?? 0)) / 0.08) : 0;
    for (const [n, w] of turning) put1(n, standing * wTurn * w, Math.min(dur(n) - 0.004, clamp01(s.turn.k ?? 0) * dur(n)));
    put1('idle', standing * (1 - wTurn) * (1 - cr), wrap(t, dur('idle')));
    put1('crouch_idle', standing * (1 - wTurn) * cr, wrap(t, dur('crouch_idle')));
    // an older file (without the brisk walk and the rest): the walk it has
    if (!rig.layers.has('lo:brisk') && going > 0) { wl.walk = (wl.walk ?? 0) + going * sh.brisk; tl.walk = u * dur('walk'); }
    // in the game one way of going gives place to another over BLEND seconds (a clip that goes out keeps the time it had)
    // (how long it takes is the rule of the change: models/moves.js)
    const mv = rig.moves ? (s._blend !== undefined ? rig.moves.step(wl, s._reset ? 0 : s._blend) : rig.moves.now()) : null;
    if (s._reset && rig.moves) rig.moves.reset(mv.state);
    if (s._blend !== undefined && rig.shares && !s._reset) {
      const k = Math.min(1, s._blend / (mv?.blend ?? BLEND)), prev = rig.shares;       // (composed again with no time gone by: as it was)
      let sum = 0;
      for (const n of new Set([...Object.keys(wl), ...Object.keys(prev.w)])) {
        const a = prev.w[n] ?? 0, b = wl[n] ?? 0, w = a + Math.max(-k, Math.min(k, b - a));
        if (w > 1e-4) { wl[n] = w; if (tl[n] === undefined) tl[n] = prev.t[n]; sum += w; } else delete wl[n];
      }
      if (sum > 0) for (const n of Object.keys(wl)) wl[n] /= sum;
    }
    if (s._blend !== undefined) rig.shares = { w: { ...wl }, t: { ...tl } };
    const stairW = STAIR_CLIPS.reduce((a, n) => a + (wl[n] ?? 0), 0);
    const moving = GAITS.reduce((a, n) => a + (wl[n] ?? 0), 0) + (wl.walk_start ?? 0) + (wl.crouch_start ?? 0) + stairW;       // how much of him is in a gait
    const W = {};
    const add = (k, w, time) => { if (!(w > 1e-4)) return; if (W[k]) W[k][0] += w; else W[k] = [w, time]; };
    const once = (n, tt) => Math.max(0, Math.min(dur(n) - 0.004, tt));
    // under an action from the chest up he may be sitting (`seated`): then the legs and the back are the sitting clip's
    const under = s.seated && rig.layers.has('lo:sentar') ? 1 : 0, mid = dur('sentar') / 2;
    for (const n of Object.keys(wl)) {
      add(`lo:${n}`, wl[n] * (1 - fa) * (1 - under), tl[n]);
      add(`up:${n}`, wl[n] * (1 - fa) * (1 - oa) * (1 - under), tl[n]);
    }
    if (under) { add('lo:sentar', 1 - fa, mid); add('up:sentar', (1 - fa) * (1 - oa), mid); if (rig.layers.has('add:sit_hands')) add('add:sit_hands', (1 - fa) * (1 - oa), dur('sit_hands')); }
    let seatShare = 0, posed = 0;      // how much of him sits by the sitting clip (the tired stance goes on top of it), and how much has its fingers posed by the clip
    const put = (a, spec, share) => {
      if (!a || !(share > 1e-4)) return;
      if (a.layer === 'ov') { add(`ov:${a.clip}`, oa * (1 - fa) * share, a.time); if (UPPER_ACTS.includes(a.clip)) posed += oa * share; return; }
      const w = fa * share;
      if (a.layer === 'seat') {
        // seated (the sitting clip held in the middle): the hands on the table, or one hand bringing the radio to the mouth
        const rad = a.clip === 'sentado_radio';
        add('lo:sentar', w, mid);
        if (rad && rig.layers.has('ov:radio')) add('ov:radio', w, wrap(spec.t ?? 0, dur('radio'))); else add('up:sentar', w, mid);
        if (rig.layers.has('add:sit_hands')) add('add:sit_hands', w * (rad ? 0.5 : 1), dur('sit_hands'));
        seatShare += share;
      } else if (a.layer === 'radio') {
        // at the station radio: the body of one clip, and the left arm either of the same clip or of a gesture laid over it
        const mixOf = RADIO_HAND[a.clip];
        const body = mixOf ? (RADIO_BODY.includes(spec.base) ? spec.base : 'radio_esperar') : a.clip;
        const bt = RADIO_LOOP.includes(body) ? wrap(spec.t ?? 0, dur(body)) : once(body, mixOf ? (spec.baseAt ?? 99) : (spec.at ?? 0));
        add(`rb:${body}`, w, bt);
        if (!mixOf) add(`rl:${body}`, w, bt);
        else for (const [clip, cw] of mixOf(spec)) add(`rh:${clip}`, w * cw, once(clip, spec.at ?? 0));
        posed += w;
      } else add(`full:${a.clip}`, w, a.time);
    };
    put(act, s, mixNow);
    if (mixNow < 1) put(before, s.prev, 1 - mixNow);
    // a relaxed hand, and a tired stance (shoulders down, head a little forward) on top of whatever the body does
    if (rig.layers.has('add:hand_relax')) add('add:hand_relax', 1 - clamp01(posed), dur('hand_relax'));
    if (rig.layers.has('add:tired')) add('add:tired', 0.5 * ((1 - fa) + fa * seatShare) * (1 - 0.3 * moving), dur('tired'));
    // the library's idle stands like a fighter: standing still, his feet come under him and his arms hang (see jonas.py)
    if (rig.layers.has('add:stance')) add('add:stance', (1 - fa) * (wl.idle ?? 0) * (1 - under), dur('stance'));       // (the starts, the stops and the turns have it in them)
    // three's mixer writes a bone only when its mixed value has changed since the last frame, so a bone turned here after the clips (the
    // twist, the legs bent to the feet) would be turned again from where the last frame left it whenever the clip holds it still: the
    // turn added up frame after frame, and stayed after it was asked back to nothing (the trunk left facing backwards over the legs:
    // the person's note of 2026-11-19). What the clips gave those bones is put back before the clips are applied, and kept again after.
    for (const [b, q] of rig.touched) b.quaternion.copy(q);
    if (rig.hip) rig.hip.bone.position.copy(rig.hip.pos);
    rig.layers.apply(W);
    for (const e of rig.touched) e[1].copy(e[0].quaternion);
    if (rig.hip) rig.hip.pos.copy(rig.hip.bone.position);
    // the upper body turned over the hips (a look over the shoulder while kneeling: the knees stay where they are)
    const tw = Math.max(-TWIST_MAX, Math.min(TWIST_MAX, s.twist ?? 0));
    if (Math.abs(tw) > 1e-4 && rig.twist?.length) {
      root.updateWorldMatrix(true, true);
      const turn = ([b, k]) => turnBoneWorld(T, b, twistQ.setFromAxisAngle(UPY, tw * k));
      const hips = rig.twist.filter(([b]) => b.name === 'pelvis'), rest = rig.twist.filter(([b]) => b.name !== 'pelvis');
      if (hips.length && rig.feet) rig.feet.keep(() => hips.forEach(turn)); else hips.forEach(turn);
      rest.forEach(turn);
    }
    // the feet that are down stay where they are while he stands, stops or turns (not while he lies, sits or hangs; and not in a gait:
    // there the clip itself keeps the foot, and holding it bent the legs)
    if (rig.feet && api.plant !== false) {
      if (s._reset) { rig.feet.reset(); rig.onK = 1; }
      const hit = action === 'derrubado' && at < 0.15;       // (the first instant of a blow: the feet stay put until the clip throws them up)
      const gone = moving * (1 - fa);
      if (Math.abs(gone - wasGoing) > 1e-4) { rising = gone > wasGoing; wasGoing = gone; }
      const off = s.lying || under || seatShare > 0.5 || act?.layer === 'radio' || act?.layer === 'seat' || (NO_PLANT.has(action) && !hit);
      // how fast the root turns: as he turns while he goes, the foot that carries him is held where it is and the body turns over it (the
      // clip alone would swing it round with the body); only that foot, by what the clip says of itself, and it takes no step of its own
      const yawNow = root.rotation.y, spin = s._dt > 0 && rig.yawWas != null && !s._reset ? Math.abs(Math.atan2(Math.sin(yawNow - rig.yawWas), Math.cos(yawNow - rig.yawWas))) / s._dt : 0;
      if (s._dt > 0 || s._reset) rig.yawWas = yawNow;
      rig.spin = s._dt > 0 ? (rig.spin ?? 0) + (spin - (rig.spin ?? 0)) * Math.min(1, s._dt * 20) : (rig.spin ?? 0);
      const inGait = gone > 0.5, veer = inGait ? band([0.7, 1.8], rig.spin) : 0;
      // setting off, a foot that was held where it stood stays there until the start's clip lifts it (let go at once, it slid to where the clip stands)
      const starting = (wl.walk_start ?? 0) + (wl.crouch_start ?? 0) > 0.5;
      // (on stairs the foot that carries him is held too: the loop's step is a stair's of one depth of tread, and the treads are what they are)
      const want = off ? 0 : Math.max(1 - band([0.7, 0.97], gone), veer, starting ? 1 : 0, stairW > 0.5 ? 1 : 0);
      // (in the game the hold is taken up quickly and let go over a moment, not at once)
      rig.onK = s._blend > 0 ? rig.onK + Math.max(-s._blend / BLEND, Math.min(s._blend / 0.04, want - rig.onK)) : want;
      let may = 3;
      if (inGait) { let top = null; for (const n of Object.keys(wl)) if (way[n]?.ct && (top === null || wl[n] > wl[top])) top = n; if (top) { const R = way[top], time = tl[top] ?? 0; let i = 0; while (i < R.t.length - 1 && R.t[i + 1] <= time) i++; may = R.ct[i]; } }
      root.updateWorldMatrix(true, false);
      // (a turn made by its clip steps by itself: the hold does not step for it)
      rig.feet.apply(s._dt ?? 0, { on: rig.onK, ground: root.matrixWorld.elements[13], far: rising ? FEET.reach * 1.7 : Infinity, turn: wTurn > 0.5 || inGait ? Infinity : undefined, may: [Boolean(may & 1), Boolean(may & 2)], steps: !inGait, reach: starting || stairW > 0.5 ? 0.3 : undefined });
      // each foot onto its own ground, the hips to the lower one (a tread, the edge of a step, a slope)
      const G = off ? null : groundOf(s.ground);
      const moved = rig.feet.terrain(s._dt ?? 0, { ground: G, base: root.matrixWorld.elements[13], hips: rig.hip?.bone ?? null, on: 1, standing: 1 - clamp01(gone) });
      rig.terrain = moved;
    }
    setFace({ ...s, action });
    // a body laid down by the caller (root tilted about 90 degrees): the lying clips already lie, so the tilt is taken back
    const lying = s.lying;
    counter.quaternion.identity(); counter.position.y = 0;
    if (lying) {
      const q = root.quaternion.clone().invert().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), root.rotation.y));
      counter.quaternion.copy(q);
      counter.position.y = lying === 'repouso' ? -0.16 : -0.22;
    }
  }

  const prevChange = root.rotation._onChangeCallback;
  root.rotation._onChange(() => {
    prevChange?.();
    const x = root.rotation.x, lying = x > 1.2 ? (Math.abs(x - Math.PI / 2) < 0.002 ? 'repouso' : 'caido') : null;
    if (lying) { if (touched || lying !== tilted) { compose({ action: lying, lying, t: nowT }); touched = false; } }
    else if (tilted && lastLoco) compose(lastLoco);
    tilted = lying;
  });

  let poseT = null;
  api.setPose = (a = {}) => {
    // a film plays its frames in order: the feet go on from the last one; a jump in time (or no time) lets them go
    const go = a.t !== undefined && poseT !== null && a.t > poseT && a.t - poseT < 0.25;
    const step = go ? a.t - poseT : 0;
    poseT = a.t ?? null;
    if (a.t !== undefined) nowT = a.t; lastLoco = { ...a }; touched = true; compose({ ...a, _dt: step, _reset: !go });
  };
  let wk = 0, rn = 0, bk = 0, jg = 0, cr = 0, clock = 0, act = null, actAt = 0, fa = 0, oa = 0, fadeName = null, faceName = null, faceW = 0;
  let prev = null, cross = 1, more = {};          // the action he is leaving and how far the fade has gone; the last base, key, colour and side asked for
  const hand = { u: 0.5, v: 0.33, k: 2, set: false };
  let again = 0, faceWas = null, faceAge = 0;
  const gz = { x: 0, y: 0 };
  const lerp = (a, b, k) => a + (b - a) * Math.min(1, k);
  let lastX = null, lastZ = 0, spSeen = 0, still = 1;
  const ws = { phase: 0, from: 0, still: 1, stopPhase: null };       // his walking, stepped by the ground (walkStep)
  let stopNow = null;              // the stop under way: the phase he was at when it began, and whether its clip plays
  api.update = (dt, { speed = 0, crouch = false, run = false, action = null, look: lk = null, face = null, mouth = null, faceWeight = null, gaze = null, blink = null, lamp, viseme = null, lips = null, morphs = null, base = null, key = null, color = null, dir = 1, seated = false, n = 0, twist = 0, turn = null, stop = null, stairs = null, ground = null } = {}) => {
    clock += dt; nowT = clock; touched = true;
    // how far the root went since the last call, along where he faces (the caller moves the root; the step follows the ground covered)
    const rp = root.position;
    let moved = null, jumped = lastX === null;
    if (lastX !== null) {
      const dx = rp.x - lastX, dz = rp.z - lastZ, d = Math.hypot(dx, dz);
      if (d > Math.max(0.75, 8 * dt)) jumped = true;          // put somewhere else (a teleport, a new scene)
      else { const fwd = -Math.sin(root.rotation.y) * dx - Math.cos(root.rotation.y) * dz; moved = Math.abs(fwd) >= 0.3 * d ? Math.sign(fwd) * d : d; }
    }
    lastX = rp.x; lastZ = rp.z;
    if (dt > 0 && moved !== null) spSeen = lerp(spSeen, Math.abs(moved) / dt, dt * 12);
    still = Math.abs(moved ?? 0) > 1e-4 ? 0 : still + dt;      // (a frame of the browser may come with no step of the game: a stop is two of them)
    const want = gazeOf({ gaze, look: lk });                 // the eyes get there in about a tenth of a second
    gz.x = lerp(gz.x, want.x, dt * 14); gz.y = lerp(gz.y, want.y, dt * 14);
    faceW = faceWeight != null ? clamp01(faceWeight) : lerp(faceW, face ? 1 : 0, dt * 8);
    if (face !== faceWas) { faceWas = face; faceAge = 0; } else faceAge += dt;
    if (face) faceName = face;
    if (action !== act) {
      // into and between the new actions (and from or to sitting), the one he leaves fades into the next
      const kin = act && action && isOvName(act) === isOvName(action) && (NEW_ACTS.has(act) || NEW_ACTS.has(action));
      prev = kin ? { action: act, at: actAt, t: clock, ...more } : null; cross = kin ? 0 : 1;
      act = action; if (action) { actAt = 0; fadeName = action; }
    } else if (n !== again) actAt = 0;           // the same gesture once more (another key, another click): `n` changed
    again = n;
    actAt += dt;
    if (prev) { cross = Math.min(1, cross + dt / CROSS); prev.at += dt; prev.t = clock; if (cross >= 1) prev = null; }
    // the finger slides from one key (or colour) to the next
    const ki = lim(Math.round(key ?? 4), 0, 11), wantU = (ki % 3) / 2, wantV = Math.floor(ki / 3) / 3, wantK = lim(color ?? 2, 0, 4);
    if (!hand.set || (act !== 'radio_tecla' && act !== 'radio_cor')) { hand.u = wantU; hand.v = wantV; hand.k = wantK; hand.set = true; }
    hand.u = lerp(hand.u, wantU, dt * 16); hand.v = lerp(hand.v, wantV, dt * 16); hand.k = lerp(hand.k, wantK, dt * 16);
    more = { base, key: ki, keyU: hand.u, keyV: hand.v, color: wantK, colorK: hand.k, dir, seated };
    const sp = moved === null ? Math.abs(speed) : spSeen, moving = moved === null ? sp > 0.08 : still < 0.05 && sp > 0.08;
    // how much he walks (against standing), the gait his speed asks for, how much he crouches
    const was = wk;
    wk = lerp(wk, moving ? 1 : 0, dt * 10); cr = lerp(cr, crouch ? 1 : 0, dt * 7);
    if (moving) { const ga = gaitAt(sp); if (was < 0.05) { rn = ga.run; bk = ga.brisk; jg = ga.jog; } else { rn = lerp(rn, ga.run, dt * 8); bk = lerp(bk, ga.brisk, dt * 8); jg = lerp(jg, ga.jog, dt * 8); } }
    // a stop the caller tells of ({ t, T }): its clip plays if he was walking (a run slows down through the mix, and the feet are held)
    const stopping = Boolean(stop) && act !== 'mancar' && act !== 'corda';
    if (stopping && !stopNow) stopNow = { phase: ws.phase, clip: rn + jg < 0.5 && was > 0.6 };
    if (!stopping) stopNow = null;
    if (jumped) { ws.from = 0; ws.still = 1; }
    if (act === 'corda') ws.phase += (speed / 0.9) * Math.PI * 2 * dt;
    else if (act === 'mancar') ws.phase += ((moved ?? sp * dt) / strideOf('mancar')) * Math.PI * 2;
    else walkStep(ws, moved ?? sp * dt, dt, { brisk: bk, jog: jg, run: rn, crouch: cr }, stopping);
    // (on stairs the phase is the treads': the gait he comes off them into takes it up where the stair's loop is)
    if (stairs && rig && rig.shares) { const n = STAIR_CLIPS.find((c) => (rig.shares.w[c] ?? 0) > 0.5); if (n && way[n]) ws.phase = (rig.shares.t[n] / way[n].dur) * 2 * Math.PI; ws.from = Math.max(ws.from, 5); }
    const phase = ws.phase;
    const kind = fadeName && isOvName(fadeName) ? 'ov' : 'full';
    const on = act ? 1 : 0;
    fa = kind === 'full' ? lerp(fa, on, dt / (on ? 0.15 : 0.2)) : lerp(fa, 0, dt / 0.15);
    oa = kind === 'ov' ? lerp(oa, on, dt / (on ? 0.15 : 0.2)) : lerp(oa, 0, dt / 0.15);
    const amt = Math.min(1, wk);
    lastLoco = { phase, from: ws.from, walk: amt, brisk: bk, jog: jg, run: rn, crouch: cr, turn, stairs, ground, stop: stopNow && stop ? { t: stop.t, T: stop.T, phase: stopNow.phase, clip: stopNow.clip } : null, action: act ?? (fa > 0.01 || oa > 0.01 ? fadeName : null), at: actAt, speed, t: clock, fa, oa, look: lk, face: faceW > 0.02 ? faceName : null, faceW, mouth, viseme, lips, morphs, faceAt: faceAge, gaze: { x: gz.x, y: gz.y }, blink, lamp, twist, ...more, prev, mix: cross };
    compose({ ...lastLoco, _dt: dt, _blend: dt, _reset: jumped });
  };
  api.setPose({});
  /** A bone of the model as it is drawn now, by name: the sockets of the palms ('grip_r', 'grip_l'), 'Head' … (null until the file arrives). */
  api.socket = (name) => {
    if (!rig) return null;
    if (!rig.sockets.has(name)) rig.sockets.set(name, rig.inst.getObjectByName(name) ?? null);
    return rig.sockets.get(name);
  };
  /** The outline: { on, width (metres of line per metre of distance), min, max (metres), color }. What is not given stays. */
  api.setOutline = (o = {}) => {
    Object.assign(outline, o);
    for (const h of hulls) { h.visible = Boolean(outline.on); if (o.color) h.material.uniforms.uColor?.value.set(outline.color); }
    if (lastCall) compose(lastCall);
  };
  api.outline = outline;
  /** false lets the feet go where the clips put them (to compare; the game keeps it on). */
  api.plant = true;
  /** Metres one cycle of the gait carries him: `g` is { brisk, run, crouch } as setPose takes them, or a loop's name ('walk', 'brisk', 'run', 'crouch_walk', 'mancar'). */
  api.stride = (g = 'walk') => (typeof g === 'string' ? strideOf(g) : strideFor(g));
  /** How the feet have been held so far: for each, the steps it was made to take, and how far (metres) a held one was from the clip's, on average and at most. */
  api.feetStats = () => (rig?.feet ? rig.feet.legs.map((l) => ({ steps: l.steps, off: l.held ? l.off / l.held : 0, offMax: l.offMax, state: l.state, w: l.w * (rig.onK ?? 1) })) : null);
  /** The gait at a speed (m/s), as update() chooses it: { brisk, run }, what setPose takes. */
  api.gaitAt = (sp) => gaitAt(sp);
  /** How far the phase goes on (radians) over `moved` metres in the gait `g` ({ brisk, run, crouch }). */
  api.phaseStep = (ph, moved, dt, g) => phaseStep(ph, moved, dt, g);
  /** One step of his walking by the ground covered: st { phase, from, still, stopPhase } is changed and returned (see walkStep above). The film steps its Jonas by it. */
  api.walkStep = (st, moved, dt, g, stopping) => walkStep(st, moved, dt, g, stopping);
  /** The ways of the clips as the file has them (for the tests): for each, the metres it goes, its seconds, and for a loop its speed (m/s). */
  api.gait = () => Object.fromEntries(Object.entries(way).map(([k, x]) => [k, { len: x.len * U, dur: x.dur, speed: x.len * U / x.dur }]));
  /** The state he is in and the change under way: { state, from, k, rule, blend, listed } (models/moves.js); `moves.log` has the last changes. */
  api.move = () => rig?.moves?.now() ?? null;
  Object.defineProperty(api, 'moves', { get: () => rig?.moves ?? null });
  /** How far the ground under his feet has moved his hips and each foot (metres), as of the last pose. */
  api.terrain = () => rig?.terrain ?? null;
  /** What plays now: the share of each way of going (they add up to 1), for the tests. */
  api.shares = () => ({ ...(rig?.shares?.w ?? {}) });
  /** The length of a clip in seconds (the new actions' lengths are also in JONAS_MARKS, before the file arrives). */
  api.duration = (name) => DUR[name] ?? JONAS_MARKS[name]?.dur ?? null;

  const both = () => { const hi = modelIfReady(FILE), lo = modelIfReady(FILE_LOD); if (hi) attach(hi, 'high'); if (lo && hi) attach(lo, 'low', hi); };
  if (modelIfReady(FILE) && (modelIfReady(FILE_LOD) || false)) both(); else jonasReady.then(both);
  return api;
}
