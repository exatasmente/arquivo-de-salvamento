// The chase through the building (night 1, scene 4, acts 2 to 4): the pure parts (the new kinds of command, the beats, the picture as a function of
// time, the plan of the building, the film's views) and, with a Chrome, the chase played: a whole run with the right commands, a miss in the
// stretch of each of the five saved points and the way back to it, the three media, and the film mode.
// The browser tests only run with PLAYWRIGHT_CORE (the folder of playwright-core) and CHROME (default /usr/bin/google-chrome).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createSequence } from '../src/systems/sequence.js';
import { STEPS, SLOW, FLEE, FLEE_TIME, CINE, actionPose } from '../src/systems/emenda.js';
import * as FU from '../src/systems/fuga.js';
import * as PL from '../src/scenes/predio-plan.js';
import { views, poseAt, TOTAL, MISSES, filmOf, worldOf, CAM_OFF } from '../src/cutscenes/fuga-views.js';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8'), json = (p) => JSON.parse(read(p));
const finite = (P) => [...P.cam.eye, ...P.cam.at, ...P.jonas.pos, ...P.dog.pos].every(Number.isFinite);
const run = (steps, inputs, options = {}) => { const ev = []; const q = createSequence({ steps, options, emit: (e) => ev.push(e) }); q.start(); for (const [n, it] of inputs) for (let i = 0; i < n; i++) q.step(1 / 60, it); return { q, ev, v: q.view() }; };

test('beat: a stretch with no command plays its seconds (never doubled) and gives way to the next step without a sound of its own', () => {
  const a = run([{ kind: 'beat', window: 1, id: 'a' }, { kind: 'press', window: 1, id: 'b' }], [[58, {}]], { quick: 'long' });
  assert.equal(a.v.kind, 'beat'); assert.equal(a.v.total, 1, '"mais tempo" does not stretch what only plays');
  const b = run([{ kind: 'beat', window: 1, id: 'a' }, { kind: 'press', window: 1, id: 'b' }], [[63, {}]]);
  assert.equal(b.v.kind, 'press'); assert.equal(b.v.id, 'b'); assert.equal(b.q.view().misses, 0);
  const c = run([{ kind: 'beat', window: 1 }, { kind: 'press', window: 1 }], [[63, {}]], { quick: 'off' });
  assert.equal(c.v.kind, 'press', 'with the reaction off a beat still takes its time'); assert.equal(c.v.auto, true);
});
test('hold his breath (strict): begun in time, never let go, nothing else touched; letting go, moving or starting late is the dog', () => {
  const st = [{ kind: 'hold', strict: true, still: true, grace: 1, need: 2, window: 3.4, fatal: true }];
  assert.equal(run(st, [[20, {}], [125, { held: true }], [60, {}]]).v.outcome, 'done');
  assert.equal(run(st, [[20, {}], [60, { held: true }], [5, {}]]).v.outcome, 'bitten', 'let go');
  assert.equal(run(st, [[20, {}], [60, { held: true }], [2, { held: true, move: true }]]).v.outcome, 'bitten', 'moved');
  assert.equal(run(st, [[70, {}]]).v.outcome, 'bitten', 'never began');
  assert.equal(run(st, [[100, {}]], { quick: 'long' }).v.outcome, null, '"mais tempo" doubles the time to begin');
  assert.equal(run(st, [[230, {}]], { quick: 'off' }).v.outcome, 'done', 'off: it holds by itself');
});
test('slow aim: the pointer moves at its own slow rate whatever the device pushes, a press lets go; inside the zone is a hit, outside or never is the dog', () => {
  const st = [{ kind: 'aim', from: -0.7, zone: [0.5, 0.86], rate: 0.5, window: 6.5, fatal: true }];
  const mid = run(st, [[162, { ax: 1 }]]); assert.ok(Math.abs(mid.v.aim - 0.65) < 0.02, `the pointer is at ${mid.v.aim}`);
  assert.equal(run(st, [[162, { ax: 1 }], [1, { press: true }], [40, {}]]).v.outcome, 'done');
  assert.equal(run(st, [[162, { ax: 5 }], [1, { react: true }], [40, {}]]).v.outcome, 'done', 'a hard push is no faster, and Reagir lets go too');
  assert.equal(run(st, [[60, { ax: 1 }], [1, { press: true }], [5, {}]]).v.outcome, 'bitten', 'short of the door');
  assert.equal(run(st, [[400, {}]]).v.outcome, 'bitten', 'never let go');
  assert.equal(run(st, [[150, {}]], { quick: 'off' }).v.outcome, 'done', 'off: it aims and lets go by itself');
});
test('stay still: touching anything starts the wait again and says so, and is never the dog; a button still down from the step before does not count', () => {
  const st = [{ kind: 'press', window: 1, after: 0 }, { kind: 'still', window: 1 }];
  const a = run(st, [[2, { press: true, held: true }], [30, { held: true }], [80, {}]]); assert.equal(a.v.outcome, 'done'); assert.equal(a.ev.filter((e) => e.type === 'still-moved').length, 0);
  const b = run(st, [[2, { press: true }], [40, {}], [1, { dir: 1 }], [40, {}]]); assert.equal(b.ev.filter((e) => e.type === 'still-moved').length, 1); assert.equal(b.v.outcome, null, 'the wait began again');
  const c = run(st, [[2, { press: true }], [40, {}], [1, { move: true }], [95, {}]]); assert.equal(c.v.outcome, 'done'); assert.equal(c.q.view().misses, 0);
});

test('the choice of a scene and the trap: left, right or Use take a branch whose steps replace what follows; nothing in time is the dog; a trap plays and ends badly whatever is pressed', () => {
  const st = [{ kind: 'choose', window: 3, options: { left: 'a', right: 'b', use: 'c' }, auto: 'b', branches: { a: [{ kind: 'press', window: 1 }], b: [{ kind: 'beat', window: 0.5 }], c: [{ kind: 'doom', window: 0.5 }] } }];
  const ch = (r) => r.ev.find((e) => e.type === 'step' && e.kind === 'choose')?.choice;
  const a = run(st, [[5, {}], [1, { dir: -1 }], [40, {}]]); assert.equal(ch(a), 'a'); assert.equal(a.v.kind, 'press');
  const b = run(st, [[5, {}], [1, { dir: 1 }], [80, {}]]); assert.equal(ch(b), 'b'); assert.equal(b.v.outcome, 'done');
  const c = run(st, [[5, {}], [1, { press: true }], [20, { press: true, held: true }], [60, {}]]); assert.equal(ch(c), 'c'); assert.equal(c.v.outcome, 'bitten', 'the trap: nothing pressed saves him');
  assert.equal(run(st, [[200, {}]]).v.outcome, 'bitten', 'no choice in time');
  const d = run(st, [[200, {}]], { quick: 'off' }); assert.equal(ch(d), 'b', 'off: the way the step names'); assert.equal(d.v.outcome, 'done');
});
test('the switch: the choice by the skip is out (data/story/fuga.json), and the full splice is hold, dodge, run, with no choice in it', () => {
  assert.equal(json('data/story/fuga.json').escolhaCacamba, 'remove');
  assert.deepEqual(STEPS.fuga.map((s) => s.kind), ['hold', 'dir', 'press']);
  assert.ok(STEPS.fuga[2].fatal, 'standing there is the dog'); assert.equal(STEPS.fuga[2].window, 2, 'the dog is stunned for two seconds');
  assert.ok(Math.abs(STEPS.fuga[2].after - FLEE_TIME) < 1e-9); assert.equal(CINE.fuga, CINE.cheia);
  assert.ok(STEPS.cheia.some((s) => s.kind === 'pick'), 'the old way is still there behind the switch');
  // the run that begins the chase ends where the chase's first beat takes him, at his run
  const A = 4.6, rec = { variant: 'fuga', from: -1, film: true, starts: [0, A, 8], wins: [4.4, 0.6, 2], dodge: { side: 'left', at: A + 0.5 }, runAt: 8.4 };
  const end = actionPose('fuga', rec, 8.4 + FLEE_TIME - 1e-3).jonas, first = FU.chasePose(FU.recAt(FU.filmRec().rec, 0), 0).jonas;
  assert.ok(Math.hypot(end.pos[0] - first.pos[0], end.pos[1] - first.pos[1]) < 0.15, 'no jump between the splice and the chase'); assert.ok(end.speed > 4.5 && first.speed > 4.5);
  assert.ok(Math.hypot(end.pos[0] - FLEE.cut[0], end.pos[1] - FLEE.cut[1]) < 0.15);
  assert.equal(actionPose('fuga', rec, 9).tail, null, 'no cable stuck in a grate in this one');
});
test('the beats: the panels of acts 2 to 4 with the person\'s changes (the door as action, the choice in the flat), each with the camera of the scene\'s grammar; five saved points; every command but the last is fatal', () => {
  assert.deepEqual([...new Set(FU.BEATS.map((b) => b.panel))].sort((a, b) => a - b), [6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20], 'panel 15 (the dog coming back to the lure) is out');
  assert.deepEqual(FU.CHECKPOINTS, ['porta', 'hall', 'escolha', 'janela'], 'with the start of the splice, five');
  const kinds = Object.fromEntries(FU.BEATS.map((b) => [b.id, b.cmd?.kind ?? null]));
  assert.deepEqual(kinds, { corrida: 'dir', semaforo: null, porta: 'mash', vidro: null, hall: null, vao: null, corredor: 'dir', escolha: 'choose', pano: 'aim', atras: 'hold', empurra: 'mash', entra: null, dentro: 'hold', achado: 'doom', janela: null, degrau: 'press', trava: 'mash', calcada: 'hold', fecha: 'press', grade: 'still' });
  for (const b of FU.BEATS) if (b.cmd && b.cmd.kind !== 'doom') assert.equal(Boolean(b.cmd.fatal), b.id !== 'grade', `${b.id}: missing it is ${b.id === 'grade' ? 'noise, not the dog' : 'the dog'}`);
  assert.deepEqual(FU.BEATS.filter((b) => b.cmd?.slow).map((b) => b.id), ['fecha'], 'slow motion only on the dog\'s leap');
  assert.deepEqual(FU.BEATS.filter((b) => b.cam === 'fp').map((b) => b.id), ['corrida', 'corredor', 'escolha', 'entra', 'dentro', 'achado', 'degrau', 'calcada']);
  for (const b of FU.BEATS) assert.ok(['fp', 'fix', 'cine', 'slow'].includes(b.cam) && ['rua', 'predio', 'poco'].includes(b.room));
  assert.deepEqual([...new Set(Object.values(kinds).filter(Boolean))].sort(), ['aim', 'choose', 'dir', 'doom', 'hold', 'mash', 'press', 'still']);
  // the choice in the flat: to cover its sensors (the sheet, or the cupboard pushed over it); into the cupboard is a trap
  const steps = FU.stepsOf('escolha'), ch = steps.at(-1); assert.equal(steps[0].id, 'escolha'); assert.equal(ch.kind, 'choose');
  assert.deepEqual(ch.options, { left: 'atras', right: 'pano', use: 'dentro' }); assert.equal(ch.auto, 'pano');
  assert.deepEqual([...new Set(ch.branches.pano.map((x) => x.id))], ['pano', 'janela', 'degrau', 'trava', 'calcada', 'fecha', 'grade']);
  assert.deepEqual([...new Set(ch.branches.atras.map((x) => x.id))], ['atras', 'empurra', 'janela', 'degrau', 'trava', 'calcada', 'fecha', 'grade']);
  assert.deepEqual(ch.branches.dentro.map((x) => `${x.id}:${x.kind}`), ['entra:beat', 'dentro:beat', 'dentro:hold', 'achado:doom'], 'into the cupboard: his breath held while it searches and sweeps the room, and then it is the dog whatever he does');
  assert.deepEqual([...new Set(FU.stepsOf('empurra').map((x) => x.id))].slice(0, 2), ['empurra', 'janela'], 'a run may begin inside a way');
  // the beats the person wants to compare cameras on have two or three each, by name
  for (const id of ['porta', 'vidro', 'pano', 'atras', 'empurra', 'dentro']) assert.ok(Object.keys(FU.BEAT[id].cams).length >= 3, `${id}: ${Object.keys(FU.BEAT[id].cams)}`);
  assert.deepEqual(Object.values(FU.MOCAP).sort(), ['arremessar-pano', 'empurrar-armario', 'espreitar-atras-armario', 'forcar-porta', 'recuar-ofegante'], 'the hand-keyed moves have the names a take of motion capture will carry');
});
test('a run with every command right: a pure function of time, nothing out of place; how long it is', () => {
  const f = FU.filmRec(), at = (t) => FU.chasePose(FU.recAt(f.rec, t), t);
  assert.ok(f.total > 90 && f.total < 240, `acts 2 to 4 take ${f.total.toFixed(1)} s`);
  let prev = null, flashes = [];
  for (let t = 0; t < f.total; t += 1 / 30) {
    const P = at(t); assert.ok(finite(P), `finite at ${t.toFixed(2)} (${P.beat})`);
    const b = FU.BEAT[P.beat];
    if (b.cam === 'fp' || b.cam === 'slow') assert.ok(P.jonas.hidden, `${P.beat}: in his eyes his body is not drawn`);
    if (prev && prev.beat === P.beat) {
      // he never jumps inside a beat (a cut is between two), and a fixed plane does not travel
      const dj = Math.hypot(P.jonas.pos[0] - prev.jonas.pos[0], P.jonas.pos[1] - prev.jonas.pos[1]); assert.ok(dj < 0.4, `${P.beat} at ${t.toFixed(2)}: Jonas moved ${dj.toFixed(2)} m in a frame`);
      if (b.cam === 'fix') assert.ok(Math.hypot(...P.cam.eye.map((v, i) => v - prev.cam.eye[i])) < 0.01, `${P.beat}: the fixed camera stays`);
      if (P.dog.sensor !== prev.dog.sensor || P.fx.glass !== prev.fx.glass) flashes.push(t);
    }
    prev = P;
  }
  for (const t of flashes) assert.ok(flashes.filter((x) => x >= t && x < t + 1).length <= 3, `no more than 3 changes of light in a second (at ${t.toFixed(2)})`);
  assert.deepEqual(at(40), at(40), 'the same time is the same picture');
  // the door as action: he is seen at it; then he backs away from the glass, slowly, out of breath, and runs only after the second blow
  const tv = f.beats.vidro.t0, back = (k) => at(tv + k).jonas; assert.equal(at(f.beats.porta.t0 + 1).jonas.hidden, undefined, 'the camera is on him at the door');
  assert.ok(back(4.4).pos[1] < back(1.6).pos[1] - 0.7 && Math.abs(back(3).yaw - Math.PI) < 0.01, 'backwards, his face to the door'); assert.ok(back(3).pant && back(3).speed < 0 && back(3).speed > -1, 'slowly, panting');
  assert.equal(at(tv + 1.2).fx.glass, 0); assert.equal(at(tv + 1.3).fx.glass, 1, 'the first blow stars the glass'); assert.ok(back(4.9).speed <= 0 && back(5.6).speed > 2, 'the second blow (4.6 s) and he runs');
  // the other way: behind the cupboard, and the cupboard over onto the dog
  const g2 = FU.filmRec(undefined, { branch: 'atras' }), at2 = (t) => FU.chasePose(FU.recAt(g2.rec, t), t), over = at2(g2.beats.empurra.hit + 1.2);
  assert.ok(Math.abs(over.fx.tip - FU.FALL.rest) < 0.03 && over.dog.sensor === '#16161a' && over.dog.state === 'desligado', 'the cupboard leans on it, it is down and its sensors are covered'); assert.ok(Math.abs(at2(g2.beats.janela.t0 + 1).fx.tip - FU.FALL.rest) < 1e-6, 'and it stays where it fell');
  const hid = at2(g2.beats.atras.cmd + 2).jonas; assert.ok(hid.pos[0] > PL.CUPBOARD.x1 && hid.pos[0] < PL.APT.x1 && hid.crouch === 1, 'he is in the gap behind it');
  const sheet = at(f.beats.pano.hit + 1.2); assert.ok(sheet.cloth?.drape && sheet.dog.sensor === '#16161a' && sheet.fx.pano === false, 'the sheet is over its sensor');
  for (let t = 0; t < g2.total; t += 1 / 15) assert.ok(finite(at2(t)), `the other way is finite at ${t.toFixed(2)}`);
  // inside the building he is inside its walls and on its floors; on the stairs, on their steps
  for (const [id, y] of [['hall', PL.BLOCK.y[0]], ['corredor', PL.CORR.y], ['escolha', PL.CORR.y], ['pano', PL.CORR.y]]) {
    const T = f.beats[id]; for (let t = T.t0 + 0.05; t < T.end - (id === 'hall' ? 3.8 : 0.1); t += 0.2) { const j = at(t).jonas; assert.ok(j.pos[0] > PL.BLOCK.x0 && j.pos[0] < PL.BLOCK.x1 && j.pos[1] > PL.BLOCK.zb && j.pos[1] < PL.BLOCK.zf + 0.7, `${id}: inside`); assert.ok(Math.abs(j.h - y) < 0.01 || id === 'hall', `${id}: on its floor`); }
  }
  const v = at(f.beats.vao.t0 + 3).jonas, sa = [...Array(400)].map((_, i) => PL.stairAt(i * 0.08)).find((q) => Math.hypot(q.pos[0] - v.pos[0], q.pos[1] - v.pos[1]) < 0.05 && Math.abs(q.h - v.h) < 0.05);
  assert.ok(sa, 'in the well he is on the stairs');
  assert.equal(PL.stairAt(PL.stairOf(3)).floor, 2); assert.ok(Math.abs(PL.stairAt(PL.stairOf(3) - 1e-4).h - PL.BLOCK.y[3]) < 0.01, 'three floors of stairs end at the third floor');
  // the last picture is the first cutscene's camera, in the shaft, with the dog on the grate over him
  const g = at(f.beats.grade.t0 + 0.2), cid = json('data/story/scenes.json')['n1-cidade'].beats.find((b) => b.type === 'cutscene').shots[0];
  assert.deepEqual(g.cam.eye, cid.eye); assert.equal(g.cam.fov, cid.fov); assert.ok(Math.hypot(...g.cam.at.map((x, i) => x - cid.at[i])) < 0.05);
  assert.ok(Math.abs(g.dog.pos[0] - PL.SHAFT.pos[0]) < 1.2 && Math.abs(g.dog.pos[1] - PL.SHAFT.pos[1]) < 0.75, 'the dog is on the grate'); assert.ok(g.jonas.h < -1.5, 'and he is down the shaft');
});
test('every command missed: the dog comes from where the beat says, takes him down, and the picture leaves his eyes for the attack', () => {
  for (const b of FU.BEATS.filter((x) => x.cmd?.fatal)) {
    const m = FU.filmRec(undefined, { miss: b.id, branch: b.branch ?? 'pano' }), f = m.rec.failAt, at = (t) => FU.chasePose(FU.recAt(m.rec, t), t);
    const P0 = at(f), d = FU.failOf(b, P0).delay;
    assert.ok(d > 0.2 && d < 1.5, `${b.id}: it is on him in ${d} s`);
    for (let t = f; t < f + d + 3; t += 1 / 30) assert.ok(finite(at(t)), `${b.id}: finite`);
    assert.ok(FU.attackAt(FU.recAt(m.rec, f + d + 1), f + d + 1) > 0.99);
    const A = at(f + d + 1);
    assert.equal(A.jonas.action, 'derrubado'); assert.equal(A.jonas.hidden, false, 'he is seen'); assert.ok(A.knock, 'where the blood would be');
    assert.ok(Math.hypot(A.dog.pos[0] - A.jonas.pos[0], A.dog.pos[1] - A.jonas.pos[1]) < 0.8, `${b.id}: the dog is on him`);
    assert.ok(Math.hypot(...A.cam.eye.map((v, i) => v - [A.jonas.pos[0], A.jonas.h ?? FU.GROUND(A.jonas.pos), A.jonas.pos[1]][i])) < 3.2, `${b.id}: the camera is beside them`);
  }
  // into the cupboard: whatever he does it finds him (it has his heat), tears the door off and has him
  { const m = FU.filmRec(undefined, { branch: 'dentro' }), f = m.rec.failAt, A = FU.chasePose(FU.recAt(m.rec, f + 2), f + 2); assert.ok(f != null && m.beats.dentro && m.beats.achado && !m.beats.janela); assert.equal(A.jonas.action, 'derrubado'); assert.ok(A.fx.cupboard > 1.4, 'the cupboard\'s door is torn open'); }
  // moving under the dog on the grate: it hears (white sensor, its light on him), and nothing more
  const f = FU.filmRec(), t = f.beats.grade.cmd + 2, rec = { ...FU.recAt(f.rec, t), moved: [t - 0.1] };
  assert.equal(FU.chasePose(rec, t).dog.sensor, '#ffffff'); assert.equal(FU.chasePose(FU.recAt(f.rec, t), t).dog.sensor, '#e8a42a'); assert.equal(FU.STILL_ESCUTA, 8);
});
test('the sound comes from the thing: every sound of the chase has its place (the dog as it goes, his mouth, the cupboard); his breath stops while he holds it; the trap is the clip the person approved', () => {
  for (const branch of FU.BRANCHES) {
    const f = FU.filmRec(undefined, { branch }), ev = FU.soundsOf(f.rec, 0, f.rec.failAt != null ? f.rec.failAt + 3.6 : f.total);
    const loose = ev.filter((e) => !e.pos && !['camera-lenta'].includes(e.name)); assert.deepEqual(loose.map((e) => e.name), [], `${branch}: every sound has a place`);
    assert.ok(ev.some((e) => e.name === 'cao-rolar') && ev.some((e) => e.name === 'respiracao'));
  }
  // the dog's steps and servo follow it through the flat
  const g = FU.filmRec(undefined, { branch: 'atras' }), T = g.beats.atras, ev = FU.soundsOf(g.rec, T.t0, g.beats.empurra.end), steps = ev.filter((e) => e.name === 'cao-rolar');
  assert.ok(steps.length >= 6, `${steps.length} steps of the dog in the flat`); assert.ok(Math.hypot(steps[0].pos[0] - steps.at(-1).pos[0], steps[0].pos[2] - steps.at(-1).pos[2]) > 2, 'from where it is, as it moves');
  assert.ok(ev.some((e) => e.name === 'sensor-varre') && ev.some((e) => e.name === 'cao-busca'), 'the sweep of its sensor and its servo');
  const held = ev.filter((e) => e.name === 'respiracao' && e.t > T.cmd + 0.6 && e.t < T.hit); assert.deepEqual(held, [], 'no breath while he holds it'); assert.ok(ev.some((e) => e.name === 'respiracao' && e.t < T.cmd), 'he breathes before');
  assert.ok(ev.some((e) => e.name === 'armario-cai') && ev.some((e) => e.name === 'armario-range'), 'the cupboard creaks and goes over');
  // into the cupboard (the clip the person approved, from inside it): his breath held, quiet and kept in the cupboard; the dog comes in by the door, goes
  // about the room, stands and sweeps it (the sweep sounds from its sensor), turns to the cupboard, comes, and the wood splits under the blow
  const m = FU.filmRec(undefined, { branch: 'dentro' }), t0 = m.beats.dentro.t0, tr = FU.soundsOf(m.rec, m.beats.entra.t0, m.rec.failAt + 3.6).map((e) => ({ ...e, t: e.t - t0 })), at = (n) => tr.filter((e) => e.name === n);
  assert.ok(at('armario-abre').length === 1 && at('armario-fecha').length === 1 && at('armario-range').length >= 2, 'its door and its creak');
  assert.ok(at('respiracao-escondido').length >= 1 && at('respiracao-escondido').every((e) => Math.abs(e.pos[0] - PL.CUPBOARD.in[0]) < 0.1), 'his breath is in the cupboard');
  assert.deepEqual(at('respiracao-escondido').filter((e) => e.t > 2.7 && e.t < 5.5), [], 'none while he holds it');
  const pose = (k) => FU.chasePose(FU.recAt(m.rec, t0 + k), t0 + k), wall = (g) => g.pos[1] > PL.APT.z0 - 0.22 && g.pos[1] < PL.APT.z0 + 0.02 && !(g.pos[0] > PL.APT.door - 0.4 && g.pos[0] < PL.APT.door + 0.4);
  let seen = null, scans = null; for (let k = 0; k < 7; k += 1 / 30) { const P = pose(k); assert.ok(!wall(P.dog), `the dog is not in the wall at ${k.toFixed(2)} s`); if (!P.dog.hidden && seen == null) seen = k; if (P.scan && scans == null) scans = k; }
  assert.ok(Math.abs(seen - 2.7) < 0.2 && Math.abs(scans - 4.2) < 0.2, `it comes in at ${seen?.toFixed(2)} s and sweeps from ${scans?.toFixed(2)} s`);
  assert.ok(Math.abs(pose(3.2).dog.pos[0] - PL.APT.door) < 0.45, 'by the door'); assert.ok(pose(5).dog.speed === 0 && Math.abs(pose(4.6).dog.look - pose(5.2).dog.look) > 0.3, 'it stands and its sensor sweeps');
  assert.ok(at('sensor-varre').length >= 1 && at('sensor-varre')[0].t > 4 && Math.hypot(at('sensor-varre')[0].pos[0] - pose(5).dog.pos[0], at('sensor-varre')[0].pos[2] - pose(5).dog.pos[1]) < 0.7, 'the sweep sounds from its sensor');
  assert.ok(at('cao-rolar').length >= 4 && Math.hypot(at('cao-rolar')[0].pos[0] - at('cao-rolar').at(-1).pos[0], at('cao-rolar')[0].pos[2] - at('cao-rolar').at(-1).pos[2]) > 2, 'its steps follow it');
  assert.ok(Math.abs(at('cao-ataque')[0].t - 7.05) < 0.06 && Math.abs(at('armario-racha')[0].t - 7.05) < 0.06 && at('cao-ataque')[0].pos, `the blow at ${at('cao-ataque')[0].t.toFixed(2)} s, from the dog`);
  assert.ok(Math.abs(7.05 + FU.ATTACK.overAt - 9.95) < 0.06, 'FIM DE JOGO at about 9.95 s'); assert.ok(Math.abs(views['erro-dentro'][0] - (450 + t0)) < 1e-6, 'the view begins inside the cupboard');
  for (const k of [0.1, 3, 6]) assert.equal(pose(k).jonas.hidden, true, 'through the slats: in his eyes');
  // letting his breath go early is the dog at once, and it still comes by the door
  const early = FU.filmRec(undefined, { branch: 'dentro', miss: 'dentro' }); assert.ok(early.rec.failAt < m.rec.failAt + 2);
  // the takes the person chose are sounds of the game: files, the manifest, the routes
  const man = json('assets/audio/sfx/manifest.json'), routes = read('src/audio/samples.js');
  for (const [id, route] of [['apto-fundo', 'ambiente-apto'], ['jonas-respira-escondido', 'respiracao-escondido'], ['cao-sensor-varre', 'sensor-varre'], ['armario-golpe', 'armario-racha'], ['fim-de-jogo', 'fim-de-jogo']]) { assert.ok(man[id] && existsSync(path.join(ROOT, 'assets/audio/sfx', man[id].file)), `${id} is a file of the game`); assert.ok(routes.includes(`'${route}': { ids: ['${id}']`), `${route} plays it`); }
  assert.equal(man['apto-fundo'].loop, true); for (const id of ['escolha', 'pano', 'atras', 'empurra', 'entra', 'dentro', 'achado']) assert.equal(FU.BEAT[id].amb, 'ambiente-apto', `${id}: the flat's own room tone`);
});
test('the building\'s plan: the door, the stairs, the corridor, the flat and the fire escape are where the chase walks', () => {
  const { BLOCK, DOOR, HALL, STAIR, CORR, APT, CUPBOARD, WINDOW, ESCAPE } = PL;
  assert.ok(DOOR.x > HALL.x0 && DOOR.x < HALL.x1 && Math.abs(DOOR.z - BLOCK.zf) < 1e-9);
  assert.ok(STAIR.cz + STAIR.half + STAIR.w / 2 <= HALL.z0 + 1e-9, 'the stairs are behind the hall');
  assert.ok(Math.abs(CORR.z1 - APT.z0) < 0.21 && APT.door > APT.x0 && APT.door < APT.x1 && CUPBOARD.in[0] > CUPBOARD.x0 && CUPBOARD.in[0] < CUPBOARD.x1);
  assert.ok(APT.x1 - CUPBOARD.x1 > 0.6, 'a man fits between the cupboard\'s back and the wall');
  assert.ok(WINDOW.x - WINDOW.w / 2 > ESCAPE.x0 && WINDOW.x + WINDOW.w / 2 < ESCAPE.x1, 'the window gives onto the landing');
  assert.ok(Math.abs(PL.escapeH(3, ESCAPE.top) - BLOCK.y[3]) < 1e-9 && Math.abs(PL.escapeH(3, ESCAPE.foot) - BLOCK.y[2]) < 1e-9);
  // the building is a scene of its own: one entity per line, each thing of it an entity; the plan reads the cupboard's place from it
  const own = json('data/scenes/predio.json'); assert.equal(own.scene, 'predio'); assert.equal(read('data/scenes/predio.json').split('\n').filter((l) => l.includes('"id"')).length, own.entities.length);
  for (const id of ['casca', 'porta-rua', 'correio', 'escada', 'escada-incendio', 'porta-apto', 'armario', 'caixas-corredor', 'pano', 'janela', 'lampada-hall']) assert.ok(own.entities.some((x) => x.id === id), `${id} is an entity`);
  assert.equal(own.entities.find((x) => x.id === 'armario').pos[0], CUPBOARD.x0); assert.match(read('src/scene-view.js'), /'predio'/);
  const lay = json('data/scenes/rua.json').entities, e = lay.find((x) => x.id === 'predio-fuga');
  assert.equal(e.type, 'predioFuga'); assert.deepEqual(e.pos, PL.ORIGIN, 'the entity stands where the plan says'); assert.deepEqual(e.rot, [0, 0, 0]);
  assert.ok(lay.some((x) => x.id === 'carro-fuga' && x.type === 'carro'), 'the car stopped across the lanes');
  // no real text or brand in the paintings: nothing is ever written on a canvas
  for (const f of ['src/models/predio/paints.js', 'src/models/predio/index.js']) assert.ok(!/fillText|strokeText/.test(read(f)), `${f}: no text is painted`);
});
test('film mode: every panel has a view, the acts and the misses too; each is in the manifest, the cutscene is in the index, and each resolves to a picture', () => {
  const man = json('src/film-manifest.json');
  for (const b of FU.BEATS) { assert.ok(views[b.id], `a view for ${b.id}`); for (const c of Object.keys(b.cams ?? {})) assert.ok(views[`${b.id}-${c}`], `a view for ${b.id} with the camera ${c}`); }
  // the same moment with another camera is another picture of the same scene
  for (const id of ['porta', 'vidro', 'pano', 'atras', 'empurra', 'dentro']) for (const c of ['seguranca', 'cao']) { const a = poseAt((views[id][0] + views[id][1]) / 2), b2 = poseAt((views[`${id}-${c}`][0] + views[`${id}-${c}`][1]) / 2); assert.ok(Math.hypot(...a.cam.eye.map((v, i) => v - b2.cam.eye[i])) > 0.5, `${id}-${c} is another camera`); assert.ok(Math.hypot(a.dog.pos[0] - b2.dog.pos[0], a.dog.pos[1] - b2.dog.pos[1]) < 1e-6, `${id}-${c} is the same moment`); assert.ok(views[`${id}-${c}`][0] >= CAM_OFF[c]); }
  for (const [k, [t0, t1, desc]] of Object.entries(views)) {
    assert.ok(t1 > t0 && desc.length > 20, k);
    assert.ok(man.views[`fuga.${k}`]?.startsWith(desc), `fuga.${k} is in the manifest`);
    for (const t of [t0, (t0 + t1) / 2, t1 - 1e-3]) assert.ok(finite(poseAt(t)), `${k} at ${t.toFixed(2)}`);
  }
  assert.equal(Object.keys(man.views).filter((k) => k.startsWith('fuga.')).length, Object.keys(views).length);
  assert.ok(Object.keys(man.anchors).some((k) => k.startsWith('fuga.')));
  assert.match(read('src/cutscenes/index.js'), /import fuga from '\.\/fuga\.js';[\s\S]*\bfuga \}/);
  assert.equal(MISSES.length, 12); assert.ok(Math.abs(worldOf(filmOf(60)) - 60) < 1e-6 && TOTAL > FU.filmRec().total, 'the slow leap takes longer on the film');
  assert.equal(poseAt(views['erro-atras'][1] - 0.5).jonas.action, 'derrubado'); assert.equal(poseAt(views.dentro[1] - 0.3).jonas.action, 'derrubado');
  assert.ok(Math.abs(SLOW.scale - 0.28) < 1e-9);
});

// ---- with a browser ------------------------------------------------------------------------------------------------------------------------
const CORE = process.env.PLAYWRIGHT_CORE, skip = CORE ? false : 'set PLAYWRIGHT_CORE to run the browser tests';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg' };
const BASE = '?cena=n1-saida&sair=agora&semente=7';
async function withGame(fn, { touch = false, pad = false, film = false } = {}) {
  const { chromium } = createRequire(import.meta.url)(CORE);
  const srv = http.createServer((req, res) => {
    let p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0])); if (p.endsWith('/')) p += 'index.html';
    if (!p.startsWith(ROOT) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] ?? 'application/octet-stream' }); res.end(readFileSync(p));
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const url = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', args: ['--mute-audio', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  try {
    const page = await browser.newPage(touch ? { viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true } : { viewport: { width: 640, height: 360 } }), errors = [];
    page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => (m.type() === 'error' || /unknown sound/.test(m.text())) && errors.push(m.text()));
    if (pad) await page.addInitScript(() => { const b = () => ({ pressed: false, value: 0 }); window.__pad = { connected: true, id: 'test pad', index: 0, mapping: 'standard', buttons: Array.from({ length: 17 }, b), axes: [0, 0, 0, 0] }; navigator.getGamepads = () => [window.__pad]; });
    const open = async (query) => {
      await page.goto(`${url}${query}`, { timeout: 120000 });
      if (film) return;
      await page.waitForFunction(() => window.__game?.run && window.__game.st.phase); await page.evaluate(() => window.__game.test.manual(true));
      await page.waitForFunction(() => window.__game.st.shot >= 0 && window.__game.st.world && !window.__game.st.cut?.loading, null, { timeout: 120000 });
    };
    await fn({ page, open, errors, url });
    assert.deepEqual(errors, [], 'no console error');
  } finally { await browser.close(); srv.close(); }
}
const step = (page, n) => page.evaluate((k) => window.__game.test.step(k), n);
const sv = (page) => page.evaluate(() => { const S = window.__game.st.seq; if (!S) return null; const v = S.sq.view(); return { fuga: S.kind === 'fuga', from: S.from ?? null, phase: S.phase, kind: v.kind, id: v.id, i: v.i, gap: v.gap, over: v.over, el: v.el, want: v.want, outcome: v.outcome, aim: v.aim, zone: v.zone, t: S.t, beat: S.pose?.beat ?? null, fail: S.rec.failAt ?? null, dead: S.dead, gameOver: Boolean(S.over), scale: S.timeScale, progress: v.progress, moved: v.moved }; });
/** The chase begun at a beat, as a saved point brings him back to it. */
async function toChase(page, open, beat, more = '') { await open(`${BASE}&fuga=${beat}${more}`); await page.waitForFunction(() => window.__game.st.seq?.kind === 'fuga', null, { timeout: 60000 }); await page.evaluate(() => { window.__game.st.fadeIn = 0; }); }
/**
 * Plays what is on with the keys, the right way, until `stop(v)` holds (or the chase ends). `miss`: the id of the beat whose command is left alone.
 * Returns the last view.
 */
async function play(page, { stop = () => false, miss = null, max = 2400, keys = null, way = 'pano' } = {}) {
  const K = keys ?? { hold: (d) => (d ? page.keyboard.down('KeyE') : page.keyboard.up('KeyE')), tap: async () => { await page.keyboard.down('KeyE'); await step(page, 2); await page.keyboard.up('KeyE'); }, dir: async (w) => { const k = w < 0 ? 'ArrowLeft' : 'ArrowRight'; await page.keyboard.down(k); await step(page, 2); await page.keyboard.up(k); },
    react: async () => { await page.keyboard.down('Space'); await step(page, 2); await page.keyboard.up('Space'); }, axis: (d) => (d ? page.keyboard.down('KeyD') : page.keyboard.up('KeyD')) };
  let held = false, axis = false, v = null, n = 0;
  for (let i = 0; i < max; i++) {
    v = await sv(page); if (!v || !v.fuga || v.fail != null || stop(v)) break;
    const on = !v.gap && !v.over && v.id !== miss, wantHold = on && v.kind === 'hold', wantAxis = on && v.kind === 'aim' && v.aim < (v.zone[0] + v.zone[1]) / 2;
    if (wantHold !== held) { held = wantHold; await K.hold(held); }
    if (wantAxis !== axis) { axis = wantAxis; await K.axis(axis); }
    if (on && v.kind === 'dir' && v.el > 0.2) await K.dir(v.want);
    else if (on && v.kind === 'mash' && n++ % 2 === 0) await K.tap();
    else if (on && v.kind === 'press' && v.el > (v.id === 'fecha' ? 0.3 : 0.08)) await K.react();
    else if (on && v.kind === 'aim' && !wantAxis) await K.tap();
    else if (on && v.kind === 'choose' && v.el > 0.4) { if (way === 'dentro') await K.tap(); else await K.dir(way === 'atras' ? -1 : 1); }
    await step(page, v.kind === 'still' || v.kind === 'beat' || (v.kind === 'hold' && held) ? 12 : 4);
  }
  if (held) await K.hold(false); if (axis) await K.axis(false);
  return v;
}
const state = (page) => page.evaluate(() => { const G = window.__game; return { scene: G.director.scene?.id, cp: G.run.cp ?? null, pocket: [...G.run.pocket], escuta: G.escuta.value, flags: { ...G.run.flags }, seq: Boolean(G.st.seq), ctx: document.getElementById('app').dataset.ctx }; });
const fx = (page) => page.evaluate(() => { const S = window.__game.st.seq; return S?.pose?.fx ?? null; });

test('the splice now ends in the run: hold, dodge, and with the dog against the skip one press, and the chase begins; no choice is offered', { skip, timeout: 900000 }, async () => {
  await withGame(async ({ page, open }) => {
    await open(`${BASE}&emenda=cheia`);
    for (let i = 0; i < 8 && (await page.evaluate(() => window.__game.director.waitName)) !== 'saida-emenda'; i++) { await page.evaluate(() => { const G = window.__game; G.director.signal('isca'); G.test.teleport(-13.3, 7.0); }); await step(page, 400); }
    await page.evaluate(() => { window.__game.test.teleport(-13.3, 7.0); window.__game.player.body = 3.14; }); await step(page, 3);
    await page.keyboard.down('KeyE'); for (let i = 0; i < 60 && !(await page.evaluate(() => Boolean(window.__game.st.seq))); i++) await step(page, 10); await page.keyboard.up('KeyE');
    assert.equal(await page.evaluate(() => window.__game.st.seq.variant), 'fuga');
    await page.evaluate(() => { window.__game.st.fadeIn = 0; window.__game.input.S.edges.add('skip'); }); await step(page, 3);
    const kinds = [];
    let held = false;
    for (let i = 0; i < 900; i++) {
      const v = await sv(page); if (!v || v.fuga) break;
      if (!v.gap && kinds.at(-1) !== v.kind) kinds.push(v.kind);
      const want = v.kind === 'hold' && !v.gap; if (want !== held) { held = want; if (held) await page.keyboard.down('KeyE'); else await page.keyboard.up('KeyE'); }
      if (v.kind === 'dir' && !v.gap && v.el > 0.35) { await page.keyboard.down('ArrowLeft'); await step(page, 2); await page.keyboard.up('ArrowLeft'); }
      if (v.kind === 'press' && !v.gap && v.el > 0.3) { await page.keyboard.down('Space'); await step(page, 2); await page.keyboard.up('Space'); }
      await step(page, 5);
    }
    await page.keyboard.up('KeyE');
    assert.deepEqual(kinds, ['hold', 'dir', 'press'], 'no choice by the skip');
    const v = await sv(page); assert.ok(v?.fuga, 'the chase is on'); assert.equal(v.beat, 'corrida'); assert.equal(v.from, 'corrida');
    const s = await state(page);
    assert.equal(s.cp.at, 'saida-emenda'); assert.equal(s.cp.fuga, undefined, 'the first saved point is the start of the splice');
    assert.equal(s.flags.caoDesativado, undefined);
    assert.equal(await page.evaluate(() => window.__game.st.world.sc.ents.params('cabo-avenida').emendado), true, 'the splice closed before he ran');
    // missing the swerve: the dog, the game over, and back to the start of the splice (the first of the five saved points)
    const m = await play(page, { miss: 'corrida' }); assert.equal(m.beat, 'corrida'); assert.ok(m.fail != null);
    for (let i = 0; i < 80 && !(await sv(page))?.gameOver; i++) await step(page, 10);
    assert.ok((await sv(page)).gameOver, 'the game over shows'); assert.equal(await page.evaluate(() => document.getElementById('gameover').hidden), false);
    for (let i = 0; i < 60 && (await sv(page))?.fuga; i++) await step(page, 20);
    await page.waitForFunction(() => window.__game.st.seq && window.__game.st.seq.kind !== 'fuga', null, { timeout: 60000 });
    const back = await page.evaluate(() => ({ variant: window.__game.st.seq.variant, phase: window.__game.st.seq.phase })); assert.equal(back.variant, 'fuga'); assert.ok(['cine', 'act'].includes(back.phase), 'at the first command of the splice again');
  });
});
test('`?cacamba=keep`: the switch gives the choice by the skip back (and no chase)', { skip, timeout: 300000 }, async () => {
  await withGame(async ({ page, open }) => {
    await open(`${BASE}&emenda=cheia&cacamba=keep`);
    for (let i = 0; i < 8 && (await page.evaluate(() => window.__game.director.waitName)) !== 'saida-emenda'; i++) { await page.evaluate(() => { const G = window.__game; G.director.signal('isca'); G.test.teleport(-13.3, 7.0); }); await step(page, 400); }
    await page.evaluate(() => { window.__game.test.teleport(-13.3, 7.0); window.__game.player.body = 3.14; }); await step(page, 3);
    await page.keyboard.down('KeyE'); for (let i = 0; i < 60 && !(await page.evaluate(() => Boolean(window.__game.st.seq))); i++) await step(page, 10); await page.keyboard.up('KeyE');
    assert.equal(await page.evaluate(() => window.__game.st.seq.variant), 'cheia'); assert.ok(await page.evaluate(() => window.__game.st.seq.steps.some((s) => s.kind === 'pick')));
  });
});
test('the whole chase with the right commands (keyboard): the saved points in order, the building as the chase leaves it, the lure spent, and the story goes on in the station', { skip, timeout: 3000000 }, async () => {
  await withGame(async ({ page, open }) => {
    await toChase(page, open, 'corrida');
    const seen = [], cps = [], t0 = (await sv(page)).t;
    const e0 = (await state(page)).escuta;
    const end = await play(page, { max: 6000, stop: (v) => { if (seen.at(-1) !== v.beat) seen.push(v.beat); return false; } });
    void end;
    assert.deepEqual(seen, FU.BEATS.filter((b) => !b.branch || b.branch === 'pano').map((b) => b.id), 'every beat, in order, by the way of the sheet');
    const s = await state(page);
    assert.equal(s.seq, false, 'the chase is over'); assert.equal(s.scene, 'n1-radio', 'and the story is in the station: he does not climb down the shaft again');
    assert.equal(s.flags.fugaCaminho, 'pano', 'the way he took is kept'); assert.equal(s.escuta, e0, 'a clean run does not raise the Escuta');
    void cps; void t0;
  });
});
test('the saved points: each is written as its beat begins, and a miss in its stretch is the attack, the game over and the way back to it', { skip, timeout: 3000000 }, async () => {
  // (from each saved point: on to the next command, left alone; then the dog, and where the game puts him)
  for (const [cp, miss] of [['porta', 'porta'], ['hall', 'corredor'], ['escolha', 'escolha'], ['janela', 'degrau']]) {
    await withGame(async ({ page, open }) => {
      const before = { porta: 'semaforo', hall: 'vidro', escolha: 'corredor', janela: 'pano' }[cp];
      await toChase(page, open, before);
      await play(page, { stop: (v) => v.beat === cp });
      const s = await state(page); assert.equal(s.cp.fuga, cp, `${cp}: the saved point is written when its beat begins`); assert.equal(s.cp.scene, 'n1-saida');
      const m = await play(page, { miss }); assert.equal(m.beat, miss); assert.ok(m.fail != null, `${miss}: missed`);
      await step(page, 100);
      const P = await page.evaluate(() => { const S = window.__game.st.seq; return { action: S.pose.jonas.action, beat: S.pose.beat, sign: document.getElementById('hud-sign')?.hidden }; }); assert.equal(P.action, 'derrubado', `${miss}: the dog is on him`);
      for (let i = 0; i < 80 && !(await sv(page))?.gameOver; i++) await step(page, 10);
      assert.ok((await sv(page)).gameOver, `${miss}: the game over`);
      await page.keyboard.down('KeyE'); for (let i = 0; i < 60; i++) { const w = await sv(page); if (!w || w.dead || w.fail == null) break; await step(page, 5); } await page.keyboard.up('KeyE');     // (Use, once the game over is read: back to the saved point)
      await page.waitForFunction(() => { const S = window.__game.st.seq; return S?.kind === 'fuga' && !S.dead && S.rec.failAt == null; }, null, { timeout: 60000 });
      const v = await sv(page); assert.equal(v.from, cp, `${miss}: back at ${cp}`); assert.equal(v.beat, cp); assert.ok(v.t < 1, `${cp}: at its start (${v.t})`);
      assert.equal(await page.evaluate(() => document.getElementById('gameover').hidden), true);
      // and from there it can be done right
      const on = await play(page, { stop: (x) => x.beat !== cp && x.beat !== miss, max: 1500 }); assert.ok(on.fail == null && on.beat !== cp, `${cp}: played on from the saved point`);
    });
  }
});
test('the building answers the chase: the door gives, the glass stars and goes, the flat\'s door and the cupboard open, the sash, the step, the ladder and the hatch move; only the dog\'s leap is slow', { skip, timeout: 3000000 }, async () => {
  await withGame(async ({ page, open }) => {
    await toChase(page, open, 'porta');
    const sc = () => page.evaluate(() => { const G = window.__game, f = G.st.world.sc.fuga.parts, h = G.st.world.sc.group.getObjectByName('grade-folha'); return { inside: f.ins.visible, door: f.door.rotation.y, apt: -f.aptDoor.rotation.y, cup: f.cupDoor.rotation.y, sash: f.sash.position.y, step: f.loose.rotation.x, ladder: f.ladder.position.y, hatch: h.rotation.z }; });
    assert.equal((await sc()).inside, true, 'the hall is there behind the glass');
    await play(page, { stop: (v) => v.beat === 'vidro' && v.el > 2 }); assert.equal((await fx(page)).glass, 1, 'the glass stars and holds');
    await play(page, { stop: (v) => v.beat === 'hall' && v.el > 3.2 }); assert.equal((await fx(page)).glass, 2, 'and then it goes');
    assert.equal(await page.evaluate(() => window.__game.st.world.sc.fuga.parts.ext.getObjectByName('cacos').visible), true);
    await play(page, { way: 'atras', stop: (v) => v.beat === 'janela' }); assert.ok((await sc()).apt > 1.2, 'the flat\'s door is open'); assert.ok((await fx(page)).tip > 0.9, 'and the cupboard leans on the dog');
    let scales = [];
    await play(page, { stop: (v) => { scales.push([v.beat, v.scale]); return v.beat === 'degrau' && v.id === 'degrau' && v.kind === 'press' && v.gap; } });
    assert.ok((await sc()).sash > 0.5 && (await sc()).step > 1, 'the sash is up and the step hangs');
    await play(page, { stop: (v) => { scales.push([v.beat, v.scale]); return v.beat === 'calcada'; } }); assert.ok((await sc()).ladder < 0.5, 'the ladder is down');
    await play(page, { stop: (v) => { scales.push([v.beat, v.scale]); return v.beat === 'calcada' && v.kind === 'hold' && v.gap; } }); assert.ok((await sc()).hatch > 1, 'the hatch leaf is up');
    await play(page, { stop: (v) => { scales.push([v.beat, v.scale]); return v.beat === 'grade'; } }); assert.ok(Math.abs((await sc()).hatch) < 0.01, 'and shut over him');
    assert.ok(scales.filter(([b]) => b !== 'fecha' && b !== 'grade').every(([, k]) => k > 0.999), 'nothing is slow but the leap');
    assert.ok(scales.some(([b, k]) => b === 'fecha' && k < 0.4), 'the leap at the grate is slow');
    // under the grate: moving is heard (+8 on the Escuta, the wait begins again), never the dog
    await play(page, { stop: (v) => v.beat === 'grade' && v.kind === 'still' && v.el > 1 });
    const e0 = (await state(page)).escuta; await page.keyboard.down('KeyD'); await step(page, 4); await page.keyboard.up('KeyD'); await step(page, 4);
    const v = await sv(page); assert.equal((await state(page)).escuta, e0 + FU.STILL_ESCUTA); assert.equal(v.moved, 1); assert.ok(v.el < 0.3 && v.fail == null);
    await play(page, { max: 800 }); assert.equal((await state(page)).scene, 'n1-radio');
  });
});
test('the three ways out of the flat: the sheet over its sensor, the cupboard pushed over it, and the trap of getting into the cupboard (the attack, the game over, and back to the choice)', { skip, timeout: 3000000 }, async () => {
  await withGame(async ({ page, open }) => {
    await toChase(page, open, 'escolha');
    const sign = async () => { await page.evaluate(() => new Promise((ok) => { window.__game.test.render(); requestAnimationFrame(() => requestAnimationFrame(ok)); })); return page.evaluate(() => document.getElementById('hud-sign').textContent); };
    await play(page, { stop: (v) => v.kind === 'choose' && !v.gap && v.el > 0.2 }); assert.match(await sign(), /atrás do armário.*pano na mesa.*entrar no armário/);
    // into the cupboard: nothing he presses saves him
    const d = await play(page, { way: 'dentro', max: 900 }); assert.equal(d.beat, 'achado', 'he held his breath to the end, and it found him all the same'); assert.ok(d.fail != null, 'the dog has him');
    assert.equal((await state(page)).flags.fugaCaminho, 'dentro');
    for (let i = 0; i < 80 && !(await sv(page))?.gameOver; i++) await step(page, 10);
    assert.ok((await sv(page)).gameOver); await page.keyboard.down('KeyE'); for (let i = 0; i < 60; i++) { const w = await sv(page); if (!w || w.dead || w.fail == null) break; await step(page, 5); } await page.keyboard.up('KeyE');
    await page.waitForFunction(() => { const S = window.__game.st.seq; return S?.kind === 'fuga' && !S.dead && S.rec.failAt == null; }, null, { timeout: 60000 });
    const back = await sv(page); assert.equal(back.beat, 'escolha'); assert.equal(back.from, 'escolha', 'back at the choice');
    // the sheet
    const a = await play(page, { way: 'pano', stop: (v) => v.beat === 'janela' }); assert.equal(a.beat, 'janela'); assert.equal(a.fail, null);
    assert.equal((await fx(page)).pano, false, 'the sheet left the table'); assert.equal((await state(page)).flags.fugaCaminho, 'pano');
  });
  await withGame(async ({ page, open }) => {
    await toChase(page, open, 'escolha');
    let sawHold = false, sawMash = false;
    const b = await play(page, { way: 'atras', stop: (v) => { sawHold ||= v.id === 'atras' && v.kind === 'hold'; sawMash ||= v.id === 'empurra' && v.kind === 'mash'; return v.beat === 'janela'; } });
    assert.ok(sawHold && sawMash, 'the breath held behind it, then the push'); assert.equal(b.beat, 'janela'); assert.ok((await fx(page)).tip > 0.9);
    // an alternative camera for a review: ?cam=
    await toChase(page, open, 'vidro', '&cam=seguranca'); await step(page, 60);
    const eye = await page.evaluate(() => window.__game.st.seq.pose.cam.eye); assert.ok(eye[1] > 3, 'the fixed camera in the corner of the hall');
  });
});
test('"mais tempo" and "reação desligada" hold for every command of the chase: double windows, and a chase that plays itself to the end', { skip, timeout: 3000000 }, async () => {
  await withGame(async ({ page, open }) => {
    await toChase(page, open, 'degrau'); await page.evaluate(() => { window.__game.options.quick = 'off'; });
    const kinds = new Set(); let v = null;
    for (let i = 0; i < 700; i++) { v = await sv(page); if (!v?.fuga) break; assert.equal(v.fail, null); if (!v.gap) kinds.add(v.kind); await step(page, 12); }
    assert.ok(['press', 'mash', 'hold', 'still'].every((k) => kinds.has(k)), 'each kind played itself'); assert.equal((await state(page)).scene, 'n1-radio');
  });
  for (const [beat, win] of [['corrida', 0.9], ['pano', 5.5]]) {
    const st = FU.stepsOf(beat).find((s) => s.kind !== 'beat'), q = createSequence({ steps: [st], options: { quick: 'long' } }); q.start(); assert.equal(q.view().total, win * 2, `${beat}: double`);
  }
});
test('touch: the chase with the buttons on the picture (Usar, ◀ ▶, the stick for the aim), on a phone', { skip, timeout: 3000000 }, async () => {
  await withGame(async ({ page, open }) => {
    await toChase(page, open, 'vao');
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.tb-dirL')).display !== 'none' && getComputedStyle(document.querySelector('.tb-use')).display !== 'none'), true, 'the buttons of a sequence are on the picture');
    const S = () => page.evaluate(() => window.__game.input.S);
    void S;
    const keys = {
      hold: (d) => page.evaluate((on) => { const S2 = window.__game.input.S; S2.press.down = on; if (on) S2.press.at = performance.now() / 1000; }, d),
      tap: async () => { await page.tap('.tb-use'); await step(page, 2); }, dir: async (w) => { await page.tap(w < 0 ? '.tb-dirL' : '.tb-dirR'); await step(page, 2); },
      react: async () => { await page.tap('.tb-use'); await step(page, 2); }, axis: (d) => page.evaluate((on) => { window.__game.input.S.move = [on ? 1 : 0, 0]; }, d),
    };
    const v = await play(page, { keys, stop: (x) => x.beat === 'janela', max: 2500 });
    assert.equal(v.beat, 'janela', 'through the corridor (◀), the choice (▶) and the sheet (the stick, then Usar)'); assert.equal(v.fail, null);
    // the sign of the command is in the scenery, inside the picture, with no key cap on a touch screen
    await toChase(page, open, 'porta'); await play(page, { keys, stop: (x) => x.id === 'porta' && x.kind === 'mash' && !x.gap });
    await page.evaluate(() => new Promise((ok) => { window.__game.test.render(); requestAnimationFrame(() => requestAnimationFrame(ok)); }));
    const sign = await page.evaluate(() => { const e = document.getElementById('hud-sign'), b = e.getBoundingClientRect(); return { hidden: e.hidden, x: b.left, r: b.right, w: innerWidth, text: e.textContent }; });
    assert.equal(sign.hidden, false); assert.ok(sign.x >= 0 && sign.r <= sign.w + 1, 'inside the picture'); assert.match(sign.text, /empurre/);
  }, { touch: true });
});
test('gamepad: the chase with the pad (A, X, the d-pad, the left stick for the aim)', { skip, timeout: 3000000 }, async () => {
  await withGame(async ({ page, open }) => {
    await toChase(page, open, 'vao');
    const btn = async (i, on) => page.evaluate(([k, v]) => { window.__pad.buttons[k] = { pressed: v, value: v ? 1 : 0 }; }, [i, on]);
    const tap = async (i) => { await btn(i, true); await step(page, 3); await btn(i, false); await step(page, 1); };
    const keys = { hold: (d) => btn(0, d), tap: () => tap(0), dir: (w) => tap(w < 0 ? 14 : 15), react: () => tap(2), axis: (d) => page.evaluate((on) => { window.__pad.axes[0] = on ? 1 : 0; }, d) };
    const v = await play(page, { keys, way: 'atras', stop: (x) => x.beat === 'janela', max: 2500 });
    assert.equal(v.beat, 'janela', 'through the corridor, the choice (d-pad left), the breath held (A) and the cupboard (A hammered)'); assert.equal(v.fail, null);
    assert.equal(await page.evaluate(() => window.__game.input.device), 'gamepad');
  }, { pad: true });
});
test('film mode in the page: the views of the chase are listed, their sounds are placed, and a frame of each panel draws', { skip, timeout: 3000000 }, async () => {
  await withGame(async ({ page, open }) => {
    await open('?film');
    await page.waitForFunction(() => window.__film?.sounds, null, { timeout: 120000 });
    const list = await page.evaluate(() => Object.keys(window.__film.listViews()).filter((k) => k.startsWith('fuga.')));
    assert.equal(list.length, Object.keys(views).length);
    const snd = await page.evaluate(() => window.__film.sounds('fuga.vidro')); assert.ok(snd.events.some((e) => e.name === 'vidro-aramado' && e.opts.pos), 'the blow on the glass sounds at the door');
    const all = await page.evaluate(() => window.__film.sounds('fuga.inteira')); assert.ok(all.natural > 90 && all.events.length > 40);
    const drawn = await page.evaluate(async (ids) => {
      const film = window.__film.build({ width: 640, height: 360 }), v = window.__film.listViews(), out = {};
      for (const id of ids) { const w = v[`fuga.${id}`]; film.stage.frame('fuga', (w.t0 + w.t1) / 2); film.stage.draw(); const c = film.render.camera.position; out[id] = [c.x, c.y, c.z].every(Number.isFinite); }
      return out;
    }, ['corrida', 'porta-cao', 'vidro-seguranca', 'vao', 'pano', 'atras-cao', 'empurra', 'dentro', 'erro-dentro', 'dentro-seguranca', 'janela', 'fecha', 'grade', 'erro-trava']);
    assert.ok(Object.values(drawn).every(Boolean), JSON.stringify(drawn));
  }, { film: true });
});
