// The screens of the game (title, pause, options, commands, memory card): they work with only a keyboard, with only a pad and with only touch, and they look
// like the game (no browser button, scrollbar or blue ring), keep touch targets of 44 px, and the film and editor modes show none of them.
// The pure parts run always; the browser ones need a Chrome and playwright-core: PLAYWRIGHT_CORE=<folder> node --test test/menus.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { titleCamera } from '../src/title-cam.js';
import { legend, icon, LOGO } from '../src/ui-art.js';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const CORE = process.env.PLAYWRIGHT_CORE, skip = CORE ? false : 'set PLAYWRIGHT_CORE to run the browser tests';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg' };
const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

// ---- the pure parts ------------------------------------------------------------------------------------------------------------------------------
test('the title camera is a function of the time alone: the same second gives the same picture, it starts wide and ends close on the radio, and it only breathes after', () => {
  assert.deepEqual(titleCamera(12.5), titleCamera(12.5));
  const a = titleCamera(0), b = titleCamera(34), c = titleCamera(300);
  assert.ok(a.fov > b.fov + 15, 'it starts wide and closes in');
  assert.ok(Math.hypot(a.eye[0] - b.eye[0], a.eye[2] - b.eye[2]) > 4, 'it travels across the hall');
  assert.ok(Math.hypot(c.eye[0] - b.eye[0], c.eye[1] - b.eye[1], c.eye[2] - b.eye[2]) < 0.2, 'after the move it only sways a few centimetres');
  const calm = titleCamera(300, { calm: true }), still = titleCamera(34, { calm: true });
  assert.ok(Math.abs(calm.eye[0] - still.eye[0]) <= Math.abs(c.eye[0] - b.eye[0]) + 1e-9, 'calm sways less');
  assert.ok(!/Math\.random|Date\.now|performance/.test(readFileSync(new URL('../src/title-cam.js', import.meta.url), 'utf8')), 'no clock, no unseeded random');
});

test('the legend of the buttons follows the device: keys for the keyboard, drawn buttons for the pad, only what a finger does for touch (with a Voltar button)', () => {
  const kb = legend(['move', 'ok', 'back'], 'keyboard'), pad = legend(['move', 'ok', 'back'], 'gamepad'), touch = legend(['move', 'ok', 'back'], 'touch');
  assert.match(kb, /<kbd>Enter<\/kbd>/); assert.match(kb, /<kbd>Esc<\/kbd>/); assert.doesNotMatch(kb, /class="pb/);
  assert.match(pad, /class="pb b-a"/); assert.match(pad, /class="pb b-b"/); assert.doesNotMatch(pad, /<kbd>Enter/);
  assert.doesNotMatch(touch, /<kbd>/); assert.match(touch, /data-act="back"/); assert.match(touch, /Toque para escolher/);
  assert.match(legend(['back'], 'keyboard', { backAct: 'resume', backWord: 'Voltar ao jogo' }), /data-act="resume"[^>]*>.*Voltar ao jogo/s);
});

test('the pieces drawn in code: the logotype has the name, every kind of memory-card block has an icon, and nothing in them is an image file', () => {
  assert.match(LOGO, /SINAL/); assert.match(LOGO, /DE VIDA/); assert.doesNotMatch(LOGO, /<image|href=/);
  for (const k of ['run', 'night', 'other', 'corrupt', 'channel', 'secrets', 'empty']) assert.match(icon(k), /<path class="ink"/, k);
  assert.notEqual(icon('corrupt'), icon('empty'), 'the broken block has its own icon');
});

test('the fonts are in the repository with their licences, loaded by @font-face from local files (never from a network address)', () => {
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  const faces = [...css.matchAll(/@font-face[^}]*src:\s*url\('([^']+)'\)/g)].map((m) => m[1]);
  assert.ok(faces.length >= 3, 'the faces are declared');
  for (const f of faces) { assert.match(f, /^\.\/assets\/fonts\//); assert.ok(existsSync(new URL('../' + f.slice(2), import.meta.url)), f); }
  for (const l of ['OFL-BigShouldersDisplay.txt', 'OFL-BarlowSemiCondensed.txt']) assert.match(readFileSync(new URL('../assets/fonts/' + l, import.meta.url), 'utf8'), /SIL OPEN FONT LICENSE/i);
  assert.doesNotMatch(css + readFileSync(new URL('../menus.css', import.meta.url), 'utf8') + readFileSync(new URL('../index.html', import.meta.url), 'utf8'), /fonts\.googleapis|fonts\.gstatic|https?:\/\/[^"')]*\.(woff2?|ttf)/);
  assert.match(readFileSync(new URL('../CREDITOS.md', import.meta.url), 'utf8'), /Big Shoulders/);
});

// ---- the browser ---------------------------------------------------------------------------------------------------------------------------------
async function withGame(fn, { touch = false, pad = false, size = null } = {}) {
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
    const ctx = await browser.newContext(touch ? { viewport: size ?? { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: size ?? { width: 960, height: 540 } });
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    // a pad that exists only in the page: window.__pad is what the buttons say
    if (pad) await page.addInitScript(() => { const b = () => ({ pressed: false, value: 0 }); window.__pad = { connected: true, id: 'test pad', index: 0, buttons: Array.from({ length: 17 }, b), axes: [0, 0, 0, 0] }; navigator.getGamepads = () => [window.__pad]; });
    const open = async (query = '') => { await page.goto(`${url}${query}`, { timeout: 120000 }); await page.waitForFunction(() => window.__game?.run && window.__game.st.phase); await page.evaluate(() => window.__game.test.manual(true)); await page.waitForFunction(() => window.__game.st.world && window.__game.st.shot >= 0, null, { timeout: 90000 }); };
    await fn({ page, open, errors, url });
    assert.deepEqual(errors, [], 'no console error');
  } finally { await browser.close(); srv.close(); }
}
const step = (page, n = 3) => page.evaluate((k) => window.__game.test.step(k), n);
const cur = (page) => page.evaluate(() => window.__game.screens.current);
const selText = (page) => page.evaluate(() => document.querySelector('#screens .f.sel')?.textContent.replace(/\s+/g, ' ').trim());
/** One press of a pad button: down for a few steps, then up. */
const padPress = async (page, i) => { await page.evaluate((k) => { window.__pad.buttons[k] = { pressed: true, value: 1 }; }, i); await step(page, 3); await page.evaluate((k) => { window.__pad.buttons[k] = { pressed: false, value: 0 }; }, i); await step(page, 3); };
const press = async (page, key) => { await page.keyboard.down(key); await step(page, 3); await page.keyboard.up(key); await step(page, 3); };

test('with only the keyboard: the arrows walk the title, Enter opens, Tab changes the tab, the arrows set a fader and a switch, Esc goes back, and the legend names the keys', { skip, timeout: 240000 }, async () => {
  await withGame(async ({ page, open }) => {
    await open('');
    assert.equal(await cur(page), 'title');
    assert.match(await selText(page), /Nova partida/);
    await press(page, 'ArrowDown'); assert.match(await selText(page), /Cartão de memória/);
    await press(page, 'ArrowDown'); await press(page, 'ArrowDown'); assert.match(await selText(page), /Comandos/);
    await press(page, 'ArrowDown'); assert.match(await selText(page), /Nova partida/, 'the list comes round');
    await press(page, 'ArrowUp'); assert.match(await selText(page), /Comandos/);
    await press(page, 'ArrowUp'); assert.match(await selText(page), /Opções/);
    assert.match(await page.evaluate(() => document.querySelector('#screens .legend').innerHTML), /<kbd[^>]*>Enter<\/kbd>/);
    await press(page, 'Enter'); assert.equal(await cur(page), 'options');
    assert.equal(await page.evaluate(() => document.querySelector('#screens .tab.on').dataset.tab), 'imagem');
    await press(page, 'Tab'); assert.equal(await page.evaluate(() => document.querySelector('#screens .tab.on').dataset.tab), 'som', 'Tab: the next tab');
    assert.match(await selText(page), /Volume/);
    const v0 = await page.evaluate(() => window.__game.options.volume);
    await press(page, 'ArrowLeft'); await press(page, 'ArrowLeft');
    assert.equal(await page.evaluate(() => window.__game.options.volume), v0 - 2, 'the left arrow lowers the fader');
    await press(page, 'ArrowDown'); assert.match(await selText(page), /Legendas/);
    const c0 = await page.evaluate(() => window.__game.options.captions);
    await press(page, 'Enter'); assert.equal(await page.evaluate(() => window.__game.options.captions), !c0, 'Enter throws the switch');
    assert.equal(await page.evaluate(() => document.querySelector('#screens [data-o="captions"]').getAttribute('aria-checked')), String(!c0));
    await press(page, 'ArrowUp'); await press(page, 'ArrowUp'); assert.match(await selText(page), /Som/, 'up from the first row reaches the tabs');
    await press(page, 'ArrowRight'); assert.equal(await page.evaluate(() => document.querySelector('#screens .tab.on').dataset.tab), 'controles', 'the arrows on the tabs change the tab');
    await press(page, 'Escape'); assert.equal(await cur(page), 'title', 'Esc goes back to where it came from');
    await press(page, 'ArrowUp'); assert.match(await selText(page), /Cartão de memória/); await press(page, 'Enter'); assert.equal(await cur(page), 'card');
    assert.equal(await page.evaluate(() => document.querySelectorAll('#screens .blk').length), 15, 'fifteen blocks');
    await press(page, 'ArrowRight'); assert.equal(await page.evaluate(() => document.querySelector('#screens .blk.sel')?.dataset.n), '2', 'the arrows move over the blocks');
    await press(page, 'ArrowDown'); assert.equal(await page.evaluate(() => document.querySelector('#screens .blk.sel')?.dataset.n), '7');
    assert.match(await page.evaluate(() => document.querySelector('#screens .cardinfo').textContent), /Bloco 7/, 'the info follows the block');
    await press(page, 'Escape'); assert.equal(await cur(page), 'title');
  });
});

test('with only a pad: the d-pad and the stick walk the menus, A confirms, B goes back, LB and RB change the tab, the d-pad sets a fader, and the legend shows the pad buttons', { skip, timeout: 240000 }, async () => {
  await withGame(async ({ page, open }) => {
    await open('');
    assert.equal(await page.evaluate(() => window.__game.input.device), 'keyboard', 'no pad button yet');
    await padPress(page, PAD.DOWN);
    assert.equal(await page.evaluate(() => window.__game.input.device), 'gamepad');
    assert.match(await selText(page), /Cartão de memória/);
    const leg = await page.evaluate(() => document.querySelector('#screens .legend').innerHTML);
    assert.match(leg, /class="pb b-a"/, 'the legend shows the A button'); assert.doesNotMatch(leg, /<kbd/);
    await padPress(page, PAD.DOWN); assert.match(await selText(page), /Opções/);
    // the left stick is a step of the menu too
    await page.evaluate(() => { window.__pad.axes[1] = 0.9; }); await step(page, 3); await page.evaluate(() => { window.__pad.axes[1] = 0; }); await step(page, 3);
    assert.match(await selText(page), /Comandos/, 'the stick moves one line');
    await padPress(page, PAD.UP); assert.match(await selText(page), /Opções/);
    await padPress(page, PAD.A); assert.equal(await cur(page), 'options');
    assert.match(await page.evaluate(() => document.querySelector('#screens .legend').innerHTML), /class="pb b-b"/, 'the options name B as the way back');
    await padPress(page, PAD.RB); assert.equal(await page.evaluate(() => document.querySelector('#screens .tab.on').dataset.tab), 'som', 'RB: the next tab');
    await padPress(page, PAD.RB); await padPress(page, PAD.LB); assert.equal(await page.evaluate(() => document.querySelector('#screens .tab.on').dataset.tab), 'som', 'RB then LB comes back');
    assert.match(await selText(page), /Volume/);
    const v0 = await page.evaluate(() => window.__game.options.volume);
    await padPress(page, PAD.LEFT); await padPress(page, PAD.LEFT); await padPress(page, PAD.LEFT);
    assert.equal(await page.evaluate(() => window.__game.options.volume), v0 - 3, 'the d-pad sets the fader');
    await padPress(page, PAD.B); assert.equal(await cur(page), 'title', 'B goes back');
    // the first start: the content notice, answered with the pad
    await padPress(page, PAD.UP); await padPress(page, PAD.UP); assert.match(await selText(page), /Nova partida/);
    await padPress(page, PAD.A); assert.equal(await cur(page), 'gore');
    await padPress(page, PAD.DOWN); await padPress(page, PAD.A);
    await page.waitForFunction(() => window.__game.st.phase === 'play');
    assert.equal(await page.evaluate(() => window.__game.options.gore), false, 'answered with the pad');
    // the pause: Start opens it in a walkable scene, the pad moves in it, B goes back to the game
    await page.evaluate(() => { window.__game.screens.open('menu'); }); await step(page, 3);
    assert.equal(await cur(page), 'menu');
    assert.match(await selText(page), /Continuar/);
    await padPress(page, PAD.DOWN); await padPress(page, PAD.DOWN); assert.match(await selText(page), /Opções/);
    await padPress(page, PAD.A); assert.equal(await cur(page), 'options'); await padPress(page, PAD.B); assert.equal(await cur(page), 'menu');
    await padPress(page, PAD.B); assert.equal(await cur(page), null, 'B closes the pause');
  }, { pad: true });
});

test('with only touch (390 x 844): a tap opens, a tap or a drag on the fader sets it, the buttons are drawn at 44 px or more, nothing scrolls sideways, and the Voltar button is the way back', { skip, timeout: 240000 }, async () => {
  await withGame(async ({ page, open }) => {
    await open('');
    assert.equal(await page.evaluate(() => window.__game.input.device), 'touch');
    assert.doesNotMatch(await page.evaluate(() => document.querySelector('#screens .legend').innerHTML), /<kbd/, 'no key is named for a finger');
    const small = async () => page.evaluate(() => [...document.querySelectorAll('#screens .f, #screens .st, #screens .lg.back')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => ({ t: (e.getAttribute('aria-label') || e.textContent || e.className).trim().slice(0, 30), w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height) })).filter((x) => x.h < 44 || x.w < 44));
    const overflow = async () => page.evaluate(() => { const p = document.querySelector('#screens .panel'); return [p, ...p.querySelectorAll('.list, .hd, .mgr, .cardgrid')].filter((e) => e.scrollWidth > e.clientWidth + 1 && !e.classList.contains('tabs')).map((e) => e.className); });
    assert.deepEqual(await small(), [], 'title: every thing to touch is 44 px or more'); assert.deepEqual(await overflow(), []);
    await page.tap('[data-act="options"]'); assert.equal(await cur(page), 'options');
    assert.deepEqual(await small(), [], 'options'); assert.deepEqual(await overflow(), []);
    await page.tap('[data-tab="som"]'); assert.equal(await page.evaluate(() => document.querySelector('#screens .tab.on').dataset.tab), 'som');
    assert.deepEqual(await small(), [], 'the Som tab');
    const box = await page.evaluate(() => { const r = document.querySelector('#screens .track[data-o="volume"]').getBoundingClientRect(); return { x: r.x, y: r.y + r.height / 2, w: r.width }; });
    await page.touchscreen.tap(box.x + box.w * 0.3, box.y);
    assert.equal(await page.evaluate(() => window.__game.options.volume), 3, 'a tap on the track sets the notch');
    await page.tap('[data-act="vol+"]'); assert.equal(await page.evaluate(() => window.__game.options.volume), 4, 'the + end of the fader');
    await page.tap('[data-o="captions"]'); assert.equal(await page.evaluate(() => window.__game.options.captions), false, 'a tap throws the switch');
    for (const t of ['controles', 'acess', 'conteudo']) { await page.tap(`[data-tab="${t}"]`); assert.deepEqual(await small(), [], t); assert.deepEqual(await overflow(), [], t); }
    await page.tap('[data-tab="acess"]'); await page.tap('[data-o="textSize"]');
    assert.equal(await page.evaluate(() => window.__game.options.textSize), 1, 'a tap on a selector steps it');
    await page.tap('[data-act="back"]'); assert.equal(await cur(page), 'title', 'the Voltar button');
    await page.tap('[data-act="card"]'); assert.equal(await cur(page), 'card'); assert.deepEqual(await small(), [], 'card'); assert.deepEqual(await overflow(), [], 'card');
    await page.tap('.blk[data-n="13"]'); assert.match(await page.evaluate(() => document.querySelector('#screens .cardinfo').textContent), /Arquivo quebrado/, 'the broken block');
    await page.tap('[data-act="back"]');
    await page.tap('[data-act="commands"]'); assert.equal(await cur(page), 'commands'); assert.deepEqual(await overflow(), [], 'commands');
    assert.match(await page.evaluate(() => document.querySelector('#screens .list .cmd .c.cur').textContent), /direcional virtual|toque|arrastar/i, 'the touch column is the one on show');
    await page.tap('[data-act="back"]');
    await page.evaluate(() => window.__game.screens.open('menu')); await step(page, 3);
    assert.deepEqual(await small(), [], 'the pause'); assert.deepEqual(await overflow(), [], 'the pause');
    await page.tap('[data-act="resume"]'); assert.equal(await cur(page), null);
  }, { touch: true });
});

test('no browser look: no default button, no scrollbar, no blue focus ring, no text cursor, and the type is the game\'s (not system-ui)', { skip, timeout: 240000 }, async () => {
  await withGame(async ({ page, open }) => {
    await open('');
    await page.evaluate(() => window.__game.screens.open('options'));
    const r = await page.evaluate(() => {
      const out = { appearance: [], outline: [], scroll: [], fonts: new Set(), caret: getComputedStyle(document.getElementById('app')).caretColor };
      for (const b of document.querySelectorAll('#screens button')) { const c = getComputedStyle(b); if (c.appearance !== 'none' && c.appearance !== 'auto') out.appearance.push(c.appearance); if (c.appearance === 'auto') out.appearance.push('auto'); if (c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0) out.outline.push(b.className); if (c.fontFamily.includes('system-ui')) out.fonts.add('system-ui'); out.fonts.add(c.fontFamily.split(',')[0].replace(/['"]/g, '')); }
      for (const e of document.querySelectorAll('#screens .panel, #screens .list, #screens .tabs')) if (e.offsetWidth - e.clientWidth > 0 || e.offsetHeight - e.clientHeight > 0 && getComputedStyle(e).overflowY !== 'hidden') out.scroll.push(e.className);
      out.fonts = [...out.fonts]; out.user = getComputedStyle(document.getElementById('screens')).userSelect;
      return out;
    });
    assert.deepEqual(r.appearance, [], 'no native button look'); assert.deepEqual(r.outline, [], 'no focus ring'); assert.deepEqual(r.scroll, [], 'no scrollbar takes room');
    assert.ok(!r.fonts.includes('system-ui'), 'not the system font'); assert.ok(r.fonts.every((f) => /^SV (Display|Text)$/.test(f)), `the two fonts of the game: ${r.fonts}`);
    assert.equal(r.user, 'none', 'no text selection'); assert.equal(r.caret, 'rgba(0, 0, 0, 0)', 'no text cursor');
    // the fonts really loaded from the local files
    assert.ok(await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('20px "SV Display"') && document.fonts.check('20px "SV Text"'); }), 'the fonts are loaded');
  });
});

test('the accessibility options act: text size grows the type, high contrast changes the grounds, reduce flashes calms the transitions, and all of them are kept on the card', { skip, timeout: 240000 }, async () => {
  await withGame(async ({ page, open }) => {
    await open('');
    const size = () => page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#screens .item .t')).fontSize));
    const s0 = await size();
    await page.evaluate(() => { window.__game.G.actions.choose('textSize', 1); }); const s1 = await size();
    assert.ok(s1 > s0 * 1.1, `bigger type (${s0} -> ${s1})`);
    assert.equal(await page.evaluate(() => document.getElementById('app').style.getPropertyValue('--ts')), '1.18');
    await page.evaluate(() => { window.__game.G.actions.toggleOption('contrast'); window.__game.G.actions.toggleOption('flashes'); window.__game.G.actions.bright(2); });
    assert.deepEqual(await page.evaluate(() => ({ c: document.getElementById('app').dataset.contrast, calm: document.getElementById('app').dataset.calm, f: document.getElementById('c').style.filter })), { c: 'on', calm: 'on', f: 'brightness(1.16)' });
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#screens .grain')).display), 'none', 'calm: no grain moving');
    const kept = await page.evaluate(() => { const o = JSON.parse(localStorage.getItem('sinal-de-vida.card.v2')).meta.opts; return [o.textSize, o.contrast, o.flashes, o.bright]; });
    assert.deepEqual(kept, [1, true, true, 7]);
    await open(''); assert.equal(await page.evaluate(() => document.getElementById('app').dataset.contrast), 'on', 'kept through a reload');
  });
});

test('the film and the editor modes show no menu: no screens, no loading screen', { skip, timeout: 240000 }, async () => {
  await withGame(async ({ page, url }) => {
    for (const q of ['?film', '?editor=galeria']) {
      await page.goto(`${url}${q}`, { waitUntil: 'domcontentloaded' });
      assert.equal(await page.evaluate(() => document.getElementById('loading')), null, `${q}: no loading screen`);
      await page.waitForTimeout(1500);
      assert.equal(await page.evaluate(() => document.getElementById('screens')), null, `${q}: no screens`);
    }
  });
});

test('the loading screen is there from the first paint, the pause blurs the game and the game over is composed (the title, the pause and the game over, seen in the page)', { skip, timeout: 240000 }, async () => {
  await withGame(async ({ page, url, open }) => {
    await page.route('**/*.glb', async (route) => { await new Promise((r) => setTimeout(r, 4000)); route.continue().catch(() => {}); });
    await page.goto(url, { waitUntil: 'commit' });
    await page.waitForFunction(() => { const l = document.getElementById('loading'); return l && !l.hidden && getComputedStyle(l).opacity === '1'; }, null, { timeout: 20000 });
    assert.match(await page.evaluate(() => document.getElementById('loading').textContent), /Carregando/);
    assert.match(await page.evaluate(() => getComputedStyle(document.querySelector('#loading .ld-name')).fontFamily), /SV Display/);
    await page.waitForFunction(() => window.__game?.st.world && window.__game.st.shot >= 0, null, { timeout: 90000 });
    await page.waitForFunction(() => document.getElementById('loading').hidden, null, { timeout: 60000 });
    await page.unroute('**/*.glb');
    await page.evaluate(() => window.__game.test.manual(true));
    // the pause: the scene behind is blurred and dimmed, the menu is on the left, the notebook on the right
    await page.evaluate(() => window.__game.screens.open('menu', { tip: false }));
    const p = await page.evaluate(() => { const bg = getComputedStyle(document.querySelector('#screens .bg')); const side = document.querySelector('#screens .side').getBoundingClientRect(), note = document.querySelector('#screens .note')?.getBoundingClientRect(); return { blur: bg.backdropFilter, side: side.x + side.width / 2, note: note ? note.x + note.width / 2 : null, w: innerWidth }; });
    assert.match(p.blur, /blur\(/); assert.ok(p.side < p.w / 2, 'the menu is on the left');
    // the game over: the title, the reason and the key, composed (not loose centred text)
    await page.evaluate(() => { window.__game.screens.close(true); window.__game.ui.gameOver({ why: 'O cão pegou o Jonas.', hint: 'E: voltar ao último ponto salvo' }); });
    const g = await page.evaluate(() => { const h = document.querySelector('#gameover h2').getBoundingClientRect(), k = document.querySelector('#gameover .go kbd'); return { x: h.x, w: innerWidth, kbd: k?.textContent, font: getComputedStyle(document.querySelector('#gameover h2')).fontFamily }; });
    assert.ok(g.x < g.w * 0.2, 'the title is set on the left'); assert.equal(g.kbd, 'E'); assert.match(g.font, /SV Display/);
  });
});
