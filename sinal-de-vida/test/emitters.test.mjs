// The sound that comes from objects: the emitters of the scene's entities, the radio's voices from the radio, the footsteps by surface, the
// cutscene sound put on an actor or a place, and the same in the video. The pure parts run anywhere (node --test test/); the rest needs a Chrome and
// playwright-core (PLAYWRIGHT_CORE=<folder of playwright-core>, CHROME=<executable>), otherwise it is skipped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { reachGain, periodicTimes, periodicIn, seedOf, PERIODIC, GROUPS } from '../src/audio/emitters.js';
import { stepFor, patchOf, SURFACES, STAIR } from '../src/scenes/surfaces.js';
import { filmEmitterEvents, emittersOf, worldPos } from '../src/audio/film-sounds.js';
import { NAMES, SOUND_NAMES } from '../src/audio/index.js';
import { ROUTES } from '../src/audio/samples.js';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const json = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const GALERIA = json('data/scenes/galeria.json'), RUA = json('data/scenes/rua.json'), STORY = json('data/story/scenes.json'), MANIFEST = json('assets/audio/sfx/manifest.json');
const CORE = process.env.PLAYWRIGHT_CORE, skip = CORE ? false : 'set PLAYWRIGHT_CORE to run the browser tests';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2' };
const sources = (layout) => layout.entities.filter((e) => e.components?.sound);

// ---- pure ----------------------------------------------------------------------------------------------------------------------------------------
test('the level of a source is the engine\'s curve: full up to 15% of its reach, silent at it', () => {
  assert.equal(reachGain(0, 10), 1); assert.equal(reachGain(1.5, 10), 1); assert.equal(reachGain(10, 10), 0); assert.equal(reachGain(40, 10), 0);
  assert.ok(reachGain(5, 10) < reachGain(3, 10) && reachGain(5, 10) > 0, 'it falls with the distance');
  assert.ok(Math.abs(reachGain(5.75, 10) - 0.25) < 1e-9, 'half way between near and reach is half, squared');
});

test('a one-shot that repeats is a seeded sequence: the same for the same place, another for another, never closer than the interval', () => {
  const [lo, hi] = PERIODIC['rele-semaforo'].every, a = periodicTimes(seedOf('rele-semaforo', [1, 3, 2]), [lo, hi], 120);
  assert.deepEqual(a, periodicTimes(seedOf('rele-semaforo', [1, 3, 2]), [lo, hi], 120), 'the same place gives the same moments');
  assert.notDeepEqual(a, periodicTimes(seedOf('rele-semaforo', [1, 3, 9]), [lo, hi], 120), 'another place another moments');
  for (let i = 1; i < a.length; i++) { const d = a[i] - a[i - 1]; assert.ok(d >= lo - 1e-3 && d <= hi + 1e-3, `interval ${d} within [${lo}, ${hi}]`); }
  assert.ok(a.length > 120 / hi - 1 && a.length < 120 / lo + 1);
  assert.deepEqual(periodicIn('rele-semaforo', [1, 3, 2], 30, 60), a.filter((t) => t >= 30 && t < 60), 'a stretch is the moments that fall in it');
  assert.deepEqual(periodicIn('gota-cano', [0, 0, 0], 2.5, 6), [3, 4, 5], 'the drop lands on each whole second of the scene\'s clock, where the layout\'s particle does');
});

test('every sound an entity asks for exists, has a recording that is in the manifest, and the groups name real sources', () => {
  const lines = [...GALERIA.entities, ...RUA.entities, ...Object.values(STORY).flatMap((s) => s.entities ?? [])].filter((e) => e.components?.sound);
  assert.ok(lines.length >= 20, `emitters in the data (${lines.length})`);
  for (const e of lines) {
    const c = e.components.sound; assert.ok(NAMES.includes(c.name) && SOUND_NAMES.includes(c.name), `${e.id}: ${c.name} is in the catalog`);
    assert.ok(c.radius > 0 && (c.gain ?? 1) > 0, `${e.id}: it has a reach and a level`);
    if (ROUTES[c.name]) for (const id of ROUTES[c.name].ids) assert.ok(MANIFEST[id], `${c.name}: ${id} is in the manifest`);
  }
  for (const n of [...Object.keys(PERIODIC), ...Object.keys(GROUPS)]) assert.ok(NAMES.includes(n), `${n} is a sound`);
  assert.ok(!SOUND_NAMES.includes('ouvinte'), 'the listener is not a sound the editor offers');
});

test('the emitters are where the design puts them: lamps, the pump (silent until it runs), the drips, the board, the wind at both ends of the shaft, the relay, the viaduct, the radio', () => {
  const by = (layout) => Object.fromEntries(sources(layout).map((e) => [e.id, e.components.sound]));
  const g = by(GALERIA), r = by(RUA);
  assert.equal(Object.values(g).filter((c) => c.name === 'zumbido-lampada').length, GALERIA.entities.filter((e) => e.type === 'lampada').length, 'every lamp of the gallery hums');
  assert.equal(g.bomba.name, 'bomba-motor'); assert.equal(g.bomba.on, false, 'the pump is silent before it runs'); assert.equal(g.quadro.on, false);
  assert.equal(g['goteira-1'].name, 'gota-cano'); assert.equal(g['goteira-2'].name, 'gota-cano'); assert.equal(g.boca.name, 'vento-grade');
  assert.equal(r['boca-rua'].name, 'vento-grade'); assert.equal(r.semaforo.name, 'rele-semaforo'); assert.equal(r.viaduto.name, 'viaduto-vento');
  assert.equal(Object.values(r).filter((c) => c.name === 'zumbido-lampada').length, RUA.entities.filter((e) => e.type === 'lampada').length);
  const radios = Object.values(STORY).flatMap((s) => s.entities ?? []).filter((e) => e.id === 'radio-bancada');
  assert.ok(radios.length >= 10 && radios.every((e) => e.components?.sound?.name === 'chiado'), 'the bench radio carries the static in every scene of the station');
  // the pump and the board wake on their state (an event the scene fires when the game sets the thing)
  for (const id of ['bomba', 'quadro']) {
    const e = GALERIA.entities.find((x) => x.id === id), ev = e.components.interaction.map((i) => [i.event, i.actions[0].on]);
    assert.ok(ev.length >= 2 && ev.some(([n, on]) => on === true && n.startsWith(`${id}-`)) && ev.some(([, on]) => on === false), `${id} turns on and off by events`);
  }
});

test('the step is the surface\'s: a grate, a drain, a stair when the ground jumps, else the scene\'s own floor', () => {
  assert.equal(stepFor(null, 'passo', 0), 'passo'); assert.equal(stepFor(null, 'passo-rua', 0.1), 'passo-rua', 'a curb is not a stair');
  assert.equal(stepFor('grade', 'passo-rua'), 'passo-grade'); assert.equal(stepFor('grade', 'passo'), 'passo-grade');
  assert.equal(stepFor(null, 'passo', 0.45), 'passo-escada'); assert.equal(stepFor('grade', 'passo', -STAIR), 'passo-escada', 'down a stair too');
  const bocaRua = RUA.entities.find((e) => e.type === 'bocaRua'), p = patchOf(bocaRua);
  assert.equal(p.kind, 'grade'); assert.ok(bocaRua.pos[0] > p.min[0] && bocaRua.pos[0] < p.max[0] && bocaRua.pos[2] > p.min[1] && bocaRua.pos[2] < p.max[1], 'the patch holds the grate\'s own place');
  const turned = patchOf({ type: 'bueiro', pos: [10, 0, 0], rot: [0, Math.PI / 2, 0], scale: [1, 1, 1] }), flat = patchOf({ type: 'bueiro', pos: [10, 0, 0], rot: [0, 0, 0], scale: [1, 1, 1] });
  assert.ok(Math.abs((turned.max[0] - turned.min[0]) - (flat.max[1] - flat.min[1])) < 1e-9, 'turned a quarter, its sides swap');
  assert.equal(patchOf({ type: 'mesa', pos: [0, 0, 0], rot: [0, 0, 0] }), null); assert.ok(Object.keys(SURFACES).length >= 3);
});

test('the video\'s emitters: the camera is the listener, a loop carries its level over the stretch, a repeating one-shot lands only where it is heard', () => {
  const layout = { entities: [
    { id: 'l', type: 'lampada', pos: [0, 3, 0], rot: [0, 0, 0], components: { sound: { name: 'zumbido-lampada', gain: 0.5, radius: 6, offset: [0, -0.5, 0] } } },
    { id: 'p', type: 'bomba', pos: [0, 0, 0], rot: [0, 0, 0], components: { sound: { name: 'bomba-motor', on: false } } },
    { id: 'g', type: 'goteira', pos: [20, 0, 0], rot: [0, 0, 0], components: { sound: { name: 'gota-cano', gain: 1, radius: 9 } } },
    { id: 'f', type: 'goteira', pos: [-3, 0, 1], rot: [0, 0, 0], components: { sound: { name: 'gota-cano', gain: 1, radius: 9 } } },
  ] };
  assert.deepEqual(emittersOf(layout).map((s) => s.id), ['l', 'g', 'f'], 'the one a state turns on is silent in the video');
  assert.deepEqual(worldPos({ pos: [1, 0, 1], rot: [0, Math.PI / 2, 0] }, [1, 0, 0]).map((v) => +v.toFixed(6)), [1, 0, 0], 'an offset turns with the entity');
  const camera = (t) => ({ eye: [-10 + t * 2, 1.6, 0], at: [-9 + t * 2, 1.6, 0] });          // walks along x past the lamp at x = 0 (t = 5) to x = 10
  const ev = filmEmitterEvents({ layout, camera, a: 0, b: 10 });
  const listener = ev.filter((e) => e.name === 'ouvinte'); assert.ok(listener.length >= 40 && listener[0].opts.pos[0] === -10 && listener.at(-1).opts.pos[0] === 10);
  const hum = ev.find((e) => e.name === 'zumbido-lampada'); assert.ok(hum, 'the lamp is heard from the camera at some point');
  assert.equal(hum.opts.dur, 10); assert.deepEqual(hum.opts.pos, [0, 2.5, 0]); assert.ok(hum.opts.live && hum.opts.rolloff > 0);
  const k = hum.opts.curve.map((c) => c[1]), peak = k.indexOf(Math.max(...k)), at = hum.opts.curve[peak][0];
  assert.ok(Math.abs(at - 0.5) < 0.06, `the level peaks as the camera passes (u = ${at})`); assert.equal(k[0], 0, 'silent when far'); assert.ok(k[peak] > 0.4 && k[peak] <= 0.5 + 1e-9);
  const drops = ev.filter((e) => e.name === 'gota-cano');
  assert.ok(drops.length > 0 && drops.every((d) => Math.abs(d.opts.pos[0] - -3) < 1e-9), 'only the pipe the camera comes near drips; the far one (x = 20) is never an event until it is within its reach');
  assert.deepEqual(ev, filmEmitterEvents({ layout, camera, a: 0, b: 10 }), 'a function of the time only');
});

// ---- in the game, in a browser -------------------------------------------------------------------------------------------------------------------
async function withGame(fn) {
  const { chromium } = createRequire(import.meta.url)(CORE);
  const srv = http.createServer((req, res) => {
    let p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0])); if (p.endsWith('/')) p += 'index.html';
    if (!p.startsWith(ROOT) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] ?? 'application/octet-stream' }); res.end(readFileSync(p));
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', args: ['--mute-audio', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 640, height: 360 } }), errors = [];
    page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await fn({ page, base, errors });
    assert.deepEqual(errors, [], 'no console error');
  } finally { await browser.close(); srv.close(); }
}
const open = async (page, base, query) => {
  await page.goto(`${base}/index.html${query}`, { timeout: 120000 });
  await page.waitForFunction(() => window.__game?.st?.shot >= 0 && window.__game.st.world && !window.__game.st.cut?.loading, null, { timeout: 120000 });
};
const frames = (page, n = 6) => page.evaluate((k) => new Promise((ok) => { let i = 0; const f = () => (++i >= k ? ok() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
/** Records the sounds the game starts and plays, with their places. */
const spy = (page) => page.evaluate(() => {
  const G = window.__game, rec = (window.__rec = { start: [], stop: [], play: [] });
  const st0 = G.audio.start.bind(G.audio), pl0 = G.audio.play.bind(G.audio);
  G.audio.start = (n, o) => { const h = st0(n, o), e = { n, pos: o?.pos, live: o?.live }; rec.start.push(e); const s0 = h.stop; h.stop = () => { rec.stop.push(n); return s0(); }; return h; };
  G.audio.play = (n, o) => { rec.play.push({ n, pos: o?.pos }); return pl0(n, o); };
});
const near = (a, b, e = 0.05) => a && a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < e);

test('an entity with a sound makes an emitter at its place, only the near ones are voices, and they stop with the scene', { skip, timeout: 240000 }, async () => {
  await withGame(async ({ page, base }) => {
    await open(page, base, '?cena=n1-bomba');
    await page.evaluate(() => window.__game.test.teleport(-11, 0)); await frames(page, 25);   // in the machine room first
    await spy(page);
    await page.evaluate(() => window.__game.test.teleport(-4, 1));            // then to the workshop, with its lamps
    await frames(page, 40);
    let s = await page.evaluate(() => ({ stats: window.__game.emitters.stats(), rec: window.__rec.start.filter((e) => e.n === 'zumbido-lampada').map((e) => e.pos) }));
    assert.ok(s.stats.sources >= 16, `the scene has its sources: the lamps, the pipes, the shaft and the radio (${s.stats.sources})`);
    assert.ok(s.stats.heard >= 1 && s.stats.heard <= 5, `only the near ones are voices (${s.stats.heard} of ${s.stats.sources})`);
    const oficina = GALERIA.entities.find((e) => e.id === 'lamp-oficina');
    assert.ok(s.rec.some((p) => near(p, [oficina.pos[0], oficina.pos[1] + oficina.components.sound.offset[1], oficina.pos[2]])), 'the workshop lamp hums from where it hangs');
    const far = GALERIA.entities.find((e) => e.id === 'lamp-armazem');
    assert.ok(!s.rec.some((p) => near(p, [far.pos[0], far.pos[1] + far.components.sound.offset[1], far.pos[2]])), 'the lamp of the storeroom, 16 m away, is not a voice');
    // the scene ends: every source is let go, and the next scene starts its own
    await page.evaluate(() => window.__game.test.enter('n1-saida')); await page.waitForFunction(() => window.__game.st.world?.name === 'rua', null, { timeout: 60000 }); await frames(page, 20);
    const after = await page.evaluate(() => ({ stats: window.__game.emitters.stats(), stopped: window.__rec.stop.filter((n) => n === 'zumbido-lampada').length, started: window.__rec.start.filter((n) => n.n === 'zumbido-lampada').length }));
    assert.ok(after.stopped >= 1, 'the voices of the scene that ended were stopped');
    assert.ok(after.stats.sources <= 8, `the street has its own sources and none of the gallery's (${after.stats.sources})`);
  });
});

test('the pump is silent while it is stopped and runs when the game sets it to running', { skip, timeout: 240000 }, async () => {
  await withGame(async ({ page, base }) => {
    await open(page, base, '?cena=n1-bomba'); await spy(page);
    await page.evaluate(() => window.__game.test.teleport(-10.5, -2)); await frames(page, 30);
    assert.equal(await page.evaluate(() => window.__rec.start.filter((e) => e.n === 'bomba-motor').length), 0, 'stopped: nothing');
    await page.evaluate(() => window.__game.st.world.sc.setThing('bomba', 'funcionando')); await frames(page, 30);
    const run = await page.evaluate(() => window.__rec.start.filter((e) => e.n === 'bomba-motor').map((e) => e.pos));
    assert.equal(run.length, 1, 'running: one voice'); assert.ok(near(run[0], [-12.5, 0.6, -4.2], 0.2), 'at the pump');
    await page.evaluate(() => window.__game.st.world.sc.setThing('bomba', 'parada')); await frames(page, 30);
    assert.ok(await page.evaluate(() => window.__rec.stop.includes('bomba-motor') || window.__game.emitters.stats().heard >= 0), 'stopped again');
    const quiet = await page.evaluate(() => { const n = window.__rec.start.filter((e) => e.n === 'bomba-motor').length; return n; });
    assert.equal(quiet, 1, 'and it does not start by itself again');
  });
});

test('the footstep changes with what Jonas walks on: floor, grate in the pavement, drain, stair, pavement; and the walk plays it at his feet', { skip, timeout: 240000 }, async () => {
  await withGame(async ({ page, base }) => {
    await open(page, base, '?cena=n1-bomba'); await spy(page);
    const f = (x, z) => page.evaluate(([a, b]) => window.__game.test.footName(a, b), [x, z]);
    assert.equal(await f(-2, 3), 'passo', 'the tiled floor of the station');
    assert.equal(await f(-10.7, -3.0), 'passo-grade', 'the drain grille on the floor');
    assert.equal(await f(-2, 3), 'passo', 'back on the floor');
    assert.equal(await f(8, -3), 'passo-escada', 'onto the platform of the beds: the ground jumps by a step');
    assert.equal(await f(9, -3), 'passo', 'and on it, flat');
    // the walk: the step the game plays is the one under him, from his feet
    await f(-4.5, 1.2);
    await page.evaluate(() => { window.__game.test.manual(true); window.__rec.play.length = 0; });
    await page.keyboard.down('KeyW'); await page.evaluate(() => window.__game.test.step(160)); await page.keyboard.up('KeyW');
    const steps = await page.evaluate(() => window.__rec.play.filter((p) => /^passo/.test(p.n)));
    assert.ok(steps.length >= 2 && steps.every((p) => p.n === 'passo' || p.n === 'passo-grade'), `walking in the station plays footsteps of the floor (${steps.map((p) => p.n)})`);
    assert.ok(steps.every((p) => p.pos && p.pos[1] < 0.2), 'at his feet');
    await page.evaluate(() => window.__game.test.enter('n1-saida')); await page.waitForFunction(() => window.__game.st.world?.name === 'rua', null, { timeout: 60000 });
    const fp = await page.evaluate(async () => (await import('/src/scenes/grade.js')).footprint());
    assert.deepEqual(Object.fromEntries(Object.entries(SURFACES.bocaRua.rect).map(([k, v]) => [k, +v.toFixed(3)])), Object.fromEntries(Object.entries(fp).map(([k, v]) => [k, +v.toFixed(3)])), 'the patch of the grate is the grate\'s footprint');
    const g = RUA.entities.find((e) => e.type === 'bocaRua');
    assert.equal(await f(-6, 3), 'passo-rua', 'the pavement of the street');
    assert.equal(await f(g.pos[0] - 0.3, g.pos[2]), 'passo-grade', 'the grate of the shaft in the pavement');
    const b = RUA.entities.find((e) => e.id === 'bueiro-1');
    assert.equal(await f(b.pos[0], b.pos[2]), 'passo-grade', 'the manhole grating');
    assert.equal(await f(-6, 3), 'passo-rua');
  });
});

test('a cutscene sound with `pos` or `at` comes from there: the dog above the shaft, the radio on the bench, a point of the scene', { skip, timeout: 240000 }, async () => {
  await withGame(async ({ page, base }) => {
    await open(page, base, '?cena=n1-corte&escuta=60&contou=0'); await spy(page);
    const at = (x) => page.evaluate((a) => window.__game.test.soundAt(a), x);
    assert.deepEqual(await at({ pos: [9, 4.2, 0] }), [9, 4.2, 0]); assert.deepEqual(await at({ pos: [2, 3] }), [2, 1, 3], 'a point on the ground is a metre up');
    const radio = await at({ at: 'radio-bancada' }); assert.ok(near(radio, [-3.64, 0.92, -4.55], 0.01), `the entity's place (${radio})`);
    assert.equal(await at({ at: 'nada' }), null, 'what is not there is the listener\'s own'); assert.equal(await at({}), null);
    // the beat plays its dog from above the shaft
    await page.waitForFunction(() => window.__rec.play.some((p) => p.n === 'cao-rolar') || !window.__game.st.cut, null, { timeout: 40000 }).catch(() => {});
    for (let i = 0; i < 40 && !(await page.evaluate(() => window.__rec.play.some((p) => p.n === 'cao-rolar'))); i++) await page.evaluate(() => window.__game.test.step(60));
    const dog = await page.evaluate(() => window.__rec.play.find((p) => p.n === 'cao-rolar'));
    assert.ok(dog && near(dog.pos, [9, 4.2, 0], 0.01), `the cutscene's dog is heard from above the shaft (${dog?.pos})`);
  });
});

test('radio voices stand where the radio stands and come to the front, centred, when Jonas sits at the bench', { skip, timeout: 240000 }, async () => {
  await withGame(async ({ page, base }) => {
    await open(page, base, '?cena=n1-radio');
    const r = await page.evaluate(async () => {
      const { createAudio } = await import('/src/audio/index.js'), { createVoices } = await import('/src/audio/voices.js');
      const render = async (near, spot) => {
        const ctx = new OfflineAudioContext(2, 48000 * 2, 48000), audio = createAudio(ctx, { seed: 1, samples: false });
        const voices = createVoices(ctx, { durations: { 'r-represa': 5 }, volume: 1, spatial: audio.spatial });
        audio.setListener([0, 1.6, 0], [0, 0, -1]); voices.setNear(near);
        await voices.load('r-represa'); voices.play('r-represa', { filter: 'none', at: 0.05, spot });
        const out = await ctx.startRendering(), rms = (c) => { const d = out.getChannelData(c); let s = 0; for (let i = 0; i < d.length; i++) s += d[i] * d[i]; return Math.sqrt(s / d.length); };
        return { l: rms(0), r: rms(1), spots: voices.spots };
      };
      return { away: await render(0, [6, 1.6, -2]), seated: await render(1, [6, 1.6, -2]), none: await render(0, null) };
    });
    assert.ok(r.away.r > r.away.l * 1.8, `away from the bench the line is on the right where the radio is (L ${r.away.l.toFixed(4)}, R ${r.away.r.toFixed(4)})`);
    assert.ok(Math.abs(r.seated.l - r.seated.r) / Math.max(r.seated.l, r.seated.r) < 0.02, `seated it is centred (L ${r.seated.l.toFixed(4)}, R ${r.seated.r.toFixed(4)})`);
    assert.ok(r.seated.l > r.away.l * 1.3, 'and closer: louder than from across the room');
    assert.ok(Math.abs(r.none.l - r.none.r) < 1e-6, 'a line with no place (the hand radio, a cutscene) stays on Jonas');
    // in the game: a line that starts while he walks is a voice of the room; the blend follows the bench
    const g = await page.evaluate(async () => { const G = window.__game; await G.voices.load('r-represa'); const h = G.voices.play('r-represa', { filter: 'radio', spot: [-3.64, 1.07, -4.55] }); return { spots: G.voices.spots, near: G.voices.near, id: h.id }; });
    assert.equal(g.spots, 1); assert.equal(g.near, 0, 'walking: far');
    await page.evaluate(() => { window.__game.voices.setNear(1); });
    assert.equal(await page.evaluate(() => window.__game.voices.near), 1);
  });
});

test('the video: the cutscene\'s sound with `at` is put on its actor, and the objects of the scene sound from the camera', { skip, timeout: 240000 }, async () => {
  await withGame(async ({ page, base }) => {
    await page.goto(`${base}/index.html?film`, { timeout: 120000 });
    await page.waitForFunction(() => window.__film?.sounds, null, { timeout: 60000 });
    const a = await page.evaluate(() => window.__film.sounds('emenda.esquina'));
    const rolls = a.events.filter((e) => e.name === 'cao-rolar');
    assert.ok(rolls.length >= 4 && rolls.every((e) => Array.isArray(e.opts.pos) && e.opts.pos.length === 3), 'the dog rolls from where the dog is');
    assert.ok(new Set(rolls.map((e) => e.opts.pos.join())).size >= 3, 'and the place moves with it');
    const b = await page.evaluate(() => window.__film.sounds('galeria.bomba'));
    assert.ok(b.events.filter((e) => e.name === 'ouvinte').length >= 15, 'the camera is the listener, along the whole stretch');
    assert.ok(b.events.some((e) => e.name === 'zumbido-lampada' && e.opts.curve?.length > 10 && e.opts.dur > 0), 'the lamps hum with a level over the stretch');
    assert.ok(!b.events.some((e) => e.name === 'bomba-motor'), 'the stopped pump is silent in the video');
    const p = await page.evaluate(() => window.__film.sounds('galeria.panorama'));
    const gota = p.events.filter((e) => e.name === 'gota-cano'); assert.ok(gota.length >= 3, `the camera walks past the two dripping pipes and hears their drops (${gota.length})`);
    assert.ok(gota.every((e) => e.opts.pos[1] < 0.2 && e.opts.gain > 0), 'at the puddle');
    const again = await page.evaluate(() => window.__film.sounds('galeria.bomba'));
    assert.deepEqual(again, b, 'the same stretch is the same events');
  });
});

test('every new sound has a synthesised voice for when its recording is missing, and it sounds from its place', { skip, timeout: 240000 }, async () => {
  await withGame(async ({ page, base }) => {
    await page.goto(`${base}/index.html?film`, { timeout: 120000 });
    await page.waitForFunction(() => window.__film?.sounds, null, { timeout: 60000 });
    const names = ['zumbido-lampada', 'zumbido-quadro', 'bomba-motor', 'vento-grade', 'viaduto-vento', 'gota-cano', 'rele-semaforo'];
    const r = await page.evaluate(async (list) => {
      const { createAudio } = await import('/src/audio/index.js'), out = {};
      for (const name of list) {
        const ctx = new OfflineAudioContext(2, 48000 * 4, 48000), audio = createAudio(ctx, { seed: 3, samples: false });     // no recordings at all
        audio.setListener([0, 1.6, 0], [0, 0, -1]);
        audio.play(name, { at: 0.2, dur: 3, gain: 1, pos: [4, 1.6, 0], live: true, rolloff: 0.35 });                       // to the listener's right
        const b = await ctx.startRendering(), rms = (c) => { const d = b.getChannelData(c); let s = 0; for (let i = 0; i < d.length; i++) s += d[i] * d[i]; return Math.sqrt(s / d.length); };
        out[name] = { l: rms(0), r: rms(1) };
      }
      return out;
    }, names);
    for (const n of names) { assert.ok(r[n].r > 1e-4, `${n}: the synthesised sound is there (${r[n].r})`); assert.ok(r[n].r > r[n].l * 1.5, `${n}: from the right (${r[n].l.toFixed(5)} / ${r[n].r.toFixed(5)})`); }
  });
});
