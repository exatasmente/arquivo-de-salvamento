// The recorded sound effects: the seeded pick of a variation, the fallback when a file is missing, the routes against the files, the rooms. Run: node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { rng, hash } from '../vendor/engine/sound.js';
import { ROUTES, SAMPLE_NAMES, createSamples, pickVariant, variantsOf } from '../src/audio/samples.js';
import { NAMES } from '../src/audio/index.js';
import { makeImpulse, SPACES, resolveSpace } from '../src/audio/space.js';

const SFX = new URL('../assets/audio/sfx/', import.meta.url);
const MANIFEST = JSON.parse(readFileSync(new URL('manifest.json', SFX), 'utf8'));
const MINI = { a: { file: 'a.mp3', dur: 3, slices: [[0.1, 0.4], [0.8, 1.2], [1.6, 2.1]] }, b: { file: 'b.mp3', dur: 1.5 } };

/** A context that records what is played: enough of an AudioContext for the sample player. */
function fakeCtx() {
  const calls = [];
  const param = () => ({ value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
  return {
    calls, currentTime: 0,
    decodeAudioData(ab, ok) { const b = { duration: 3, bytes: ab.byteLength }; ok?.(b); return Promise.resolve(b); },
    createBufferSource() { return { buffer: null, loop: false, playbackRate: param(), connect() {}, start: (...a) => calls.push(['start', ...a]), stop: (...a) => calls.push(['stop', ...a]) }; },
    createGain() { return { gain: param(), connect() {} }; },
  };
}
const okFetch = (files) => async (url) => {
  const name = String(url).split('/').pop();
  return files.includes(name) ? { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(16), json: async () => MINI } : { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0), json: async () => ({}) };
};
const ROUTES_MINI = { ids: ['a', 'b'], g: 0, pitch: 0.06, vol: 2 };

test('the pick of a variation is seeded: the same seed gives the same sequence, another seed gives another, and it never repeats back to back', () => {
  const pool = variantsOf(ROUTES_MINI, MINI);
  assert.equal(pool.length, 4, 'three slices of a and the whole of b');
  const run = (seed) => { const r = rng(hash('passo', seed)); let last = null; const out = []; for (let i = 0; i < 40; i++) { last = pickVariant(r, pool, last); out.push(`${last.id}${last.slice}`); } return out; };
  assert.deepEqual(run(7), run(7));
  assert.notDeepEqual(run(7), run(8));
  const seq = run(3); for (let i = 1; i < seq.length; i++) assert.notEqual(seq[i], seq[i - 1], 'not the same hit twice in a row');
  assert.ok(new Set(seq).size >= 3, 'the variations are all used');
  assert.equal(pickVariant(rng(1), []), null);
  assert.equal(pickVariant(rng(1), [pool[0]], pool[0]).id, 'a', 'with one choice it is that one');
});

test('the same seed plays the same slice at the same pitch and level', async () => {
  const play = async (seed) => {
    const ctx = fakeCtx(), s = createSamples(ctx, { base: 'x/', fetchFn: okFetch(['manifest.json', 'a.mp3', 'b.mp3']) });
    const routes = ROUTES; routes.__t = ROUTES_MINI;
    await s.preload(['__t']);
    const r = rng(hash('__t', seed)), out = [];
    for (let i = 0; i < 6; i++) { s.play('__t', { r, at: i, dest: {} }); }
    delete routes.__t;
    return ctx.calls.filter((c) => c[0] === 'start');
  };
  assert.deepEqual(await play(5), await play(5));
  assert.notDeepEqual(await play(5), await play(6));
});

test('a missing file or manifest is not an error: nothing plays, the name is not ready, and the game keeps its synthesised sound', async () => {
  ROUTES.__f = ROUTES_MINI;
  try {
    // the manifest is there, one file is not
    const ctx = fakeCtx(), s = createSamples(ctx, { base: 'x/', fetchFn: okFetch(['manifest.json', 'a.mp3']) });
    assert.equal(s.ready('__f'), false, 'not loaded yet');
    assert.equal(s.play('__f', { at: 0, dest: {} }), 0, 'asked before it is loaded: it starts loading and plays nothing');
    await s.preload(['__f']);
    assert.equal(s.ready('__f'), true, 'a is there');
    assert.ok(s.play('__f', { r: rng(1), at: 0, dest: {} }) > 0);
    for (let i = 0; i < 20; i++) s.play('__f', { r: rng(i + 1), at: i, dest: {} });
    assert.ok(ctx.calls.every((c) => c[0] !== 'start' || typeof c[2] === 'number'));
    // nothing is there
    const none = createSamples(fakeCtx(), { base: 'x/', fetchFn: okFetch([]) });
    await none.preload(['__f']);
    assert.equal(none.ready('__f'), false); assert.equal(none.play('__f', { at: 0, dest: {} }), 0); assert.equal(none.loop('__f', { at: 0, dest: {} }), null);
    // a network that fails outright
    const down = createSamples(fakeCtx(), { base: 'x/', fetchFn: async () => { throw new Error('offline'); } });
    await down.preload(['__f']);
    assert.equal(down.ready('__f'), false); assert.equal(down.play('__f', { at: 0, dest: {} }), 0);
    // a file that does not decode
    const bad = fakeCtx(); bad.decodeAudioData = (ab, ok, no) => { no?.(new Error('bad data')); return Promise.reject(new Error('bad data')); };
    const broken = createSamples(bad, { base: 'x/', fetchFn: okFetch(['manifest.json', 'a.mp3', 'b.mp3']) });
    await broken.preload(['__f']);
    assert.equal(broken.ready('__f'), false); assert.equal(broken.play('__f', { at: 0, dest: {} }), 0);
  } finally { delete ROUTES.__f; }
});

test('every route points at files that exist and are in the manifest, and every routed name also has a synthesised sound to fall back on', () => {
  for (const [name, rt] of Object.entries(ROUTES)) {
    assert.ok(NAMES.includes(name), `${name} has a synthesised sound`);
    for (const id of rt.ids) {
      assert.ok(MANIFEST[id], `${name}: ${id} is in the manifest`);
      assert.ok(existsSync(new URL(MANIFEST[id].file, SFX)), `${name}: ${MANIFEST[id].file} exists`);
      if (rt.loop) assert.equal(MANIFEST[id].loop, true, `${id} is a loop`);
      else for (const [a, b] of MANIFEST[id].slices ?? []) assert.ok(a >= 0 && b > a && b <= MANIFEST[id].dur + 0.01, `${id}: a slice inside the file`);
    }
  }
  assert.ok(SAMPLE_NAMES.length >= 30);
  let bytes = 0; for (const m of Object.values(MANIFEST)) bytes += readFileSync(new URL(m.file, SFX)).length;
  assert.ok(bytes < 6e6, `the recordings stay small (${(bytes / 1e6).toFixed(1)} MB)`);
});

test('the rooms: an impulse is deterministic, has unit energy, and a longer room is longer', () => {
  const a = makeImpulse(48000, SPACES.estacao, 1), b = makeImpulse(48000, SPACES.estacao, 1), c = makeImpulse(48000, SPACES.poco, 1);
  assert.deepEqual(a[0].slice(0, 2000), b[0].slice(0, 2000));
  const energy = (ir) => (ir[0].reduce((s, v) => s + v * v, 0) + ir[1].reduce((s, v) => s + v * v, 0)) / 2;
  assert.ok(Math.abs(energy(a) - 1) < 1e-3 && Math.abs(energy(c) - 1) < 1e-3);
  assert.ok(a[0].length > c[0].length);
  assert.notDeepEqual(a[0].slice(0, 2000), a[1].slice(0, 2000), 'the two ears are not the same noise');
  assert.equal(resolveSpace('galeria'), 'estacao'); assert.equal(resolveSpace('inexistente'), 'estacao');
});
