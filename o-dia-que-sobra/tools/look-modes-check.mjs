// The picture's modes as a person meets them: the code 1998 on the monitor, the "MODO 1998" option (only after an ending), the quality
// option cycling, the mode kept on the card through a reload and through the card file's import.
//   PLAYWRIGHT_CORE=<playwright-core> node tools/look-modes-check.mjs        (exit code 1 when something fails)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..');
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const srv = await new Promise((res) => { const s = http.createServer((req, rs) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0])); if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rs.writeHead(404); rs.end(); return; } rs.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(rs); }); s.listen(0, '127.0.0.1', () => res(s)); });
const base = `http://127.0.0.1:${srv.address().port}/o-dia-que-sobra/index.html`;
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio', '--no-sandbox'] });
const fails = [];
const ok = (c, m) => { console.log((c ? 'ok    ' : 'FAIL  ') + m); if (!c) fails.push(m); };
const ctx = await browser.newContext({ viewport: { width: 480, height: 270 } });
ctx.setDefaultTimeout(120000);
const errs = [];
const open = async (q) => { const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); await page.goto(`${base}?${q}`); await page.waitForFunction(() => window.__odq?.game); await page.evaluate(() => document.getElementById('splash')?.remove()); return page; };
const cells = (page) => page.evaluate(() => [...document.querySelectorAll('#modal [data-cell]')].map((c) => c.textContent.trim()));
const click = (page, text) => page.evaluate((t) => { const c = [...document.querySelectorAll('#modal [data-cell]')].find((x) => x.textContent.trim().startsWith(t)); if (!c) return false; const r = c.getBoundingClientRect(); c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); return true; }, text);
const row = (page, id) => page.evaluate((id) => document.querySelector(`#modal [data-key="row:${id}"]`)?.dataset.v ?? null, id);
const back = (page) => page.evaluate(() => { const b = document.querySelector('#modal [data-back]'); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); });
const state = (page) => page.evaluate(() => { const O = window.__odq; return { mode: O.render.mode, look: O.render.look, tier: O.render.tier, card: O.game.save.card.look1998 }; });

// 1. the menu, before and after an ending; the quality option cycles; the mode option switches and is kept
let page = await open('debug&manual&nointro&silent&look=novo&tier=medio&wx=limpo');
await page.evaluate(() => window.__odq.advance(3));
ok(await click(page, 'OPÇÕES'), 'the title has OPÇÕES');
let list = await cells(page);
ok(!list.some((t) => t.startsWith('MODO 1998')), `no MODO 1998 option before an ending (${list.join(' | ').slice(0, 120)})`);
const q0 = list.find((t) => t.startsWith('QUALIDADE'));
ok(Boolean(q0), `the quality option is there (${q0})`);
const seen = [q0];
for (let i = 0; i < 4; i++) { await click(page, 'QUALIDADE'); await page.evaluate(() => window.__odq.advance(1)); seen.push((await cells(page)).find((t) => t.startsWith('QUALIDADE'))); }
const kind = (t) => t.replace(/ \(.*$/, '');   // (the automatic one names the tier it picked: the first came from ?tier=, the last from the device)
ok(new Set(seen.slice(0, 4).map(kind)).size === 4 && kind(seen[4]) === kind(seen[0]), `the quality option cycles through four values and back (${seen.join(' / ')})`);
await page.evaluate(() => { window.__odq.game.save.card.addEnding(1); });
await back(page); await page.evaluate(() => window.__odq.advance(2));
await click(page, 'OPÇÕES'); list = await cells(page);
ok((await row(page, 'modo1998')) === 'DESLIGADO', 'after the first ending the MODO 1998 option shows, off');
await click(page, 'MODO 1998'); await page.evaluate(() => window.__odq.advance(2));
let s = await state(page);
ok(s.mode === '1998' && s.look === 'n64' && s.card === true, `choosing it switches the picture to the n64 look and writes the card (${JSON.stringify(s)})`);
ok((await row(page, 'modo1998')) === 'LIGADO', 'the option now reads LIGADO');
ok(await page.evaluate(() => document.getElementById('app').dataset.look === '1998'), 'the interface changes with the picture (data-look 1998)');
// 2. the card file: the mode survives the export and the import
const rt = await page.evaluate(async () => { const S = await import('/o-dia-que-sobra/src/systems/snapshot.js'); const G = window.__odq.game; const txt = S.buildExport(G.save.card.data, { debug: true }); const r = S.parseCardFile(txt, txt.length); return { ok: r.ok, reason: r.reason, look: r.card?.meta?.look1998 }; });
ok(rt.ok && rt.look === true, `meta.look1998 survives the card file's export and import (${JSON.stringify(rt)})`);
await page.close();
// 3. a reload starts in the kept mode (the debug card keeps its own storage: the same context)
page = await open('debug&manual&nointro&silent&wx=limpo');
s = await state(page);
ok(s.mode === '1998' && s.look === 'n64', `after a reload the game starts in the 1998 mode (${JSON.stringify(s)})`);
await page.evaluate(() => window.__odq.game.setLookMode('novo'));
await page.close();
page = await open('debug&manual&nointro&silent&wx=limpo');
s = await state(page);
ok(s.mode === 'novo' && s.look === 'prerender', `and back to the new look when it is turned off (${JSON.stringify(s)})`);
await page.close();

// 4. the code on the monitor: typing 1, 9, 9, 8 switches the mode, again switches it back; other digits do not
page = await open('debug=day:2&manual&skiptutorial&silent&wx=limpo&look=novo&tier=leve');
const dig = async (ds) => { await page.evaluate((ds) => { for (const d of ds) window.__odq.game.cameras.digit(d); }, ds); };
await dig([7, 1, 9, 9]); s = await state(page);
ok(s.mode === 'novo', 'a partial code (7 1 9 9) does nothing');
await dig([8]); s = await state(page);
ok(s.mode === '1998' && s.look === 'n64', `the digits 1 9 9 8 switch to the 1998 mode (${JSON.stringify(s)})`);
await page.evaluate(() => window.__odq.advance(2));
await dig([1, 9, 9, 8]); s = await state(page);
ok(s.mode === 'novo' && s.look === 'prerender', `the code again switches back to the new look (${JSON.stringify(s)})`);
await page.close();
ok(errs.length === 0, `console clean (${errs.slice(0, 2).join(' ; ')})`);
await browser.close(); srv.close();
process.exit(fails.length ? 1 : 0);
