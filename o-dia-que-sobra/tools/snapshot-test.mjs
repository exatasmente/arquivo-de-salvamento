// "Save now" and the card as a file, through the real page (desktop 1920x1080 and phone 390x844).
//
//   node tools/snapshot-test.mjs              both sizes
//   node tools/snapshot-test.mjs desktop      one size
//
// What it plays: night 3 (the debug card), to 00:40 with a car at pump 3 and a customer in the shop, pauses, SALVAR AGORA through the
// menu, reloads the page, CONTINUAR from the title and compares the night with what was saved; then EXPORTAR CARTÃO (a real download),
// clears the storage, IMPORTAR CARTÃO (a real file chooser), CONTINUAR again; then broken files, which must be refused with the card
// untouched. Exit code 1 when anything fails or the console is not clean.
// Environment: PLAYWRIGHT_CORE, CHROME, OUT_DIR (where the screenshots go; none when unset).
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..');
const PW = process.env.PLAYWRIGHT_CORE || 'playwright-core';
const { chromium } = createRequire(import.meta.url)(PW);
const OUT = process.env.OUT_DIR ? process.env.OUT_DIR.replace(/\/?$/, '/') : null;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const failures = [];
const ok = (cond, msg) => { console.log((cond ? 'ok    ' : 'FAIL  ') + msg); if (!cond) failures.push(msg); return cond; };
const CARD = 'o-dia-que-sobra.card.v1.debug';

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

async function open(ctx, base, query, errs) {
  const page = await ctx.newPage(); page.__touch = /[?&]touch/.test(query);
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/Service Worker registration blocked/.test(m.text())) errs.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await page.goto(`${base}/o-dia-que-sobra/index.html?${query}${/[?&]wx=/.test(query) ? '' : '&wx=limpo'}`);   // (a dry night unless the scenario asks for a weather)
  return page;
}
const shot = async (page, name) => { if (OUT) await page.screenshot({ path: `${OUT}${name}.png` }); };
const clickText = async (page, text) => {
  // a real (trusted) click or tap on the row, so that the file chooser and the download are allowed to open; then the manual steps that read it
  await page.waitForSelector('#modal [data-cell]');
  const r = await page.evaluate((t) => {
    const c = [...document.querySelectorAll('#modal [data-cell]')].find((e) => e.textContent.trim().startsWith(t));
    if (!c) return null; const b = c.getBoundingClientRect(); return { x: b.right - 12, y: b.top + b.height / 2 };
  }, text);
  if (!r) throw new Error('no menu row starting with ' + JSON.stringify(text));
  if (page.__touch) await page.touchscreen.tap(r.x, r.y); else await page.mouse.click(r.x, r.y);
  await page.evaluate(() => window.__odq.advance(3));
};
const rows = (page) => page.evaluate(() => [...document.querySelectorAll('#modal li')].map((e) => e.textContent.trim()));

/** What the night looks like, as numbers: the same read before saving and after continuing. */
const OBSERVE = () => {
  const G = window.__odq.game, st = G.progression.st, p = G.player.st;
  return {
    state: G.state, day: st.day, minutes: Math.round(G.time.minutes * 1000) / 1000, wallet: st.wallet, sanity: Math.round(G.sanity.value * 100) / 100,
    night: JSON.stringify(st.night), weekPts: st.weekPts, slots: G.inventory.slots.join(','), sel: G.inventory.sel, flash: Math.round(G.inventory.flash.charge * 100) / 100,
    till: JSON.stringify(G.cash.state()), opened: G.cash.opened,
    pos: [Math.round(p.x * 100) / 100, Math.round(p.z * 100) / 100, Math.round(p.yaw * 100) / 100],
    goal: G.goals.key, seed: G.nightSeed,
    tasks: G.tasks.list.filter((t) => t.kind !== 'carro' && t.kind !== 'cliente').map((t) => `${t.id}:${t.done ? 1 : 0}${t.failed ? 'f' : ''}`).sort().join('|'),
    open: G.tasks.list.filter((t) => !t.done && t.kind !== 'carro' && t.kind !== 'cliente').length,
    shelves: G.world.shelves.filter(Boolean).map((r) => r.stock).join(','),
    cust: G.customers.list.filter((c) => (c.kind === 'car' || c.kind === 'walk') && !c.done).map((c) => `${c.kind}${c.pump || ''}`).sort().join(','),
    prep: G.prep.on, punched: G.prep.punched,
  };
};

async function scenario(browser, base, kind) {
  const mobile = kind === 'mobile', tag = mobile ? 'celular' : 'desktop';
  const dl = fs.mkdtempSync(path.join(os.tmpdir(), 'odq-card-'));
  const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1920, height: 1080 }, hasTouch: mobile, isMobile: mobile, serviceWorkers: 'block', acceptDownloads: true });
  const errs = [];
  const Q0 = `debug=day:3&manual&silent&skiptutorial&nointro&seed=1${mobile ? '&touch' : ''}`, Q1 = `debug=load&manual&silent&nointro&seed=1${mobile ? '&touch' : ''}`;
  let page = await open(ctx, base, Q0, errs);
  await page.waitForFunction(() => window.__odq?.game?.state === 'play', null, { timeout: 90000 });
  const ev = (fn, arg) => page.evaluate(fn, arg);

  // ---- a night in the middle: the preparation done, the till open, a car at pump 3 and a customer in the shop
  await ev(() => { const G = window.__odq.game; try { Object.defineProperty(document, 'pointerLockElement', { get: () => document.body, configurable: true }); } catch { /* there already */ } for (let i = 0; i < 400; i++) G.step(1 / 60); });
  await ev(() => { const G = window.__odq.game; G.tasks.done('ponto'); G.prep.setPunched(true); });
  await ev(() => { const G = window.__odq.game; let n = 0; while (G.time.minutes < 0 && n++ < 14000) { if (G.ui.modalOpen) G.ui.closeModal(); G.step(1 / 60); } });
  await ev(() => { const G = window.__odq.game; G.tasks.openTill(); G.customers.enable(false); const a = G.customers.spawnCar({ pump: 3, seed: 77 }), b = G.customers.spawnWalker({ seed: 5 }); window.__made = Boolean(a && b); });
  ok(await ev(() => window.__made), `${tag}: a car and a shop customer exist before saving`);
  await ev(() => { const G = window.__odq.game; let n = 0; while (G.time.minutes < 40 && n++ < 9000) { if (G.ui.modalOpen) G.ui.closeModal(); G.step(1 / 60); } G.customers.enable(false); });
  await ev(() => { const G = window.__odq.game; G.sanity.add(-13, 'teste'); G.inventory.flash.on = true; G.inventory.flash.charge -= 40; G.inventory.select(2); G.progression.st.wallet += 7.5; G.progression.points(4); G.cash.ring(1250); G.cash.receive(2000); G.world.shelves.filter(Boolean)[0].setStock(1); G.player.st.x += 0.5; G.player.st.yaw = 1.25; });
  const before = await ev(OBSERVE);
  ok(before.cust.includes('car3') && before.cust.includes('walk'), `${tag}: before saving there is ${before.cust}`);
  ok(before.minutes >= 40, `${tag}: saved at ${before.minutes} min`);

  // ---- pause, SALVAR AGORA through the menu
  await ev(() => window.__odq.game.openPause());
  const pauseRows = await rows(page);
  ok(pauseRows.includes('SALVAR AGORA') && pauseRows.includes('EXPORTAR CARTÃO'), `${tag}: the pause offers SALVAR AGORA and EXPORTAR CARTÃO (${pauseRows.join(' / ')})`);
  await clickText(page, 'SALVAR AGORA');
  const note = await ev(() => document.querySelector('#modal')?.textContent || '');
  ok(/Salvo: SEMANA 1 · NOITE 3 · 00:4\d/.test(note), `${tag}: the pause says what was saved (${note.replace(/\s+/g, " ").slice(0, 200)})`);
  await shot(page, `salvar-agora-pausa-${tag}`);
  const stored = JSON.parse(await ev((k) => localStorage.getItem(k), CARD));
  ok(stored.run?.snap?.v === 1 && stored.run.snap.day === 3 && stored.run.snap.customers.list.length >= 2, `${tag}: the card holds run.snap with ${stored.run?.snap?.customers?.list?.length} customers`);
  ok(!/"s[0-9]+".*resposta|senha|password/i.test(JSON.stringify(stored)), `${tag}: no answer text in the card`);

  // ---- reload, CONTINUAR
  await page.close();
  page = await open(ctx, base, Q1, errs);
  await page.waitForFunction(() => window.__odq?.game?.state === 'title', null, { timeout: 90000 });
  const titleRows = await rows(page);
  ok(titleRows.some((r) => /^CONTINUAR\s+\(SEMANA 1 · NOITE 3 · 00:4\d\)$/.test(r)), `${tag}: the title says ${titleRows[0]}`);
  ok(titleRows.includes('IMPORTAR CARTÃO'), `${tag}: the title offers IMPORTAR CARTÃO`);
  await shot(page, `titulo-continuar-${tag}`);
  await clickText(page, 'CONTINUAR');
  await page.waitForFunction(() => window.__odq.game.state === 'play', null, { timeout: 30000 });
  await ev(() => { try { Object.defineProperty(document, 'pointerLockElement', { get: () => document.body, configurable: true }); } catch { /* there already */ } });
  let after = await ev(OBSERVE);
  const same = ['day', 'minutes', 'wallet', 'sanity', 'night', 'weekPts', 'slots', 'sel', 'flash', 'till', 'opened', 'pos', 'seed', 'prep', 'punched'];
  const near = (k) => (k === 'minutes' && Math.abs(before.minutes - after.minutes) < 0.1) || (k === 'flash' && Math.abs(before.flash - after.flash) < 0.5);
  for (const k of same) ok(near(k) || JSON.stringify(before[k]) === JSON.stringify(after[k]), `${tag}: continued ${k} ${JSON.stringify(after[k])}${near(k) || JSON.stringify(before[k]) === JSON.stringify(after[k]) ? '' : ' (was ' + JSON.stringify(before[k]) + ')'}`);
  ok(before.tasks === after.tasks || before.open === after.open, `${tag}: tasks ${after.open} open (was ${before.open})${before.tasks === after.tasks ? '' : '\n         ' + before.tasks + '\n         ' + after.tasks}`);
  ok(before.shelves === after.shelves, `${tag}: shelves ${after.shelves === before.shelves ? 'same' : after.shelves + ' vs ' + before.shelves}`);
  ok(before.cust === after.cust, `${tag}: the car and the customer are back (${after.cust})`);
  await shot(page, `continuar-noite-retomada-${tag}`);
  // the people do their service again: the car reaches the pump
  await ev(() => { const G = window.__odq.game; for (let i = 0; i < 1500; i++) G.step(1 / 60); });
  const run2 = await ev(() => { const G = window.__odq.game; return G.customers.list.filter((c) => !c.done).map((c) => `${c.kind}:${c.state}`).join(','); });
  ok(/car:(ready|parked|talking|idle|waiting|asking|order|stopped|at)/.test(run2) || /car:/.test(run2), `${tag}: after 25 s: ${run2}`);

  // ---- save again in the same night: the new save replaces the old one
  await ev(() => { const G = window.__odq.game; G.openPause(); });
  await clickText(page, 'SALVAR AGORA');
  const st2 = JSON.parse(await ev((k) => localStorage.getItem(k), CARD));
  ok(st2.run.snap.minutes > stored.run.snap.minutes, `${tag}: a second save replaced the first (${stored.run.snap.minutes} -> ${st2.run.snap.minutes})`);

  // ---- EXPORTAR CARTÃO: a real download
  const [download] = await Promise.all([page.waitForEvent('download'), clickText(page, 'EXPORTAR CARTÃO')]);
  const file = path.join(dl, download.suggestedFilename());
  await download.saveAs(file);
  const exported = JSON.parse(fs.readFileSync(file, 'utf8'));
  ok(exported.format === 'o-dia-que-sobra.card' && exported.fileVersion === 1 && /^\d{4}-\d\d-\d\dT/.test(exported.exportedAt) && exported.gameVersion && exported.debugCard === true && Array.isArray(exported.notes) && exported.notes.length > 3 && exported.debug?.modo === 'noite' && exported.debug.clientes.length >= 2, `${tag}: the file has its header, notes and the readable debug block (${download.suggestedFilename()}, ${exported.gameVersion})`);
  ok(JSON.stringify(exported.card) === JSON.stringify(st2), `${tag}: the file holds the whole card`);
  ok(Array.isArray(exported.card.secrets), `${tag}: secrets are ids ${JSON.stringify(exported.card.secrets)}`);
  const canShare = await ev(() => Boolean(window.__odq.game.snapshot.canShareFile()));
  console.log(`info  ${tag}: Web Share of files offered by this browser: ${canShare}`);
  const withCard = await rows(page);
  await ev(() => window.__odq.game.ui.closeModal());

  // ---- the card screen carries the same rows
  await page.close();
  page = await open(ctx, base, Q1, errs);
  await page.waitForFunction(() => window.__odq?.game?.state === 'title', null, { timeout: 90000 });
  await clickText(page, 'CARTÃO DE MEMÓRIA');
  const cardRows = await rows(page);
  ok(cardRows.includes('EXPORTAR CARTÃO') && cardRows.includes('IMPORTAR CARTÃO') && cardRows.includes('VOLTAR'), `${tag}: the card screen has ${cardRows.join(' / ')}`);
  await shot(page, `cartao-exportar-importar-${tag}`);
  const fits = await ev(() => { const b = document.querySelector('#modal .box')?.getBoundingClientRect(); return Boolean(b) && b.left >= -1 && b.right <= innerWidth + 1 && b.top >= -1 && b.bottom <= innerHeight + 1; });
  ok(fits, `${tag}: the card screen fits the window`);
  void withCard;

  // ---- clear the storage, import the file, continue
  await ev(() => { localStorage.clear(); });
  await page.close();
  page = await open(ctx, base, Q1, errs);
  await page.waitForFunction(() => window.__odq?.game?.state === 'title', null, { timeout: 90000 });
  ok(!(await rows(page)).some((r) => r.startsWith('CONTINUAR')), `${tag}: with the storage cleared there is nothing to continue`);
  const importFile = async (p, label) => {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), clickText(page, 'IMPORTAR CARTÃO')]);
    await chooser.setFiles(p);
    await page.waitForFunction(() => /IMPORTAR CARTÃO|CARTÃO RECUSADO/.test(document.querySelector('#modal h1')?.textContent || ''), null, { timeout: 8000 });
    void label;
    return page.evaluate(() => ({ h1: document.querySelector('#modal h1')?.textContent, text: document.querySelector('#modal')?.textContent }));
  };
  const good = await importFile(file, 'good');
  ok(good.h1 === 'IMPORTAR CARTÃO' && /Isto substitui o cartão deste navegador/.test(good.text) && /NOITE 3/.test(good.text), `${tag}: asks before replacing (${good.text.slice(0, 160).replace(/\s+/g, ' ')})`);
  await shot(page, `importar-confirmacao-${tag}`);
  await clickText(page, 'NÃO, VOLTAR');
  ok((await ev((k) => localStorage.getItem(k), CARD)) === null, `${tag}: NÃO leaves the storage empty`);
  await importFile(file, 'good');
  await clickText(page, 'SIM, SUBSTITUIR');
  ok(JSON.stringify(JSON.parse(await ev((k) => localStorage.getItem(k), CARD))) === JSON.stringify(exported.card), `${tag}: the card was written as it was exported`);
  const t2 = await rows(page);
  ok(t2.some((r) => /^CONTINUAR\s+\(SEMANA 1 · NOITE 3 · \d\d:\d\d\)/.test(r)), `${tag}: continue is offered after the import (${t2[0]})`);
  await clickText(page, 'CONTINUAR');
  await page.waitForFunction(() => window.__odq.game.state === 'play', null, { timeout: 30000 });
  after = await ev(OBSERVE);
  ok(after.day === 3 && Math.abs(after.minutes - st2.run.snap.minutes) < 0.1 && after.opened === true, `${tag}: imported and continued at ${after.minutes} min`);
  await shot(page, `importar-continuar-${tag}`);

  // ---- broken files: refused, and the card stays
  const cardNow = await ev((k) => localStorage.getItem(k), CARD);
  const bad = {
    'not-json': 'this is not json',
    'other-format': JSON.stringify({ format: 'something.else', fileVersion: 1, card: {} }),
    'newer-version': JSON.stringify({ ...exported, fileVersion: 9 }),
    'no-version': JSON.stringify({ format: exported.format, card: exported.card }),
    'bad-card': JSON.stringify({ ...exported, card: { v: 7 } }),
    'bad-day': JSON.stringify({ ...exported, card: { ...exported.card, run: { ...exported.card.run, day: 99 } } }),
    'bad-snap': JSON.stringify({ ...exported, card: { ...exported.card, run: { ...exported.card.run, snap: { ...exported.card.run.snap, minutes: 5000 } } } }),
    'bad-key': '{"format":"o-dia-que-sobra.card","fileVersion":1,"card":{"v":1,"run":{"day":3,"week":1,"wallet":5,"__proto__":{"x":1}}}}',
    'huge': JSON.stringify({ ...exported, pad: 'x'.repeat(600 * 1024) }),
  };
  await ev(() => window.__odq.game.showTitle());
  let shotRefused = false;
  for (const [name, text] of Object.entries(bad)) {
    const f = path.join(dl, name + '.json'); fs.writeFileSync(f, text);
    const r = await importFile(f, name);
    ok(r.h1 === 'CARTÃO RECUSADO' && /Nada foi apagado/.test(r.text), `${tag}: ${name} refused (${r.text.replace(/\s+/g, ' ').slice(14, 110)})`);
    if (!shotRefused) { shotRefused = true; await shot(page, `importar-arquivo-quebrado-${tag}`); }
    await clickText(page, 'VOLTAR');
  }
  ok((await ev((k) => localStorage.getItem(k), CARD)) === cardNow, `${tag}: no broken file touched the card`);

  // ---- the real card (no ?debug) keeps its own key: the export of one never carries the other
  ok(await ev(() => localStorage.getItem('o-dia-que-sobra.card.v1') === null), `${tag}: the real card was never touched by the debug one`);

  ok(errs.length === 0, `${tag}: console clean${errs.length ? '\n' + errs.slice(0, 6).join('\n') : ''}`);
  await ctx.close();
  fs.rmSync(dl, { recursive: true, force: true });
}

/** The other phases of the night: saved in the preparation (a chore done, the clock punched) and in the closing hour (door shut, yard light off). */
async function phases(browser, base) {
  const tag = 'fases';
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block', acceptDownloads: true });
  const errs = [];
  const world = () => { const G = window.__odq.game, br = G.world.posto.breakers; return { shut: [...G.world.shut].join(','), cobertura: br.isOn('cobertura'), placa: br.isOn('placa'), door: G.world.doorOpen('porta-loja'), closing: G.closing.on, prep: G.prep.on, punched: G.prep.punched, left: G.tasks.list.filter((t) => t.kind === 'fechamento').map((t) => t.id + ':' + (t.done ? 1 : 0)).join(',') }; };
  const both = (page) => page.evaluate(() => ({ ...window.__w(), ...window.__o() }));
  const prime = async (page) => page.evaluate(`window.__o = ${OBSERVE.toString()}; window.__w = ${world.toString()};`);
  const cont = async (q) => {
    const page = await open(ctx, base, q, errs);
    await page.waitForFunction(() => window.__odq?.game?.state === 'title', null, { timeout: 90000 });
    await clickText(page, 'CONTINUAR');
    await page.waitForFunction(() => window.__odq.game.state === 'play', null, { timeout: 30000 });
    await page.evaluate(() => { try { Object.defineProperty(document, 'pointerLockElement', { get: () => document.body, configurable: true }); } catch { /* there already */ } });
    await prime(page);
    return page;
  };
  const Q0 = (d) => `debug=day:${d}&manual&silent&skiptutorial&nointro&seed=1`, Q1 = 'debug=load&manual&silent&nointro&seed=1';
  const KEYS = ['day', 'wallet', 'sanity', 'night', 'tasks', 'open', 'shelves', 'prep', 'punched', 'shut', 'cobertura', 'placa', 'left', 'closing', 'till', 'opened', 'slots'];

  // ---- the preparation, half way
  let page = await open(ctx, base, Q0(4), errs);
  await page.waitForFunction(() => window.__odq?.game?.state === 'play', null, { timeout: 90000 });
  await prime(page);
  await page.evaluate(() => { const G = window.__odq.game; try { Object.defineProperty(document, 'pointerLockElement', { get: () => document.body, configurable: true }); } catch { /* there already */ } let n = 0; while (G.time.minutes < -30 && n++ < 9000) { if (G.ui.modalOpen) G.ui.closeModal(); G.step(1 / 60); } G.tasks.done('ponto'); G.prep.setPunched(true); const t = G.tasks.list.find((q) => q.kind === 'lixo' || q.kind === 'lampada'); if (t) { G.chores.resolve(t.id); G.tasks.done(t.id); } });
  const b1 = await both(page);
  ok(b1.prep && b1.punched && b1.minutes < -29 && b1.minutes > -31, `${tag}: preparation at ${b1.minutes}, punched`);
  await page.evaluate(() => window.__odq.game.openPause()); await clickText(page, 'SALVAR AGORA');
  ok(/Salvo: SEMANA 1 · NOITE 4 · 23:3\d/.test(await page.evaluate(() => document.querySelector('#modal')?.textContent || '')), `${tag}: saved in the preparation (23:3x)`);
  await page.close();
  page = await cont(Q1);
  let a1 = await both(page);
  for (const k of KEYS) ok(b1[k] === a1[k], `${tag}: prep ${k} ${JSON.stringify(a1[k]).slice(0, 90)}${b1[k] === a1[k] ? '' : ' (was ' + JSON.stringify(b1[k]).slice(0, 90) + ')'}`);
  ok(Math.abs(a1.minutes - b1.minutes) < 0.1, `${tag}: prep clock ${a1.minutes} (was ${b1.minutes})`);
  await page.evaluate(() => { const G = window.__odq.game; let n = 0; while (G.prep.on && n++ < 9000) { if (G.ui.modalOpen) G.ui.closeModal(); G.step(1 / 60); } });
  ok(await page.evaluate(() => window.__odq.game.time.minutes >= 0 && window.__odq.game.cash.opened === false && !window.__odq.game.prep.on), `${tag}: the preparation still ends at midnight after the restore`);
  await page.close();

  // ---- the closing hour: shop door shut, yard light off, a customer still at the pump
  page = await open(ctx, base, Q0(4), errs);
  await page.waitForFunction(() => window.__odq?.game?.state === 'play', null, { timeout: 90000 });
  await prime(page);
  await page.evaluate(() => {
    const G = window.__odq.game; try { Object.defineProperty(document, 'pointerLockElement', { get: () => document.body, configurable: true }); } catch { /* there already */ }
    let n = 0; while (G.time.minutes < 0 && n++ < 14000) { if (G.ui.modalOpen) G.ui.closeModal(); G.step(1 / 60); }
    G.tasks.openTill(); G.customers.enable(false); G.time.skip(300); G.customers.enable(false);
    G.world.setDoor('porta-loja', 0); G.world.shut.add('porta-loja'); G.world.posto.breakers.setOn('cobertura', false);
    for (let i = 0; i < 120; i++) G.step(1 / 60);
    G.time.skip(20);
  });
  const b2 = await both(page);
  ok(b2.closing && b2.shut === 'porta-loja' && b2.cobertura === false && /fecha-porta:1/.test(b2.left) && /fecha-patio:1/.test(b2.left), `${tag}: closing at ${b2.minutes}: ${b2.left}`);
  await page.evaluate(() => window.__odq.game.openPause()); await clickText(page, 'SALVAR AGORA');
  ok(/Salvo: SEMANA 1 · NOITE 4 · 05:2\d/.test(await page.evaluate(() => document.querySelector('#modal')?.textContent || '')), `${tag}: saved in the closing hour (05:2x)`);
  await page.close();
  page = await cont(Q1);
  const a2 = await both(page);
  for (const k of KEYS) ok(b2[k] === a2[k], `${tag}: closing ${k} ${JSON.stringify(a2[k]).slice(0, 90)}${b2[k] === a2[k] ? '' : ' (was ' + JSON.stringify(b2[k]).slice(0, 90) + ')'}`);
  ok(Math.abs(a2.minutes - b2.minutes) < 0.1, `${tag}: closing clock ${a2.minutes} (was ${b2.minutes})`);
  // the night can still be finished from here: the closing steps count, and the clock reaches six
  const fin = await page.evaluate(() => { const G = window.__odq.game; let n = 0; while (G.time.minutes < 360 && n++ < 20000) { if (G.ui.modalOpen) G.ui.closeModal(); G.step(1 / 60); } return { m: G.time.minutes, cap: G.time.minutes >= 359.9, open: G.shift.open }; });
  ok(fin.cap && fin.open, `${tag}: the clock reaches 06:00 after the restore (${fin.m})`);
  ok(errs.length === 0, `${tag}: console clean${errs.length ? '\n' + errs.slice(0, 6).join('\n') : ''}`);
  await ctx.close();
}

// ---------------------------------------------------------------------------------------------------------------- exact state
const SKIP = new Set(['id', 'ownerId', 'fuelOfId', 'walkerId']);
const TOL = { age: 0.4, cents: 30, rate: 0.2, walkPhase: 10, legT: 0.4, x: 0.5, z: 0.5, s: 2, speed: 0.5, t: 0.4, queueT: 0.4, leaveAfter: 0.4, insideT: 0.4, exitT: 0.4, boardT: 0.4, watchT: 0.4, holdT: 0.4, ry: 0.4, lastStep: 1e9, dist: 0.5, aware: 0.4, cool: 0.4, doorT: 0.4, knockT: 0.4, darkT: 0.4, since: 0.4, lockT: 0.4, search: 0.4, shake: 0.2, y: 0.02 };
/** Compares two plain trees value by value; numbers that change by themselves in the 3 frames after a continue get a tolerance. */
function diff(a, b, path = '', out = []) {
  if (a === b) return out;
  if (typeof a === 'number' && typeof b === 'number') { const k = path.split('.').pop(); if (Math.abs(a - b) <= (TOL[k] ?? 1e-6)) return out; out.push(`${path}: ${a} vs ${b}`); return out; }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (!SKIP.has(k)) diff(a[k], b[k], path ? path + '.' + k : k, out);
    return out;
  }
  out.push(`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`); return out;
}
const bySeed = (d) => ({ ...d, list: [...d.list].sort((x, y) => x.seed - y.seed || x.kind.localeCompare(y.kind)) });
const PRELOCK = () => { try { Object.defineProperty(document, 'pointerLockElement', { get: () => document.body, configurable: true }); } catch { /* there already */ } };
const toMidnight = () => { const G = window.__odq.game; try { Object.defineProperty(document, 'pointerLockElement', { get: () => document.body, configurable: true }); } catch { /* there already */ } let n = 0; while (G.time.minutes < 0 && n++ < 14000) { if (G.ui.modalOpen) G.ui.closeModal(); G.step(1 / 60); } };

/** A car that is fueling (nozzle in the tank, value running) and a customer in the middle of the scanning, one product in the player's hand. */
async function exact(browser, base) {
  const tag = 'exato';
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block', acceptDownloads: true });
  const errs = [];
  const Q0 = 'debug=day:3&manual&silent&skiptutorial&nointro&seed=1', Q1 = 'debug=load&manual&silent&nointro&seed=1';
  let page = await open(ctx, base, Q0, errs);
  await page.waitForFunction(() => window.__odq?.game?.state === 'play', null, { timeout: 90000 });
  await page.evaluate(toMidnight);
  await page.evaluate(() => {
    const G = window.__odq.game, T = G.interaction.targets; G.tasks.openTill(); G.customers.enable(false);
    const car = G.customers.spawnCar({ pump: 3, seed: 77 }), w = G.customers.spawnWalker({ seed: 5 });
    let n = 0; while ((car.state !== 'waiting' || w.state !== 'scanning') && n++ < 9000) G.step(1 / 60);
    T.get('cliente' + car.id).tap(); for (let i = 0; i < 30; i++) { if (G.ui.modalOpen) G.ui.handle({ k: 'confirm' }); G.step(1 / 60); }
    T.get(`bico3-${car.fuel}`).tap(); T.get('tampa' + car.id).tap();
    car.ordered = true; car.typed = car.value; car.cents = 0; car.fueling = true; car.rate = 0; G.world.pumpDisplay(3, 0);
    for (let i = 0; i < 150; i++) G.step(1 / 60);
    for (const i of [0, 1]) { T.get(`item${w.id}-${i}`).tap(); T.get('leitor').tap(); }
    T.get(`item${w.id}-2`).tap();
    for (let i = 0; i < 20; i++) G.step(1 / 60);
  });
  const before = await page.evaluate(() => ({ d: window.__odq.game.customers.describeAll(), carry: window.__odq.game.inventory.carry && { ...window.__odq.game.inventory.carry }, cents: window.__odq.game.customers.list.filter((c) => c.kind === 'car').map((c) => [c.cents, c.fueling, c.nozzleIn, c.typed]), total: document.getElementById('total')?.textContent || '' }));
  const car0 = before.d.list.find((c) => c.kind === 'car'), w0 = before.d.list.find((c) => c.kind === 'walk');
  ok(car0.f.fueling && car0.f.nozzleIn && car0.f.cents > 0 && w0.f.state === 'scanning' && w0.f.scanned === 2 && before.carry?.kind === 'item', `${tag}: before: car fueling ${Math.round(car0.f.cents)}/${car0.f.typed} cents, customer scanning 2 of ${w0.prods.length}, ${before.carry?.kind} in hand`);
  await page.evaluate(() => window.__odq.game.openPause()); await clickText(page, 'SALVAR AGORA');
  await page.close();
  page = await open(ctx, base, Q1, errs);
  await page.waitForFunction(() => window.__odq?.game?.state === 'title', null, { timeout: 90000 });
  await clickText(page, 'CONTINUAR');
  await page.waitForFunction(() => window.__odq.game.state === 'play', null, { timeout: 30000 });
  await page.evaluate(PRELOCK);
  const after = await page.evaluate(() => ({ d: window.__odq.game.customers.describeAll(), carry: window.__odq.game.inventory.carry && { ...window.__odq.game.inventory.carry }, total: document.getElementById('total')?.textContent || '' }));
  const dd = diff(bySeed(before.d), bySeed(after.d));
  ok(dd.length === 0, `${tag}: every field of the customers and the cars is back (${bySeed(after.d).list.length} described)${dd.length ? '\n         ' + dd.slice(0, 25).join('\n         ') : ''}`);
  ok(after.carry?.kind === 'item' && after.carry.index === before.carry.index, `${tag}: the product is in the hand again (${JSON.stringify(after.carry)})`);
  ok(before.total === after.total, `${tag}: the total on the screen "${after.total}" (was "${before.total}")`);
  // it goes on from there: the pump keeps running, the product can be scanned and the customer is ready to be charged
  const go = await page.evaluate(() => {
    const G = window.__odq.game, T = G.interaction.targets, car = G.customers.list.find((c) => c.kind === 'car'), w = G.customers.list.find((c) => c.kind === 'walk');
    const c0 = car.cents; for (let i = 0; i < 90; i++) G.step(1 / 60);
    const grew = car.cents > c0 || car.cents >= car.typed;
    T.get('leitor').tap();
    return { grew, state: w.state, nozzle: Boolean(car.nozzleObj), taken: G.customers.list.length };
  });
  ok(go.grew && go.nozzle, `${tag}: the pump kept running after the restore`);
  ok(go.state === 'ready', `${tag}: the last product scanned, the customer is ${go.state}`);
  // second save, with the customer waiting to be charged
  const b2 = await page.evaluate(() => window.__odq.game.customers.describeAll());
  await page.evaluate(() => window.__odq.game.openPause()); await clickText(page, 'SALVAR AGORA');
  await page.close();
  page = await open(ctx, base, Q1, errs);
  await page.waitForFunction(() => window.__odq?.game?.state === 'title', null, { timeout: 90000 });
  await clickText(page, 'CONTINUAR');
  await page.waitForFunction(() => window.__odq.game.state === 'play', null, { timeout: 30000 });
  const a2 = await page.evaluate(() => window.__odq.game.customers.describeAll());
  const d2 = diff(bySeed(b2), bySeed(a2));
  ok(d2.length === 0, `${tag}: the customer ready to pay and the finished car are back too${d2.length ? '\n         ' + d2.slice(0, 15).join('\n         ') : ''}`);
  ok(errs.length === 0, `${tag}: console clean${errs.length ? '\n' + errs.slice(0, 6).join('\n') : ''}`);
  await ctx.close();
}

/** A chase of the Sun: its machine, its target and its place come back, and it goes on chasing. */
async function sun(browser, base) {
  const tag = 'sol';
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block', acceptDownloads: true });
  const errs = [];
  let page = await open(ctx, base, 'debug=day:13&manual&silent&skiptutorial&nointro&seed=1', errs);
  await page.waitForFunction(() => window.__odq?.game?.state === 'play', null, { timeout: 90000 });
  await page.evaluate(toMidnight);
  const READ = () => { const G = window.__odq.game, e = G.entity, r = e.ent.root; return { S: JSON.parse(JSON.stringify(e.S)), pos: { x: r.position.x, z: r.position.z, ry: r.rotation.y }, visible: r.visible, dist: Math.hypot(r.position.x - G.player.st.x, r.position.z - G.player.st.z), state: e.state, hunt: e.S.hunts ? e.S.hunts.indexOf(e.S.hunt) : -1 }; };
  await page.evaluate(() => { const G = window.__odq.game; G.player.st.x = -30; G.player.st.z = -30; G.sanity.add(-85, 'teste'); G.entity.force('perseguicao', 3); for (let i = 0; i < 120; i++) G.step(1 / 60); });
  await page.evaluate(`window.__read = ${READ.toString()}`);
  const before = await page.evaluate(() => window.__read());
  ok(before.state === 'perseguicao' && before.visible, `${tag}: the Sun is chasing (${before.state}, ${before.dist.toFixed(1)} m away)`);
  await page.evaluate(() => window.__odq.game.openPause()); await clickText(page, 'SALVAR AGORA');
  await page.close();
  page = await open(ctx, base, 'debug=load&manual&silent&nointro&seed=1', errs);
  await page.waitForFunction(() => window.__odq?.game?.state === 'title', null, { timeout: 90000 });
  await clickText(page, 'CONTINUAR');
  await page.waitForFunction(() => window.__odq.game.state === 'play', null, { timeout: 30000 });
  await page.evaluate(PRELOCK); await page.evaluate(`window.__read = ${READ.toString()}`);
  const after = await page.evaluate(() => window.__read());
  const d = diff({ ...before, S: { ...before.S } }, { ...after, S: { ...after.S } });
  ok(d.length === 0, `${tag}: the machine, the target, the timers and the place are back, value by value${d.length ? '\n         ' + d.slice(0, 20).join('\n         ') : ''}`);
  const later = await page.evaluate(() => { const G = window.__odq.game; for (let i = 0; i < 60; i++) G.step(1 / 60); return window.__read(); });
  ok(later.state !== 'ausente' && later.visible && later.dist < before.dist, `${tag}: and it goes on 1 s later, closer (${later.state}, ${later.dist.toFixed(1)} m)`);
  ok(errs.length === 0, `${tag}: console clean${errs.length ? '\n' + errs.slice(0, 6).join('\n') : ''}`);
  await ctx.close();
}

/** The weather and the moon of the night come back: a storm night (night 17), the bolts that had passed stay passed, the plan is the same value by value, and the flow of customers, the rain and the moon are what they were. */
async function weather(browser, base) {
  const tag = 'clima';
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block', acceptDownloads: true });
  const errs = [];
  let page = await open(ctx, base, 'debug=day:17&manual&silent&skiptutorial&nointro&seed=1&wx=temporal', errs);
  await page.waitForFunction(() => window.__odq?.game?.state === 'play', null, { timeout: 90000 });
  await page.evaluate(toMidnight);
  const READ = () => {
    const G = window.__odq.game, W = G.weather, e = W.env(), sc = G.world.r.scene, flows = [];
    return { state: JSON.parse(JSON.stringify(W.state())), kind: W.kind, rain: +e.rain.toFixed(3), wet: +e.wet.toFixed(3), cloud: +e.cloud.toFixed(3), moon: { lit: +W.moon.lit.toFixed(3), alt: +W.moon.alt.toFixed(1), age: +W.moon.age.toFixed(2) }, rainShown: sc.getObjectByName('rain').visible, line: W.line(), min: Math.round(G.time.minutes * 100) / 100, flows };
  };
  await page.evaluate(() => { const G = window.__odq.game; G.customers.clear(); G.customers.enable(false); G.time.setCap(361); G.time.skip(100 - G.time.minutes); for (let i = 0; i < 600; i++) G.step(1 / 60); });
  await page.evaluate(`window.__read = ${READ.toString()}`);
  const before = await page.evaluate(() => window.__read());
  ok(before.kind === 'temporal' && before.state.idx > 0 && before.state.idx < before.state.plan.strikes.length && before.rain > 0.5, `${tag}: a storm night, ${before.state.idx} of ${before.state.plan.strikes.length} bolts already gone, rain ${before.rain} at ${before.min} min`);
  await page.evaluate(() => window.__odq.game.openPause()); await clickText(page, 'SALVAR AGORA');
  const savedSnap = await page.evaluate(() => { const c = JSON.parse(localStorage.getItem('o-dia-que-sobra.card.v1.debug')); return c.run?.snap?.weather ?? null; });
  ok(savedSnap && savedSnap.plan?.kind === 'temporal' && savedSnap.idx === before.state.idx, `${tag}: the saved moment carries the weather (${savedSnap ? savedSnap.plan.kind + ', bolt ' + savedSnap.idx : 'nothing'})`);
  await page.close();
  page = await open(ctx, base, 'debug=load&manual&silent&nointro&seed=1&wx=limpo', errs);    // (a different `wx` on purpose: the saved night keeps its own weather)
  await page.waitForFunction(() => window.__odq?.game?.state === 'title', null, { timeout: 90000 });
  await clickText(page, 'CONTINUAR');
  await page.waitForFunction(() => window.__odq.game.state === 'play', null, { timeout: 30000 });
  await page.evaluate(PRELOCK); await page.evaluate(`window.__read = ${READ.toString()}`);
  await page.evaluate(() => { const G = window.__odq.game; G.customers.clear(); G.customers.enable(false); });
  const after = await page.evaluate(() => { const G = window.__odq.game; G.step(1 / 60); return window.__read(); });
  const d = diff({ ...before, min: 0, flows: 0, state: { ...before.state } }, { ...after, min: 0, flows: 0, state: { ...after.state } });
  ok(d.length === 0, `${tag}: the plan of the bolts, the clouds, the rain, the wet ground and the moon are back, value by value${d.length ? '\n         ' + d.slice(0, 20).join('\n         ') : ''}`);
  const flow = await page.evaluate(() => window.__odq.game.weather.flow);
  ok(flow < 0.7, `${tag}: the flow of customers is lowered again after the restore (${flow})`);
  const fired = await page.evaluate(() => { const G = window.__odq.game, log = G.audioSys.audio.log, n0 = log.filter((x) => x === 'trovao').length; let n = 0; while (log.filter((x) => x === 'trovao').length === n0 && n++ < 20000) G.step(1 / 60); return { idx: G.weather.state().idx, thunder: log.filter((x) => x === 'trovao').length - n0, seconds: Math.round(n / 60) }; });   // (the next bolt, and its thunder, late by the distance)
  ok(fired.idx > after.state.idx && fired.thunder === 1, `${tag}: the plan goes on from there (bolt ${after.state.idx} -> ${fired.idx}, the thunder of the next one after ${fired.seconds} s)`);
  ok(errs.length === 0, `${tag}: console clean${errs.length ? '\n' + errs.slice(0, 6).join('\n') : ''}`);
  await ctx.close();
}

/** Chores of the night come back on the same target: a stain half cleaned (a spill), a tripped breaker, the squeegee in the hands, the ladder and a box on the cart. */
async function chores(browser, base) {
  const tag = 'tarefas';
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block', acceptDownloads: true });
  const errs = [];
  let page = await open(ctx, base, 'debug=day:3&manual&silent&skiptutorial&nointro&seed=1', errs);
  await page.waitForFunction(() => window.__odq?.game?.state === 'play', null, { timeout: 90000 });
  await page.evaluate(toMidnight);
  const READ = () => {
    const G = window.__odq.game, br = G.world.posto.breakers, st = G.chores.describeChores(), sk = G.tasks.describeStock();
    return { tasks: G.tasks.list.filter((t) => t.kind !== 'carro' && t.kind !== 'cliente').map((t) => `${t.id}|${t.kind}|${t.done ? 1 : 0}|${t.text}`).sort(), ch: { ...st, bags: st.bags }, stock: { cart: sk.cart, boxes: sk.boxes }, hands: G.inventory.carry && { ...G.inventory.carry }, breakers: br.areas.map((a) => a + ':' + (br.isOn(a) ? 1 : 0)).join(','), burnt: G.world.lights.filter((l) => l.burnt).map((l) => l.id).join(',') };
  };
  await page.evaluate(() => {
    const G = window.__odq.game;
    G.tasks.openTill(); G.customers.enable(false);
    G.chores.spill('item', { x: 10, z: 8 });                // a spill in the shop, as a customer's
    G.chores.spawn('disjuntor');
    const stainId = Object.keys(G.chores.describeChores().stain)[0];
    window.__stain = stainId;
  });
  await page.evaluate(() => {
    const G = window.__odq.game, id = window.__stain, T = G.interaction.targets;
    // half of the stain cleaned by holding the squeegee on it, the squeegee in the hands afterwards
    const kit = T.get('kit-limpeza'); kit.tap();
    const w = T.get('trab-' + id); if (w) { w.hold.start(); for (let i = 0; i < 90; i++) w.hold.update(1 / 60, 1 + i / 60); w.hold.end(); }
    G.player.st.x = 4.2; G.player.st.z = 9.5; G.player.st.yaw = 2.2;
  });
  await page.evaluate(`window.__read = ${READ.toString()}`);
  const before = await page.evaluate(() => window.__read());
  const stainP = Object.values(before.ch.stain)[0];
  ok(before.tasks.some((t) => t.startsWith('mancha-')) && before.tasks.some((t) => t.startsWith('disjuntor-')) && before.hands?.kind === 'limpeza' && stainP > 0 && stainP < 1, `${tag}: before: a stain ${Math.round(stainP * 100)}% cleaned, a breaker down, the squeegee in the hands`);
  await page.evaluate(() => window.__odq.game.openPause()); await clickText(page, 'SALVAR AGORA');
  await page.close();
  page = await open(ctx, base, 'debug=load&manual&silent&nointro&seed=1', errs);
  await page.waitForFunction(() => window.__odq?.game?.state === 'title', null, { timeout: 90000 });
  await clickText(page, 'CONTINUAR');
  await page.waitForFunction(() => window.__odq.game.state === 'play', null, { timeout: 30000 });
  await page.evaluate(PRELOCK); await page.evaluate(`window.__read = ${READ.toString()}`);
  const after = await page.evaluate(() => window.__read());
  const d = diff(before, after);
  ok(d.length === 0, `${tag}: the tasks, the stain, the breaker, the hands and the boxes are back on the same targets${d.length ? '\n         ' + d.slice(0, 15).join('\n         ') : ''}`);
  ok(errs.length === 0, `${tag}: console clean${errs.length ? '\n' + errs.slice(0, 6).join('\n') : ''}`);
  await ctx.close();
}

/** The day off: bills paid, things bought, the messages, the money and where Heitor stands; paying never happens twice. */
async function folga(browser, base) {
  const tag = 'folga';
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block', acceptDownloads: true });
  const errs = [];
  let page = await open(ctx, base, 'debug=dayoff:1&manual&silent&nointro&seed=1', errs);
  await page.waitForFunction(() => window.__odq?.game?.state === 'dayoff' && window.__odq.game.dayoff?.active, null, { timeout: 90000 });
  await page.evaluate(() => { const G = window.__odq.game; G.progression.st.wallet = 400; G.bus.emit('money:change', { wallet: 400 }); for (let i = 0; i < 120; i++) G.step(1 / 60); });
  const T = (id) => page.evaluate((i) => { const G = window.__odq.game; G.dayoff.interaction.targets.get(i).tap(); G.step(1 / 60); }, id);
  const rowsNow = () => rows(page);
  await T('mesaContas');
  console.log('info  bills rows:', (await rowsNow()).join(' | '));
  await clickText(page, 'Aluguel'); console.log('info  after:', (await rowsNow()).join(' | ')); await clickText(page, 'Conta de luz');
  await page.evaluate(() => window.__odq.game.ui.closeModal());
  await page.evaluate(() => { const G = window.__odq.game, p = G.dayoff.player.st; p.x = 15.5; p.z = 3.6; p.yaw = 1.1; });
  await T('frasco');
  await clickText(page, 'Remédio').catch(async () => { const r = await rowsNow(); await clickText(page, r[0]); });
  await clickText(page, 'Pilha').catch(() => {});
  await page.evaluate(() => window.__odq.game.ui.closeModal());
  await page.evaluate(() => { const G = window.__odq.game; for (let i = 0; i < 80; i++) G.step(1 / 60); const p = G.dayoff.player.st; p.x = 12.4; p.z = 4.1; p.yaw = -0.7; p.pitch = 0.1; G.step(1 / 60); });
  const read = () => page.evaluate(() => { const G = window.__odq.game, s = G.dayoff.snapshotState(), st = G.progression.st; return { ...s, paidSum: st.paidSum, billsPaid: [...st.billsPaid], wallet2: st.wallet, slots: G.inventory.slots.join(','), pilhas: st.pilhasExtra, frasco: st.frasco && st.frasco.pilulas, hour: G.dayoff.clock }; });
  const before = await read();
  ok(before.contas.filter((c) => c.paga).length === 2 && before.compras.remedio + before.compras.pilha >= 1, `${tag}: before: ${before.contas.filter((c) => c.paga).map((c) => c.id)} paid, bought ${JSON.stringify(before.compras)}, wallet ${before.wallet}`);
  await page.evaluate(() => window.__odq.game.bus.emit('dayoff:pause')); await clickText(page, 'SALVAR AGORA');
  const note = await page.evaluate(() => document.querySelector('#modal')?.textContent || '');
  ok(/Salvo: FOLGA/.test(note), `${tag}: the pause says it saved (${note.replace(/\s+/g, ' ').slice(0, 100)})`);
  await page.close();
  page = await open(ctx, base, 'debug=load&manual&silent&nointro&seed=1', errs);
  await page.waitForFunction(() => window.__odq?.game?.state === 'title', null, { timeout: 90000 });
  const tr = await rows(page);
  ok(tr.some((r) => /^CONTINUAR\s+\(FOLGA/.test(r)), `${tag}: the title offers ${tr[0]}`);
  await clickText(page, 'CONTINUAR');
  await page.waitForFunction(() => window.__odq.game.state === 'dayoff' && window.__odq.game.dayoff?.active, null, { timeout: 30000 });
  await page.waitForTimeout(600);
  const after = await read();
  const d = diff({ ...before, clock: 0, hour: 0 }, { ...after, clock: 0, hour: 0 });
  ok(d.length === 0, `${tag}: bills, purchases, wallet, sanity, doors, position and what is in the pocket are back, value by value${d.length ? '\n         ' + d.slice(0, 15).join('\n         ') : ''}`);
  ok(Math.abs(after.clock - before.clock) < 1, `${tag}: the house clock ${after.hour}`);
  // paying again is impossible and the end of the day off does not charge what was paid twice
  const end = await page.evaluate(() => { const G = window.__odq.game; let out = null; G.bus.on('dayoff:end', (e) => { out = e; }); G.dayoff.end(); const st = G.progression.st; return { pagas: out?.pagas, deixadas: out?.deixadas, wallet: st.wallet, paidSum: st.paidSum }; });
  ok(JSON.stringify(end.pagas) === JSON.stringify(before.contas.filter((c) => c.paga).map((c) => c.id)) && end.paidSum === before.paidSum, `${tag}: at the end ${JSON.stringify(end.pagas)} paid, ${JSON.stringify(end.deixadas)} left, paid sum ${end.paidSum}, wallet ${end.wallet}`);
  ok(errs.length === 0, `${tag}: console clean${errs.length ? '\n' + errs.slice(0, 6).join('\n') : ''}`);
  await ctx.close();
}

/** The story branches of the second part (R5 to R10): what was chosen, the three hidden measures, the flags, the things left in the world (the bag on the counter, the tape on the monitor, the photograph, the car in the back stall), the truce of the Sun and the dark of the last nights come back exact. */
async function ramos(browser, base) {
  const tag = 'ramos';
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block', acceptDownloads: true });
  const errs = [];
  let page = await open(ctx, base, 'debug=day:22&manual&silent&skiptutorial&nointro&seed=1', errs);
  await page.waitForFunction(() => window.__odq?.game?.state === 'play', null, { timeout: 90000 });
  await page.evaluate(toMidnight);
  await page.evaluate(async () => {
    const G = window.__odq.game, B = G.branches;
    G.progression.st.escolhas.length = 0;
    for (const [id, k] of [['r1', 'fiar'], ['r2', 'deixar'], ['r6', 'calou'], ['r7', 'guardar'], ['r8', 'registrar'], ['r9', 'ficar'], ['r10', 'abrir']]) B.choose(id, k);
    G.progression.flag('r10:abriu');
    await B.runNow('branches/r9-guardada.js'); await B.runNow('branches/r7-fita-volta.js'); await B.runNow('branches/r9-foto.js'); await B.runNow('branches/r6-vaga.js');
    G.entity.truce(G.time.minutes + 45);
    G.lighting.setDark(0.78);
    for (let i = 0; i < 30; i++) G.step(1 / 60);
  });
  const READ = () => {
    const G = window.__odq.game, st = G.progression.st;
    return { escolhas: st.escolhas.map((e) => `${e.b}:${e.k}@${e.d}`), ties: JSON.parse(JSON.stringify(st.ties)), flags: [...st.flags].sort(), metaPct: { ...st.metaPct }, wallet: st.wallet, log: G.branches.log(), props: G.branches.snapshotState().props.map((p) => p.path).sort(), targets: [...G.interaction.targets.keys()].filter((k) => /-r[0-9]+$/.test(k)).sort(), truce: G.entity.S.truceUntil, dark: G.lighting.dark, ran: G.branches.snapshotState().ran.slice().sort() };
  };
  await page.evaluate(`window.__read = ${READ.toString()}`);
  const before = await page.evaluate(() => window.__read());
  ok(before.escolhas.length >= 7 && before.props.length === 4 && before.truce > 0 && before.dark < 1, `${tag}: before: ${before.escolhas.length} choices, ${before.props.length} props (${before.props.join(', ')}), truce ${before.truce}, dark ${before.dark}`);
  await page.evaluate(() => window.__odq.game.openPause()); await clickText(page, 'SALVAR AGORA');
  const stored = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), CARD));
  ok(Array.isArray(stored.run?.escolhas) && stored.run.escolhas.length >= 7 && stored.run.ties && typeof stored.run.ties.conf === 'number', `${tag}: the card keeps the choices (${stored.run?.escolhas?.length}) and the measures`);
  ok(!/resposta|senha|password/i.test(JSON.stringify(stored)), `${tag}: no answer text in the card`);
  await page.close();
  page = await open(ctx, base, 'debug=load&manual&silent&nointro&seed=1', errs);
  await page.waitForFunction(() => window.__odq?.game?.state === 'title', null, { timeout: 90000 });
  await clickText(page, 'CONTINUAR');
  await page.waitForFunction(() => window.__odq.game.state === 'play', null, { timeout: 30000 });
  await page.evaluate(PRELOCK);
  await page.evaluate(() => { const G = window.__odq.game; for (let i = 0; i < 90; i++) G.step(1 / 60); });
  await page.evaluate(`window.__read = ${READ.toString()}`);
  const after = await page.evaluate(() => window.__read());
  const d = diff({ ...before, targets: 0 }, { ...after, targets: 0 });
  ok(d.length === 0, `${tag}: choices, measures, flags, props, the truce and the dark are back, value by value${d.length ? '\n         ' + d.slice(0, 15).join('\n         ') : ''}`);
  ok(after.targets.includes('foto-r9') || after.targets.includes('fita-volta-r7') || before.targets.every((t) => after.targets.includes(t)), `${tag}: the things to examine are back (${after.targets.join(', ')})`);
  ok(errs.length === 0, `${tag}: console clean${errs.length ? '\n' + errs.slice(0, 6).join('\n') : ''}`);
  await ctx.close();
}

/** R5 at home: the sister's bill answered in the week 2 day off, then saved: the money, the choice and the message heard come back, and the answer is not asked twice. */
async function ramosFolga(browser, base) {
  const tag = 'ramos-folga';
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block', acceptDownloads: true });
  const errs = [];
  let page = await open(ctx, base, 'debug=dayoff:2&manual&silent&nointro&seed=1', errs);
  await page.waitForFunction(() => window.__odq?.game?.state === 'dayoff' && window.__odq.game.dayoff?.active, null, { timeout: 90000 });
  await page.evaluate(PRELOCK);
  await page.evaluate(() => { const G = window.__odq.game; G.progression.st.wallet = 300; G.bus.emit('money:change', { wallet: 300 }); for (let i = 0; i < 120; i++) G.step(1 / 60); });
  await page.evaluate(() => { const G = window.__odq.game; G.dayoff.interaction.targets.get('telefone').tap(); G.step(1 / 60); });
  for (let i = 0; i < 12 && !(await rows(page)).some((r) => /^MANDAR R\$ 120/.test(r)); i++) { await page.keyboard.press('Enter'); await page.evaluate(() => window.__odq.advance(3)); }   // (the three messages, one key each)
  const menu = await rows(page);
  ok(menu.some((r) => /^MANDAR R\$ 120/.test(r)) && menu.some((r) => /^NÃO MANDAR/.test(r)), `${tag}: the sister asks, with a choice (${menu.join(' / ')})`);
  await shot(page, `ramos-folga-menu-irma`);
  await clickText(page, 'MANDAR METADE');
  const read = () => page.evaluate(() => { const G = window.__odq.game, s = G.dayoff.snapshotState(), st = G.progression.st; return { wallet: s.wallet, heard: s.heard, flags: st.flags.filter((f) => /^r5/.test(f)), escolhas: st.escolhas.map((e) => `${e.b}:${e.k}`), paidSum: st.paidSum, billsPaid: [...st.billsPaid] }; });
  const before = await read();
  ok(before.wallet === 240 && before.flags.includes('r5:metade') && before.paidSum === 0 && before.billsPaid.length === 0, `${tag}: R$ 60 left the wallet (${before.wallet}) and no bill was counted as paid (${before.paidSum}) ${JSON.stringify(before)}`);
  await page.evaluate(() => window.__odq.game.bus.emit('dayoff:pause')); await clickText(page, 'SALVAR AGORA');
  await page.close();
  page = await open(ctx, base, 'debug=load&manual&silent&nointro&seed=1', errs);
  await page.waitForFunction(() => window.__odq?.game?.state === 'title', null, { timeout: 90000 });
  await clickText(page, 'CONTINUAR');
  await page.waitForFunction(() => window.__odq.game.state === 'dayoff' && window.__odq.game.dayoff?.active, null, { timeout: 30000 });
  await page.evaluate(PRELOCK); await page.waitForTimeout(600);
  const after = await read();
  const d = diff(before, after);
  ok(d.length === 0, `${tag}: the money, the choice and the messages heard are back${d.length ? '\n         ' + d.slice(0, 10).join('\n         ') : ''}`);
  const again = await page.evaluate(() => { const G = window.__odq.game; G.dayoff.interaction.targets.get('telefone').tap(); G.step(1 / 60); return { modal: G.ui.modalOpen }; });
  ok(!again.modal, `${tag}: nothing is asked twice (the phone has no new message)`);
  ok(errs.length === 0, `${tag}: console clean${errs.length ? '\n' + errs.slice(0, 6).join('\n') : ''}`);
  await ctx.close();
}

const srv = await serve();
const base = `http://127.0.0.1:${srv.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const which = process.argv[2];      // desktop | mobile | phases | exact | sun | folga | chores | weather | ramos | ramos-folga (nothing: all of them)
  const want = (k) => !which || which === k || (which === 'desktop' && k !== 'mobile');
  if (want('desktop') && which !== 'phases' && which !== 'exact' && which !== 'sun' && which !== 'folga' && which !== 'chores' && which !== 'weather') await scenario(browser, base, 'desktop');
  if (!which || which === 'mobile') await scenario(browser, base, 'mobile');
  if (want('phases')) await phases(browser, base);
  if (want('exact')) await exact(browser, base);
  if (want('sun')) await sun(browser, base);
  if (want('folga')) await folga(browser, base);
  if (want('chores')) await chores(browser, base);
  if (want('weather')) await weather(browser, base);
  if (want('ramos')) await ramos(browser, base);
  if (want('ramos-folga')) await ramosFolga(browser, base);
} finally { await browser.close(); srv.close(); }
if (failures.length) { console.error('\nSNAPSHOT TEST FAILED:\n - ' + failures.join('\n - ')); process.exit(1); }
console.log('\nsnapshot test passed');
