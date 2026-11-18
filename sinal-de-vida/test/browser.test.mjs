// The game in a browser: what the pure tests cannot see (the card, the options). It needs a Chrome and playwright-core, so it only runs when
// PLAYWRIGHT_CORE (the folder of playwright-core) is set, and CHROME (the executable; default /usr/bin/google-chrome); otherwise it is skipped.
//   PLAYWRIGHT_CORE=<folder> node --test test/browser.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const CORE = process.env.PLAYWRIGHT_CORE, skip = CORE ? false : 'set PLAYWRIGHT_CORE to run the browser tests';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg' };
const KEY = 'sinal-de-vida.card.v2';

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
    const open = async (query = '') => { await page.goto(`${url}${query}`); await page.waitForFunction(() => window.__game?.run && window.__game.st.phase); await page.evaluate(() => window.__game.test.manual(true)); await page.waitForTimeout(1500); };
    await fn({ page, open, errors, url });
    assert.deepEqual(errors, [], 'no console error');
  } finally { await browser.close(); srv.close(); }
}

// ---- the radio at the bench (docs: "Interface no cenário"): no window, Jonas does it ------------------------------------------------------------
const step = (page, n) => page.evaluate((k) => window.__game.test.step(k), n);
const press = async (page, key, n = 3) => { await page.keyboard.down(key); await step(page, n); await page.keyboard.up(key); await step(page, 2); };
/** Plays the demonstration up to the bench and sits Jonas at the radio (E on the radio point). */
async function toBench(page, open, touch = false) {
  await open('?demo=1'); await step(page, 520);
  await page.evaluate(() => window.__game.test.teleport(-3.8, -2.9)); await step(page, 30);
  if (touch) await page.tap('.tb-use'); else await page.keyboard.down('KeyE');
  await step(page, 8); if (!touch) await page.keyboard.up('KeyE');
  await step(page, 140);
}
const waitAsk = async (page) => { for (let i = 0; i < 60; i++) { if (await page.evaluate(() => Boolean(window.__game.radio.view().ask))) return true; await step(page, 30); } return false; };
/** The screen point of a part of the radio piece, projected with the game's camera (the render must be fresh). */
const screenOf = (page, part, off = [0, 0, 0]) => page.evaluate(([name, o]) => {
  const G = window.__game, T = G.r.THREE, d = G.desk, p = d.prop.anchor(name);
  p.add(new T.Vector3(...o).applyQuaternion(d.prop.root.getWorldQuaternion(new T.Quaternion())));
  G.test.render();
  return new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => { G.r.camera.updateMatrixWorld(); p.project(G.r.camera); ok([(p.x * 0.5 + 0.5) * innerWidth, (-p.y * 0.5 + 0.5) * innerHeight]); })));    // (the frame puts the camera where the plane is)
}, [part, off]);

test('the radio is an object on the bench: E sits Jonas, he takes the microphone, the dial turns to the channel and the number is on the display (no window)', { skip, timeout: 120000 }, async () => {
  await withGame(async ({ page, open }) => {
    await toBench(page, open);
    const s = await page.evaluate(() => { const G = window.__game, d = G.desk; return { phase: d.phase, ctx: document.getElementById('app').dataset.ctx, mic: d.prop.mic, window: Boolean(document.getElementById('radio')), seat: d.seat, root: G.body.root.position.toArray() }; });
    assert.equal(s.phase, 'on'); assert.equal(s.ctx, 'radio'); assert.equal(s.mic, 'hand', 'the microphone left its hook for his hand'); assert.equal(s.window, false, 'there is no window of the radio');
    assert.ok(Math.hypot(s.root[0] - s.seat.x, s.root[2] - s.seat.z) < 1e-6, 'Jonas sits where the radio asks him to');
    assert.equal(await page.evaluate(() => window.__game.desk.display), 'CANAL 63\nTORRE');
    await press(page, 'ArrowLeft'); await step(page, 12);
    assert.equal(await page.evaluate(() => window.__game.desk.gesture.name), 'radio_seletor', 'Jonas turns the selector');
    assert.equal(await page.evaluate(() => window.__game.desk.display), 'CANAL --\n', 'between two channels the display is blank');
    await step(page, 150);
    assert.equal(await page.evaluate(() => window.__game.desk.display), 'CANAL 21\nA REDE');
    assert.ok(Math.abs(await page.evaluate(() => window.__game.desk.prop.dial) - 21) < 0.01, 'the pointer and the selector are at 21');
    // the answers are lines of text at the bottom, with no box, while he waits with the microphone in his hand
    assert.ok(await waitAsk(page)); await step(page, 2);
    const rows = await page.evaluate(() => [...document.querySelectorAll('#radio-lines .rl')].map((e) => e.textContent));
    assert.equal(rows.length, 2); assert.match(rows[1], /filtro/);
    // leaving: he hangs the microphone and stands up (the call he was in counts as silence, as before)
    await press(page, 'Escape'); await step(page, 200);
    assert.equal(await page.evaluate(() => window.__game.desk.phase), 'off');
    assert.equal(await page.evaluate(() => window.__game.desk.prop.mic), 'hook');
    assert.equal(await page.evaluate(() => document.getElementById('app').dataset.ctx), 'walk');
  });
});

test('transmitting: the answer is chosen, then Jonas speaks only while the button is held; TX lights, the line fills, the mark counts', { skip, timeout: 120000 }, async () => {
  await withGame(async ({ page, open }) => {
    await toBench(page, open);
    await press(page, 'ArrowLeft'); await step(page, 60);
    assert.ok(await waitAsk(page)); await press(page, 'Digit1');
    await page.keyboard.down('KeyT'); await step(page, 100); await page.keyboard.up('KeyT'); await step(page, 5);
    assert.ok(await waitAsk(page));
    await press(page, 'Digit2');
    assert.equal(await page.evaluate(() => window.__game.radio.view().ask.tx), null, 'choosing does not transmit');
    await page.keyboard.down('KeyT'); await step(page, 90);
    const during = await page.evaluate(() => { const G = window.__game, row = document.querySelector('#radio-lines .rl.tx .t'); return { talking: G.desk.talking, disp: G.desk.display, p: row && row.style.getPropertyValue('--p'), button: !document.getElementById('hud-talk').hidden, tick: Boolean(document.querySelector('#radio-lines .rl.sel u')) }; });
    assert.equal(during.talking, true); assert.match(during.disp, /TRANSMITINDO/); assert.ok(during.p && parseFloat(during.p) > 20, `the line fills (${during.p})`); assert.equal(during.button, true); assert.equal(during.tick, true, 'the tick of the mark is on the line');
    await step(page, 140); await page.keyboard.up('KeyT'); await step(page, 3);     // 3.8 s: past the mark (3.4 s) before the end (5.5 s)
    const after = await page.evaluate(() => { const G = window.__game; return { flag: G.run.flags.contouFarmacia, talking: G.desk.talking }; });
    assert.equal(after.flag, true, 'let go after the mark: the information got through'); assert.equal(after.talking, false);
  });
});

test('the password is typed on the keypad of the radio: the computer keyboard enters the letters, and a finger on the keys turns the letter like an old phone', { skip, timeout: 120000 }, async () => {
  await withGame(async ({ page, open }) => {
    await toBench(page, open);
    await press(page, 'Enter'); await step(page, 5);
    assert.equal(await page.evaluate(() => window.__game.desk.sub), 'field');
    assert.match(await page.evaluate(() => window.__game.desk.display), /SENHA:/);
    for (const c of 'cas') { await page.keyboard.press(c); await step(page, 25); }
    assert.equal(await page.evaluate(() => window.__game.desk.password), 'CAS');
    assert.match(await page.evaluate(() => window.__game.desk.display), /SENHA:CAS/, 'the letters are on the display');
    assert.equal(await page.evaluate(() => window.__game.desk.plane), 'perto', 'the camera is on the keys');
    await press(page, 'Escape'); await step(page, 5);
    assert.equal(await page.evaluate(() => window.__game.desk.password), null);
  });
  // a finger (touch) on the keys of the model itself, no button over the picture: 2 2 2 is C, then 2 is A (after a pause), then 7 7 7 7 is S
  await withGame(async ({ page, open }) => {
    await toBench(page, open, true);
    assert.equal(await page.evaluate(() => window.__game.input.device), 'touch');
    const key = async (i) => { const [x, y] = await screenOf(page, `key_${i}`); await page.touchscreen.tap(x, y); await step(page, 40); };
    for (const i of [1, 1, 1]) await key(i);
    await step(page, 70); await key(1); await step(page, 70);
    for (const i of [6, 6, 6, 6]) await key(i);
    assert.equal(await page.evaluate(() => window.__game.desk.password), 'CAS', 'multi-tap: 222 7777 -> C, A, S');
    // # sends: the wrong word does not open it, the display says so
    await key(11); await step(page, 5); await page.evaluate(() => window.__game.radio.settle?.()); await page.waitForTimeout(300); await step(page, 5);
    assert.match(await page.evaluate(() => window.__game.desk.display), /NADA RESPONDE/);
    assert.equal(await page.evaluate(() => window.__game.radio.view().password.ok), false);
  }, { touch: true });
});

test('the keyboard of colours: the five buttons light, Jonas presses them, the row of eight lights shows the sequence, and three wrong tries put it out', { skip, timeout: 120000 }, async () => {
  await withGame(async ({ page, open }) => {
    await toBench(page, open);
    await press(page, 'ArrowRight'); await step(page, 160);                  // 63 -> 88
    assert.equal(await page.evaluate(() => window.__game.radio.view().channel), 'manutencao');
    assert.equal(await page.evaluate(() => window.__game.desk.sub), 'keys');
    for (let i = 0; i < 4; i++) await press(page, 'ArrowRight');
    await press(page, 'KeyE'); await step(page, 40); await press(page, 'ArrowLeft'); await press(page, 'KeyE'); await step(page, 40);      // two buttons that are not the start of the answer
    assert.equal(await page.evaluate(() => window.__game.desk.gesture.name), 'radio_cor', 'Jonas presses a colour button');
    assert.deepEqual(await page.evaluate(() => window.__game.radio.view().keys.seq), ['rosa', 'ciano']);
    assert.match(await page.evaluate(() => window.__game.desk.display), /2\/8/);
    assert.equal(await page.evaluate(() => window.__game.desk.plane), 'perto');
    // a wrong sequence, sent three times (T held for 2 s each): the keyboard goes dark and stays so
    for (let k = 0; k < 3; k++) {
      await page.keyboard.down('KeyT'); await step(page, 130); await page.keyboard.up('KeyT'); await step(page, 3);
      await page.evaluate(() => window.__game.radio.settle()); await step(page, 3);
      if (k < 2) { await press(page, 'KeyE'); await step(page, 40); }
    }
    const v = await page.evaluate(() => window.__game.radio.view().keys);
    assert.equal(v.locked, true); assert.equal(v.left, 0);
    assert.match(await page.evaluate(() => window.__game.desk.display), /APAGADO/);
    assert.equal(await page.evaluate(() => window.__game.desk.lit), false, 'the buttons are out');
  });
});

test('the notebook and the pocket are first person on his hands, with no screen over the picture; the old window and its file are gone', { skip, timeout: 120000 }, async () => {
  assert.equal(existsSync(path.join(ROOT, 'src/radio-ui.js')), false, 'src/radio-ui.js is gone');
  await withGame(async ({ page, open }) => {
    await open('?demo=1'); await step(page, 520);
    await page.evaluate(() => window.__game.hands.ready);
    await page.evaluate(() => window.__game.test.teleport(-6.4, -2.9)); await step(page, 30);
    await page.keyboard.down('KeyE'); await step(page, 8); await page.keyboard.up('KeyE'); await step(page, 130);
    await page.waitForFunction(() => window.__game.hands.kind === 'caderno', null, { timeout: 15000 }).catch(() => {});
    let h = await page.evaluate(() => ({ kind: window.__game.hands.kind, ctx: document.getElementById('app').dataset.ctx, nb: window.__game.hands.state.notebook, screens: !document.getElementById('screens').hidden }));
    assert.equal(h.kind, 'caderno'); assert.equal(h.ctx, 'hands'); assert.equal(h.nb, true, 'the notebook is in his left hand'); assert.equal(h.screens, false);
    await press(page, 'ArrowRight'); await step(page, 80);
    assert.deepEqual(await page.evaluate(() => window.__game.hands.page), [1, 0, 0], 'a page turned');
    await press(page, 'Escape'); await step(page, 3);
    assert.equal(await page.evaluate(() => window.__game.hands.kind), null);
    assert.equal(await page.evaluate(() => document.getElementById('app').dataset.ctx), 'walk');
    await press(page, 'KeyI'); await step(page, 90);
    h = await page.evaluate(() => ({ kind: window.__game.hands.kind, item: window.__game.hands.item, screens: !document.getElementById('screens').hidden }));
    assert.equal(h.kind, 'bolso'); assert.equal(h.item, 'mapa', 'the paper map of the way out is in his hand'); assert.equal(h.screens, false);
    await press(page, 'KeyE'); await step(page, 3);
    assert.equal(await page.evaluate(() => window.__game.hands.kind), null);
  });
});

test('the demonstration is played from start to end at the bench with the keyboard: tune, answer, hold, the radio closes by itself and the night ends', { skip, timeout: 180000 }, async () => {
  await withGame(async ({ page, open }) => {
    await toBench(page, open);
    await press(page, 'ArrowLeft'); await step(page, 60);
    assert.ok(await waitAsk(page)); await press(page, 'Digit1'); await page.keyboard.down('KeyT'); await step(page, 100); await page.keyboard.up('KeyT'); await step(page, 100);
    assert.ok(await waitAsk(page)); await press(page, 'Digit1'); await page.keyboard.down('KeyT'); await step(page, 120); await page.keyboard.up('KeyT');
    for (let i = 0; i < 20 && (await page.evaluate(() => window.__game.st.phase)) !== 'end'; i++) await step(page, 120);
    assert.equal(await page.evaluate(() => window.__game.st.phase), 'end');
    assert.equal(await page.evaluate(() => window.__game.desk.active), false);
  });
});

test('the demonstration never writes the card: a saved game (block 1) and "Continuar" stay as they were', { skip, timeout: 120000 }, async () => {
  await withGame(async ({ page, open }) => {
    await open('?novo=1&semente=4242');
    const before = await page.evaluate((k) => localStorage.getItem(k), KEY);
    const saved = JSON.parse(before);
    assert.equal(saved.run.night, 'noite-1'); assert.equal(saved.run.seed, 4242);
    await open('?demo=1');
    assert.equal(await page.evaluate(() => window.__game.run.night), 'demo');
    await page.evaluate(() => window.__game.test.step(120));
    // the death inside the demonstration goes back to the demonstration's own checkpoint, not to block 1
    await page.evaluate(() => window.__game.test.die());
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.__game.run.night), 'demo');
    assert.equal(await page.evaluate((k) => localStorage.getItem(k), KEY), before, 'block 1 is byte for byte the same');
    // the title offers the real game
    await open('');
    assert.equal(await page.evaluate(() => window.__game.card.hasRun()), true);
    assert.equal(await page.evaluate(() => window.__game.card.data.run.night), 'noite-1');
    await open('?continuar=1');
    assert.equal(await page.evaluate(() => window.__game.run.night), 'noite-1');
  });
});

test('the options have a volume (0 to 10), not an on/off switch, and it is kept on the card', { skip, timeout: 120000 }, async () => {
  await withGame(async ({ page, open }) => {
    await open('');
    await page.evaluate(() => window.__game.screens.open('options'));
    const text = await page.evaluate(() => document.querySelector('#screens .panel').innerText);
    assert.match(text, /Volume: 9 de 10/); assert.doesNotMatch(text, /Som/);
    await page.click('[data-act="vol-"]'); await page.click('[data-act="vol-"]');
    assert.equal(await page.evaluate(() => window.__game.options.volume), 7);
    for (let i = 0; i < 12; i++) await page.click('[data-act="vol-"]');
    assert.equal(await page.evaluate(() => window.__game.options.volume), 0);
    assert.equal(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).meta.opts.volume, KEY), 0);
    await open('');
    assert.equal(await page.evaluate(() => window.__game.options.volume), 0, 'kept after reloading');
  });
});

test('a scene that is still a marker shows a neutral "night under construction"', { skip, timeout: 120000 }, async () => {
  await withGame(async ({ page, open }) => {
    await open('?cena=n2-abertura');
    const goal = await page.evaluate(() => new Promise((ok) => setTimeout(() => ok(window.__game.st.goal), 300)));
    assert.match(goal, /em construção/); assert.doesNotMatch(goal, /demo|fase/i);
  });
});

test('the end of a night does not show the trust (it is hidden): no line of it in the summary', () => {
  const game = readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');
  const night = game.slice(game.indexOf('function nightEnd'), game.indexOf('const startRun'));
  assert.ok(night.includes('const lines = ['), 'the summary exists');
  assert.doesNotMatch(night, /Confian/); assert.doesNotMatch(night.slice(night.indexOf('const lines'), night.indexOf('\n', night.indexOf('const lines'))), /trust/);
});

// ---- phase B: the night 1 from the new game to the card -----------------------------------------------------------------------------------
const SHOTS = process.env.CAPTURES_DIR;                      // when set, the pictures of the scenes are saved there (faseB-*.png)
const ready = (page) => page.waitForFunction(() => window.__game.st.shot >= 0 && window.__game.st.world && !window.__game.st.cut?.loading, null, { timeout: 90000 });
const hold = async (page, key, n) => { await page.keyboard.down(key); await step(page, n); await page.keyboard.up(key); await step(page, 3); };
const place = async (page, x, z, yaw) => { await page.evaluate(([a, b, y]) => { window.__game.test.teleport(a, b); if (y !== undefined) window.__game.player.body = y; }, [x, z, yaw]); await step(page, 3); };
const snap = async (page, name) => { if (!SHOTS) return; await page.evaluate(() => window.__game.test.render()); await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)))); await page.screenshot({ path: path.join(SHOTS, `faseB-${name}.png`) }); };
const goalOf = (page) => page.evaluate(() => window.__game.st.goal);
const frames = (page, n = 3) => page.evaluate((k) => new Promise((ok) => { let c = 0; const f = () => { if (++c >= k) ok(); else requestAnimationFrame(f); }; requestAnimationFrame(f); }), n);
const until = async (page, fn, max = 60) => { for (let i = 0; i < max; i++) { if (await page.evaluate(fn)) return true; await step(page, 30); } return false; };
const ask = (page) => until(page, () => Boolean(window.__game.radio.view().ask));
const answer = async (page, i, seconds) => {
  assert.ok(await ask(page), 'the other voice asked'); await press(page, `Digit${i + 1}`);
  await page.keyboard.down('KeyT'); await step(page, Math.round(seconds * 60)); await page.keyboard.up('KeyT'); await step(page, 3);
};
/**
 * Plays the sequence of the splice right: Use held, the dodge the way the dog asks, Use hammered, Use pressed. Returns the kinds seen, in order, and the log.
 * (`miss`: kinds to leave alone: 'hold' | 'mash' | 'press' | 'dir', wrong way for 'dir-wrong'.)
 */
async function perform(page, { miss = [], max = 700 } = {}) {
  const kinds = []; let held = false, n = 0;
  const key = async (k, down) => { await (down ? page.keyboard.down(k) : page.keyboard.up(k)); };
  for (let i = 0; i < max; i++) {
    const v = await page.evaluate(() => { const S = window.__game.st.seq; if (!S) return null; const w = S.sq.view(); return { kind: w.kind, gap: w.gap, over: w.over, el: w.el, want: w.want, active: w.active, outcome: w.outcome }; });
    if (!v) break;
    if (v.kind && !v.gap && !v.over && kinds.at(-1) !== v.kind) kinds.push(v.kind);
    const want = v.kind === 'hold' && !v.gap && !miss.includes('hold');
    if (want !== held) { held = want; await key('KeyE', held); }
    if (v.kind === 'dir' && !v.gap && !v.over && v.el > 0.35 && !miss.includes('dir')) { await key(miss.includes('dir-wrong') ? (v.want < 0 ? 'ArrowRight' : 'ArrowLeft') : (v.want < 0 ? 'ArrowLeft' : 'ArrowRight'), true); await step(page, 2); await key(v.want < 0 ? 'ArrowLeft' : 'ArrowRight', false); await key(v.want < 0 ? 'ArrowRight' : 'ArrowLeft', false); }
    else if (v.kind === 'mash' && !v.gap && !miss.includes('mash') && n++ % 2 === 0) { await key('KeyE', true); await step(page, 2); await key('KeyE', false); }
    else if (v.kind === 'press' && !v.gap && !miss.includes('press') && v.el > 0.25) { await key('KeyE', true); await step(page, 2); await key('KeyE', false); }
    await step(page, 5);
  }
  await key('KeyE', false);
  return { kinds };
}
const sitAtRadio = async (page) => { await place(page, -3.8, -2.9, 0); await hold(page, 'KeyE', 6); await step(page, 200); };

test('the night 1, from the new game to the card: the six scenes, the decisions, the Escuta, the secrets only as hashes', { skip, timeout: 600000 }, async () => {
  await withGame(async ({ page, open }) => {
    await open('?novo=1&semente=7'); await ready(page);
    // every voice that is played during the night is counted (a voice that plays twice at the same moment is a bug nobody can hear on a silent test)
    await page.evaluate(() => { const v = window.__game.voices, orig = v.play.bind(v); window.__plays = []; v.play = (id, o) => { window.__plays.push(id); return orig(id, o); }; });
    // 1. the city through the grate: a cutscene, skipped by holding Esc for a second
    assert.equal(await page.evaluate(() => window.__game.st.scene.id), 'n1-cidade');
    assert.match(await page.evaluate(() => document.getElementById('cut-skip').textContent), /Esc.*pular/);
    await step(page, 400); await snap(page, 'cena1-cidade-pela-grade');
    await hold(page, 'Escape', 70);
    assert.equal(await page.evaluate(() => window.__game.st.scene.id), 'n1-bomba'); await ready(page);
    // 2. the pump, taught by Neide on the hand radio
    await step(page, 40); await hold(page, 'ArrowRight', 40);
    await place(page, -12.6, -1.5, 0); await step(page, 10); await hold(page, 'KeyE', 6); await step(page, 420);
    await hold(page, 'KeyF', 4);
    await place(page, -10.8, -2.9, 0); await step(page, 5); await snap(page, 'cena2-bomba-lanterna'); await hold(page, 'KeyE', 90); await step(page, 480);
    await place(page, -4.4, 1.6, 3.14); await hold(page, 'KeyE', 8); await place(page, -5.2, 3.4, 3.14); await hold(page, 'KeyE', 8); await step(page, 400);
    await hold(page, 'KeyI', 4); await step(page, 70); await snap(page, 'cena2-bolso'); await hold(page, 'Escape', 4); await step(page, 30);
    await place(page, -5.2, -2.6, 0); await hold(page, 'KeyE', 90); await step(page, 420);
    await place(page, -10.8, -2.9, 0); await hold(page, 'KeyE', 90); await step(page, 520);
    assert.equal(await page.evaluate(() => window.__game.st.scene.id), 'n1-chamada'); await ready(page);
    // 3. the call of 22h: Neide asks about the water, Tânia about going out; decision 1: leave now
    await sitAtRadio(page);
    assert.ok(await ask(page));
    for (let i = 0; i < 40 && (await page.evaluate(() => window.__game.ui.shown)) !== 'hint'; i++) await page.waitForTimeout(250);        // (the notices go first, one at a time)
    const hintOf = () => page.evaluate(() => ({ shown: window.__game.ui.shown, text: document.getElementById('hud-action').textContent }));
    let hint = await hintOf(); assert.equal(hint.shown, 'hint'); assert.match(hint.text, /Escolher/);
    await step(page, 60 * 4); await page.waitForFunction(() => /paciência/.test(document.getElementById('hud-action').textContent), null, { timeout: 15000 }).catch(() => {});
    hint = await hintOf(); assert.match(hint.text, /paciência/, 'the static that fades is her patience: if it ends, he stayed silent');
    await press(page, 'Digit1'); await page.waitForFunction(() => /Soltar antes/.test(document.getElementById('hud-action').textContent), null, { timeout: 15000 }).catch(() => {});
    hint = await hintOf(); assert.match(hint.text, /Soltar antes corta a fala/, 'the first question teaches that letting go early cuts the speech');
    await answer(page, 0, 1.2);
    await until(page, () => window.__game.radio.view().turn === undefined && window.__game.radio.view().ask?.who === 'tania', 40);
    await snap(page, 'cena3-chamada-tania');
    await answer(page, 0, 1.4);
    await until(page, () => window.__game.st.scene.id !== 'n1-chamada' || window.__game.st.goal.includes('isca'), 60);
    assert.equal(await page.evaluate(() => window.__game.run.flags.saiAgora), true, 'decision 1: leave now');
    await step(page, 200);
    await place(page, -5.9, -2.7, 0); await hold(page, 'KeyE', 8);
    assert.deepEqual(await page.evaluate(() => window.__game.run.pocket), ['isca']);
    await place(page, 8.4, 0.9, 0); await hold(page, 'KeyE', 100); await step(page, 30);
    assert.equal(await page.evaluate(() => window.__game.st.scene.id), 'n1-saida'); await ready(page);
    // 4. the avenue: the dog near (decision 1 was "leave now"), the decoy, the splice with the reaction, back down the shaft
    await step(page, 120); await snap(page, 'cena4-saida-inicio');
    assert.match(await goalOf(page), /Rádio de mão/);
    await step(page, 240); await step(page, 100);
    assert.match(await goalOf(page), /Correr \(\{run\}\) faz barulho/, 'running is taught before the first dog can be heard');
    await step(page, 290); assert.match(await goalOf(page), /Siga o cabo/);
    await until(page, () => window.__game.street.machines.list()[0].pos[0] < -16.3, 80);          // (the dog patrols: go to the cable when it has just turned at the far end of its lane, as the scene begins)
    const hardDog = await page.evaluate(() => window.__game.street.machines.list()[0].pos);
    assert.ok(hardDog[0] < -4 && hardDog[0] > -18 && Math.abs(hardDog[1] - 3) < 1, `the dog patrols the lane by the cable (${hardDog})`);
    await place(page, -13.3, 7.0, 1.57); await step(page, 30); await snap(page, 'cena4-cao-quebrado-e-ponta');
    await page.mouse.move(500, 200); await page.mouse.down({ button: 'right' }); await step(page, 12); assert.equal(await page.evaluate(() => window.__game.st.aiming), true);
    await snap(page, 'cena4-mirando-a-isca');
    await page.mouse.down({ button: 'left' }); await step(page, 3); await page.mouse.up({ button: 'left' }); await step(page, 3); await page.mouse.up({ button: 'right' }); await step(page, 30);
    assert.deepEqual(await page.evaluate(() => window.__game.run.pocket), [], 'the decoy was thrown');
    // the splice: held next to the cut, then the cutscene of the dog arriving (skipped by holding Esc) and the sequence of reaction (the four kinds of command)
    await page.keyboard.down('KeyE'); await until(page, () => Boolean(window.__game.st.seq), 30); await page.keyboard.up('KeyE');
    assert.equal(await page.evaluate(() => window.__game.st.seq.phase), 'cine'); await step(page, 200); await snap(page, 'cena4-emenda-cinematica');
    await hold(page, 'Escape', 70);
    assert.equal(await page.evaluate(() => window.__game.st.seq.phase), 'act'); await snap(page, 'cena4-emenda-segurar');
    assert.deepEqual((await perform(page)).kinds, ['hold', 'dir', 'mash', 'press'], JSON.stringify(await page.evaluate(() => ({ seq: Boolean(window.__game.st.seq), esc: window.__game.escuta.value }))));
    await step(page, 10);
    assert.match(await goalOf(page), /poço/, JSON.stringify(await page.evaluate(() => ({ scene: window.__game.run.scene, pocket: window.__game.run.pocket, wait: window.__game.director.waitName, sp: window.__game.street?.street.splice, pos: window.__game.player.pos, esc: window.__game.escuta.value }))));
    await place(page, -1.2, 8.3, 3.14); await hold(page, 'KeyE', 100); await step(page, 30);
    assert.equal(await page.evaluate(() => window.__game.st.scene.id), 'n1-radio'); await ready(page);
    // 5. the radio: Lia's message, the channel 47, the recording of the dam, the call with the operator (the careless way: telling)
    await sitAtRadio(page); await step(page, 300);
    assert.ok(await page.evaluate(() => window.__game.radio.isKnown('represa')), 'the channel 47 is in the notebook');
    await step(page, 300); await hold(page, 'ArrowRight', 3); await step(page, 200); await hold(page, 'ArrowRight', 3);    // 21 -> 63 -> 47
    await step(page, 120); assert.equal(await page.evaluate(() => window.__game.radio.view().channelN), '47');
    await step(page, 600); await snap(page, 'cena5-radio-senha-pisca');
    // the field of the password blinks on the display: it is on and off (read at both moments), and the second line is the name of the channel or empty otherwise
    const seen = new Set();
    for (let i = 0; i < 6; i++) {
      const on = await page.evaluate(() => window.__game.desk.display.includes('SENHA DA REDE')); seen.add(on);
      if (!seen.has(`snap${on}`)) { seen.add(`snap${on}`); await snap(page, on ? 'r2-visor-senha-ligado' : 'r2-visor-senha-apagado'); }
      await step(page, 62);
    }
    seen.delete('snaptrue'); seen.delete('snapfalse');
    assert.deepEqual([...seen].sort(), [false, true], 'the display shows "SENHA DA REDE:" and then not');
    await step(page, 35); await snap(page, 'r2-visor-senha');
    await hold(page, 'ArrowLeft', 3); await step(page, 200);        // back to 63
    assert.equal(await page.evaluate(() => window.__game.radio.view().channelN), '63');
    await answer(page, 0, 3.5);                                                                                      // "Alguém escutando?"
    await answer(page, 0, 2.1);                                                                                      // "Quem é?"
    await snap(page, 'cena5-operadora-decisao-2');
    await answer(page, 0, 7.1);                                                                                      // tell (past the mark)
    assert.equal(await page.evaluate(() => window.__game.run.flags.contou), true);
    assert.ok(await until(page, () => window.__game.run.flags.soubeComporta === true, 40), 'the line 06b came: the tower of the sluice is known');
    await answer(page, 0, 3.3);
    const esc = await page.evaluate(() => window.__game.escuta.value); assert.ok(esc >= 50, `the Escuta is ${esc}: the cut on the dog at the grate`);
    // 6. the cut at the peak, then the card with the block 13 broken
    await until(page, () => window.__game.st.scene.id === 'n1-corte' && Boolean(window.__game.st.cut), 80); await step(page, 300); await snap(page, 'cena6-corte-cao-na-grade');
    await until(page, () => window.__game.st.phase === 'end', 60);
    assert.equal(await page.evaluate(() => window.__game.screens.current), 'cardend'); await snap(page, 'cena6-cartao-bloco-13');
    const card = await page.evaluate(() => { const c = window.__game.card.data; return { done: c.nights['noite-1']?.done, esc: c.nights['noite-1']?.summary?.escuta, endings: c.endings }; });
    assert.equal(card.done, true); assert.ok(card.esc >= 50);
    assert.match(await page.evaluate(() => document.getElementById('screens').textContent), /Quebrado/);
    const plays = await page.evaluate(() => window.__plays), count = {}; for (const id of plays) count[id] = (count[id] ?? 0) + 1;
    assert.deepEqual(Object.entries(count).filter(([, n]) => n > 1), [], `no voice plays twice in the night (${JSON.stringify(count)})`);
    assert.ok(plays.includes('c01') && plays.includes('r-lia') && plays.includes('r-represa'), 'the first lines of the conversations were played');
    // the repository holds no answer: the card and the save have only what was played
    const saved = await page.evaluate(() => JSON.stringify(window.__game.card.data));
    assert.doesNotMatch(saved, /verde/i, 'the colours are not in the card');
  });
});

test('the scenes can be opened one by one (?cena=), the four endings of the cut, and nothing of it is written on the card', { skip, timeout: 300000 }, async () => {
  const cut = async (query, who) => withGame(async ({ page, open }) => {
    await open(query); await ready(page);
    await page.waitForFunction(() => window.__game.st.cut && !window.__game.st.cut.loading, null, { timeout: 60000 });
    const info = await page.evaluate(() => ({ voices: window.__game.st.cut.b.lines.map((l) => [l.voice, l.from]), world: window.__game.st.world.name }));
    who(info);
    await snap(page, `corte-${query.replace(/[^a-z0-9]+/gi, '-')}`);
    for (let i = 0; i < 60 && (await page.evaluate(() => window.__game.st.phase)) !== 'end'; i++) { await step(page, 60); await page.waitForTimeout(150); }
    assert.equal(await page.evaluate(() => window.__game.st.phase), 'end');
    assert.equal(await page.evaluate(() => localStorage.getItem('sinal-de-vida.card.v2')), null, 'a jump writes nothing on the card');
  });
  await cut('?cena=n1-corte&escuta=70&contou=1', (i) => { assert.deepEqual(i.voices, [['08', undefined]], 'the whole line 08'); });
  await cut('?cena=n1-corte&escuta=70&contou=0', (i) => { assert.equal(i.voices[0][0], '08'); assert.equal(i.voices[0][1], '@08.cutFrom', 'only from the second sentence: the point is the one of data/story/marcas.json'); });
  await cut('?cena=n1-corte&escuta=70&acabou=1', (i) => { assert.deepEqual(i.voices, [], 'no voice'); });
  await cut('?cena=n1-corte&escuta=30&contou=0', (i) => { assert.equal(i.voices[0][0], 'op-fim'); });
});

test('the street: the hiding place keeps the dog from finding him, a dog that catches him starts the scene again, the splice needs the whole hold', { skip, timeout: 300000 }, async () => {
  await withGame(async ({ page, open }) => {
    await open('?cena=n1-saida&sair=agora&semente=7'); await ready(page);
    await place(page, -13.2, 6.4, 3.14); await step(page, 5); await press(page, 'KeyE');
    assert.equal(await page.evaluate(() => window.__game.player.hidden), 'cacamba');
    await step(page, 900);
    assert.equal(await page.evaluate(() => window.__game.player.hidden), 'cacamba', 'a dog searching around the skip does not take him');
    assert.equal(await page.evaluate(() => window.__game.run.scene), 3);
    await page.evaluate(() => { window.__game.bus.emit('person:down', { id: 'jonas', by: 'cao-avenida' }); });
    await step(page, 30); await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => window.__game.player.hidden), null, 'the scene started again from its checkpoint');
    assert.deepEqual(await page.evaluate(() => window.__game.player.pos.map((x) => +x.toFixed(1))), [-1.2, 8.1]);
    assert.equal(await page.evaluate(() => window.__game.run.pocket.includes('isca')), true, 'the decoy is back');
  });
});

// ---- the corrections of the round 2 of the phase B ------------------------------------------------------------------------------------------
test('one line of text over the picture at a time: the caption first, then the notice, then the hint of the button or the goal; nothing piles up', { skip, timeout: 120000 }, async () => {
  await withGame(async ({ page, open }) => {
    await open('?cena=n1-radio'); await ready(page);
    const lines = () => page.evaluate(() => ['hud-say', 'hud-toast', 'hud-action', 'hud-goal', 'hud-hurt'].filter((id) => { const e = document.getElementById(id); return e && !e.hidden && e.textContent.trim(); }));
    await page.evaluate(() => { const u = window.__game.ui; u.say('Dona Neide', 'uma fala', 1.4); const n = performance.now() / 1000 + 30; u.toast('um aviso', n); u.toast('outro aviso', n); u.toast('um aviso', n); });
    const seen = [], texts = [];
    for (let i = 0; i < 90 && !(seen.includes('hud-toast') && (seen.lastIndexOf('hud-goal') > seen.lastIndexOf('hud-toast') || seen.lastIndexOf('hud-action') > seen.lastIndexOf('hud-toast'))); i++) { await page.waitForTimeout(250); const l = await lines(); assert.ok(l.length <= 1, `two lines of text at once: ${l}`); seen.push(l[0] ?? null); if (l[0] === 'hud-toast') texts.push(await page.evaluate(() => document.getElementById('hud-toast').textContent)); }
    assert.equal(seen.find((x) => x !== 'hud-goal' && x !== 'hud-action'), 'hud-say', `the caption goes first ${JSON.stringify(seen)}`);
    assert.ok(seen.indexOf('hud-toast') > seen.indexOf('hud-say'), `the notice waits for the caption ${JSON.stringify(seen)}`);
    assert.ok(seen.includes('hud-goal') || seen.includes('hud-action'), 'then the goal of the scene, or the hint of what is in front of him');
    assert.deepEqual([...new Set(texts)], ['um aviso', 'outro aviso'], 'two notices, one after the other, the repeated one was not queued twice');
    assert.ok(texts.lastIndexOf('um aviso') < texts.indexOf('outro aviso'));
  });
});

test('opening the radio on a line that has just begun plays its voice once, and Esc cuts it', { skip, timeout: 120000 }, async () => {
  await withGame(async ({ page, open }) => {
    await open('?cena=n1-chamada'); await ready(page);
    await page.evaluate(() => { const v = window.__game.voices, orig = v.play.bind(v); window.__plays = []; v.play = (id, o) => { window.__plays.push([id, o?.from ?? 0]); return orig(id, o); }; });
    await sitAtRadio(page); await step(page, 60);
    assert.deepEqual(await page.evaluate(() => window.__plays.filter(([id]) => id === 'c01')), [['c01', 0]], 'c01 once');
    assert.equal(await page.evaluate(() => window.__game.st.radioVoice.stopped), false);
    await hold(page, 'Escape', 4);
    assert.equal(await page.evaluate(() => window.__game.st.radioVoice.stopped), true, 'Esc cuts the voice');
    // opened again in the middle of the line: it goes on from where it was, one copy
    await step(page, 200); await sitAtRadio(page); await step(page, 30);
    assert.equal(await page.evaluate(() => window.__plays.filter(([id]) => id === 'c01').length), 2, 'one more, from the middle');
  });
});


/** Where a point is on the screen (the camera's), and whether anything of the scene is in front of it (the grate, the dog itself and the halo do not count). Runs in the page. */
const SEEN = `(G, pos, T) => {
  const cam = G.r.camera; cam.updateMatrixWorld();
  const p = new T.Vector3(pos[0], pos[1], pos[2]), q = p.clone().project(cam), d = p.distanceTo(cam.position);
  const rc = new T.Raycaster(cam.position.clone(), p.clone().sub(cam.position).normalize(), 0, d - 0.9);
  const hits = rc.intersectObjects(G.r.scene.children, true).filter((h) => { for (let o = h.object; o; o = o.parent) if (o.name === 'grade' || !o.visible) return false; return h.object.material && !h.object.material.isSpriteMaterial; });
  return { x: q.x, y: q.y, inside: q.z < 1 && Math.abs(q.x) < 0.9 && Math.abs(q.y) < 0.9, blocked: hits.length, dist: d };
}`;

test('the grate of the first cutscene is geometry (in the game and in the film mode), and the broken dog lies down and blinks a light that reads on a phone', { skip, timeout: 300000 }, async () => {
  await withGame(async ({ page, open }) => {
    await open('?cena=n1-cidade'); await page.waitForFunction(() => window.__game.st.cut && !window.__game.st.cut.loading, null, { timeout: 90000 });
    await step(page, 60); await page.waitForTimeout(300);
    const g = await page.evaluate(() => { const o = window.__game.r.scene.children.find((c) => c.name === 'grade'); return { visible: o?.visible, bars: o?.children.length, css: getComputedStyle(document.getElementById('app'), '::after').content }; });
    await snap(page, 'r2-grade-geometria');
    assert.equal(g.visible, true); assert.ok(g.bars >= 12, 'bars of real geometry'); assert.ok(g.css === 'none' || g.css === 'normal', 'no CSS layer');
    // the picture has the bars: a row of the screen crosses several dark vertical bars
    const bars = await page.evaluate(async () => {
      window.__game.test.render(); await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
      const c = window.__game.r.renderer.domElement, t = document.createElement('canvas'); t.width = c.width; t.height = c.height; t.getContext('2d').drawImage(c, 0, 0);
      const y = Math.floor(t.height * 0.5), px = t.getContext('2d').getImageData(0, y, t.width, 1).data; let n = 0, dark = false;
      for (let x = 0; x < t.width; x++) { const l = px[x * 4] + px[x * 4 + 1] + px[x * 4 + 2]; const d = l < 40; if (d && !dark) n++; dark = d; }
      return n;
    });
    assert.ok(bars >= 5, `the dark bars cross the picture (${bars})`);
    // a dog of the fleet crosses the picture between the bars: projected on the screen, inside it, with nothing in front of it (measured every 0.4 s over the cutscene)
    const seen = []; let shotA = false, shotB = false;
    for (let t = 0.4; t < 14; t += 0.4) {
      const r = await page.evaluate(async ([k, src]) => {
        const G = window.__game; while (G.st.cut && G.st.cut.t < k) G.test.step(6);
        G.test.render(); await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
        const f = eval(src), out = [];
        for (const a of G.st.cut.actors) out.push({ ...f(G, [a.d.root.position.x, a.d.root.position.y + 0.45, a.d.root.position.z], G.r.THREE), t: G.st.cut.t });
        return out;
      }, [t, SEEN]);
      const ok = r.filter((x) => x.inside && x.blocked === 0 && x.dist < 14); seen.push(...ok);
      if (ok.length && !shotA && t > 4) { shotA = true; await snap(page, 'r3-grade-cao-cruzando'); }
      if (ok.length && !shotB && t > 8.5) { shotB = true; await snap(page, 'r3-grade-cao-cruzando-2'); }
    }
    assert.ok(seen.length >= 6, `a dog is in the picture, near and in the clear, in several samples (${seen.length})`);
    assert.ok(new Set(seen.map((x) => Math.round(x.t))).size >= 4, 'for several seconds');
  });
  // the same view in the film mode: the bars are in the picture too (the CSS of the game is not there)
  await withGame(async ({ page, url }) => {
    await page.goto(url.replace('index.html', 'index.html?film')); await page.waitForFunction(() => window.setup);
    await page.evaluate(() => window.setup({ width: 640, height: 360 }));
    const n = await page.evaluate(async () => {
      window.shot({ from: 'noite1.grade', duration: 14 });
      const rows = async () => {
        const img = new Image(); img.src = window.frame(2.0); await new Promise((ok) => { img.onload = ok; });
        const t = document.createElement('canvas'); t.width = 640; t.height = 360; const g = t.getContext('2d'); g.drawImage(img, 0, 0);
        return [0.35, 0.5, 0.65].map((fy) => g.getImageData(0, Math.floor(360 * fy), 640, 1).data);
      };
      const a = await rows(), o = window.__film.current.render.scene.getObjectByName('grade');
      o.children.forEach((m) => { m.visible = false; }); const b = await rows(); o.children.forEach((m) => { m.visible = true; });
      let best = 0;
      a.forEach((pa, i) => { const pb = b[i]; let k = 0, on = false; for (let x = 0; x < 640; x++) { const d = Math.abs(pa[x * 4] - pb[x * 4]) + Math.abs(pa[x * 4 + 1] - pb[x * 4 + 1]) + Math.abs(pa[x * 4 + 2] - pb[x * 4 + 2]) > 24; if (d && !on) k++; on = d; } best = Math.max(best, k); });
      return best;
    });
    assert.ok(n >= 5, `the film of noite1.grade has the bars (${n})`);
    const SC = JSON.parse(readFileSync(path.join(ROOT, 'data/story/scenes.json'), 'utf8'))['n1-cidade'].beats.find((b) => b.type === 'cutscene');
    const film = await page.evaluate(async ([cut, src]) => {
      const F = window.__film.current, T = F.render.THREE, f = eval(src), out = [];
      window.shot({ from: 'noite1.grade', duration: 14 });
      for (let t = 0.4; t < 14; t += 0.4) {
        window.frame(t);
        for (const a of cut.actors) { const k = Math.max(0, Math.min(1, (t - a.t0) / (a.t1 - a.t0))); const pos = [a.from[0] + (a.to[0] - a.from[0]) * k, 0.45, a.from[1] + (a.to[1] - a.from[1]) * k];
          out.push({ ...f({ r: F.render }, pos, T), t }); }
      }
      return out;
    }, [SC, SEEN]);
    const inFilm = film.filter((x) => x.inside && x.blocked === 0 && x.dist < 14);
    assert.ok(inFilm.length >= 6 && new Set(inFilm.map((x) => Math.round(x.t))).size >= 4, `a dog crosses the film of noite1.grade (${inFilm.length} samples)`);
  });
  await withGame(async ({ page, open }) => {
    await open('?cena=n1-saida&sair=agora&semente=7'); await ready(page);
    await page.evaluate(() => window.__game.test.teleport(-13.3, 7.5)); await step(page, 100);
    const lit = [];
    for (const t of [0.2, 0.2 + 0.75, 0.2 + 1.5, 0.2 + 2.25, 0.2 + 3, 0.2 + 3.75, 0.2 + 4.5, 0.2 + 5.25]) {
      await page.evaluate((x) => { window.__game.street.flashT = x; }, t); await step(page, 1); await frames(page, 3);
      lit.push(await page.evaluate(() => { const b = window.__game.street.broken; return b.halo.sprite.visible ? b.halo.sprite.material.color.getHexString() : null; }));
    }
    assert.ok(lit.every(Boolean), 'a light for each of the eight colours'); assert.ok(new Set(lit).size >= 4, 'the colours differ');
    await page.evaluate(() => { window.__game.street.flashT = 0.7; }); await step(page, 1); await frames(page, 3);
    assert.equal(await page.evaluate(() => window.__game.street.broken.halo.sprite.visible), false, 'dark between two colours');
    await snap(page, 'r3-cao-quebrado-caido');
  });
});

test('the cut with the Escuta under 50: the dog passing far away is really in the picture at the end of the shot', { skip, timeout: 300000 }, async () => {
  await withGame(async ({ page, open }) => {
    await open('?cena=n1-corte&escuta=30&contou=0'); await ready(page);
    assert.ok(await until(page, () => window.__game.st.cut?.b.noJonas && !window.__game.st.cut.loading, 200), 'the last cutscene of the night');
    await step(page, 60 * 5 - 30); await frames(page, 4); await page.evaluate(() => window.__game.test.render()); await frames(page, 3);
    const v = await page.evaluate(() => {
      const G = window.__game, a = G.st.cut.actors[0].d.root, p = a.position.clone().add({ x: 0, y: 0.5, z: 0, isVector3: false }); G.r.camera.updateMatrixWorld();
      const q = new G.r.THREE.Vector3(a.position.x, a.position.y + 0.5, a.position.z).project(G.r.camera);
      return { visible: a.visible, x: q.x, y: q.y, z: q.z, at: G.st.cut.t };
    });
    assert.ok(v.visible && Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.95 && v.z < 1, `the dog is in the frame: ${JSON.stringify(v)}`);
    await snap(page, 'r3-corte-cao-passando');
  });
});

test('the broken dog lying on the pavement is a body: Jonas walks against it and stops, and the way to the cable and to the skip stays open', { skip, timeout: 120000 }, async () => {
  await withGame(async ({ page, open }) => {
    await open('?cena=n1-saida&sair=agora&semente=7'); await ready(page);
    const run = (from, dir, n) => page.evaluate(([f, d, k]) => {
      const G = window.__game; G.player.pos = [...f]; const cols = G.test.colliders(); let w = 0;
      for (let i = 0; i < k; i++) G.player.step(1 / 60, { mx: d[0], mz: d[1] }, 0, { colliders: cols }, {});
      return { pos: G.player.pos.map((x) => +x.toFixed(2)), hits: cols.length };
    }, [from, dir, n]);
    const dog = [-11.4, 5.6];
    // from the east, from the west, from the north and from the south, straight at the middle of the dog: he stops before the centre, outside the body
    for (const [from, dir] of [[[-9.2, 5.6], [-1, 0]], [[-13.6, 5.6], [1, 0]], [[-11.4, 8.2], [0, -1]], [[-11.4, 3.4], [0, 1]]]) {
      const r = await run(from, dir, 240);
      const d = Math.hypot(r.pos[0] - dog[0], r.pos[1] - dog[1]);
      assert.ok(d > 0.5, `Jonas stopped at ${d.toFixed(2)} m from the middle of the dog (${r.pos})`);
    }
    // the box of the dog does not close the way to the cut of the cable (nor the one beside the skip): they are outside it, with the radius of Jonas
    const own = await page.evaluate(() => window.__game.test.colliders().at(-1));
    for (const p of [[-13.3, 7.0], [-12.9, 8.0]]) assert.ok(!(p[0] > own.min[0] - 0.3 && p[0] < own.max[0] + 0.3 && p[1] > own.min[1] - 0.3 && p[1] < own.max[1] + 0.3), `${p} is free`);
    assert.ok(own.max[0] - own.min[0] > 1.2 && own.max[0] - own.min[0] < 1.8, 'about the size of the dog');
  });
});


// ---- câmera e ação variadas: the scene 4 (the avenue) over the shoulder, and the splice as a sequence of action ---------------------------------------------
/** Opens the avenue, makes the story wait for the splice and puts Jonas at the cut with the button held until the cutscene of the dog starts. */
async function toSplice(page, open, query = '?cena=n1-saida&sair=agora&semente=7&emenda=cheia') {
  await open(query); await ready(page);
  for (let i = 0; i < 8 && (await page.evaluate(() => window.__game.director.waitName)) !== 'saida-emenda'; i++) { await page.evaluate(() => { const G = window.__game; G.director.signal('isca'); G.test.teleport(-13.3, 7.0); }); await step(page, 400); }
  assert.equal(await page.evaluate(() => window.__game.director.waitName), 'saida-emenda');
  await place(page, -13.3, 7.0, 3.14);
  await page.keyboard.down('KeyE'); const ok = await until(page, () => Boolean(window.__game.st.seq), 40); await page.keyboard.up('KeyE');
  assert.ok(ok, 'the dog arrives (the cutscene starts) at the middle of the hold'); assert.equal(await page.evaluate(() => window.__game.st.seq.phase), 'cine');
}
const skipCine = async (page) => { await hold(page, 'Escape', 70); await page.waitForFunction(() => window.__game.st.seq?.phase === 'act'); };
const escutaOf = (page) => page.evaluate(() => window.__game.escuta.value);

test('over the shoulder in the street: the camera is behind and above him, never inside a building, a car or the skip; it goes close and low in the skip; the look is limited', { skip, timeout: 300000 }, async () => {
  await withGame(async ({ page, open }) => {
    await open('?cena=n1-saida&sair=agora&semente=7'); await ready(page);
    assert.equal(await page.evaluate(() => window.__game.st.camMode), 'ombro'); assert.equal(await page.evaluate(() => window.__game.st.scene.shots.length > 0), true);
    // wherever he walks (along the buildings, between the cars, at the skip, the hoarding, the pillars), the eye is outside every box of the floor
    const inside = () => page.evaluate(() => { const G = window.__game, c = G.r.camera.position, cols = G.test.colliders(); const hit = cols.find((b) => c.x > b.min[0] && c.x < b.max[0] && c.z > b.min[1] && c.z < b.max[1]); return { hit: Boolean(hit), d: Math.hypot(c.x - G.player.pos[0], c.z - G.player.pos[1]), y: c.y }; });
    for (const [x, z, yaw] of [[-1.2, 8.1, 1.57], [-13.3, 8.1, 3.14], [-12.5, 10.2, 3.14], [-20, 7.2, 1.57], [-16, 4.1, 0], [-4, 6.8, 3.14], [-22, 9, 3.0], [8, 10.3, 0], [-6.9, 7.3, 0]]) {
      await place(page, x, z, yaw); await page.evaluate((y) => { window.__game.cam.place(y); }, yaw); await step(page, 90); await frames(page, 3);
      const c = await inside(); assert.equal(c.hit, false, `the camera is not inside a box (${x}, ${z})`); assert.ok(c.d < 3.2 && c.y > 0.9, `${JSON.stringify(c)}`);
    }
    // in the open: behind him, to the right and above
    await place(page, -1.2, 8.1, 1.57); await page.evaluate(() => window.__game.cam.place(1.5708)); await step(page, 60); await frames(page, 3);
    const open1 = await page.evaluate(() => { const G = window.__game, c = G.r.camera.position, p = G.player.pos; return { dx: c.x - p[0], dz: c.z - p[1], dy: c.y }; });
    assert.ok(open1.dx > 1.5, `behind him (he faces west): ${JSON.stringify(open1)}`); assert.ok(open1.dy > 1.8 && open1.dz > -0.9 && open1.dz < -0.2, 'above the shoulder, to the right (north when he faces west is to his right)');
    await snap(page, 'ombro-na-rua');
    // the look is limited
    await page.keyboard.down('ArrowRight'); await step(page, 200); await page.keyboard.up('ArrowRight');
    const lim = await page.evaluate(() => { const G = window.__game; return Math.abs(Math.atan2(Math.sin(G.cam.yaw - G.player.body), Math.cos(G.cam.yaw - G.player.body))); });
    assert.ok(lim > 1.0 && lim < 1.5, `free but limited (${lim.toFixed(2)} rad)`);
    // the stick walks relative to the camera: W goes where the camera looks
    await place(page, -1.2, 8.1, 1.5708); await page.evaluate(() => window.__game.cam.place(0)); await step(page, 3);        // the camera looks north, the body west
    await page.keyboard.down('KeyW'); await step(page, 60); await page.keyboard.up('KeyW');
    const pos = await page.evaluate(() => window.__game.player.pos); assert.ok(pos[1] < 7.2 && Math.abs(pos[0] + 1.2) < 0.4, `W went north, as the camera looks (${pos})`);
    // hiding in the skip: the camera comes close and low
    await place(page, -13.2, 6.4, 3.14); await page.evaluate(() => window.__game.cam.place(3.14)); await step(page, 5); await press(page, 'KeyE');
    assert.equal(await page.evaluate(() => window.__game.player.hidden), 'cacamba'); await step(page, 60); await frames(page, 3);
    const hid = await inside(); assert.ok(hid.d < 0.5 && hid.y < 1.45, `close and low in the skip ${JSON.stringify(hid)}`);
    assert.equal(await page.evaluate(() => document.getElementById('app').dataset.hide), '1', 'the rim of the skip darkens the picture');
    await snap(page, 'ombro-escondido-cacamba');
    await press(page, 'KeyE'); await step(page, 60); await frames(page, 90);
    assert.equal(await page.evaluate(() => document.getElementById('app').dataset.hide ?? null), null);
    assert.ok(await page.evaluate(() => window.__game.cam.hideK < 0.05), 'out of the skip the camera is no longer the close and low one (it is pushed in only by the skip behind him)');
  });
});

test('the splice, done right: the cutscene (4 to 6 s, skippable with Esc held), then hold, dodge, hammer and press, in four kinds; nothing is missed and the splice is closed', { skip, timeout: 600000 }, async () => {
  await withGame(async ({ page, open }) => {
    await toSplice(page, open);
    const pose = await page.evaluate(() => ({ shot: window.__game.st.seq.pose.shot, ctx: document.getElementById('app').dataset.ctx, bars: !document.getElementById('cutbars').hidden, skip: document.getElementById('cut-skip').textContent }));
    assert.equal(pose.ctx, 'cut'); assert.equal(pose.bars, true); assert.match(pose.skip, /Esc.*pular/);
    for (const [sec, shot] of [[0.6, 0], [3.5, 1], [4.9, 2]]) { await step(page, Math.max(1, Math.round((sec - (await page.evaluate(() => window.__game.st.seq.ct))) * 60))); assert.equal(await page.evaluate(() => window.__game.st.seq.pose.shot), shot, `plane ${shot} at ${sec} s`); if (shot === 1) await snap(page, 'emenda-cinematica-sensor'); }
    await until(page, () => window.__game.st.seq?.phase === 'act', 40);
    assert.equal(await page.evaluate(() => window.__game.st.seq.phase), 'act', 'the cutscene ends by itself (without the skip)');
    const before = await escutaOf(page);
    const { kinds } = await perform(page);
    assert.deepEqual(kinds, ['hold', 'dir', 'mash', 'press']);
    await step(page, 10);
    assert.equal(await page.evaluate(() => window.__game.st.seq), null, 'the sequence is over');
    assert.equal(await escutaOf(page), before, 'nothing missed: the Escuta did not move');
    assert.equal(await page.evaluate(() => window.__game.street.street.splice.state), 'done');
    assert.match(await goalOf(page), /poço/); assert.equal(await page.evaluate(() => window.__game.quick.active), false, 'the old ring did not come up');
    assert.deepEqual(await page.evaluate(() => window.__game.player.pos.map((x) => +x.toFixed(1))), [-13.3, 8.1], 'he stands where he worked');
  });
});

test('the cutscene of the dog arriving can be skipped (Esc held 1 s, Start, or the Pular button on touch) and the sequence starts at the first step', { skip, timeout: 300000 }, async () => {
  await withGame(async ({ page, open }) => {
    await toSplice(page, open); await step(page, 90);
    assert.ok(await page.evaluate(() => window.__game.st.seq.ct) < 2.5);
    await skipCine(page);
    const v = await page.evaluate(() => { const S = window.__game.st.seq; return { phase: S.phase, kind: S.sq.view().kind, first: S.sq.view().first, total: S.sq.view().total, ctx: document.getElementById('app').dataset.ctx, bars: document.getElementById('cutbars').hidden }; });
    assert.deepEqual(v, { phase: 'act', kind: 'hold', first: true, total: 4.4, ctx: 'walk', bars: true });
  });
  await withGame(async ({ page, open }) => {
    await open('?cena=n1-saida&sair=agora&semente=7&emenda=cheia'); await ready(page);
    for (let i = 0; i < 8 && (await page.evaluate(() => window.__game.director.waitName)) !== 'saida-emenda'; i++) { await page.evaluate(() => { const G = window.__game; G.director.signal('isca'); G.test.teleport(-13.3, 7.0); }); await step(page, 400); }
    await place(page, -13.3, 7.0, 3.14);
    await page.evaluate(() => { window.__game.input.S.press.down = true; }); await until(page, () => Boolean(window.__game.st.seq), 40); await page.evaluate(() => { window.__game.input.S.press.down = false; });
    assert.ok(await page.evaluate(() => Boolean(window.__game.st.seq)));
    await page.evaluate(() => window.__game.input.S.edges.add('skip')); await step(page, 3);
    assert.equal(await page.evaluate(() => window.__game.st.seq.phase), 'act', 'the Pular button (touch) skips it too');
  }, { touch: true });
});

test('missing what is not the dodge makes noise and the game goes on: +8 on the Escuta for each, in the hold, the hammer and the press', { skip, timeout: 600000 }, async () => {
  await withGame(async ({ page, open }) => {
    await toSplice(page, open); await skipCine(page);
    const before = await escutaOf(page);
    const { kinds } = await perform(page, { miss: ['hold', 'mash', 'press'] });
    assert.deepEqual(kinds, ['hold', 'dir', 'mash', 'press'], 'every step was still shown: the sequence goes on');
    await step(page, 10);
    assert.equal(await page.evaluate(() => window.__game.st.seq), null);
    assert.equal(await escutaOf(page), before + 24, 'three misses of +8');
    assert.equal(await page.evaluate(() => window.__game.street.street.splice.state), 'done', 'the splice is closed all the same');
    assert.match(await goalOf(page), /poço/);
  });
});

test('missing or mistaking the dodge: the dog knocks him down and the scene starts again from the checkpoint (his place, the decoy back)', { skip, timeout: 600000 }, async () => {
  for (const miss of [['dir'], ['dir-wrong']]) await withGame(async ({ page, open }) => {
    await toSplice(page, open); await skipCine(page);
    await perform(page, { miss, max: 260 });
    const log = await page.evaluate(() => { const S = window.__game.st.seq; return S ? S.sq.view().outcome : 'restarted'; });
    assert.ok(['knocked', 'restarted'].includes(log), String(log));
    await page.waitForFunction(() => !window.__game.st.seq && window.__game.player.pos[0] > -2, null, { timeout: 60000 }).catch(async () => { for (let i = 0; i < 40 && (await page.evaluate(() => Boolean(window.__game.st.seq))); i++) { await step(page, 30); await page.waitForTimeout(60); } });
    await step(page, 40); await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => window.__game.st.seq), null); assert.deepEqual(await page.evaluate(() => window.__game.player.pos.map((x) => +x.toFixed(1))), [-1.2, 8.1], 'back at the start of the scene');
    assert.equal(await page.evaluate(() => window.__game.run.pocket.includes('isca')), true, 'the decoy is back');
  });
});

test('accessibility: "mais tempo" doubles the windows of every kind, "desligada" does every step by itself (and the sequence closes the splice)', { skip, timeout: 600000 }, async () => {
  await withGame(async ({ page, open }) => {
    await toSplice(page, open); await skipCine(page);
    await page.evaluate(() => { window.__game.options.quick = 'long'; });
    await page.evaluate(() => { const S = window.__game.st.seq; S.sq.cancel(); S.rec.starts = []; S.rec.wins = []; S.sq.start(); });
    assert.equal(await page.evaluate(() => window.__game.st.seq.sq.view().total), 8.8, 'the first hold has four times the base');
  });
  await withGame(async ({ page, open }) => {
    await open('?cena=n1-saida&sair=agora&semente=7&emenda=cheia'); await ready(page);
    await page.evaluate(() => { window.__game.options.quick = 'off'; });
    for (let i = 0; i < 8 && (await page.evaluate(() => window.__game.director.waitName)) !== 'saida-emenda'; i++) { await page.evaluate(() => { const G = window.__game; G.director.signal('isca'); G.test.teleport(-13.3, 7.0); }); await step(page, 400); }
    await place(page, -13.3, 7.0, 3.14); await page.keyboard.down('KeyE'); await until(page, () => Boolean(window.__game.st.seq), 40); await page.keyboard.up('KeyE');
    await skipCine(page); const before = await escutaOf(page);
    const kinds = []; for (let i = 0; i < 700 && (await page.evaluate(() => Boolean(window.__game.st.seq))); i++) { const k = await page.evaluate(() => { const v = window.__game.st.seq?.sq.view(); return v && !v.gap ? v.kind : null; }); if (k && kinds.at(-1) !== k) kinds.push(k); await step(page, 6); }
    assert.deepEqual(kinds, ['hold', 'dir', 'mash', 'press'], 'it played by itself, with nothing pressed');
    assert.equal(await escutaOf(page), before); assert.equal(await page.evaluate(() => window.__game.street.street.splice.state), 'done'); assert.match(await goalOf(page), /poço/);
  });
});

test('when the decoy took the dog far off, the sequence is shorter and easier: two steps (hold and press), no leap; and the signs name the commands of each medium', { skip, timeout: 600000 }, async () => {
  await withGame(async ({ page, open }) => {
    await open('?cena=n1-saida&sair=agora&semente=7'); await ready(page);      // (no `emenda` in the query: the game decides by where the dog is)
    for (let i = 0; i < 8 && (await page.evaluate(() => window.__game.director.waitName)) !== 'saida-emenda'; i++) { await page.evaluate(() => { const G = window.__game; G.director.signal('isca'); G.test.teleport(-13.3, 7.0); }); await step(page, 400); }
    await page.evaluate(() => { const m = window.__game.street.machines; m.release('cao-avenida', { pos: [24, -3.2] }); });
    await place(page, -13.3, 7.0, 3.14); await page.keyboard.down('KeyE'); await until(page, () => Boolean(window.__game.st.seq), 40); await page.keyboard.up('KeyE');
    assert.equal(await page.evaluate(() => window.__game.st.seq.variant), 'curta', 'the dog is far: the short one');
    assert.ok(await page.evaluate(() => Math.hypot(...[0, 1].map((i) => window.__game.street.machines.list()[0].pos[i] - [-13.3, 7][i]))) > 8);
    await skipCine(page);
    const sign = () => page.evaluate(() => { const e = document.getElementById('hud-sign'); return e.hidden ? null : { keys: [...e.querySelectorAll('kbd')].map((k) => k.textContent).join('|'), word: e.querySelector('.word').textContent, arrow: e.querySelector('.arrow').textContent, bar: !e.querySelector('.bar').hidden, fill: !e.querySelector('.fill').hidden }; });
    await page.keyboard.down('KeyE'); await step(page, 30); await frames(page, 3);
    assert.deepEqual(await sign(), { keys: 'E', word: 'segure', arrow: '', bar: true, fill: true }, 'keyboard: E held, in the scenery, with the bar of the hold');
    const { kinds } = await perform(page); assert.deepEqual(kinds, ['hold', 'press']);
    assert.equal(await page.evaluate(() => window.__game.street.street.splice.state), 'done');
  });
  // the full one: every kind says what to press, on each medium
  await withGame(async ({ page, open }) => {
    await toSplice(page, open); await skipCine(page);
    const sign = () => page.evaluate(() => { const e = document.getElementById('hud-sign'); return e.hidden ? null : { keys: [...e.querySelectorAll('kbd')].map((k) => k.textContent).join('|'), word: e.querySelector('.word').textContent, arrow: e.querySelector('.arrow').textContent }; });
    const seen = {}, devices = {};
    await page.evaluate(() => { window.__game.input.S.active = true; });
    for (const dev of ['keyboard', 'gamepad']) {
      await page.evaluate((d) => { Object.defineProperty(window.__game.input, 'device', { get: () => d, configurable: true }); }, dev);
      await step(page, 4); await frames(page, 2); const k = await page.evaluate(() => window.__game.st.seq.sq.view().kind);
      devices[dev] = (await sign())?.keys ?? null; assert.equal(k, 'hold');
    }
    assert.deepEqual(devices, { keyboard: 'E', gamepad: 'A' });
    await perform(page, { max: 40 });
    for (const dev of ['keyboard', 'gamepad', 'touch']) {
      await page.evaluate((d) => { Object.defineProperty(window.__game.input, 'device', { get: () => d, configurable: true }); }, dev);
      for (let i = 0; i < 400 && (await page.evaluate(() => window.__game.st.seq?.sq.view().kind !== 'dir' || window.__game.st.seq?.sq.view().gap)); i++) await step(page, 3);
      await frames(page, 2); seen[dev] = await sign();
    }
    assert.deepEqual(seen.keyboard.arrow === '◀' || seen.keyboard.arrow === '▶', true, 'the dodge shows the arrow on the dog'); assert.ok(['←', '→'].includes(seen.keyboard.keys), 'keyboard: ← or →');
    assert.ok(['◀', '▶'].includes(seen.gamepad.keys), 'pad: the d-pad'); assert.equal(seen.touch.keys, '', 'touch: the buttons ◀ ▶ are on the screen, the sign shows only the arrow'); assert.equal(seen.keyboard.word, 'esquive');
    await snap(page, 'esquiva-comando');
  });
});

test('touch: during the sequence the buttons ◀ ▶ appear beside Usar (the dodge and the alternating hammer) and the other buttons of walking go away', { skip, timeout: 300000 }, async () => {
  await withGame(async ({ page, open }) => {
    await open('?cena=n1-saida&sair=agora&semente=7&emenda=cheia'); await ready(page);
    const vis = () => page.evaluate(() => Object.fromEntries(['dirL', 'dirR', 'use', 'run', 'crouch'].map((b) => [b, getComputedStyle(document.querySelector(`.tb-${b}`)).display !== 'none'])));
    assert.deepEqual(await vis(), { dirL: false, dirR: false, use: true, run: true, crouch: true });
    for (let i = 0; i < 8 && (await page.evaluate(() => window.__game.director.waitName)) !== 'saida-emenda'; i++) { await page.evaluate(() => { const G = window.__game; G.director.signal('isca'); G.test.teleport(-13.3, 7.0); }); await step(page, 400); }
    await place(page, -13.3, 7.0, 3.14); await page.evaluate(() => { window.__game.input.S.press.down = true; }); await until(page, () => Boolean(window.__game.st.seq), 40); await page.evaluate(() => { window.__game.input.S.press.down = false; });
    await page.evaluate(() => window.__game.input.S.edges.add('skip')); await step(page, 3);
    assert.deepEqual(await vis(), { dirL: true, dirR: true, use: true, run: false, crouch: false });
    // a tap on ▶ is the direction (the dodge): the sequence reads it as a press to the right
    await page.evaluate(() => { const w = window.__game.st.seq; w.sq.cancel(); w.rec.starts = []; w.rec.wins = []; w.steps.splice(0, 1); w.sq.start(); });
    assert.equal(await page.evaluate(() => window.__game.st.seq.sq.view().kind), 'dir');
    const want = await page.evaluate(() => window.__game.st.seq.sq.view().want); await step(page, 30);
    await page.tap(want < 0 ? '.tb-dirL' : '.tb-dirR'); await step(page, 4);
    assert.equal(await page.evaluate(() => window.__game.st.seq.rec.hits[0]), true, 'the tap on the button of the right side dodges');
  }, { touch: true });
});

test('film mode: the cutscene of the dog arriving is in the film mode, with a view for each plane, and what it films is a function of time', { skip, timeout: 300000 }, async () => {
  await withGame(async ({ page, url }) => {
    await page.goto(`${url}?film`); await page.waitForFunction(() => typeof window.setup === 'function', null, { timeout: 120000 });
    const v = await page.evaluate(() => Object.fromEntries(Object.entries(window.__film.listViews()).filter(([k]) => k.startsWith('emenda.')).map(([k, x]) => [k, x.duration])));
    for (const k of ['emenda.cinematica', 'emenda.esquina', 'emenda.sensor', 'emenda.olhar', 'emenda.salto', 'emenda.acao']) assert.ok(v[k] > 0, k);
    assert.ok(Math.abs(v['emenda.cinematica'] - 5.6) < 1e-6);
    const sounds = await page.evaluate(() => window.__film.sounds('emenda.cinematica')); assert.ok(sounds.events.some((e) => e.name === 'cao-desconfiado'));
  });
});
