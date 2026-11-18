// The face and voice capture: the mapping, the neutral, the resampling, the head from the matrix, the limits of the gaze, the Live Link
// Face import, the STS script (with the send swapped) and the server. Run: node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { BLENDSHAPES, GAZE_LIMITS, matrixToEuler, averageNeutral, subtractNeutral, resample, smoothSeries, mapFrame, convertTake, resolveMapping, normalizeName } from '../tools/capture/lib.mjs';
import { parseLiveLinkCsv, parseTimecode } from '../tools/capture/import-livelink.mjs';
import { wavSeconds, estimate, run as runSts, DEFAULT_MODEL } from '../tools/voice/sts.mjs';
import { createCaptureServer } from '../tools/capture/server.mjs';

// the shipped defaults, frozen here: tools/capture/mapping.json is the person's own tuning and changes with "Salvar ajustes"
const MAPPING = JSON.parse(readFileSync(new URL('./fixtures/mapping.default.json', import.meta.url), 'utf8'));
const MAPPING_LIVE = JSON.parse(readFileSync(new URL('../tools/capture/mapping.json', import.meta.url), 'utf8'));
const frame = (over = {}, h = [0, 0, 0]) => ({ b: BLENDSHAPES.map((n) => over[n] ?? 0), h });
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);

/** A column-major 4x4 for R = Ry(yaw) * Rx(pitch) * Rz(roll), with a scale and a translation to prove they are ignored. */
function matrix(yaw, pitch, roll, scale = 1) {
  const [cy, sy, cp, sp, cr, sr] = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch), Math.cos(roll), Math.sin(roll)];
  const Ry = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]], Rx = [[1, 0, 0], [0, cp, -sp], [0, sp, cp]], Rz = [[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]];
  const mul = (A, B) => A.map((r) => [0, 1, 2].map((j) => r.reduce((s, v, k) => s + v * B[k][j], 0)));
  const R = mul(mul(Ry, Rx), Rz);
  return [R[0][0] * scale, R[1][0] * scale, R[2][0] * scale, 0, R[0][1] * scale, R[1][1] * scale, R[2][1] * scale, 0, R[0][2] * scale, R[1][2] * scale, R[2][2] * scale, 0, 5, 6, -40, 1];
}

test('the head from the matrix: yaw, pitch and roll come back, and a scale or a translation does not matter', () => {
  for (const [y, p, r] of [[0, 0, 0], [0.3, 0, 0], [0, -0.25, 0], [0, 0, 0.2], [-0.4, 0.2, -0.15]]) {
    const e = matrixToEuler(matrix(y, p, r)); near(e.yaw, y); near(e.pitch, p); near(e.roll, r);
  }
  const s = matrixToEuler(matrix(0.2, 0.1, 0.05, 3.7)); near(s.yaw, 0.2); near(s.pitch, 0.1); near(s.roll, 0.05);
});

test('the neutral: the mean is taken off, a weight at the neutral becomes 0 and the full stays 1, the head is a difference', () => {
  const n = averageNeutral([frame({ jawOpen: 0.1 }, [0.1, 0, 0]), frame({ jawOpen: 0.3 }, [0.3, 0, 0])]);
  near(n.b[BLENDSHAPES.indexOf('jawOpen')], 0.2); near(n.h[0], 0.2);
  const k = BLENDSHAPES.indexOf('jawOpen');
  near(subtractNeutral({ t: 0, ...frame({ jawOpen: 0.2 }, [0.5, 0, 0]) }, n).b[k], 0);
  near(subtractNeutral({ t: 0, ...frame({ jawOpen: 1 }) }, n).b[k], 1);
  near(subtractNeutral({ t: 0, ...frame({ jawOpen: 0.1 }) }, n).b[k], 0);
  near(subtractNeutral({ t: 0, ...frame({}, [0.5, 0, 0]) }, n).h[0], 0.3);
  assert.equal(subtractNeutral({ t: 1, ...frame() }, null).t, 1);
});

test('resampling to 30 fps: irregular camera times become an even grid, interpolated, holding at the edges', () => {
  const s = [0, 0.04, 0.09, 0.2, 0.31].map((t) => ({ t, b: BLENDSHAPES.map(() => t), h: [t, 0, 0] }));
  const out = resample(s, 30, 0.3);
  assert.equal(out.length, 9);
  out.forEach((f, i) => { near(f.t, i / 30); near(f.b[0], Math.min(i / 30, 0.31)); near(f.h[0], i / 30); });
  assert.equal(resample(s, 30, 1).at(-1).b[0], 0.31);   // holds after the last sample
});

test('the smoothing is centred: a step is spread but its middle does not move later', () => {
  const step = [0, 0, 0, 0, 1, 1, 1, 1], sm = smoothSeries(step, [1, 2, 1]);
  near(sm[3], 0.25); near(sm[4], 0.75); near(sm[3] + sm[4], 1);   // symmetric around the edge: no delay
  const impulse = smoothSeries([0, 0, 1, 0, 0], [1, 2, 3, 2, 1]);
  assert.ok(impulse[2] > impulse[1] && impulse[2] > impulse[3]); near(impulse[1], impulse[3]);
});

test('the mapping to the contract of the Jonas: each channel reads its blendshapes, with the gain', () => {
  const m = { channels: { jaw_open: { gain: 2 } } };
  const f = frame({ jawOpen: 0.3, eyeBlinkLeft: 1, eyeBlinkRight: 0, eyeWideLeft: 0.4, eyeWideRight: 0.4, eyeSquintLeft: 0.2, eyeSquintRight: 0.6, browInnerUp: 0.5, browOuterUpLeft: 0.2, browOuterUpRight: 0.4, browDownLeft: 0.1, browDownRight: 0.3, mouthSmileLeft: 0.8, mouthSmileRight: 0.6, mouthFrownLeft: 0.2, mouthFrownRight: 0.4, mouthPucker: 0.2, mouthFunnel: 0.7, cheekSquintLeft: 0.1, cheekSquintRight: 0.3 });
  const { morphs } = mapFrame(f, m);
  near(morphs.jaw_open, 0.6); near(morphs.blink, 0.5); near(morphs.eye_wide, 0.4); near(morphs.squint, 0.4); near(morphs.brow_worry, 0.5);
  near(morphs.brow_up, 0.3); near(morphs.brow_down, 0.2); near(morphs.smile, 0.7); near(morphs.frown, 0.3); near(morphs.mouth_narrow, 0.2); near(morphs.lips_funnel, 0.7); near(morphs.cheek, 0.2);
  assert.equal(mapFrame(frame({ jawOpen: 0.9 }), m).morphs.jaw_open, 1);   // clamped to 1
});

test('the lips: each of the new channels reads its blendshapes, and the funnel is no longer the narrow', () => {
  const { morphs } = mapFrame(frame({ mouthClose: 0.6, mouthFunnel: 0.5, mouthPucker: 0.1, mouthUpperUpLeft: 0.2, mouthUpperUpRight: 0.4, mouthLowerDownLeft: 0.3, mouthLowerDownRight: 0.1, mouthPressLeft: 0.5, mouthPressRight: 0.7, mouthLeft: 0.25, mouthRight: 0.05 }), {});
  near(morphs.lips_close, 0.6); near(morphs.lips_funnel, 0.5); near(morphs.mouth_narrow, 0.1); near(morphs.upper_lip_up, 0.3); near(morphs.lower_lip_down, 0.2);
  near(morphs.lips_press, 0.6); near(morphs.mouth_left, 0.25); near(morphs.mouth_right, 0.05);
  for (const src of ['webcam', 'livelink']) for (const c of ['lips_close', 'lips_funnel', 'upper_lip_up', 'lower_lip_down', 'lips_press', 'mouth_left', 'mouth_right']) assert.ok(resolveMapping(MAPPING, src).channels[c].gain > 0, `${src} ${c}`);
  for (const c of ['lips_close', 'lips_funnel', 'upper_lip_up', 'lower_lip_down', 'lips_press', 'mouth_left', 'mouth_right']) assert.equal(resolveMapping(MAPPING, 'livelink').channels[c].gain, 1);
  validateMapping(MAPPING_LIVE);   // the person's file has the new channels and is still of the accepted shape
  assert.ok(resolveMapping(MAPPING_LIVE, 'webcam').channels.lips_close);
});

test('the gaze is within the limits of the model, and to his left / up are positive', () => {
  const look = (o, m = { gaze: { gain: 5 } }) => mapFrame(frame(o), m).gaze;
  const left = look({ eyeLookOutLeft: 1, eyeLookInRight: 1 });
  assert.equal(left.x, GAZE_LIMITS.x);   // saturated at the limit, not past it
  assert.equal(look({ eyeLookInLeft: 1, eyeLookOutRight: 1 }).x, -GAZE_LIMITS.x);
  assert.equal(look({ eyeLookUpLeft: 1, eyeLookUpRight: 1 }).y, GAZE_LIMITS.up);
  assert.equal(look({ eyeLookDownLeft: 1, eyeLookDownRight: 1 }).y, -GAZE_LIMITS.down);
  near(look({ eyeLookOutLeft: 0.1, eyeLookInRight: 0.1 }, { gaze: { gain: 1 } }).x, 0.1 * GAZE_LIMITS.x);
  assert.equal(look({ eyeLookOutLeft: 1, eyeLookInRight: 1 }, { gaze: { gain: 1, xSign: -1 } }).x, -GAZE_LIMITS.x);
});

test('the head is limited and takes its signs', () => {
  const h = (v, m) => mapFrame(frame({}, v), m).head;
  const m = { head: { yawSign: -1, limit: { yaw: 0.5, pitch: 0.4, roll: 0.3 } } };
  assert.equal(h([2, 0, 0], m).yaw, -0.5); assert.equal(h([0, -3, 0], m).pitch, -0.4); assert.equal(h([0, 0, 3], m).roll, 0.3);
});

test('the mapping has one set of gains per source, and the iPhone starts at 1', () => {
  assert.equal(resolveMapping(MAPPING, 'webcam').channels.jaw_open.gain, 1.5);
  const lk = resolveMapping(MAPPING, 'livelink');
  for (const c of Object.values(lk.channels)) assert.equal(c.gain, 1);
  assert.equal(lk.gaze.gain, 1);
});

test('a take goes through the whole conversion: neutral off, 30 fps, mapped, with the right number of frames', () => {
  const fr = []; for (let i = 0; i <= 60; i++) { const t = i / 60; fr.push({ t, b: frame({ jawOpen: 0.1 + 0.4 * (t > 0.5 ? 1 : 0) }).b, h: [0.05, 0, 0] }); }
  const neutral = averageNeutral([frame({ jawOpen: 0.1 }, [0.05, 0, 0])]);
  const out = convertTake({ source: 'webcam', duration: 1, frames: fr }, neutral, MAPPING);
  assert.equal(out.n, 30); assert.equal(out.morphs.jaw_open.length, 30); assert.equal(out.head.yaw.length, 30);
  assert.equal(out.morphs.jaw_open[2], 0); assert.ok(out.morphs.jaw_open[29] > 0.5); assert.ok(Math.abs(out.head.yaw[10]) < 1e-9);
  // a step in the mouth does not move by more than one frame (30 fps) from where it happened
  const i = out.morphs.jaw_open.findIndex((v) => v > 0.3); assert.ok(Math.abs(i - 15) <= 1, `the mouth opens at frame ${i}`);
  assert.equal(normalizeName('JawOpen'), 'jawOpen'); assert.equal(normalizeName('Foo'), null);
});

// ---- the Live Link Face CSV: hand-made, with an empty cell, an extra column and a timecode with frames --------------------------------
const CSV = [
  'Timestamp,BlendShapeCount,EyeBlinkLeft,JawOpen,MouthSmileLeft,HeadYaw,HeadPitch,HeadRoll,Extra',
  '10:00:00:00.000,61,0.1,0.0,0.2,0.1,0.0,0.0,7',
  '10:00:00:01.000,61,0.2,,0.2,0.1,0.0,0.0,7',
  '10:00:00:02.000,61,0.3,0.6,0.2,0.2,0.0,0.0,7',
  '10:00:00:03.000,61,0.4,0.5,0.2,0.2,0.0,0.0,7',
].join('\n');

test('Live Link Face: timecodes, names in the MediaPipe form, empty cells counted and held, missing columns and extra ones tolerated', () => {
  near(parseTimecode('00:00:01:15.000', 30), 1.5); near(parseTimecode('00:00:01:30.000', 60), 1.5); near(parseTimecode('00:00:02.25'), 2.25); near(parseTimecode('3.5'), 3.5);
  const r = parseLiveLinkCsv(CSV);
  assert.equal(r.fps, 30); assert.equal(r.frames.length, 4); near(r.frames[1].t, 1 / 30, 1e-3); near(r.frames[3].t, 0.1, 1e-3);
  const jaw = BLENDSHAPES.indexOf('jawOpen'), blink = BLENDSHAPES.indexOf('eyeBlinkLeft');
  near(r.frames[2].b[jaw], 0.6); near(r.frames[1].b[jaw], 0);   // the empty one holds the last value
  near(r.frames[3].b[blink], 0.4);
  assert.deepEqual(r.missing, { jawOpen: 1 });
  assert.equal(r.extra, 2); assert.ok(r.hasHead); assert.ok(r.absent.includes('browInnerUp'));   // a column that is not there is reported, not fatal
  near(r.frames[2].h[0], 0.2);
  assert.equal(parseLiveLinkCsv(CSV, { fps: 60 }).fps, 60);
  assert.throws(() => parseLiveLinkCsv('A,B\n1,2'), /timecode/);
  const deg = parseLiveLinkCsv(CSV, { headDegrees: true }); near(deg.frames[2].h[0], 0.2 * Math.PI / 180);
  const r60 = parseLiveLinkCsv(['Timestamp,JawOpen', '10:00:00:00.0,0', '10:00:00:59.0,1'].join('\n')); assert.equal(r60.fps, 60);
});

test('Live Link Face: the imported take converts with the iPhone gains', () => {
  const r = parseLiveLinkCsv(CSV), dur = r.frames.at(-1).t + 1 / 30;
  const out = convertTake({ source: 'livelink', duration: dur, frames: r.frames }, null, MAPPING);
  assert.equal(out.n, 4); assert.ok(out.morphs.jaw_open[3] > 0.3 && out.morphs.jaw_open[3] <= 0.6);
});

// ---- STS: with the send swapped, never the real call -----------------------------------------------------------------------------------
function wavBytes(seconds, rate = 48000) {
  const n = Math.round(seconds * rate), b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0, 'latin1'); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8, 'latin1'); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36, 'latin1'); b.writeUInt32LE(n * 2, 40);
  return b;
}
test('STS: the duration and the cost come first, nothing is sent without --yes or on a dry run, and a different output length warns', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'sts-'));
  try {
    writeFileSync(path.join(dir, '01.wav'), wavBytes(6)); writeFileSync(path.join(dir, '03.wav'), wavBytes(54));
    near(wavSeconds(wavBytes(2.5)), 2.5); assert.deepEqual(estimate(60), { credits: 1000, usd: 0.12 });
    const logs = [], calls = [];
    const deps = { log: (l) => logs.push(l), send: async (a) => { calls.push(a); return Buffer.from('mp3'); }, probe: (f) => (f.includes('03') ? 54.2 : 6.01), readKey: () => 'SECRET-KEY' };
    let r = await runSts({ dir, ids: 'all', dryRun: true, yes: true }, deps);
    assert.equal(r.sent, false); assert.equal(calls.length, 0); near(r.seconds, 60); assert.equal(r.cost.credits, 1000);
    assert.ok(logs.some((l) => /60\.0 s in total/.test(l)) && logs.some((l) => /1000 credits/.test(l)));
    r = await runSts({ dir, ids: 'all' }, deps); assert.equal(r.sent, false); assert.equal(calls.length, 0);
    logs.length = 0; r = await runSts({ dir, ids: 'all', yes: true }, deps);
    assert.equal(calls.length, 2); assert.equal(calls[0].model, DEFAULT_MODEL); assert.equal(calls[0].voice, 'uNRH6oYhKWLYyXKl4HVH');
    assert.ok(logs.some((l) => /03\.jonas\.mp3.*WARNING/.test(l))); assert.ok(logs.some((l) => /01\.jonas\.mp3.*matches/.test(l)));
    assert.ok(!logs.join('\n').includes('SECRET-KEY'));
    assert.equal(readFileSync(path.join(dir, '01.jonas.mp3'), 'utf8'), 'mp3');
    await assert.rejects(runSts({ dir, ids: '99' }, deps), /no 99\.wav/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---- the server -------------------------------------------------------------------------------------------------------------------------
test('the server: only this machine, only the lines of the script, wav and face written to the folder', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'cap-')), script = path.join(dir, 's.json'), out = path.join(dir, 'out');
  writeFileSync(script, JSON.stringify({ lines: [{ id: '01', who: 'jonas', text: 'oi' }] }));
  const cap = createCaptureServer({ out, script, port: 0 });
  try {
    const port = await cap.listen(), base = `http://127.0.0.1:${port}`;
    assert.equal((await fetch(`${base}/api/script`)).status, 200);
    assert.equal((await fetch(`${base}/`)).status, 200);
    assert.equal((await fetch(`${base}/api/take/01/audio`, { method: 'PUT', body: wavBytes(0.1) })).status, 200);
    assert.equal((await fetch(`${base}/api/take/01/face`, { method: 'PUT', body: JSON.stringify({ frames: [] }) })).status, 200);
    assert.equal((await fetch(`${base}/api/take/02/audio`, { method: 'PUT', body: wavBytes(0.1) })).status, 404);
    assert.equal((await fetch(`${base}/api/take/..%2Fx/audio`, { method: 'PUT', body: wavBytes(0.1) })).status, 404);
    assert.equal((await fetch(`${base}/api/take/01/audio`, { method: 'PUT', body: 'not a wav' })).status, 400);
    assert.equal((await fetch(`${base}/api/neutral`, { method: 'PUT', body: JSON.stringify({ b: [1], h: [] }) })).status, 400);
    const spoof = await new Promise((res) => http.get({ host: '127.0.0.1', port, path: '/api/script', headers: { Host: 'evil.example' } }, (r) => { r.resume(); res(r.statusCode); }));
    assert.equal(spoof, 403);
    assert.equal((await fetch(`${base}/api/take/01/audio`, { method: 'PUT', body: wavBytes(0.1), headers: { Origin: 'http://evil.example' } })).status, 403);
    assert.equal(readFileSync(path.join(out, '01.wav')).length, 44 + 4800 * 2);
    assert.ok(JSON.parse(readFileSync(path.join(out, '01.face.json'), 'utf8')).frames);
  } finally { await cap.close(); rmSync(dir, { recursive: true, force: true }); }
});

// ---- Live Link Face over the network ------------------------------------------------------------------------------------------------------
import dgram from 'node:dgram';
import { parsePacket, buildPacket, LIVELINK_NAMES } from '../tools/capture/livelink.mjs';

test('the Live Link packet: the weights land in the MediaPipe slots, the head from Head*, malformed packets are refused, a odd count follows the sizes', () => {
  assert.equal(LIVELINK_NAMES.length, 61);
  const p = parsePacket(buildPacket({ values: { JawOpen: 0.5, EyeBlinkLeft: 1, BrowInnerUp: 0.25, TongueOut: 0.9, HeadYaw: 0.3, HeadPitch: -0.2, HeadRoll: 0.1 }, subject: 'Jonas', frame: 7, sub: 0.5, num: 60, den: 1 }));
  near(p.b[BLENDSHAPES.indexOf('jawOpen')], 0.5); near(p.b[BLENDSHAPES.indexOf('eyeBlinkLeft')], 1); near(p.b[BLENDSHAPES.indexOf('browInnerUp')], 0.25);
  assert.equal(p.b.length, BLENDSHAPES.length); near(p.h[0], 0.3); near(p.h[1], -0.2, 1e-6); near(p.h[2], 0.1);
  assert.equal(p.subject, 'Jonas'); assert.equal(p.fps, 60); near(p.frame, 7.5); assert.deepEqual(p.notes, []);
  assert.equal(parsePacket(Buffer.from('hello')), null); assert.equal(parsePacket(Buffer.alloc(0)), null); assert.equal(parsePacket(buildPacket().subarray(0, 40)), null);
  const odd = parsePacket(buildPacket({ values: { JawOpen: 0.4, HeadYaw: 0.2 }, version: 7, count: 70 }));   // a different version and count: reported, followed by the sizes
  near(odd.b[BLENDSHAPES.indexOf('jawOpen')], 0.4); near(odd.h[0], 0.2); assert.equal(odd.notes.length, 2);
  assert.equal(parsePacket(buildPacket({ count: 20 })), null);   // too few values to have a head
});

test('the server passes the UDP frames of the iPhone on by Server-Sent Events, counts the ignored ones, and saves nothing', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'cap-')), script = path.join(dir, 's.json'), out = path.join(dir, 'out'), logs = [];
  writeFileSync(script, JSON.stringify({ lines: [{ id: '01', who: 'jonas', text: 'oi' }] }));
  const cap = createCaptureServer({ out, script, port: 0, livelinkPort: 0, log: (l) => logs.push(l) });
  const sock = dgram.createSocket('udp4');
  try {
    const port = await cap.listen(), udp = cap.udpPort();
    assert.ok(udp > 0);
    const got = []; let buf = '';
    const stream = await new Promise((res) => { const r = http.get({ host: '127.0.0.1', port, path: '/livelink/stream' }, (rs) => { rs.setEncoding('utf8'); rs.on('data', (c) => { buf += c; for (const m of buf.matchAll(/data: (.*)\n\n/g)) got.push(JSON.parse(m[1])); buf = buf.slice(buf.lastIndexOf('\n\n') + 2); }); res(r); }); });
    await new Promise((r) => setTimeout(r, 100));
    const send = (b) => new Promise((r) => sock.send(b, udp, '127.0.0.1', r));
    await send(Buffer.from('garbage')); await send(buildPacket({ values: { JawOpen: 0.75, HeadYaw: 0.25 } }));
    for (let i = 0; i < 50 && !got.length; i++) await new Promise((r) => setTimeout(r, 50));
    assert.equal(got.length, 1); near(got[0].b[BLENDSHAPES.indexOf('jawOpen')], 0.75); near(got[0].h[0], 0.25); assert.ok(Math.abs(got[0].at - Date.now()) < 5000); assert.equal(got[0].ip, '127.0.0.1');
    assert.equal(cap.stats.ignored, 1); assert.equal(cap.stats.received, 1);
    assert.ok(logs.some((l) => /first packet from 127\.0\.0\.1/.test(l)));
    assert.equal(readdirSync(out).length, 0);   // nothing is written by the receiver
    stream.destroy();
  } finally { sock.close(); await cap.close(); rmSync(dir, { recursive: true, force: true }); }
});

// ---- the live Jonas: the same mapping, causal; the mapping file's format; the game served read-only ----------------------------------------
import { createLiveMapper, validateMapping } from '../tools/capture/lib.mjs';

test('the live mapper gives what the cutscene gives for a steady face, and never looks ahead', () => {
  const src = frame({ jawOpen: 0.3, mouthSmileLeft: 0.4, mouthSmileRight: 0.4, eyeLookOutLeft: 0.2, eyeLookInRight: 0.2 }, [0.1, 0.05, 0]), neutral = averageNeutral([frame({ jawOpen: 0.05 }, [0.02, 0, 0])]);
  const live = createLiveMapper(MAPPING, 'webcam', neutral); let out;
  for (let i = 0; i < 6; i++) out = live.push(src);
  const ref = mapFrame(subtractNeutral({ t: 0, ...src }, neutral), resolveMapping(MAPPING, 'webcam'));
  near(out.morphs.jaw_open, ref.morphs.jaw_open); near(out.morphs.smile, ref.morphs.smile); near(out.gaze.x, ref.gaze.x); near(out.head.yaw, ref.head.yaw);
  // a step in the mouth: the first frame after it is already moving (not late by more than the smoothing) and nothing moves before it
  const l2 = createLiveMapper(MAPPING, 'livelink'); const seq = [0, 0, 0, 1, 1, 1].map((j) => l2.push(frame({ jawOpen: j }))).map((o) => o.morphs.jaw_open);
  assert.equal(seq[2], 0); assert.ok(seq[3] > 0 && seq[3] < seq[4] && seq[5] >= seq[4]);
  assert.ok(createLiveMapper(MAPPING, 'livelink').mapping.channels.jaw_open.gain === 1);
});

test('the mapping file: the saved one is valid, and a wrong shape is refused', () => {
  validateMapping(MAPPING);
  validateMapping(MAPPING_LIVE);   // the tuned file in use must stay valid
  const bad = (f) => { const m = JSON.parse(JSON.stringify(MAPPING)); f(m); assert.throws(() => validateMapping(m), /bad mapping/); };
  bad((m) => { m.extra = 1; }); bad((m) => { m.sources.webcam.head.yawSign = 2; }); bad((m) => { m.sources.webcam.channels.jaw_open.gain = 99; });
  bad((m) => { m.sources.webcam.channels.nope = { gain: 1 }; }); bad((m) => { m.sources.other = {}; }); bad((m) => { m.sources.webcam.gaze.gain = '1'; }); bad((m) => { m.smooth.face = [1, 2]; });
  assert.throws(() => validateMapping(null), /bad mapping/);
});

test('the server serves the game read-only (src, vendor, assets/models only, never tools or the rest) and saves only a valid mapping', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'cap-')), script = path.join(dir, 's.json'), mapFile = path.join(dir, 'mapping.json');
  writeFileSync(script, JSON.stringify({ lines: [] })); writeFileSync(mapFile, JSON.stringify(MAPPING));
  const cap = createCaptureServer({ out: path.join(dir, 'out'), script, port: 0, mappingFile: mapFile });
  try {
    const port = await cap.listen(), base = `http://127.0.0.1:${port}`;
    const raw = (p) => new Promise((res) => http.get({ host: '127.0.0.1', port, path: p }, (r) => { r.resume(); res(r.statusCode); }));
    assert.equal(await raw('/game/src/models/jonas.js'), 200); assert.equal(await raw('/game/vendor/three/three.module.js'), 200); assert.equal(await raw('/game/assets/models/jonas.glb'), 200); assert.equal(await raw('/game/data/cutscenes/radio-teste.json'), 200); assert.equal(await raw('/game/data/scenes/galeria.json'), 200); assert.equal(await raw('/director.html'), 200);
    for (const p of ['/game/tools/capture/server.mjs', '/game/data/story/secrets.json', '/game/data/', '/game/data/cutscenes/../story/secrets.json', '/game/assets/props/../audio/cena-radio.mp3', '/game/README.md', '/game/src/../tools/capture/mapping.json', '/game/%2e%2e/%2e%2e/etc/passwd', '/game/src/%2e%2e/%2e%2e/tools/capture/lib.mjs', '/game/src/', '/game/assets/audio/cena-radio.mp3', '/game/src/%00x.js']) assert.notEqual(await raw(p), 200, p);
    assert.equal((await fetch(`${base}/api/mapping`)).status, 200);
    const put = (b) => fetch(`${base}/api/mapping`, { method: 'PUT', body: typeof b === 'string' ? b : JSON.stringify(b) });
    const m = JSON.parse(JSON.stringify(MAPPING)); m.sources.webcam.channels.jaw_open.gain = 2.25;
    assert.equal((await put(m)).status, 200); assert.equal(JSON.parse(readFileSync(mapFile, 'utf8')).sources.webcam.channels.jaw_open.gain, 2.25);
    assert.equal((await put({ ...m, evil: 1 })).status, 400); assert.equal((await put('not json')).status, 400);
    assert.equal(JSON.parse(readFileSync(mapFile, 'utf8')).sources.webcam.channels.jaw_open.gain, 2.25);   // the bad ones changed nothing
  } finally { await cap.close(); rmSync(dir, { recursive: true, force: true }); }
});
