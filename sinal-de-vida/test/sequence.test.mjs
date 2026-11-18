// The sequence of action of the splice (scene 4, "câmera e ação variadas"): the kinds of command, hitting and missing, the accessibility options, the poses
// of the cutscene and of the reaction (pure functions of time, the same ones the film mode films), and the camera over the shoulder. Pure: no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSequence, SEQ } from '../src/systems/sequence.js';
import { createShoulder, SHOULDER } from '../src/systems/shoulder.js';
import { STEPS, CINE, J, cinePose, actionPose, leap, DODGE } from '../src/systems/emenda.js';
import { readFileSync } from 'node:fs';
import { hits } from '../src/systems/player.js';
import MANIFEST from '../src/film-manifest.json' with { type: 'json' };
import SCENES from '../data/story/scenes.json' with { type: 'json' };

const DT = 1 / 60;
const make = (steps, options = {}) => { const ev = []; const s = createSequence({ steps, options, emit: (e) => ev.push(e) }); return { s, ev }; };
/** Runs for `sec` seconds, giving `input(t)` to every step. */
const run = (s, sec, input = () => ({})) => { for (let t = 0; t < sec; t += DT) s.step(DT, input(t)); };
const results = (ev) => ev.filter((e) => e.type === 'step').map((e) => [e.kind, e.hit]);

test('hold: the bar fills while Use is held and falls when let go; short of it at the end of the window is a miss, with the game going on', () => {
  const a = make([{ kind: 'hold', window: 2, need: 1.5 }, { kind: 'press', window: 1 }]); a.s.start();
  run(a.s, 1.0, () => ({ held: true })); assert.ok(Math.abs(a.s.view().progress - 1.0 / 1.5) < 0.02);
  run(a.s, 0.5, () => ({ held: false })); assert.ok(a.s.view().progress < 0.5, 'it falls when let go');
  run(a.s, 0.6, () => ({ held: true }));                       // (the window is over before the bar is full again)
  assert.deepEqual(results(a.ev), [['hold', false]]); assert.equal(a.s.view().kind, 'hold'); run(a.s, 0.5);
  assert.equal(a.s.view().kind, 'press', 'the sequence goes on after a miss');
  const b = make([{ kind: 'hold', window: 2, need: 1.5 }]); b.s.start(); run(b.s, 2.1, () => ({ held: true }));
  assert.deepEqual(results(b.ev), [['hold', true]]);
});

test('dir: the right way, in the window, is a hit; the wrong way, or none, is the dog knocking him down and ends the sequence', () => {
  const steps = [{ kind: 'dir', window: 1.3, want: -1, after: 0.5 }, { kind: 'press', window: 1 }];
  const ok = make(steps); ok.s.start(); run(ok.s, 0.4); ok.s.step(DT, { dir: -1 });
  assert.deepEqual(results(ok.ev), [['dir', true]]); assert.equal(ok.s.view().dodge.side, 'left'); run(ok.s, 0.6); assert.equal(ok.s.view().kind, 'press');
  const wrong = make(steps); wrong.s.start(); wrong.s.step(DT, { dir: 1 });
  assert.deepEqual(results(wrong.ev), [['dir', false]]); assert.equal(wrong.s.view().outcome, 'knocked'); assert.equal(wrong.ev.at(-1).type, 'seq-end'); assert.equal(wrong.s.active, false);
  const late = make(steps); late.s.start(); run(late.s, 1.4);
  assert.equal(late.s.view().outcome, 'knocked'); assert.equal(late.s.view().misses, 0, 'a dodge missed is no noise: it is the dog');
  const right = make([{ kind: 'dir', window: 1.3, want: 1 }]); right.s.start(); right.s.step(DT, { dir: 1 }); assert.equal(right.ev.find((e) => e.type === 'step').hit, true);
});

test('mash: Use hammered, or left and right alternated, or Reagir, fill the bar; it falls slowly; it ends as soon as it is full', () => {
  const need = 6, steps = [{ kind: 'mash', window: 3, need }];
  for (const key of [{ press: true }, { dir: 1 }, { react: true }]) {
    const m = make(steps); m.s.start(); for (let i = 0; i < need + 2; i++) { m.s.step(DT, key); run(m.s, 0.05); }
    assert.deepEqual(results(m.ev), [['mash', true]], JSON.stringify(key));
  }
  const slow = make(steps); slow.s.start(); for (let i = 0; i < need; i++) { slow.s.step(DT, { press: true }); run(slow.s, 0.9); }
  assert.deepEqual(results(slow.ev), [['mash', false]], 'too slow: the bar falls faster than it is filled');
  const held = make(steps); held.s.start(); run(held.s, 3.1, () => ({ held: true })); assert.deepEqual(results(held.ev), [['mash', false]], 'holding is not hammering');
});

test('press: one press of Use or Reagir before the window closes; missing closes it anyway, with the noise', () => {
  const steps = [{ kind: 'press', window: 1.2 }];
  for (const key of [{ press: true }, { react: true }]) { const p = make(steps); p.s.start(); run(p.s, 0.3); p.s.step(DT, key); assert.deepEqual(results(p.ev), [['press', true]], JSON.stringify(key)); }
  const m = make(steps); m.s.start(); run(m.s, 1.3); assert.deepEqual(results(m.ev), [['press', false]]); run(m.s, 2); assert.equal(m.ev.at(-1).type, 'seq-end'); assert.equal(m.ev.at(-1).outcome, 'done'); assert.equal(m.ev.at(-1).misses, 1);
  const held = make(steps); held.s.start(); run(held.s, 1.3, () => ({ held: true })); assert.deepEqual(results(held.ev), [['press', false]], 'a hold is not a press');
});

test('accessibility: "more time" doubles every window, the first step has double time, "off" makes every step a hit by itself and says so', () => {
  const steps = [{ kind: 'hold', window: 2.2, first: true }, { kind: 'dir', window: 1.3, want: 1 }, { kind: 'mash', window: 3.6, need: 9 }, { kind: 'press', window: 1.2 }];
  const n = make(steps), l = make(steps, { quick: 'long' });
  assert.deepEqual(steps.map((x) => +n.s.windowOf(x).toFixed(2)), [4.4, 1.3, 3.6, 1.2]);
  assert.deepEqual(steps.map((x) => +l.s.windowOf(x).toFixed(2)), [8.8, 2.6, 7.2, 2.4]);
  l.s.start(); assert.equal(l.s.view().total, 8.8);
  const off = make(steps.map((x) => (x.kind === 'dir' ? { ...x, after: 0.2 } : { ...x, after: 0.2 })), { quick: 'off' }); off.s.start();
  let t = 0; while (off.s.running && off.s.active && t < 30) { off.s.step(DT, {}); t += DT; }
  assert.deepEqual(results(off.ev), [['hold', true], ['dir', true], ['mash', true], ['press', true]]); assert.ok(off.ev.filter((e) => e.type === 'step').every((e) => e.auto));
  assert.equal(off.ev.at(-1).outcome, 'done'); assert.equal(off.ev.at(-1).misses, 0);
  assert.ok(off.s.view().t < 4.4 + 1.3 + 1.2 + 0.6 + 4 * 0.2 + 0.1, 'the steps that need no pacing are shorter when they are automatic');
});

test('the steps of the scene: four kinds of command in order, the short one has two; a perfect run takes 15 to 25 s with the cutscene, the short one less', () => {
  const kinds = (v) => STEPS[v].map((x) => x.kind);
  assert.deepEqual(kinds('cheia'), ['hold', 'dir', 'mash', 'press']); assert.deepEqual(kinds('curta'), ['hold', 'press']);
  assert.ok(STEPS.cheia[0].first && STEPS.curta[0].first, 'the first step has the double time (the lesson)');
  const perfect = (v) => { const steps = STEPS[v].map((x) => (x.kind === 'dir' ? { ...x, want: -1 } : x)), m = make(steps); m.s.start(); let t = 0;
    while (m.s.running && m.s.active && t < 60) { const w = m.s.view(); const k = w.kind;
      m.s.step(DT, { held: k === 'hold', press: k === 'press' || (k === 'mash' && Math.round(t * 60) % 6 === 0), dir: k === 'dir' && w.el > 0.4 ? -1 : 0 }); t += DT; }
    assert.equal(m.ev.at(-1).outcome, 'done'); assert.deepEqual(results(m.ev).map((x) => x[1]), steps.map(() => true)); return t; };
  const full = CINE.cheia + perfect('cheia'), short = CINE.curta + perfect('curta');
  assert.ok(full >= 15 && full <= 25, `the full sequence takes ${full.toFixed(1)} s`); assert.ok(short < full && short >= 8, `the short one ${short.toFixed(1)} s`);
  assert.ok(CINE.cheia >= 4 && CINE.cheia <= 6, 'the cutscene is 4 to 6 s');
});

test('the miss numbers: +8 on the Escuta for each step missed that is not the dodge (the number of any reaction missed in the street)', () => {
  assert.equal(SEQ.missEscuta, 8);
});

test('the cutscene of the dog arriving: three planes cut, the sensor goes from weak amber to amber, Jonas turns to look over his shoulder; a pure function of time', () => {
  for (const v of ['cheia', 'curta']) {
    const T = CINE[v], shots = new Set(); let first = null, last = null;
    for (let t = 0; t < T; t += 0.05) { const p = cinePose(v, t); shots.add(p.shot); first ??= p; last = p; assert.deepEqual(p, cinePose(v, t), 'the same time, the same picture'); }
    assert.deepEqual([...shots], [0, 1, 2], `${v}: three planes`);
    const b = cinePose(v, CINE[v] * (v === 'cheia' ? 0.6 : 0.6)); assert.ok(b.shot >= 1);
    const A = cinePose(v, v === 'cheia' ? 3.1 : 1.9), B = cinePose(v, v === 'cheia' ? 4.2 : 2.9);
    assert.notEqual(A.dog.sensor, B.dog.sensor, `${v}: the sensor changes colour in the close`); assert.equal(B.dog.sensor, '#e8a42a');
    assert.ok(Math.abs(last.jonas.yaw) > 1, `${v}: Jonas has turned to look over his shoulder`);
  }
});

test('the reaction: the dog stalks along the pavement, leaps over the dodge and lands past him; a dodge missed is the dog on him (the knock-down action)', () => {
  const lp = leap(-1);
  assert.ok(lp.L > 3 && lp.L < 4.5 && Math.abs(lp.C[0] - J[0]) < 1e-9, 'the leap ends where Jonas works');
  const rec = { variant: 'cheia', from: -1, starts: [0, 4.6], wins: [4.4, 1.3], hits: [true, true], dodge: { side: 'left', at: 5.1 }, knockedAt: null };
  const at = (t) => actionPose('cheia', rec, t);
  assert.ok(at(0).dog.pos[0] < at(4.5).dog.pos[0], 'it walks toward him during the hold'); assert.ok(at(4.5).dog.pos[0] > -18 && at(4.5).dog.pos[0] < -16);
  assert.ok(at(5.2).dog.y > 0.3, 'in the air in the leap'); assert.ok(at(5.6).dog.pos[0] > J[0] - 2.5, 'it comes to him'); assert.ok(at(7).dog.pos[0] > J[0], 'and lands past him');
  assert.equal(at(7).dog.state, 'busca', 'lost, its sensor searching'); assert.equal(at(7).dog.action, undefined);
  const d = at(5.3).jonas; assert.ok(Math.abs(d.pos[1] - J[1]) > 0.2, 'he moves out of the way'); assert.ok(Math.abs(at(5.1 + DODGE.dash + DODGE.fall - 0.01).jonas.pos[1] - J[1] - DODGE.dz) < 0.01, 'a metre to the left (south)');
  const knocked = { ...rec, dodge: null, knockedAt: 5.9 };
  assert.equal(actionPose('cheia', knocked, 6.3).dog.action, 'derrubar'); assert.equal(actionPose('cheia', knocked, 6.3).jonas.action, 'derrubado');
  const right = { ...rec, dodge: { side: 'right', at: 5.1 } }; assert.ok(actionPose('cheia', right, 5.45).jonas.pos[1] < J[1], 'right of the picture is north');
  // the camera never leaves its place during the hold, and the whole is a pure function
  assert.deepEqual(actionPose('cheia', rec, 3), actionPose('cheia', rec, 3));
});

test('the camera over the shoulder: behind and above the right shoulder, the look limited, pushed in by the boxes, close and low when he hides', () => {
  const c = createShoulder(); c.place(0);                           // looking along -z
  const open = c.pose([0, 0], [], { ground: 0 });
  assert.ok(open.eye[2] > 2 && open.eye[1] > 1.6 && open.eye[0] > 0.3, 'behind him, above, to the right');
  // a wall right behind him: the camera is pushed in and is not inside the wall
  const wall = [{ min: [-5, 1.2], max: [5, 3] }]; c.place(0);
  const p = c.pose([0, 0], wall, { ground: 0 }); assert.ok(p.dist < 1.2 && p.eye[2] < 1.2, `pushed in (${p.dist.toFixed(2)} m)`); assert.ok(!hits(wall, p.eye[0], p.eye[2], 0.05), 'not inside the wall');
  // a place full of boxes: wherever he stands and however it looks, the eye is never inside a box
  const boxes = [{ min: [-3, -3], max: [-1, 3] }, { min: [1, -2], max: [3, 0] }, { min: [-2, 2.5], max: [2, 4] }];
  for (const yaw of [0, 1, 2, 3, 4, 5]) for (const pos of [[0, 0.5], [0, 1.9], [-0.5, -3.5], [2.5, 1.6], [0.2, 2.2]]) {
    if (hits(boxes, pos[0], pos[1], 0.3)) continue;
    const k = createShoulder(); k.place(yaw); const q = k.pose(pos, boxes, { ground: 0 });
    assert.ok(!hits(boxes, q.eye[0], q.eye[2], 0.05), `the eye is outside every box (yaw ${yaw}, ${pos})`);
  }
  // the look: free but limited around where he faces (the person's hand cannot take it past the limit)
  const k = createShoulder(); k.place(0); for (let i = 0; i < 200; i++) k.step(DT, { look: { yaw: 0.05, pitch: 0 }, body: 0 });
  assert.ok(Math.abs(k.yaw) <= SHOULDER.lookLimit + 1e-9, `the look stopped at ${k.yaw.toFixed(2)} rad`); assert.ok(k.yaw > 1);
  for (let i = 0; i < 600; i++) k.step(DT, { body: 0 }); assert.ok(Math.abs(k.yaw) < 0.1, 'and it comes back behind him when he is still and the look is let go');
  // hiding: close and low
  const h = createShoulder(); h.place(0); for (let i = 0; i < 60; i++) h.step(DT, { hidden: true });
  const hid = h.pose([0, 0], [], { hidden: true, ground: 0 }); assert.ok(hid.dist < 0.3 && hid.eye[1] < 1.4 && hid.eye[1] < open.eye[1] - 0.3, `close and low (${hid.dist.toFixed(2)} m, ${hid.eye[1].toFixed(2)} m)`);
  // in the camera of a person walking ahead, it swings behind him
  const w = createShoulder(); w.place(0); for (let i = 0; i < 120; i++) w.step(DT, { moving: true, forward: 1, body: 1.0 }); assert.ok(w.yaw > 0.8, 'it follows the body when he walks ahead');
});

test('the scene 4 asks for the camera over the shoulder; the other scenes keep their planes', () => {
  assert.equal(SCENES['n1-saida'].camera, 'ombro');
  for (const [id, sc] of Object.entries(SCENES)) if (id !== 'n1-saida') assert.equal(sc.camera, undefined, `${id} keeps the fixed planes`);
});

test('film mode: the cutscene of the dog arriving has views in the manifest (the cutscene is a file of src/cutscenes/, listed in its index)', () => {
  const file = readFileSync(new URL('../src/cutscenes/emenda.js', import.meta.url), 'utf8'), index = readFileSync(new URL('../src/cutscenes/index.js', import.meta.url), 'utf8');
  assert.match(index, /import emenda from '\.\/emenda\.js'/); assert.match(index, /CUTSCENES = \{[^}]*\bemenda\b/);
  assert.match(file, /export default \{\s*name: 'emenda'/);
  const block = file.slice(file.indexOf('const views = {'), file.indexOf('};', file.indexOf('const views = {')));
  const names = [...block.matchAll(/^\s{2}'?([a-z-]+)'?: \[/gm)].map((m) => `emenda.${m[1]}`);
  for (const n of ['emenda.cinematica', 'emenda.esquina', 'emenda.sensor', 'emenda.olhar', 'emenda.salto']) assert.ok(names.includes(n), n);
  for (const n of names) assert.ok(MANIFEST.views[n], `${n} is in the manifest`);
  for (const n of Object.keys(MANIFEST.views).filter((x) => x.startsWith('emenda.'))) assert.ok(names.includes(n), `${n} has its cutscene`);
  assert.match(MANIFEST.views['emenda.cinematica'], new RegExp(`\\(${CINE.cheia.toFixed(1)} s\\)$`), 'the first view is the whole cutscene of the game');
});

test('"desligada": the dodge is made by itself, to the side the dog asks, before the dog gets to him', () => {
  const m = make([{ kind: 'dir', window: 1.3, want: 1, after: 0.1 }], { quick: 'off' }); m.s.start(); run(m.s, 1.4);
  const d = m.s.view().dodge; assert.equal(d.side, 'right'); assert.ok(d.at > 0.3 && d.at < 1.3); assert.equal(m.ev.find((e) => e.type === 'step').hit, true);
});
