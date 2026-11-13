// Plays the day off end to end in the preview page and takes screenshots:
//   PLAYWRIGHT_CORE=<path to playwright-core> OUT_DIR=<folder> node tools/dayoff-play.mjs <port> <week> [desktop|mobile]
const { PLAYWRIGHT_CORE, OUT_DIR } = process.env;
if (!PLAYWRIGHT_CORE || !OUT_DIR) throw new Error('set PLAYWRIGHT_CORE and OUT_DIR');
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)(PLAYWRIGHT_CORE);
const [port, week = '1', kind = 'desktop'] = process.argv.slice(2);
const mobile = kind === 'mobile', out = OUT_DIR.replace(/\/?$/, '/');
const tag = `s${week}${mobile ? '-celular' : ''}`;
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1920, height: 1080 }, hasTouch: mobile, isMobile: mobile });
const errs = []; page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); }); page.on('pageerror', (e) => errs.push('pageerror: ' + e));
await page.goto(`http://127.0.0.1:${port}/o-dia-que-sobra/tools/dayoff-preview.html?manual&silent&week=${week}&wallet=${process.env.WALLET || 60}${mobile ? '&touch' : ''}`);
await page.waitForFunction(() => window.__d, null, { timeout: 30000 });
const adv = (n) => page.evaluate((n) => window.__d.advance(n), n);
const shot = async (name) => { await adv(2); await page.screenshot({ path: `${out}f5-folga-${name}-${tag}.png` }); };
const info = (extra = '') => page.evaluate((x) => { const d = window.__d; const s = d.dayoff.state; return JSON.stringify({ wallet: s.wallet, contas: s.contas.map((c) => c.paga), recados: s.recados, compras: s.compras, bag: d.eco.bag, prompt: document.querySelector('#prompt')?.hidden === false ? document.querySelector('#prompt span').textContent : null, obj: document.querySelector('#objective').textContent, modal: d.ui.modalOpen, x }); }, extra);
// puts Heitor at an anchor, looking at a point of the house
const face = (anchor, point, dy = 0) => page.evaluate(([a, p, dy]) => {
  const { casa, player } = window.__d.dayoff; const A = casa.anchors[a].pos, P = casa.points[p];
  player.st.x = A[0]; player.st.z = A[2]; const dx = P[0] - A[0], dz = P[2] - A[2];
  player.st.yaw = Math.atan2(-dx, -dz); player.st.pitch = Math.atan2(P[1] + dy - 1.65, Math.hypot(dx, dz));
}, [anchor, point, dy]);
const tap = async (key = 'KeyE') => { await page.keyboard.down(key); await adv(2); await page.keyboard.up(key); await adv(2); };
// desktop: E; phone: a finger tap on the centre of the screen (the object under the finger is the target)
const tapAct = async () => { if (!mobile) return tap(); const v = page.viewportSize(); await page.touchscreen.tap(v.width / 2, v.height / 2); await adv(4); };
// choose the i-th item of the open menu: keys on desktop, a tap on the cell on the phone
const sel = async (i) => { if (mobile) await tapEl('#modal [data-cell]', i); else { const cur = await page.evaluate(() => [...document.querySelectorAll('#modal [data-cell]')].findIndex((c) => c.classList.contains('sel'))); for (let k = cur; k < i; k++) await press('ArrowDown'); for (let k = cur; k > i; k--) await press('ArrowUp'); await press('Enter'); } };
const tapEl = async (css, i = 0) => { const bx = await page.evaluate(([c, i]) => { const r = document.querySelectorAll(c)[i].getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, [css, i]); await page.touchscreen.tap(bx[0], bx[1]); await adv(3); };
const next = async () => { if (!(await page.evaluate(() => window.__d.ui.modalOpen))) return; if (mobile) await tapEl('#dlg .box'); else await press('Enter'); };
const press = async (k) => { await page.keyboard.press(k); await adv(3); };
const ok = (c, m) => console.log((c ? 'ok   ' : 'FAIL ') + m);

await adv(60); await shot('inicio');
console.log(await info('start'));
await adv(300); await shot('dica-controles');

// the rod
await face('vara', 'vara'); await adv(5); await shot('vara-mira');
await tapAct(); await adv(40); await shot('vara-pensamento');
// the fridge
await face('geladeira', 'adesivoGeladeira'); await adv(5);
await tapAct(); await adv(40); await shot('geladeira');
// the answering machine
await face('telefone', 'telefone'); await adv(5); await shot('telefone-mira');
const before = JSON.parse(await info());
await tapAct(); await adv(10);
let n = 0; while (await page.evaluate(() => window.__d.ui.modalOpen) && n++ < 8) { await adv(30); await next(); await adv(3); await shot(`recado-${n}-texto`); await next(); await adv(5); }
const afterPhone = JSON.parse(await info());
ok(before.recados > 0 && afterPhone.recados === 0 && !afterPhone.modal, `recados ${before.recados} -> ${afterPhone.recados}`);
console.log('events', JSON.stringify(await page.evaluate(() => window.__d.log.filter((l) => l[0] === 'dayoff:event'))));
// the bills
await face('mesaContas', 'mesaContas'); await adv(5);
await tapAct(); await adv(10); await shot('contas-menu');
await sel(0); await sel(1); await shot('contas-pagas');
await sel(2); await adv(5); await shot('contas-recusa');
let st = JSON.parse(await info());
ok(st.contas[0] && st.contas[1] && (week === '3' ? st.contas[2] : !st.contas[2]), `wallet ${st.wallet} pagas ${st.contas} (a third one is refused when the wallet is short)`);
await sel(3); await adv(5);
ok(!(JSON.parse(await info()).modal), 'bills menu closed with Esc/back');
// out of the house, really walking: the front door is 8.2, 5.5
await page.evaluate(() => { const p = window.__d.dayoff.player; p.st.x = 8.2; p.st.z = 3.8; p.st.yaw = Math.PI; p.st.pitch = 0; });
if (mobile) { await page.evaluate(() => { window.__d.input.touch.mx = 0; }); }
await page.keyboard.down('KeyW'); await adv(150); await page.keyboard.up('KeyW');
const z1 = await page.evaluate(() => window.__d.dayoff.player.st.z);
ok(z1 > 6.2, `walked out the front door, z=${z1.toFixed(2)}`);
await page.evaluate(() => { const p = window.__d.dayoff.player; p.st.yaw = -Math.PI / 2 - 0.15; p.st.pitch = 0.03; }); await shot('rua');
// pharmacy door
await page.evaluate(() => { const p = window.__d.dayoff.player; p.st.x = 16.5; p.st.z = 8.2; p.st.yaw = 0; p.st.pitch = 0; });
await page.keyboard.down('KeyW'); await adv(120); await page.keyboard.up('KeyW');
const z2 = await page.evaluate(() => window.__d.dayoff.player.st.z);
ok(z2 < 4.8, `walked into the pharmacy, z=${z2.toFixed(2)}`); await shot('farmacia-entrada');
// the counter
await face('farmaciaBalcao', 'frasco'); await adv(5); await shot('frasco-mira');
await tapAct(); await adv(10); await shot('farmacia-menu');
await sel(0);                                           // remedio 22
await sel(1); await shot('farmacia-compras');          // pilha 9
st = JSON.parse(await info());
console.log(JSON.stringify(st));
// run the wallet dry: pilha until refused
for (let i = 0; i < 4; i++) await sel(1);
await shot('farmacia-recusa');
st = JSON.parse(await info());
ok(week === '3' ? st.bag.includes('remedio') && st.bag.includes('pilha') : !st.bag.includes('remedio') && st.bag.length === 2 && st.wallet === 0, `bag ${st.bag} wallet ${st.wallet}`);
await sel(2);
// back home and to bed
await page.evaluate(() => { const p = window.__d.dayoff.player; p.st.x = 8.2; p.st.z = 6.6; });
await adv(5);
await face('cama', 'cama'); await adv(5); await shot('cama-mira');
await tapAct(); await adv(10); await shot('cama-menu');
await sel(0);
await adv(100); await shot('dormindo');
await adv(160);
const end = await page.evaluate(() => window.__d.ended);
console.log('END', JSON.stringify(end));
ok(end && end.sanidade === 50 + 40 - (week === '3' ? 6 : 0), 'dayoff:end sanity');
ok(await page.evaluate(() => window.__d.dayoff.scene.parent === null && !window.__d.dayoff.active), 'scene restored');
console.log(errs.length ? 'ERRORS ' + JSON.stringify(errs.slice(0, 8)) : 'console clean');
await browser.close();
