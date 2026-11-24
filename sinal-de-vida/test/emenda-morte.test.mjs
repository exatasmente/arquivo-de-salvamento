// The splice of the avenue, the part about the dog: the dodge in slow motion, the death and the checkpoint, the two ways out after the dodge (quiet and loud),
// the blood and the option that turns it off. The pure parts are in test/sequence.test.mjs; this one needs a Chrome and playwright-core, so it only runs when
// PLAYWRIGHT_CORE (the folder of playwright-core) is set, and CHROME (the executable; default /usr/bin/google-chrome); otherwise it is skipped.
//   PLAYWRIGHT_CORE=<folder> node --test test/emenda-morte.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { SLOW, ATTACK, DUMP, ESCUTA_DISABLE, STEPS, bloodAt, actionPose, J } from '../src/systems/emenda.js';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const CORE = process.env.PLAYWRIGHT_CORE, skip = CORE ? false : 'set PLAYWRIGHT_CORE to run the browser tests';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg' };
const KEY = 'sinal-de-vida.card.v2';
// (the choice by the skip is out of the game since 2026-11-23 and lives behind one switch, data/story/fuga.json: these tests keep the old way honest with `cacamba=keep`;
// what the game plays now, the run and the chase, is in test/fuga.test.mjs)
const QUERY = '?cena=n1-saida&sair=agora&semente=7&emenda=cheia&cacamba=keep';

async function withGame(fn, { touch = false } = {}) {
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
    page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    const open = async (query = '') => { await page.goto(`${url}${query}`, { timeout: 120000 }); await page.waitForFunction(() => window.__game?.run && window.__game.st.phase); await page.evaluate(() => window.__game.test.manual(true)); await ready(page); };
    await fn({ page, open, errors, url });
    assert.deepEqual(errors, [], 'no console error');
  } finally { await browser.close(); srv.close(); }
}
const step = (page, n) => page.evaluate((k) => window.__game.test.step(k), n);
const ready = (page) => page.waitForFunction(() => window.__game.st.shot >= 0 && window.__game.st.world && !window.__game.st.cut?.loading, null, { timeout: 90000 });
const until = async (page, fn, max = 60, n = 30) => { for (let i = 0; i < max; i++) { if (await page.evaluate(fn)) return true; await step(page, n); } return false; };
const sv = (page) => page.evaluate(() => { const S = window.__game.st.seq; if (!S) return null; const v = S.sq.view(); return { phase: S.phase, kind: v.kind, i: v.i, gap: v.gap, over: v.over, el: v.el, want: v.want, outcome: v.outcome, scale: S.timeScale, slowK: S.slowK, t: S.t, ch: S.rec.choice?.id ?? null, total: v.total, dead: S.dead, over2: Boolean(S.over), noQuiet: v.noQuiet }; });

/** At the cut of the cable with the story waiting for the splice, the button held until the dog arrives, the cutscene skipped: the first command is on. */
async function toAct(page, open, query = QUERY) {
  await open(query);
  for (let i = 0; i < 8 && (await page.evaluate(() => window.__game.director.waitName)) !== 'saida-emenda'; i++) { await page.evaluate(() => { const G = window.__game; G.director.signal('isca'); G.test.teleport(-13.3, 7.0); }); await step(page, 400); }
  await page.evaluate(() => { window.__game.test.teleport(-13.3, 7.0); window.__game.player.body = 3.14; }); await step(page, 3);
  await page.keyboard.down('KeyE'); const ok = await until(page, () => Boolean(window.__game.st.seq), 40, 10); await page.keyboard.up('KeyE'); assert.ok(ok, 'the dog arrives');
  await page.evaluate(() => { window.__game.st.fadeIn = 0; });
  await page.evaluate(() => window.__game.input.S.edges.add('skip')); await step(page, 3);
  assert.equal((await sv(page)).phase, 'act');
}
/**
 * The sequence played by the keys: hold Use, the dodge the way the dog asks, the choice, the commands of the branch, hammer, press.
 * `miss`: 'dir' | 'pick' | 'branch' (the first command of the branch); `choice`: 'quiet' (left) or 'loud' (right); `until`: stops when this holds (a function in the page).
 */
async function play(page, { miss = [], choice = 'quiet', max = 900, stopWhen = null } = {}) {
  let held = false, n = 0; const key = (k, down) => (down ? page.keyboard.down(k) : page.keyboard.up(k));
  for (let i = 0; i < max; i++) {
    const v = await sv(page); if (!v || v.over) break;
    if (stopWhen && await page.evaluate(stopWhen)) break;
    const branch = v.i === 3;
    const want = v.kind === 'hold' && !v.gap && !(branch && miss.includes('branch'));
    if (want !== held) { held = want; await key('KeyE', held); }
    if (v.kind === 'dir' && !v.gap && v.el > 0.35 && !miss.includes('dir')) { const k = v.want < 0 ? 'ArrowLeft' : 'ArrowRight'; await key(k, true); await step(page, 2); await key(k, false); }
    else if (v.kind === 'pick' && !v.gap && v.el > 0.3 && !miss.includes('pick')) { const k = choice === 'quiet' ? 'ArrowLeft' : 'ArrowRight'; await key(k, true); await step(page, 2); await key(k, false); }
    else if (v.kind === 'mash' && !v.gap && n++ % 2 === 0) { await key('KeyE', true); await step(page, 2); await key('KeyE', false); }
    else if (v.kind === 'press' && !v.gap && v.el > 0.25 && !(branch && miss.includes('branch'))) { await key('KeyE', true); await step(page, 2); await key('KeyE', false); }
    await step(page, 5);
  }
  await key('KeyE', false);
}
const audioSpy = (page) => page.evaluate(() => { const a = window.__game.audio, o = a.play.bind(a); window.__played = []; a.play = (n, p) => { window.__played.push(n); return o(n, p); }; });
const played = (page) => page.evaluate(() => window.__played);
const frame = (page) => page.evaluate(() => new Promise((ok) => { window.__game.test.render(); requestAnimationFrame(() => requestAnimationFrame(ok)); }));
const fadeOf = async (page) => { await frame(page); return page.evaluate(() => Number(document.getElementById('fade').style.opacity || 0)); };
const hold = async (page, key, n) => { await page.keyboard.down(key); await step(page, n); await page.keyboard.up(key); await step(page, 3); };
const bloodParts = (page) => page.evaluate(() => { const G = window.__game; let n = 0, visible = 0; G.r.scene.traverse((o) => { if (o.name === 'sangue') { n++; o.traverse((c) => { if (c.isMesh) visible += c.visible ? 1 : 0; }); } }); return { groups: n, visible }; });

// ---- the clock of the filming --------------------------------------------------------------------------------------------------------------------------
test('the speed: the animation of the bodies follows the game steps, not how many times the browser draws between two pictures (what made Jonas look hurried in the video)', { skip, timeout: 300000 }, async () => {
  await withGame(async ({ page, open }) => {
    await open(QUERY);
    await page.evaluate(() => { const G = window.__game; G.st.frameDt = 2 / 60; G.test.teleport(-6.2, 7.0); G.player.body = 1.5708; G.cam.place(1.5708); window.__anim = 0; const o = G.body.update.bind(G.body); G.body.update = (dt, a) => { window.__anim += dt; return o(dt, a); }; });
    const p0 = await page.evaluate(() => window.__game.player.pos.slice());
    await page.keyboard.down('KeyW');
    for (let i = 0; i < 30; i++) { await step(page, 2); await frame(page); await frame(page); await frame(page); }          // (three pictures for every two steps: the browser draws as often as it likes)
    await page.keyboard.up('KeyW');
    const r = await page.evaluate(() => ({ p: window.__game.player.pos.slice(), anim: window.__anim }));
    const walked = Math.hypot(r.p[0] - p0[0], r.p[1] - p0[1]);
    // (2026-11-19: the stick all the way is a brisk walk, 1.55 m/s, and he takes 0.31 s to get up to it: 1.31 m in the first second)
    assert.ok(Math.abs(walked - 1.31) < 0.1, `one second of steps from standing is 1.31 m of walking (${walked.toFixed(2)} m, the same speed as in the station)`);
    assert.ok(Math.abs(r.anim - 1.0) < 0.1, `and one second of animation (${r.anim.toFixed(2)} s; it was 48 s)`);
  });
});

// ---- the dodge in slow motion -------------------------------------------------------------------------------------------------------------------------
test('the dodge is an event: while it is asked for the world slows to 0.25-0.3x, the camera pushes in, and the left/right command shows; after it, time comes back', { skip, timeout: 300000 }, async () => {
  assert.ok(SLOW.scale >= 0.25 && SLOW.scale <= 0.3);
  await withGame(async ({ page, open }) => {
    await toAct(page, open);
    const cam = () => page.evaluate(() => { const c = window.__game.r.camera, S = window.__game.st.seq, d = S.pose.dog.pos, j = S.pose.jonas.pos; return { fov: c.fov, dist: Math.hypot(c.position.x - (d[0] + j[0]) / 2, c.position.z - (d[1] + j[1]) / 2) }; });
    const sign = () => page.evaluate(() => { const e = document.getElementById('hud-sign'); return e.hidden ? null : { word: e.querySelector('.word').textContent, arrow: e.querySelector('.arrow').textContent }; });
    await play(page, { stopWhen: () => window.__game.st.seq.sq.view().kind === 'hold' && window.__game.st.seq.sq.view().el > 0.5 });
    assert.equal((await sv(page)).scale, 1, 'before the leap the world is at its speed');
    await play(page, { stopWhen: () => window.__game.st.seq.sq.view().kind === 'dir' });
    await step(page, 2); await frame(page); const c0 = await cam();
    await step(page, 60);
    const v = await sv(page); assert.equal(v.kind, 'dir'); assert.ok(v.scale < 0.35 && v.scale >= SLOW.scale - 0.01, `slow while it is on (${v.scale.toFixed(2)})`);
    await frame(page); const c1 = await cam();
    assert.ok(c1.fov < c0.fov - 2, `the camera comes in: ${c0.fov.toFixed(1)} to ${c1.fov.toFixed(1)}`); assert.ok(c1.dist < c0.dist, 'and gets nearer to the two of them');
    assert.deepEqual(await sign(), { word: 'esquive', arrow: await page.evaluate(() => window.__game.st.seq.sq.view().want < 0 ? '◀' : '▶') }, 'the command shows in that window');
    // the window of 0.6 s of the world takes about two seconds of the person
    let steps = 62; while ((await sv(page)).kind === 'dir' && (await sv(page)).el < 0.5 && steps < 600) { await step(page, 5); steps += 5; }
    assert.ok(steps / 60 > 1.2, `0.5 s of the world is more than a second for the person (${(steps / 60).toFixed(1)} s)`);
    // dodged: time eases back to its speed
    const want = (await sv(page)).want; const k = want < 0 ? 'ArrowLeft' : 'ArrowRight'; await page.keyboard.down(k); await step(page, 2); await page.keyboard.up(k);
    await step(page, 150); assert.ok((await sv(page)).scale > 0.9, 'back to its speed'); assert.ok(await page.evaluate(() => window.__game.st.seq.rec.dodge !== null));
  });
  // accessibility: "mais tempo" doubles the window (and the world is slow all the same), "desligada" dodges by itself
  await withGame(async ({ page, open }) => {
    await open(QUERY); await page.evaluate(() => { window.__game.options.quick = 'long'; });
    for (let i = 0; i < 8 && (await page.evaluate(() => window.__game.director.waitName)) !== 'saida-emenda'; i++) { await page.evaluate(() => { const G = window.__game; G.director.signal('isca'); G.test.teleport(-13.3, 7.0); }); await step(page, 400); }
    await page.evaluate(() => { window.__game.test.teleport(-13.3, 7.0); }); await page.keyboard.down('KeyE'); await until(page, () => Boolean(window.__game.st.seq), 40, 10); await page.keyboard.up('KeyE');
    await page.evaluate(() => window.__game.input.S.edges.add('skip')); await step(page, 3);
    await play(page, { stopWhen: () => window.__game.st.seq.sq.view().kind === 'dir' }); await step(page, 5);
    const v = await sv(page); assert.equal(v.kind, 'dir'); assert.ok(Math.abs(v.total - 1.2) < 1e-6, `"mais tempo": 1.2 s of the world instead of 0.6 (${v.total})`);
    await step(page, 200); assert.ok((await sv(page)).scale < 0.35, 'slow all the same');
  });
  await withGame(async ({ page, open }) => {
    await open(QUERY); await page.evaluate(() => { window.__game.options.quick = 'off'; });
    for (let i = 0; i < 8 && (await page.evaluate(() => window.__game.director.waitName)) !== 'saida-emenda'; i++) { await page.evaluate(() => { const G = window.__game; G.director.signal('isca'); G.test.teleport(-13.3, 7.0); }); await step(page, 400); }
    await page.evaluate(() => { window.__game.test.teleport(-13.3, 7.0); }); await page.keyboard.down('KeyE'); await until(page, () => Boolean(window.__game.st.seq), 40, 10); await page.keyboard.up('KeyE');
    await page.evaluate(() => window.__game.input.S.edges.add('skip')); await step(page, 3);
    const seen = new Set(); const choices = [];
    for (let i = 0; i < 1500 && (await sv(page)); i++) { const v = await sv(page); if (v.kind === 'dir' && !v.gap) seen.add(+v.scale.toFixed(1) < 0.4); await step(page, 6); if (v.ch) choices.push(v.ch); }
    assert.ok(seen.has(true), 'automatic, the dodge is slow too'); assert.equal(await page.evaluate(() => window.__game.player.hidden), 'cacamba', 'and it plays to the end by itself (the quiet way)');
    assert.ok(choices.length > 0 && choices.every((c) => c === 'quiet'), 'it chose the quiet way by itself');
  });
});

// ---- the death and the checkpoint ---------------------------------------------------------------------------------------------------------------------
test('missing the dodge is death: the dog attacks, the picture goes black, the game over shows, and it reloads from the checkpoint at the start of the splice (the card holds it)', { skip, timeout: 600000 }, async () => {
  await withGame(async ({ page, open }) => {
    await open(QUERY);
    // a game on the card (not the demonstration): the checkpoint is written to the memory card
    await page.evaluate(() => { window.__game.run.temp = false; });
    for (let i = 0; i < 8 && (await page.evaluate(() => window.__game.director.waitName)) !== 'saida-emenda'; i++) { await page.evaluate(() => { const G = window.__game; G.director.signal('isca'); G.test.teleport(-13.3, 7.0); }); await step(page, 400); }
    await page.evaluate(() => { window.__game.test.teleport(-13.3, 7.0); }); await page.keyboard.down('KeyE'); await until(page, () => Boolean(window.__game.st.seq), 40, 10); await page.keyboard.up('KeyE');
    const card = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).run, KEY);
    assert.deepEqual({ at: card.cp?.at, scene: card.cp?.scene, variant: card.cp?.variant, pocket: card.pocket }, { at: 'saida-emenda', scene: 'n1-saida', variant: 'cheia', pocket: card.pocket }, 'the card holds the checkpoint of the splice');
    assert.ok(card.pocket.includes('isca-reserva'), 'with the lure of reserve in the pocket');
    await page.evaluate(() => window.__game.input.S.edges.add('skip')); await step(page, 3);
    await audioSpy(page);
    await play(page, { miss: ['dir'], max: 400, stopWhen: () => window.__game.st.seq.rec.knockedAt != null });
    await until(page, () => window.__game.st.seq.t > window.__game.st.seq.rec.knockedAt + 0.4, 40, 6);
    assert.ok(await page.evaluate(() => window.__game.st.seq.sq.view().outcome === 'knocked'));
    assert.ok((await played(page)).includes('cao-ataque'), 'the attack is heard (blood on: the attack as it is)');
    // the black comes up, then the game over, then the reload
    assert.ok(await until(page, () => document.getElementById('gameover').hidden === false, 60, 6), 'the game over shows');
    assert.ok(await fadeOf(page) > 0.95, 'over black');
    assert.match(await page.evaluate(() => document.querySelector('#gameover h2').textContent), /FIM DE JOGO/);
    assert.ok((await played(page)).includes('fim-de-jogo'));
    const gap = await page.evaluate(() => window.__game.st.seq.t - window.__game.st.seq.rec.knockedAt); assert.ok(gap >= ATTACK.overAt && gap < ATTACK.reloadAt, `${gap.toFixed(1)} s after the impact`);
    await page.waitForFunction(() => window.__game.st.seq?.phase === 'act' && window.__game.st.seq.t < 2 && window.__game.st.seq.rec.knockedAt == null && document.getElementById('gameover').hidden, null, { timeout: 120000, polling: 200 }).catch(async () => { for (let i = 0; i < 120; i++) { await step(page, 30); if (await page.evaluate(() => window.__game.st.seq?.phase === 'act' && window.__game.st.seq.rec.knockedAt == null)) break; } });
    const after = await page.evaluate(() => { const G = window.__game, S = G.st.seq; return { seq: Boolean(S), kind: S?.sq.view().kind, pos: G.player.pos.map((x) => +x.toFixed(1)), pocket: G.run.pocket.includes('isca-reserva'), cp: G.run.cp?.at, wait: G.director.waitName, scene: G.st.scene.id, over: document.getElementById('gameover').hidden }; });
    assert.deepEqual(after, { seq: true, kind: 'hold', pos: [-13.3, 8.1], pocket: true, cp: 'saida-emenda', wait: 'saida-emenda', scene: 'n1-saida', over: true }, 'back at the first command of the splice, not at the start of the exit');
    // and the splice can be done from there
    await play(page, { max: 1200 }); assert.equal(await page.evaluate(() => window.__game.street.street.splice.state), 'done');
    // the next scene is a new checkpoint: the one of the splice does not follow it
    assert.equal(await page.evaluate(() => window.__game.run.cp?.at ?? null), 'saida-emenda', 'it stays until the scene is over');
  });
  // the card of the game goes through a reload of the page: "Continuar" comes back at the splice
  await withGame(async ({ page, open }) => {
    await open(QUERY); await page.evaluate(() => { window.__game.run.temp = false; });
    for (let i = 0; i < 8 && (await page.evaluate(() => window.__game.director.waitName)) !== 'saida-emenda'; i++) { await page.evaluate(() => { const G = window.__game; G.director.signal('isca'); G.test.teleport(-13.3, 7.0); }); await step(page, 400); }
    await page.evaluate(() => { window.__game.test.teleport(-13.3, 7.0); }); await page.keyboard.down('KeyE'); await until(page, () => Boolean(window.__game.st.seq), 40, 10); await page.keyboard.up('KeyE');
    await page.goto(page.url().split('?')[0] + '?continuar=1'); await page.waitForFunction(() => window.__game?.run && window.__game.st.phase === 'play'); await page.evaluate(() => window.__game.test.manual(true)); await ready(page);
    assert.ok(await until(page, () => window.__game.st.seq?.phase === 'act', 40, 10), 'after "Continuar" the sequence starts again at its first command');
    assert.equal(await page.evaluate(() => window.__game.director.waitName), 'saida-emenda');
  });
});

test('the dog that recovers and bites: the choice not made, or the first command of the branch missed, is the same death (the attack, the game over, the reload)', { skip, timeout: 900000 }, async () => {
  for (const [name, opts] of [['no choice', { miss: ['pick'] }], ['the lure missed', { miss: ['branch'], choice: 'quiet' }], ['the cable missed', { miss: ['branch'], choice: 'loud' }]]) await withGame(async ({ page, open }) => {
    await toAct(page, open); await audioSpy(page);
    await play(page, { ...opts, max: 900, stopWhen: () => window.__game.st.seq.rec.failAt != null });
    assert.ok(await page.evaluate(() => window.__game.st.seq.rec.failAt != null), `${name}: the dog got him`);
    assert.equal((await sv(page)).outcome ?? await page.evaluate(() => window.__game.st.seq.sq.view().outcome), 'bitten');
    const k = await page.evaluate(() => window.__game.st.seq.rec.knockedAt - window.__game.st.seq.rec.failAt); assert.ok(Math.abs(k - ATTACK.bite) < 1e-6, 'it takes a moment to recover');
    assert.equal(await page.evaluate(() => Boolean(window.__game.escuta) && window.__game.run.flags.caoDesativado === true), false, 'nothing of the loud way happened');
    assert.ok(await until(page, () => document.getElementById('gameover').hidden === false, 90, 6), `${name}: the game over`);
    assert.ok((await played(page)).includes('cao-ataque'));
    assert.ok(await until(page, () => window.__game.st.seq?.phase === 'act' && window.__game.st.seq.rec.knockedAt == null && window.__game.st.seq.t < 2, 120, 6), `${name}: and it is back at the start of the splice`);
  });
});

// ---- the two ways out after the dodge ----------------------------------------------------------------------------------------------------------------
test('desorientar (quiet): the lure at the sensor deafens the dog for about 8 s, it is spent, he closes the splice and hides in the skip, and the dog goes on along its route without finding him', { skip, timeout: 600000 }, async () => {
  await withGame(async ({ page, open }) => {
    await toAct(page, open); await audioSpy(page);
    const before = await page.evaluate(() => ({ esc: window.__game.escuta.value, pocket: [...window.__game.run.pocket] }));
    assert.ok(before.pocket.includes('isca-reserva'));
    await play(page, { choice: 'quiet', stopWhen: () => window.__game.st.seq.rec.deafAt != null });
    assert.deepEqual(await page.evaluate(() => ({ choice: window.__game.st.seq.rec.choice.id, pocket: window.__game.run.pocket.includes('isca-reserva'), flag: window.__game.run.flags.iscaGasta })), { choice: 'quiet', pocket: false, flag: true }, 'the lure is spent');
    assert.ok((await played(page)).includes('isca-perto') && (await played(page)).includes('cao-surdo'));
    // deaf: it turns and stumbles about (searching) for the 8 s, near the skip, and does not come for him
    await step(page, 120);
    const d1 = await page.evaluate(() => { const S = window.__game.st.seq, d = S.pose.dog; return { state: d.state, pos: d.pos, rel: S.t - S.rec.deafAt }; });
    assert.equal(d1.state, 'busca'); assert.ok(d1.rel > 1 && d1.rel < 4); assert.ok(Math.hypot(d1.pos[0] - DUMP.hit[0], d1.pos[1] - DUMP.hit[1]) < 1.3, 'still at the skip');
    await play(page, { choice: 'quiet' });
    const end = await page.evaluate(() => { const G = window.__game, dog = G.street.machines.list()[0]; return { hidden: G.player.hidden, seq: G.st.seq, esc: G.escuta.value, dog: dog.state, splice: G.street.street.splice.state, wait: G.director.waitName, goal: G.st.goal }; });
    assert.equal(end.hidden, 'cacamba'); assert.equal(end.seq, null); assert.equal(end.esc, before.esc, 'the Escuta did not rise: nothing of the sequence was missed and nobody saw him'); assert.equal(end.splice, 'done');
    assert.equal(end.dog, 'calm', 'the dog is back to its route'); assert.match(end.goal, /poço/);
    // the dog moves on along its route and does not find him in the skip
    for (let i = 0; i < 8; i++) await step(page, 120);
    const st = await page.evaluate(() => ({ dog: window.__game.street.machines.list()[0].state, hidden: window.__game.player.hidden, esc: window.__game.escuta.value }));
    assert.notEqual(st.dog, 'chase'); assert.equal(st.hidden, 'cacamba'); assert.equal(st.esc, before.esc);
    assert.equal(await page.evaluate(() => window.__game.run.flags.caoDesativado ?? false), false);
  });
  // the pose of the dog by the clock: deaf 8 s, then it hears again and goes
  const rec = { variant: 'cheia', from: -1, film: true, starts: [0, 4.6, 7.3, 8.5, 10.8, 13.3], wins: [4.4, 0.6, 2, 1.6, 3.6, 1.2], dodge: { side: 'left', at: 5.1 }, choice: { id: 'quiet', at: 8.5 }, b1End: 10.1, deafAt: 10.1, freedAt: 12.8, closedAt: 13.7 };
  const dog = (t) => actionPose('cheia', rec, t).dog;
  assert.equal(dog(7).state, 'busca', 'stunned against the skip'); assert.equal(dog(12).state, 'busca'); assert.ok(dog(10.2).speed >= 0 && dog(14).yaw !== dog(12).yaw, 'it turns');
  assert.equal(dog(10.1 + DUMP.deaf + 3).state, 'calma', 'after the 8 s it goes on along its route'); assert.ok(Math.hypot(...dog(10.1 + DUMP.deaf + 4).pos.map((x, i) => x - DUMP.hit[i])) > 1.5);
  // (2026-11-19: he goes to the skip crouched at the pace of his crouched walk, 1.1 m/s, round the lamp post, turning on the spot in
  // steps: in it 3.3 s after the splice, not 1.8; the step leaves 5.2 s for it)
  assert.equal(actionPose('cheia', rec, 17.1).jonas.hidden, true, 'and he is in the skip, out of sight');
});

test('desativar (loud): the cable into the socket on its back shorts the battery, it sparks and falls switched off, Escuta +10, and the splice closes shorter and slower', { skip, timeout: 600000 }, async () => {
  await withGame(async ({ page, open }) => {
    await toAct(page, open); await audioSpy(page);
    const before = await page.evaluate(() => ({ esc: window.__game.escuta.value, pocket: [...window.__game.run.pocket] }));
    await play(page, { choice: 'loud', stopWhen: () => window.__game.st.seq.rec.jabAt != null });
    assert.equal(await page.evaluate(() => window.__game.escuta.value), before.esc + ESCUTA_DISABLE, 'Escuta +10');
    assert.deepEqual(await page.evaluate(() => ({ pocket: window.__game.run.pocket.includes('isca-reserva'), flag: window.__game.run.flags.caoDesativado, spent: window.__game.st.seq.rec.spent })), { pocket: true, flag: true, spent: true }, 'the lure is still there; the piece of cable is what is spent');
    assert.ok((await played(page)).includes('curto'));
    await step(page, 20);
    assert.ok(await page.evaluate(() => window.__game.st.seq.pose.fx.dogSpark > 0), 'it sparks');
    assert.ok(await page.evaluate(() => { let n = 0; window.__game.r.scene.traverse((o) => { if (o.isMesh && o.visible && o.parent?.children.length === 16) n++; }); return n > 0; }), 'the sparks are in the scene');
    await step(page, 120);
    assert.equal(await page.evaluate(() => window.__game.st.seq.pose.dog.state), 'desligado', 'it falls switched off, as the broken one lies');
    // the splice is shorter and slower: more to hammer, the cable it pulls is shorter
    const steps = await page.evaluate(() => window.__game.st.seq.sq.view().count); assert.equal(steps, 6);
    await play(page, { choice: 'loud' });
    const end = await page.evaluate(() => { const G = window.__game; return { seq: G.st.seq, esc: G.escuta.value, down: G.street.down, state: G.street.machines.list()[0].state, splice: G.street.street.splice.state, hidden: G.player.hidden, cols: G.street.cols.length }; });
    assert.equal(end.seq, null); assert.equal(end.esc, before.esc + 10, 'only the +10, nothing missed'); assert.equal(end.down, 'cao-avenida'); assert.equal(end.splice, 'done'); assert.equal(end.hidden, null, 'he does not hide: nobody is looking for him');
    await step(page, 600);
    assert.equal(await page.evaluate(() => window.__game.street.machines.list()[0].state), 'calm', 'it stays where it fell (a puppet): it does not hunt');
    assert.ok(await page.evaluate((h) => window.__game.street.machines.list()[0].pos.every((x, i) => Math.abs(x - h[i]) < 0.01), DUMP.hit), 'where it fell');
  });
  assert.ok(STEPS.cheia[2].branches.loud[1].need > STEPS.cheia[2].branches.quiet[1].need && STEPS.cheia[2].branches.loud[1].window > STEPS.cheia[2].branches.quiet[1].window, 'slower: more to hammer, more time');
  const rec = { variant: 'cheia', from: -1, film: true, starts: [0, 4.6, 7.3, 8.5, 10.4, 14.4], wins: [4.4, 0.6, 2, 0.9, 5, 1.4], dodge: { side: 'left', at: 5.1 }, choice: { id: 'loud', at: 8.5 }, jabAt: 8.9, b1End: 8.9, spent: true, freedAt: 13.9, closedAt: 14.9 };
  const p = (t) => actionPose('cheia', rec, t);
  assert.ok(p(9.2).fx.dogSpark > 0.5, 'sparks'); assert.equal(p(11).dog.state, 'desligado'); assert.equal(p(20).dog.state, 'desligado', 'and it stays that way');
  const shorter = (rec2) => actionPose('cheia', rec2, 12).tail.at(-1); assert.notDeepEqual(shorter(rec), shorter({ ...rec, spent: false }), 'the strand of cable is shorter');
});

// ---- the blood, and the option that turns it off -----------------------------------------------------------------------------------------------------
test('blood on: the attack has a spray, a pool on the pavement and blots on him, in a dark red; none of it exists when the dodge is made', { skip, timeout: 600000 }, async () => {
  await withGame(async ({ page, open }) => {
    await toAct(page, open);
    assert.equal(await page.evaluate(() => window.__game.gore()), true, 'on by default');
    assert.deepEqual(await bloodParts(page), { groups: 0, visible: 0 }, 'nothing of the kind before the attack');
    await audioSpy(page);
    await play(page, { miss: ['dir'], max: 400, stopWhen: () => window.__game.st.seq.rec.knockedAt != null });
    await until(page, () => window.__game.st.seq.t > window.__game.st.seq.rec.knockedAt + 1.2, 40, 6); await frame(page);
    const b = await bloodParts(page); assert.equal(b.groups, 1); assert.ok(b.visible > 40, `the drops, the pool and the blots are on (${b.visible})`);
    // dark red, never white or bright; the picture is not flashing (the black is a single slow fade, and there is no white at all)
    const colors = await page.evaluate(() => { const out = []; window.__game.r.scene.traverse((o) => { if (o.name === 'sangue') o.traverse((c) => { if (c.isMesh && c.material.color) out.push(c.material.color.getHexString()); }); }); return [...new Set(out)]; });
    for (const hex of colors) { const [r, g, bl] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)); assert.ok(r > g * 3 && r < 170 && bl < 60, `${hex} is a dark red`); }
    const samples = []; for (let i = 0; i < 20; i++) { await step(page, 6); samples.push(await fadeOf(page)); }
    let flips = 0; for (let i = 2; i < samples.length; i++) if ((samples[i] - samples[i - 1]) * (samples[i - 1] - samples[i - 2]) < -1e-9) flips++;
    assert.equal(flips, 0, 'the fade only goes one way: nothing flashes'); assert.ok(Math.max(...samples) <= 1);
    // the drops are a function of the seed and the time
    assert.deepEqual(bloodAt(0.6), bloodAt(0.6)); assert.notDeepEqual(bloodAt(0.6, J, 4), bloodAt(0.6, J, 5));
    assert.ok(bloodAt(0.05).pts.every((p) => p === null) && bloodAt(2).pool > bloodAt(0.6).pool, 'the pool grows');
  });
  // the dodge made: no blood in the scene, at any time
  await withGame(async ({ page, open }) => {
    await toAct(page, open); await play(page, { max: 300, stopWhen: () => window.__game.st.seq.sq.view().kind === 'press' }); assert.deepEqual(await bloodParts(page), { groups: 0, visible: 0 });
  });
});

test('blood off: no blood entity is ever made, the attack cuts to black just before the impact with a muffled sound, and the death, the game over and the reload are the same', { skip, timeout: 600000 }, async () => {
  await withGame(async ({ page, open }) => {
    await open(QUERY); await page.evaluate(() => { window.__game.options.gore = false; });
    for (let i = 0; i < 8 && (await page.evaluate(() => window.__game.director.waitName)) !== 'saida-emenda'; i++) { await page.evaluate(() => { const G = window.__game; G.director.signal('isca'); G.test.teleport(-13.3, 7.0); }); await step(page, 400); }
    await page.evaluate(() => { window.__game.test.teleport(-13.3, 7.0); }); await page.keyboard.down('KeyE'); await until(page, () => Boolean(window.__game.st.seq), 40, 10); await page.keyboard.up('KeyE');
    await page.evaluate(() => window.__game.input.S.edges.add('skip')); await step(page, 3);
    assert.equal(await page.evaluate(() => window.__game.gore()), false); await audioSpy(page);
    await play(page, { miss: ['dir'], max: 400, stopWhen: () => window.__game.st.seq.rec.knockedAt != null });
    await step(page, 12); await frame(page);
    assert.ok(await fadeOf(page) > 0.99, 'black at the impact'); assert.ok(await page.evaluate(() => window.__game.st.seq.t - window.__game.st.seq.rec.knockedAt) < 0.5, 'within a moment of it (the ON way is still bright at this time)');
    const p = await played(page); assert.ok(p.includes('abafado'), 'muffled'); assert.ok(!p.includes('cao-ataque'), 'the attack itself is not heard');
    await until(page, () => window.__game.st.seq.t > window.__game.st.seq.rec.knockedAt + 1.5, 40, 6); await frame(page);
    assert.deepEqual(await bloodParts(page), { groups: 0, visible: 0 }, 'no blood entity at all'); assert.equal(await page.evaluate(() => window.__game.st.seq.blood), null);
    assert.equal(await page.evaluate(() => document.getElementById('gameover').hidden), false, 'the game over is the same');
    assert.ok((await played(page)).includes('fim-de-jogo'));
    assert.ok(await until(page, () => window.__game.st.seq?.phase === 'act' && window.__game.st.seq.rec.knockedAt == null && window.__game.st.seq.t < 2, 120, 6), 'and it reloads the same');
  });
  // the same attack with the option on is still at the picture at that time (the cut is the option's, not the timing of the attack)
  await withGame(async ({ page, open }) => {
    await toAct(page, open);
    await play(page, { miss: ['dir'], max: 400, stopWhen: () => window.__game.st.seq.rec.knockedAt != null }); await step(page, 12);
    assert.ok(await fadeOf(page) < 0.1, 'blood on: the picture is still there');
  });
  // the timings: black before the impact for the dog that recovers (the impact is known), and it is all quicker than with the blood
  assert.ok(ATTACK.off.fadeAt <= 0 && ATTACK.off.overAt < ATTACK.overAt && ATTACK.off.reloadAt < ATTACK.reloadAt);
});

test('the option "Sangue e violência gráfica": on by default, in the Options and in the pause, offered at the first start with a content notice, and kept on the memory card', { skip, timeout: 300000 }, async () => {
  await withGame(async ({ page, open }) => {
    await open('');
    assert.equal(await page.evaluate(() => window.__game.options.gore), true, 'on by default');
    // the first start: "Nova partida" asks first, with a notice; the answer is kept
    await page.click('[data-act="new"]');
    assert.equal(await page.evaluate(() => window.__game.screens.current), 'gore');
    const txt = await page.evaluate(() => document.querySelector('#screens .panel').textContent); assert.match(txt, /Aviso de conteúdo/); assert.match(txt, /sangue e violência gráfica/i); assert.match(txt, /Opções/);
    assert.equal(await page.evaluate(() => window.__game.st.phase), 'title', 'the game waits for the answer');
    await page.click('[data-act="gore-off"]');
    await page.waitForFunction(() => window.__game.st.phase === 'play');
    assert.equal(await page.evaluate(() => window.__game.options.gore), false);
    // the card keeps it: a page opened again on the avenue (no cutscene) has the option off, and the pause is next
    await open(QUERY); assert.equal(await page.evaluate(() => window.__game.options.gore), false, 'kept through a reload');
    const meta = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).meta, KEY); assert.equal(meta.goreAsked, true); assert.equal(meta.opts.gore, false, 'saved in the memory card');
    // the pause: the option is there, and changes at any time
    await page.keyboard.down('Escape'); await step(page, 3); await page.keyboard.up('Escape'); await page.waitForFunction(() => window.__game.screens.current === 'menu');
    const row = await page.evaluate(() => [...document.querySelectorAll('#screens .f')].map((b) => b.textContent).find((t) => /Sangue e violência gráfica/.test(t))); assert.match(row, /não/);
    await page.click('[data-o="gore"]');
    assert.equal(await page.evaluate(() => window.__game.options.gore), true); assert.equal(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).meta.opts.gore, KEY), true);
    // the Options: the same row
    await page.click('[data-act="options"]'); await page.waitForFunction(() => window.__game.screens.current === 'options');
    await page.click('[data-tab="conteudo"]');                                                       // the option lives on the tab Conteúdo, drawn as a switch
    assert.match(await page.evaluate(() => document.querySelector('#screens [data-o="gore"]').textContent), /Sangue e violência gráfica/);
    assert.equal(await page.evaluate(() => document.querySelector('#screens [data-o="gore"]').getAttribute('aria-checked')), 'true', 'the switch reads on');
    await page.click('[data-o="gore"]');
    assert.equal(await page.evaluate(() => window.__game.options.gore), false);
    assert.equal(await page.evaluate(() => document.querySelector('#screens [data-o="gore"]').getAttribute('aria-checked')), 'false', 'the switch reads off');
    // a reload of the page: the choice is still there
    await page.reload(); await page.waitForFunction(() => window.__game?.run && window.__game.st.phase);
    assert.equal(await page.evaluate(() => window.__game.options.gore), false, 'kept through a reload');
  });
  await withGame(async ({ page, open }) => {
    await open('');
    await page.evaluate(() => { window.__game.card.setMeta({ goreAsked: true }); });
    await page.click('[data-act="new"]'); await page.waitForFunction(() => window.__game.st.phase === 'play');
    assert.equal(await page.evaluate(() => window.__game.screens.current), null, 'asked once: not again');
    assert.equal(await page.evaluate(() => window.__game.options.gore), true, 'still on: the notice was not answered');
  });
  // every gore element goes through the one check
  const src = readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');
  assert.equal([...src.matchAll(/options\.gore/g)].length, 2, 'options.gore is read by gore() and written by the answer of the notice (the toggle is generic): nothing else asks it');
  assert.ok(/const gore = \(\) => options\.gore !== false;/.test(src));
  assert.equal([...src.matchAll(/\bbuildBlood\(/g)].length, 2, 'the blood is built in one place (its definition and its one call), behind gore()');
  assert.match(src, /S\.blood = gore\(\) \? buildBlood/);
});

test('touch: the labels of the choice are in the scenery with the arrows, and the gore notice fits a phone', { skip, timeout: 300000 }, async () => {
  await withGame(async ({ page, open }) => {
    await open(QUERY);
    for (let i = 0; i < 8 && (await page.evaluate(() => window.__game.director.waitName)) !== 'saida-emenda'; i++) { await page.evaluate(() => { const G = window.__game; G.director.signal('isca'); G.test.teleport(-13.3, 7.0); }); await step(page, 400); }
    await page.evaluate(() => { window.__game.test.teleport(-13.3, 7.0); window.__game.input.S.press.down = true; }); await until(page, () => Boolean(window.__game.st.seq), 40, 10); await page.evaluate(() => { window.__game.input.S.press.down = false; window.__game.input.S.edges.add('skip'); }); await step(page, 3);
    // jumps over to the choice (the sequence of the splice, played by the pad of the screen)
    await page.evaluate(() => { const S = window.__game.st.seq; S.sq.cancel(); S.rec.starts = []; S.rec.wins = []; S.steps.splice(0, 2); S.sq.start(); });
    assert.equal((await sv(page)).kind, 'pick'); await step(page, 20); await frame(page);
    const sign = await page.evaluate(() => { const e = document.getElementById('hud-sign'); return { hidden: e.hidden, keys: [...e.querySelectorAll('kbd')].length, word: e.querySelector('.word').textContent }; });
    assert.equal(sign.hidden, false); assert.equal(sign.keys, 0, 'touch: the buttons ◀ ▶ are on the screen, the sign shows only the words'); assert.match(sign.word, /desorientar/);
    const vis = await page.evaluate(() => Object.fromEntries(['dirL', 'dirR'].map((b) => [b, getComputedStyle(document.querySelector(`.tb-${b}`)).display !== 'none'])));
    assert.deepEqual(vis, { dirL: true, dirR: true });
    await page.tap('.tb-dirR'); await step(page, 4);
    assert.equal(await page.evaluate(() => window.__game.st.seq.rec.choice?.id), 'loud', 'a tap on ▶ chooses the loud way');
  }, { touch: true });
});
