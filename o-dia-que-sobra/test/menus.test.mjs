// The screens of the game (title, pause, options, controls, memory card, end of a night, endings, loading): they work with only a keyboard, with only a pad and
// with only touch, they look like the game (the chain's material of 1998; no browser button, scrollbar or blue ring), keep touch targets of 44 px, and the film
// mode shows none of them. The pure parts run always; the browser ones need a Chrome and playwright-core:
//   PLAYWRIGHT_CORE=<folder> LOOK=1998 node --test test/menus.test.mjs        (LOOK=1998 draws the lighter picture: pages load in time on a machine without a GPU)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { titleCamera, signPower } from '../src/title.js';
import { legend, icon, logo, solSvg, keycaps } from '../src/ui-art.js';

const GAME = path.resolve(new URL('..', import.meta.url).pathname), ROOT = path.resolve(GAME, '..');
const CORE = process.env.PLAYWRIGHT_CORE, skip = CORE ? false : 'set PLAYWRIGHT_CORE to run the browser tests';
const LOOK = process.env.LOOK || '1998';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg' };
const PAD = { A: 0, B: 1, LB: 4, RB: 5, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

// ---- the pure parts ------------------------------------------------------------------------------------------------------------------------------
const SIGN = { x: -14, y: 9.2, z: -20.3, face: [-0.84, 0.54] };
test('the title camera is a function of the time alone: the same second gives the same picture, it starts far and wide and ends close under the Sun, and it only breathes after', () => {
  assert.deepEqual(titleCamera(12.5, SIGN), titleCamera(12.5, SIGN));
  const a = titleCamera(0, SIGN), b = titleCamera(44, SIGN), c = titleCamera(300, SIGN);
  const dist = (k) => Math.hypot(k.x - SIGN.x, k.z - SIGN.z);
  assert.ok(dist(a) > dist(b) + 6, 'it walks toward the sign');
  assert.ok(a.fov > b.fov + 8, 'it starts wide and closes the lens');
  assert.ok(Math.hypot(c.x - b.x, c.y - b.y, c.z - b.z) < 0.7, 'after the approach it only sways a few centimetres');
  const range = (opt) => { let lo = Infinity, hi = -Infinity; for (let t = 100; t < 300; t += 0.5) { const k = titleCamera(t, SIGN, opt).x; lo = Math.min(lo, k); hi = Math.max(hi, k); } return hi - lo; };
  assert.ok(range({ calm: true }) < range({}) * 0.5, 'calm sways less');
  assert.ok(!/Math\.random|Date\.now|performance/.test(read('src/title.js')), 'no clock, no unseeded random');
});

test('the sign\'s light fails now and then (with a long failure) and, with "reduzir clarões", never fails', () => {
  let off = 0, longest = 0, run = 0;
  for (let t = 0; t < 91; t += 0.02) { if (!signPower(t)) { off++; run++; longest = Math.max(longest, run); } else run = 0; assert.equal(signPower(t), signPower(t), 'a function of the time'); }
  assert.ok(off > 20, 'it fails'); assert.ok(longest * 0.02 > 0.5, 'once for more than half a second');
  for (let t = 0; t < 91; t += 0.02) assert.equal(signPower(t, { calm: true }), true);
});

test('the legend of the buttons follows the device: keys for the keyboard, drawn buttons for the pad, only what a finger does for touch (with a Voltar button)', () => {
  const kb = legend(['move', 'ok', 'back'], 'keyboard'), pad = legend(['move', 'ok', 'back'], 'gamepad'), touch = legend(['move', 'ok', 'back'], 'touch');
  assert.match(kb, /<kbd>Enter<\/kbd>/); assert.match(kb, /<kbd>Esc<\/kbd>/); assert.doesNotMatch(kb, /class="pb/);
  assert.match(pad, /class="pb b-a"/); assert.match(pad, /class="pb b-b"/); assert.doesNotMatch(pad, /<kbd>Enter/);
  assert.doesNotMatch(touch, /<kbd>/); assert.match(touch, /data-back/); assert.match(touch, /Toque para escolher/);
  assert.match(keycaps('W A S D', (x) => x), /<kbd>W<\/kbd>.*<kbd>D<\/kbd>/);
});

test('the pieces drawn in code: the logotype has the name, the Sun follows the weeks (a wider smile in week 3, a drifting face in week 4, never in week 1), every kind of memory-card block has an icon, and nothing is an image file', () => {
  const L = logo({ week: 1 });
  assert.match(L, /O DIA/); assert.match(L, /QUE SOBRA/); assert.doesNotMatch(L, /<image|href=/);
  const smile = (w) => /class="smile" d="([^"]+)"/.exec(solSvg({ week: w }))[1];
  assert.notEqual(smile(1), smile(3), 'week 3: the smile is wider'); assert.notEqual(smile(3), smile(4)); assert.equal(smile(1), smile(2), 'weeks 1 and 2 are the same Sun');
  assert.doesNotMatch(solSvg({ week: 1 }), /drift/); assert.doesNotMatch(solSvg({ week: 3 }), /drift/); assert.match(solSvg({ week: 4 }), /drift/);
  for (const k of ['run', 'night', 'record', 'rinha', 'corrupt', 'empty']) assert.match(icon(k), /<path class="ink"/, k);
  assert.notEqual(icon('corrupt'), icon('empty'), 'the broken block has its own icon');
  assert.notEqual(icon('run'), icon('record'), 'a pump for the run and a Sun for the record');
});

test('the fonts are three roles in CSS variables with system fonts as the reserve, loaded by @font-face from local files with their licences and credits (never from a network address)', () => {
  const css = read('style.css'), all = css + read('menus.css') + read('index.html');
  for (const v of ['--f-marca', '--f-texto', '--f-mono']) assert.match(css, new RegExp(`${v}:[^;]*"BD [A-Za-z]+"[^;]*,[^;]*(sans-serif|monospace)`), `${v} has the font and a system reserve`);
  const faces = [...css.matchAll(/@font-face[^}]*src:\s*url\('([^']+)'\)/g)].map((m) => m[1]);
  assert.ok(faces.length >= 4, 'the faces are declared (Baloo 2, Nunito, Nunito italic, VT323)');
  for (const f of faces) { assert.match(f, /^\.\/assets\/fonts\//); assert.ok(existsSync(new URL('../' + f.slice(2), import.meta.url)), f); }
  for (const l of ['OFL-Baloo2.txt', 'OFL-Nunito.txt', 'OFL-VT323.txt']) assert.match(read('assets/fonts/' + l), /SIL OPEN FONT LICENSE/i);
  assert.doesNotMatch(all, /fonts\.googleapis|fonts\.gstatic|https?:\/\/[^"')]*\.(woff2?|ttf)/);
  const cred = read('CREDITOS.md'); for (const n of ['Baloo 2', 'Nunito', 'VT323', 'SIL Open Font License 1.1', 'github.com/google/fonts']) assert.match(cred, new RegExp(n.replace(/\./g, '\\.')));
  assert.doesNotMatch(css.replace(/--f-mono:[^;]*;/, ''), /"Courier New"/, 'the old Courier New only stays as the last reserve of the mono stack');
});

test('the answers of the secrets are in no file of the screens (S1, S3 and S4 never in clear text)', () => {
  for (const f of ['src/screens.js', 'src/ui.js', 'src/ui-art.js', 'src/title.js', 'menus.css', 'index.html']) assert.doesNotMatch(read(f).toLowerCase(), /senha:|sha-?256\(|passphrase/, f);
});

// ---- the browser ---------------------------------------------------------------------------------------------------------------------------------
async function withGame(fn, { touch = false, pad = false, size = null, look = LOOK } = {}) {
  const { chromium } = createRequire(import.meta.url)(CORE);
  const srv = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!p.startsWith(ROOT) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] ?? 'application/octet-stream' }); res.end(readFileSync(p));
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${srv.address().port}/o-dia-que-sobra/index.html`;
  const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', args: ['--mute-audio', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  try {
    const ctx = await browser.newContext({ ...(touch ? { viewport: size ?? { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: size ?? { width: 1280, height: 720 } }), serviceWorkers: 'block' });
    ctx.setDefaultTimeout(120000);
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    // a pad that exists only in the page: window.__pad is what the buttons say
    if (pad) await page.addInitScript(() => { const b = () => ({ pressed: false, value: 0 }); window.__pad = { connected: true, id: 'test pad', index: 0, buttons: Array.from({ length: 17 }, b), axes: [0, 0, 0, 0] }; navigator.getGamepads = () => [window.__pad]; });
    const open = async (query = '', after = 'title') => {
      await page.goto(`${base}?${/(^|&)debug=/.test(query) ? '' : 'debug&'}manual&silent&nointro&wx=limpo&look=${look}&tier=leve${touch ? '&touch' : ''}${query ? '&' + query : ''}`, { timeout: 280000 });
      await page.waitForFunction((st) => window.__odq?.game?.state === st, after, { timeout: 280000 });
      await page.addStyleTag({ content: '#splash{display:none!important}' });
      await step(page, 4);
    };
    await fn({ page, open, errors, base, browser });
    assert.deepEqual(errors.filter((e) => !/Service Worker/.test(e)), [], 'no console error');
  } finally { await browser.close(); srv.close(); }
}
const step = (page, n = 3) => page.evaluate((k) => window.__odq.advance(k), n);
const selText = (page) => page.evaluate(() => document.querySelector('#modal .sel')?.textContent.replace(/\s+/g, ' ').trim());
const screenKind = (page) => page.evaluate(() => document.querySelector('#modal .scr')?.dataset.kind ?? null);
const tabOn = (page) => page.evaluate(() => document.querySelector('#modal .tab.on')?.dataset.tab);
const opts = (page) => page.evaluate(() => ({ ...window.__odq.game.opts }));
const press = async (page, key) => { await page.keyboard.down(key); await step(page, 3); await page.keyboard.up(key); await step(page, 3); };
const padPress = async (page, i) => { await page.evaluate((k) => { window.__pad.buttons[k] = { pressed: true, value: 1 }; }, i); await step(page, 3); await page.evaluate((k) => { window.__pad.buttons[k] = { pressed: false, value: 0 }; }, i); await step(page, 3); };
/** A touch on a thing: the pointer event with real coordinates on that element (this Chrome's emulated tap reports 0,0, a phone does not). `at`: where along its width, 0 to 1. */
const tap = async (page, sel, at = 0.5) => {
  const okk = await page.evaluate(([sel, at]) => { const e = document.querySelector(sel); if (!e) return false; const r = e.getBoundingClientRect(); e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch', clientX: r.left + r.width * at, clientY: r.top + r.height / 2 })); return true; }, [sel, at]);
  await step(page, 3); return okk;
};
const openTitleItem = async (page, text) => { await page.evaluate((t) => { const c = [...document.querySelectorAll('#modal li[data-cell]')].find((x) => x.textContent.trim().startsWith(t)); c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); }, text); await step(page, 3); };

test('with only the keyboard: the arrows walk the title, Enter opens, Tab changes the tab, the arrows set a fader and a breaker, Esc goes back, the card is walked block by block, and the legend names the keys', { skip, timeout: 600000 }, async () => {
  await withGame(async ({ page, open }) => {
    await open();
    assert.equal(await screenKind(page), 'title');
    assert.match(await selText(page), /COMEÇAR/);
    await press(page, 'ArrowDown'); assert.match(await selText(page), /OPÇÕES/);
    await press(page, 'ArrowDown'); await press(page, 'ArrowDown'); await press(page, 'ArrowDown'); assert.match(await selText(page), /IMPORTAR/);
    await press(page, 'ArrowDown'); assert.match(await selText(page), /COMEÇAR/, 'the list comes round');
    await press(page, 'ArrowUp'); assert.match(await selText(page), /IMPORTAR/);
    assert.match(await page.evaluate(() => document.querySelector('#modal .legend').innerHTML), /<kbd[^>]*>Enter<\/kbd>/);
    await press(page, 'ArrowUp'); await press(page, 'ArrowUp'); await press(page, 'ArrowUp'); assert.match(await selText(page), /OPÇÕES/);
    await press(page, 'Enter'); assert.equal(await screenKind(page), 'options'); assert.equal(await tabOn(page), 'imagem');
    await press(page, 'Tab'); assert.equal(await tabOn(page), 'som', 'Tab: the next tab');
    assert.match(await selText(page), /Som/, 'the tab itself is chosen');
    await press(page, 'ArrowDown'); assert.match(await selText(page), /VOLUME/);
    const v0 = (await opts(page)).volume;
    await press(page, 'ArrowLeft'); await press(page, 'ArrowLeft');
    assert.ok(Math.abs((await opts(page)).volume - (v0 - 0.2)) < 1e-6, 'the left arrow lowers the fader');
    assert.equal(await page.evaluate(() => document.querySelector('#modal [data-key="row:volume"]').dataset.v), '7', 'the seven-segment number follows');
    await press(page, 'ArrowDown'); assert.match(await selText(page), /SOM/);
    const m0 = (await opts(page)).mute;
    await press(page, 'Enter'); assert.equal((await opts(page)).mute, !m0, 'Enter throws the breaker');
    assert.equal(await page.evaluate(() => document.querySelector('#modal [data-key="row:mute"]').getAttribute('aria-checked')), String(m0), 'the breaker shows it (aria-checked is "on" = sound on)');
    await press(page, 'Enter');
    await press(page, 'ArrowUp'); await press(page, 'ArrowUp'); assert.match(await selText(page), /Som/, 'up from the first row reaches the tabs');
    await press(page, 'ArrowRight'); assert.equal(await tabOn(page), 'controles', 'the arrows on the tabs change the tab');
    await press(page, 'Escape'); assert.equal(await screenKind(page), 'title', 'Esc goes back to where it came from');
    await press(page, 'ArrowUp'); assert.match(await selText(page), /IMPORTAR/); await press(page, 'ArrowUp'); assert.match(await selText(page), /CARTÃO DE MEMÓRIA/);
    await press(page, 'Enter'); assert.equal(await screenKind(page), 'card');
    assert.equal(await page.evaluate(() => document.querySelectorAll('#modal .blk').length), 15, 'fifteen blocks');
    assert.equal(await page.evaluate(() => document.querySelector('#modal .blk.sel')?.dataset.key), 'b:1');
    await press(page, 'ArrowRight'); assert.equal(await page.evaluate(() => document.querySelector('#modal .blk.sel')?.dataset.key), 'b:2', 'the arrows move over the blocks');
    await press(page, 'ArrowDown'); assert.equal(await page.evaluate(() => document.querySelector('#modal .blk.sel')?.dataset.key), 'b:7');
    assert.match(await page.evaluate(() => document.querySelector('#modal .cardinfo').textContent), /Bloco 7/, 'the info follows the block');
    assert.match(await page.evaluate(() => document.querySelector('#modal .scr-card, #modal .scr').textContent), /Semente do jogo: 1/, 'the seed of the game is on the card screen');
    await press(page, 'Escape'); assert.equal(await screenKind(page), 'title');
  });
});

test('with only a pad: the d-pad and the stick walk the menus, A confirms, B goes back, LB and RB change the tab, the d-pad sets a fader, Start opens the pause, and the legend shows the pad buttons', { skip, timeout: 600000 }, async () => {
  await withGame(async ({ page, open }) => {
    await open();
    assert.equal(await page.evaluate(() => window.__odq.input.device()), 'keyboard', 'no pad button yet');
    await padPress(page, PAD.DOWN);
    assert.equal(await page.evaluate(() => window.__odq.input.device()), 'gamepad');
    assert.match(await selText(page), /OPÇÕES/);
    const leg = await page.evaluate(() => document.querySelector('#modal .legend').innerHTML);
    assert.match(leg, /class="pb b-a"/, 'the legend shows the A button'); assert.doesNotMatch(leg, /<kbd/);
    await page.evaluate(() => { window.__pad.axes[1] = 0.9; }); await step(page, 3); await page.evaluate(() => { window.__pad.axes[1] = 0; }); await step(page, 3);
    assert.match(await selText(page), /CONTROLES/, 'the stick moves one line');
    await padPress(page, PAD.UP); assert.match(await selText(page), /OPÇÕES/);
    await padPress(page, PAD.A); assert.equal(await screenKind(page), 'options');
    assert.match(await page.evaluate(() => document.querySelector('#modal .legend').innerHTML), /class="pb b-b"/, 'the options name B as the way back');
    await padPress(page, PAD.RB); assert.equal(await tabOn(page), 'som', 'RB: the next tab');
    await padPress(page, PAD.RB); await padPress(page, PAD.LB); assert.equal(await tabOn(page), 'som', 'RB then LB comes back');
    await padPress(page, PAD.DOWN); assert.match(await selText(page), /VOLUME/);
    const v0 = (await opts(page)).volume;
    await padPress(page, PAD.LEFT); await padPress(page, PAD.LEFT); await padPress(page, PAD.LEFT);
    assert.ok(Math.abs((await opts(page)).volume - (v0 - 0.3)) < 1e-6, 'the d-pad sets the fader');
    await padPress(page, PAD.B); assert.equal(await screenKind(page), 'title', 'B goes back');
    await padPress(page, PAD.UP); assert.match(await selText(page), /IMPORTAR/);
  }, { pad: true });
});

test('with only a pad, in a night: Start opens the pause (the punch card beside it), the pad moves in it, B goes back to the game', { skip, timeout: 600000 }, async () => {
  await withGame(async ({ page, open }) => {
    await open('debug=day:3&skiptutorial', 'play');
    await padPress(page, PAD.START);
    assert.equal(await screenKind(page), 'pause');
    assert.match(await selText(page), /CONTINUAR/);
    await padPress(page, PAD.DOWN); await padPress(page, PAD.DOWN); assert.match(await selText(page), /OPÇÕES/);
    await padPress(page, PAD.A); assert.equal(await screenKind(page), 'options'); await padPress(page, PAD.B); assert.equal(await screenKind(page), 'pause');
    await padPress(page, PAD.B); assert.equal(await screenKind(page), null, 'B closes the pause');
    assert.equal(await page.evaluate(() => window.__odq.game.state), 'play');
  }, { pad: true });
});

test('the pause: the scene behind is blurred and dimmed, the menu is on the left, the punch card on the right with the 28 days (the worked ones stamped, today marked) and no seed (only with ?debug)', { skip, timeout: 600000 }, async () => {
  await withGame(async ({ page, open }) => {
    await open('debug=day:9&skiptutorial', 'play');
    await page.evaluate(() => window.__odq.game.openPause()); await step(page, 3);
    const p = await page.evaluate(() => {
      const bg = getComputedStyle(document.querySelector('#modal .bg')), box = document.querySelector('#modal .box').getBoundingClientRect(), side = document.querySelector('#modal .side')?.getBoundingClientRect();
      return { blur: bg.backdropFilter, box: box.x + box.width / 2, side: side && side.x + side.width / 2, w: innerWidth, days: document.querySelectorAll('#modal .punch .d').length, done: document.querySelectorAll('#modal .punch .d.done').length, today: document.querySelector('#modal .punch .d.today em')?.textContent, text: document.querySelector('#modal').textContent };
    });
    assert.match(p.blur, /blur\(/); assert.ok(p.box < p.w / 2, 'the menu is on the left'); assert.ok(p.side > p.w / 2, 'the card is on the right');
    assert.equal(p.days, 28); assert.equal(p.done, 8, 'eight nights worked before night 9'); assert.equal(p.today, '10', 'night 9 is the 10th day of the calendar');
    // the punch card tells the real night (the footer's: "noite 9", not the night of the week) and an entry time that is never after "now"
    const mins = (t) => { const [h, m] = t.split(':').map(Number); return (h < 12 ? h + 24 : h) * 60 + m; };
    const read = (text) => { const m = /Hoje: noite (\d+) · entrada (\d\d:\d\d)[^·]*· agora (\d\d:\d\d)/.exec(text.replace(/\s+/g, ' ')); return m && { night: Number(m[1]), entry: m[2], now: m[3], foot: /noite (\d+) · dia/.exec(text)?.[1] }; };
    const a = read(p.text);
    assert.ok(a, `the line of tonight is there (${p.text.slice(0, 200)})`);
    assert.equal(a.night, 9, 'the night is the real one'); assert.equal(String(a.night), a.foot, 'the same night as the footer');
    assert.equal(a.entry, '23:00', 'before the punch, the entry is the start of the shift'); assert.ok(mins(a.entry) <= mins(a.now), 'the entry is not after now');
    assert.match(p.text, /ponto por bater/);
    await page.evaluate(() => window.__odq.game.resume()); await step(page, 400);
    await page.evaluate(() => { window.__odq.game.interaction.targets.get('ponto').tap(); });
    const punchedAt = await page.evaluate(() => window.__odq.game.prep.punchedAt);
    await step(page, 700); await page.evaluate(() => window.__odq.game.openPause()); await step(page, 3);
    const b = read(await page.evaluate(() => document.querySelector('#modal').textContent));
    assert.equal(b.entry, punchedAt, 'after the punch, the entry is the time he punched'); assert.ok(mins(b.entry) <= mins(b.now) && b.entry !== b.now, 'and it is before now'); assert.doesNotMatch(await page.evaluate(() => document.querySelector('#modal').textContent), /ponto por bater/);
    await page.evaluate(() => window.__odq.game.resume());
  }, { look: 'novo' });
  assert.match(read('src/game.js'), /params\.debug \? ` · Semente/, 'the pause names the seed only with ?debug');
});

test('with only touch (390 x 844): a tap opens, a tap or a touch on the fader sets it, every thing to touch is 44 px or more, nothing scrolls sideways, and the Voltar button is the way back', { skip, timeout: 600000 }, async () => {
  await withGame(async ({ page, open }) => {
    await open();
    assert.equal(await page.evaluate(() => window.__odq.input.device()), 'touch');
    assert.doesNotMatch(await page.evaluate(() => document.querySelector('#modal .legend').innerHTML), /<kbd/, 'no key is named for a finger');
    const small = () => page.evaluate(() => [...document.querySelectorAll('#modal [data-cell], #modal .st, #modal .lg.back')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => ({ t: (e.getAttribute('aria-label') || e.textContent || e.className).trim().slice(0, 30), w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height) })).filter((x) => x.w < 44 || x.h < 44));
    const overflow = () => page.evaluate(() => { const out = []; if (document.documentElement.scrollWidth > innerWidth + 1) out.push('page'); for (const e of document.querySelectorAll('#modal .scr, #modal .box, #modal .rows, #modal .mgr, #modal .cardgrid, #modal .tape')) if (e.scrollWidth > e.clientWidth + 1) out.push(e.className); const r = document.querySelector('#modal .box').getBoundingClientRect(); if (r.right > innerWidth + 1 || r.left < -1) out.push('box outside'); return out; });
    assert.deepEqual(await small(), [], 'title: every thing to touch is 44 px or more'); assert.deepEqual(await overflow(), [], 'title');
    await openTitleItem(page, 'OPÇÕES'); assert.equal(await screenKind(page), 'options');
    assert.deepEqual(await small(), [], 'options'); assert.deepEqual(await overflow(), [], 'options');
    await tap(page, '[data-tab="som"]'); assert.equal(await tabOn(page), 'som'); assert.deepEqual(await small(), [], 'the Som tab');
    await tap(page, '[data-key="row:volume"] .track', 0.3);
    assert.equal(Math.round((await opts(page)).volume * 10), 3, 'a touch on the track sets the notch');
    await tap(page, '[data-key="row:volume"] .st.plus'); assert.equal(Math.round((await opts(page)).volume * 10), 4, 'the + end of the fader');
    const m0 = (await opts(page)).mute; await tap(page, '[data-key="row:mute"]'); assert.equal((await opts(page)).mute, !m0, 'a tap throws the breaker');
    for (const t of ['controles', 'acess', 'conteudo', 'imagem']) { await tap(page, `[data-tab="${t}"]`); assert.deepEqual(await small(), [], t); assert.deepEqual(await overflow(), [], t); }
    await tap(page, '[data-tab="acess"]'); await tap(page, '[data-key="row:text"]', 0.9);
    assert.equal((await opts(page)).text, 1.25, 'a tap on a selector steps it');
    assert.deepEqual(await overflow(), [], 'with bigger text'); assert.deepEqual(await small(), [], 'with bigger text');
    await tap(page, '[data-back]'); assert.equal(await screenKind(page), 'title', 'the Voltar button');
    await openTitleItem(page, 'CARTÃO'); assert.equal(await screenKind(page), 'card'); assert.deepEqual(await small(), [], 'card'); assert.deepEqual(await overflow(), [], 'card');
    await tap(page, '.blk[data-key="b:13"]'); assert.match(await page.evaluate(() => document.querySelector('#modal .cardinfo').textContent), /danificado/, 'the broken block');
    await tap(page, '[data-back]');
    await openTitleItem(page, 'CONTROLES'); assert.equal(await screenKind(page), 'controls'); assert.deepEqual(await overflow(), [], 'controls');
    await tap(page, '[data-back]');
  }, { touch: true });
});

test('a night on the phone: the pause (menu and punch card), the end-of-night tape and an ending fit 390 x 844 with 44 px targets and nothing sliding sideways', { skip, timeout: 600000 }, async () => {
  await withGame(async ({ page, open }) => {
    await open('debug=day:9&skiptutorial', 'play');
    const check = async (what) => {
      const r = await page.evaluate(() => { const out = { small: [], over: [] }; for (const e of document.querySelectorAll('#modal [data-cell], #modal .st, #modal .lg.back')) { const b = e.getBoundingClientRect(); if (b.width > 0 && (b.width < 44 || b.height < 44)) out.small.push(e.textContent.trim().slice(0, 20) + ':' + Math.round(b.width) + 'x' + Math.round(b.height)); } if (document.documentElement.scrollWidth > innerWidth + 1) out.over.push('page'); for (const e of document.querySelectorAll('#modal .scr, #modal .box, #modal .tape, #modal .paper, #modal .clipboard')) if (e.scrollWidth > e.clientWidth + 1) out.over.push(e.className); const b = document.querySelector('#modal .box').getBoundingClientRect(); out.fits = b.left >= -1 && b.right <= innerWidth + 1 && b.top >= -1 && b.bottom <= innerHeight + 1; return out; });
      assert.deepEqual(r.small, [], `${what}: targets`); assert.deepEqual(r.over, [], `${what}: nothing sideways`); assert.ok(r.fits, `${what}: the column fits the screen`);
    };
    await page.evaluate(() => window.__odq.game.openPause()); await step(page, 3); await check('pause');
    await tap(page, '[data-back]'); await step(page, 3);
    await page.evaluate(() => { const G = window.__odq.game; G.ui.showSummary({ atendimentos: 23, vendas: 14, abastecimentos: 9, tarefas: 11, naoFeitas: 2, erros: 1, reclamacoes: 0, divergencia: 1250, ocorrencias: 1, caixa: 184040, carteira: 312, points: 143, day: 9, saved: true, seed: 901, next: 10, cal: G.progression.calendar(9), weekClosed: false, weekPts: 280, meta: 620, last: false, recorrentes: ['Seu Antenor'] }); });
    await step(page, 3); await check('tape');
    await page.evaluate(() => { const G = window.__odq.game; G.ui.closeModal(); G.ui.endingScreen({ title: 'O dia que sobra', subtitle: 'FIM 1', lines: ['Amanheceu. O gerente chegou cedo.', '', 'Finais encontrados: 1 de 5.', 'Semana 4 · noite 24 · carteira R$ 2.000,00 · metas perdidas 0.', 'Semente do jogo: 1.'], items: [{ label: () => 'NOVO JOGO', act() {} }, { label: () => 'CARTÃO DE MEMÓRIA', act() {} }, { label: () => 'VOLTAR AO TÍTULO', act() {} }] }); });
    await step(page, 3); await check('ending');
  }, { touch: true });
});

test('every label of a menu line fits on one line (desktop and phone): the title, the pause, every tab of the options, the card\'s rows and the controls', { skip, timeout: 600000 }, async () => {
  const lines = (page, sel) => page.evaluate((sel) => [...document.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().width > 0).map((e) => { const r = document.createRange(); r.selectNodeContents(e); const tops = new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top / 4))); return { t: e.textContent.trim().slice(0, 40), n: tops.size }; }).filter((x) => x.n > 1), sel);
  for (const size of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    await withGame(async ({ page, open }) => {
      await open(); await page.evaluate(() => window.__odq.game.save.card.addEnding(1)); await page.evaluate(() => window.__odq.game.showTitle()); await step(page, 3);
      assert.deepEqual(await lines(page, '#modal li .t'), [], `${size.width}: the title lines`);
      await openTitleItem(page, 'OPÇÕES');
      for (const t of ['imagem', 'som', 'controles', 'acess', 'conteudo']) { await tap(page, `[data-tab="${t}"]`); assert.deepEqual(await lines(page, '#modal .row .lab, #modal .tab'), [], `${size.width}: the options, tab ${t}`); }
      await tap(page, '[data-back]'); await openTitleItem(page, 'CARTÃO'); assert.deepEqual(await lines(page, '#modal li .t'), [], `${size.width}: the card rows`);
      await tap(page, '[data-back]'); await openTitleItem(page, 'CONTROLES'); assert.deepEqual(await lines(page, '#modal li .t'), [], `${size.width}: the controls lines`);
    }, { size });
  }
  await withGame(async ({ page, open }) => {
    await open('debug=day:9&skiptutorial', 'play');
    await page.evaluate(() => window.__odq.game.openPause()); await step(page, 3);
    assert.deepEqual(await lines(page, '#modal li .t'), [], 'the pause lines on the desktop');
    await page.evaluate(() => window.__odq.game.resume());
  });
  await withGame(async ({ page, open }) => {
    await open(); assert.deepEqual(await lines(page, '#modal li .t'), [], 'the title lines on the phone');
    await page.evaluate(() => window.__odq.game.save.card.save({ day: 3, week: 1, fase: 'noite', wallet: 40, seed: 1 })); await page.evaluate(() => window.__odq.game.showTitle()); await step(page, 3);
    assert.deepEqual(await lines(page, '#modal li .t'), [], 'the title lines on the phone, with a game to continue');
  }, { touch: true });
});

test('the HUD reads from a metre: the reader\'s total is 28 px or more in the dot-matrix font (the rule of style.css under #top no longer wins), the objective 15 px or more', { skip, timeout: 600000 }, async () => {
  await withGame(async ({ page, open }) => {
    await open('debug=day:9&skiptutorial', 'play');
    await page.evaluate(() => { const G = window.__odq.game; G.ui.setTotal('1 x R$ 12,00'); }); await step(page, 3);
    const r = await page.evaluate(() => { const f = (id) => { const c = getComputedStyle(document.getElementById(id)); return { px: parseFloat(c.fontSize), fam: c.fontFamily }; }; return { total: f('total'), obj: f('objective'), clock: f('calhud') && parseFloat(getComputedStyle(document.querySelector('#calhud b')).fontSize) }; });
    assert.ok(r.total.px >= 28, `the total is ${r.total.px}px`); assert.match(r.total.fam, /BD Mono/); assert.ok(r.obj.px >= 15, `the objective is ${r.obj.px}px`); assert.ok(r.clock >= 48, `the clock is ${r.clock}px`);
  }, { size: { width: 1920, height: 1080 } });
});

test('no browser look: no default button, no scrollbar, no blue focus ring, no text cursor, and the type is the game\'s three fonts (not system-ui), loaded from the local files', { skip, timeout: 600000 }, async () => {
  await withGame(async ({ page, open }) => {
    await open('', 'title');
    const FONTS = /^BD (Marca|Texto|Mono)$/;
    for (const screen of ['title', 'options', 'card', 'controls']) {
      if (screen === 'options') await openTitleItem(page, 'OPÇÕES'); else if (screen === 'card') { await page.evaluate(() => window.__odq.game.showTitle()); await step(page, 3); await openTitleItem(page, 'CARTÃO'); } else if (screen === 'controls') { await page.evaluate(() => window.__odq.game.showTitle()); await step(page, 3); await openTitleItem(page, 'CONTROLES'); }
      const r = await page.evaluate(() => {
        const out = { appearance: [], outline: [], scroll: [], fonts: new Set(), caret: getComputedStyle(document.getElementById('app')).caretColor };
        for (const b of document.querySelectorAll('#modal button')) { const c = getComputedStyle(b); if (c.appearance !== 'none') out.appearance.push(c.appearance); if (c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0) out.outline.push(b.className); }
        for (const e of document.querySelectorAll('#modal .scr, #modal .box, #modal .rows, #modal .tabs, #modal .tape')) if (e.offsetWidth - e.clientWidth > 1 || (e.offsetHeight - e.clientHeight > 1 && getComputedStyle(e).overflowY === 'visible')) out.scroll.push(e.className);
        for (const e of document.querySelectorAll('#modal *')) if (e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) out.fonts.add(getComputedStyle(e).fontFamily.split(',')[0].replace(/"/g, '').trim());
        out.fonts = [...out.fonts]; out.user = getComputedStyle(document.querySelector('#modal .scr')).userSelect; return out;
      });
      assert.deepEqual(r.appearance, [], `${screen}: no native button look`); assert.deepEqual(r.outline, [], `${screen}: no focus ring`); assert.deepEqual(r.scroll, [], `${screen}: no scrollbar takes room`);
      assert.ok(r.fonts.every((f) => FONTS.test(f)), `${screen}: the fonts of the game: ${r.fonts}`);
      assert.equal(r.user, 'none', 'no text selection'); assert.equal(r.caret, 'rgba(0, 0, 0, 0)', 'no text cursor');
    }
    assert.ok(await page.evaluate(async () => { await document.fonts.ready; return ['BD Marca', 'BD Texto', 'BD Mono'].every((f) => document.fonts.check(`20px "${f}"`)); }), 'the fonts are loaded from the local files');
  });
});

test('the accessibility options act: text size grows the type, high contrast closes the grounds, reduce flashes stops the movement and the sign\'s failures, brightness filters the picture, grain goes off, and all of them are kept through a reload', { skip, timeout: 600000 }, async () => {
  await withGame(async ({ page, open }) => {
    await open();
    const size = () => page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#modal li .t')).fontSize));
    const s0 = await size();
    await openTitleItem(page, 'OPÇÕES'); await tap(page, '[data-tab="acess"]');
    await tap(page, '[data-key="row:text"]', 0.9);
    await tap(page, '[data-key="row:contrast"]'); await tap(page, '[data-key="row:reduceFlash"]');
    assert.equal(await page.evaluate(() => document.getElementById('app').style.getPropertyValue('--ts')), '1.25');
    assert.deepEqual(await page.evaluate(() => ({ c: document.getElementById('app').dataset.contrast, calm: document.getElementById('app').dataset.calm })), { c: 'on', calm: 'on' });
    await tap(page, '[data-back]');
    const s1 = await size(); assert.ok(s1 > s0 * 1.15, `bigger type (${s0} -> ${s1})`);
    const bg = await page.evaluate(() => getComputedStyle(document.querySelector('#modal .bg')).backgroundColor);
    assert.match(bg, /rgba\(0, 0, 0, 0\.9\d*\)/, 'high contrast: a nearly black ground');
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#modal .logo')).animationName), 'none', 'calm: the logotype does not move');
    assert.equal(await page.evaluate(() => { const l = document.querySelector('#modal li.sel .mk'); return getComputedStyle(l).animationName; }), 'none', 'calm: the mark does not bounce');
    // the sign never fails with "reduzir clarões": the title's light is on at every second the function could turn it off
    assert.equal(signPower(2.12, { calm: true }), true);
    await page.evaluate(() => window.__odq.game.showTitle()); await openTitleItem(page, 'OPÇÕES');
    await tap(page, '[data-tab="imagem"]'); await tap(page, '[data-key="row:grain"]'); await tap(page, '[data-key="row:bright"] .st.plus'); await tap(page, '[data-key="row:bright"] .st.plus');
    const o = await opts(page);
    assert.equal(o.grain, false); assert.equal(o.bright, 7);
    assert.match(await page.evaluate(() => document.getElementById('c').style.filter), /(^| )brightness\(1\.16\)$/, 'brightness is a filter on the picture (the title adds its own lift in front of it)');
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#modal .grain')).display), 'none', 'grain off: no grain over the menus');
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('o-dia-que-sobra.opts')));
    assert.deepEqual([kept.text, kept.contrast, kept.reduceFlash, kept.grain, kept.bright], [1.25, true, true, false, 7]);
    await open(); assert.equal(await page.evaluate(() => document.getElementById('app').dataset.contrast), 'on', 'kept through a reload');
    assert.match(await page.evaluate(() => document.getElementById('c').style.filter), /(^| )brightness\(1\.16\)$/, 'the brightness too');
  }, { look: 'novo' });
});

test('the 1998 mode changes the interface with the picture: the type is the bitmap one, the colours are flat, and the change is on the spot (the option shows only after the first ending)', { skip, timeout: 600000 }, async () => {
  await withGame(async ({ page, open }) => {
    await open('', 'title');
    await openTitleItem(page, 'OPÇÕES');
    assert.equal(await page.evaluate(() => Boolean(document.querySelector('#modal [data-key="row:modo1998"]'))), false, 'no option before an ending');
    await page.evaluate(() => { window.__odq.game.save.card.addEnding(1); window.__odq.game.showTitle(); }); await step(page, 3);
    const look = () => page.evaluate(() => { const t = document.querySelector('#modal li .t, #modal .tab'); return { mode: document.getElementById('app').dataset.look, font: getComputedStyle(t).fontFamily, bg: getComputedStyle(document.querySelector('#modal .bg')).backgroundColor, blur: getComputedStyle(document.querySelector('#modal .bg')).backdropFilter }; });
    await page.evaluate(() => window.__odq.game.setLookMode('novo')); await step(page, 3);
    const a = await look(); assert.equal(a.mode, 'novo'); assert.match(a.font, /BD Marca/);
    await openTitleItem(page, 'OPÇÕES');
    assert.equal(await page.evaluate(() => Boolean(document.querySelector('#modal [data-key="row:modo1998"]'))), true, 'after an ending the option is there');
    await tap(page, '[data-key="row:modo1998"]');
    const b = await look(); assert.equal(b.mode, '1998'); assert.match(b.font, /BD Mono/, 'the bitmap type'); assert.notEqual(a.font, b.font);
    assert.match(b.bg, /rgb\(10, 20, 112\)/, 'a flat navy ground'); assert.ok(!/blur/.test(b.blur), 'no blur');
    assert.equal(await page.evaluate(() => window.__odq.game.save.card.look1998), true, 'kept on the card');
    await tap(page, '[data-key="row:modo1998"]'); assert.equal((await look()).mode, 'novo', 'and back on the spot');
  }, { look: 'novo' });
});

test('the screens are the same everywhere: the end of a night is a register tape (the cash difference among its lines), the balance a slip, an ending a composition with FIM n, the night card a banner; and the Sun of the interface follows the week', { skip, timeout: 600000 }, async () => {
  await withGame(async ({ page, open }) => {
    await open('debug=day:9&skiptutorial', 'play');
    await page.evaluate(() => { const G = window.__odq.game; G.ui.showSummary({ atendimentos: 23, vendas: 14, abastecimentos: 9, tarefas: 11, naoFeitas: 2, erros: 1, reclamacoes: 0, divergencia: 1250, ocorrencias: 1, caixa: 184040, carteira: 312, points: 143, day: 9, saved: true, seed: 901, next: 10, cal: G.progression.calendar(9), weekClosed: false, weekPts: 280, meta: 620, last: false }); });
    await step(page, 3);
    const t = await page.evaluate(() => ({ kind: document.querySelector('#modal .scr').dataset.kind, h1: document.querySelector('#modal h1').textContent, rows: [...document.querySelectorAll('#modal .tape .tl')].map((r) => r.firstChild.textContent), gap: document.querySelector('#modal .tape .tl.gap b')?.textContent, items: [...document.querySelectorAll('#modal li[data-cell]')].map((x) => x.textContent.trim()) }));
    assert.equal(t.kind, 'tape'); assert.match(t.h1, /^NOITE 9 FECHADA/); assert.ok(t.rows.includes('Divergência de caixa') && t.rows.includes('PONTOS') && t.rows.includes('Atendimentos'));
    assert.match(t.gap, /12,50/, 'the cash difference, with nothing said about it'); assert.deepEqual(t.items, ['PRÓXIMA NOITE', 'VOLTAR AO TÍTULO']);
    await page.evaluate(() => { const G = window.__odq.game; G.ui.closeModal(); G.ui.showBalance({ title: 'BALANÇO DA SEMANA 2', sub: 'Desconfiança', lines: ['Meta: 620.', '', 'Carteira: R$ 812,00.'], ok: 'IR PARA CASA' }); });
    assert.equal(await page.evaluate(() => document.querySelector('#modal .scr').dataset.kind), 'slip');
    await page.evaluate(() => { const G = window.__odq.game; G.ui.closeModal(); G.ui.endingScreen({ title: 'Quase', subtitle: 'FIM 4', lines: ['A linha.', '', 'Finais encontrados: 1 de 5.'], items: [{ label: () => 'NOVO JOGO', act() {} }] }); });
    assert.deepEqual(await page.evaluate(() => [document.querySelector('#modal h1').textContent, document.querySelector('#modal h2').textContent, document.querySelector('#modal .lede').textContent, document.querySelectorAll('#modal .chips li').length]), ['Quase', 'FIM 4', 'A linha.', 1]);
    await page.evaluate(() => { const G = window.__odq.game; G.ui.closeModal(); G.ui.nightCard('Noite 3 · A calçada', 'SEX · semana 1'); });
    assert.match(await page.evaluate(() => document.querySelector('#ncard').textContent), /Noite 3 · A calçada/); assert.equal(await page.evaluate(() => document.querySelectorAll('#ncard svg.sol').length), 1, 'the banner has the Sun');
  });
});

test('the loading screen is in the page from the first paint (the sign of the Sun, the name, "Carregando"), in the game\'s fonts', { skip, timeout: 600000 }, async () => {
  await withGame(async ({ page, base }) => {
    await page.route('**/*.glb', async (route) => { await new Promise((r) => setTimeout(r, 3000)); route.continue().catch(() => {}); });
    await page.goto(`${base}?debug&manual&silent&nointro&look=${LOOK}&tier=leve`, { waitUntil: 'commit' });
    await page.waitForFunction(() => { const l = document.getElementById('splash'); return l && getComputedStyle(l).opacity === '1'; }, null, { timeout: 20000 });
    const r = await page.evaluate(() => ({ text: document.getElementById('splash').textContent, svg: document.querySelectorAll('#splash svg.sign .lit').length, font: getComputedStyle(document.querySelector('#splash h1')).fontFamily }));
    assert.match(r.text, /CARREGANDO/); assert.match(r.text, /O DIA QUE SOBRA/); assert.ok(r.svg > 5, 'the sign with its Sun');
    assert.match(r.font, /BD Marca|--f-marca|Baloo/i);
    await page.unroute('**/*.glb');
  });
});

test('the film mode shows no menu and no loading screen (and the page has no screens of its own there)', { skip, timeout: 600000 }, async () => {
  await withGame(async ({ page, base }) => {
    // (this game's page has no `?editor` mode of its own: the editor works on data/scenes; the loading screen still stays out of its way)
    for (const q of ['?film', '?editor']) {
      await page.goto(`${base}${q}`, { waitUntil: 'domcontentloaded' });
      assert.equal(await page.evaluate(() => document.getElementById('splash')), null, `${q}: no loading screen`);
    }
    await page.goto(`${base}?film`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    assert.equal(await page.evaluate(() => document.querySelector('#modal .scr')), null, '?film: no screens');
    assert.equal(await page.evaluate(() => document.getElementById('modal')), null, '?film: not even the layer of the screens');
  });
});
