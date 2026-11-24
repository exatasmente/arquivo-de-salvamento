// Pictures and videos of the chase through the building, for a review (they are written outside the repository).
//   PLAYWRIGHT_CORE=<folder of playwright-core> node tools/fuga/capture.mjs --out <folder> [--panels] [--film] [--miss <beat>] [--gpu] [--fps 30] [--size 1280x720]
// --panels   one picture per panel of the storyboard (`fuga-NN-<beat>.png`, NN the panel), from the game, with the command of the panel in the scenery
// --film     the whole chase from the film mode (`?film`: the view fuga.inteira, no HUD), as `fuga-corrida.mp4`
// --miss dentro [--direct]   the trap of the flat: he gets into the cupboard, the dog finds him, FIM DE JOGO, back to the saved point (--direct begins inside the beat)
// --miss b   the game itself: the command of beat `b` left alone, the attack, the game over and the way back to the saved point, as `fuga-erro.mp4`
// --gpu      draw with the machine's graphics card (ANGLE over GL) instead of the software renderer: much faster, when there is one
// Every frame is a step of the game's (or the film's) own clock, never the wall clock: the video plays at the speed of the game.
import http from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { BEATS, BEAT, CHECKPOINTS } from '../../src/systems/fuga.js';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname), CORE = process.env.PLAYWRIGHT_CORE;
if (!CORE) { console.error('set PLAYWRIGHT_CORE to the folder of playwright-core'); process.exit(2); }
const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? d : process.argv[i + 1] ?? true; }, has = (n) => process.argv.includes(`--${n}`);
const OUT = path.resolve(arg('out', '.')), FPS = Number(arg('fps', 30)), [W, H] = String(arg('size', '1280x720')).split('x').map(Number);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg' };
const { chromium } = createRequire(import.meta.url)(CORE);
const srv = http.createServer((req, res) => {
  let p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0])); if (p.endsWith('/')) p += 'index.html';
  if (!p.startsWith(ROOT) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] ?? 'application/octet-stream' }); res.end(readFileSync(p));
});
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
const url = `http://127.0.0.1:${srv.address().port}/index.html`;
const gl = has('gpu') ? ['--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist', '--enable-gpu'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', args: ['--mute-audio', '--no-sandbox', ...gl] });
const errors = [];
const newPage = async () => { const page = await browser.newPage({ viewport: { width: W, height: H } }); page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => m.type() === 'error' && errors.push(m.text())); return page; };
const frame = (page) => page.evaluate(() => new Promise((ok) => { window.__game.test.render(); requestAnimationFrame(() => requestAnimationFrame(ok)); }));
const view = (page) => page.evaluate(() => { const S = window.__game.st.seq; if (!S) return null; const v = S.sq.view(); return { fuga: S.kind === 'fuga', kind: v.kind, id: v.id, gap: v.gap, el: v.el, want: v.want, aim: v.aim, zone: v.zone, beat: S.pose?.beat, fail: S.rec.failAt ?? null, over: Boolean(S.over), dead: S.dead, from: S.from, t: S.t }; });
async function game(page, beat) {
  await page.goto(`${url}?cena=n1-saida&sair=agora&semente=7&fuga=${beat}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__game?.st.seq?.kind === 'fuga' && window.__game.st.world, null, { timeout: 180000 });
  await page.evaluate((dt) => { const G = window.__game; G.test.manual(true); G.st.frameDt = dt; G.st.fadeIn = 0; }, 1 / FPS);
}
/** One frame of the game's clock with the keys the command asks for (`miss`: the beat whose command is left alone; `soft`: it is still held, or aimed, only never ended). */
function player(page, miss = null, soft = false, way = 'pano') {
  let held = false, axis = false, n = 0;
  return async () => {
    const v = await view(page); if (!v?.fuga) return v;
    const live = !v.gap && v.fail == null, on = live && v.id !== miss, wantHold = live && v.kind === 'hold' && (on || soft), wantAxis = live && v.kind === 'aim' && (on || soft) && v.aim < (v.zone[0] + v.zone[1]) / 2;
    if (wantHold !== held) { held = wantHold; await (held ? page.keyboard.down('KeyE') : page.keyboard.up('KeyE')); }
    if (wantAxis !== axis) { axis = wantAxis; await (axis ? page.keyboard.down('KeyD') : page.keyboard.up('KeyD')); }
    let key = null;
    if (on && v.kind === 'dir' && v.el > 0.45) key = v.want < 0 ? 'ArrowLeft' : 'ArrowRight';
    else if (on && v.kind === 'mash' && n++ % 3 === 0) key = 'KeyE';
    else if (on && v.kind === 'press' && v.el > 0.3) key = 'Space';
    else if (on && v.kind === 'aim' && !wantAxis && v.el > 1) key = 'KeyE';
    else if (on && v.kind === 'choose' && v.el > 1.6) key = way === 'dentro' ? 'KeyE' : way === 'atras' ? 'ArrowLeft' : 'ArrowRight';
    else if (v.over && v.fail != null && !v.dead && v.t - v.fail > 5.2) key = 'KeyE';             // (the game over read, then back to the saved point)
    if (key) await page.keyboard.down(key);
    await page.evaluate((k) => window.__game.test.step(k), Math.round(60 / FPS));
    if (key) await page.keyboard.up(key);
    return v;
  };
}
const mp4 = (dir, name) => { execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', path.join(dir, 'f%05d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', path.join(OUT, name)]); rmSync(dir, { recursive: true, force: true }); console.log('wrote', name); };
mkdirSync(OUT, { recursive: true });

if (has('panels')) {
  // each panel at the moment that tells it: its command asked for where it has one, else the middle of what plays
  const page = await newPage();
  const AT = { semaforo: 1.5, vidro: 3.4, hall: 2.75, vao: 6.5, janela: 5.9 }, CMD = { corrida: 0.45, porta: 2.0, corredor: 0.9, escolha: 1.2, pano: 2.6, atras: 3.4, empurra: 1.1, dentro: 3.6, achado: 0.9, degrau: 0.3, trava: 2.2, calcada: 1.4, fecha: 0.33, grade: 3.0 };
  let from = null;
  for (const b of BEATS) {
    const cp = b.branch ? 'escolha' : [...CHECKPOINTS].reverse().find((c) => BEATS.findIndex((x) => x.id === c) <= BEATS.findIndex((x) => x.id === b.id)) ?? BEATS[0].id;
    if (cp !== from) { await game(page, cp); from = cp; }
    await page.keyboard.up('KeyE'); await page.keyboard.up('KeyD');
    const play = player(page, b.id, true, b.branch ?? 'pano');          // (the panel's own command is asked for and not yet answered when the picture is taken)
    for (let i = 0; i < 9000; i++) {
      const v = await view(page); if (!v?.fuga) break;
      if (v.beat === b.id && (b.cmd ? v.id === b.id && v.kind !== 'beat' && !v.gap && v.el >= CMD[b.id] : v.el >= (AT[b.id] ?? b.pre / 2))) break;
      await play();
    }
    await page.evaluate(() => { window.__game.st.fadeIn = 0; }); await frame(page);
    if (b.id === 'entra') { from = null; continue; }          // (the walk into the cupboard: the panel is the view from inside it)
    const name = `fuga-${String(b.panel).padStart(2, '0')}-${b.id}.png`; await page.screenshot({ path: path.join(OUT, name) }); console.log('wrote', name);
    from = null;                                    // (the next panel starts from its saved point again: this one's command was left unanswered)
  }
  await page.keyboard.up('KeyE'); await page.close();
}
if (arg('miss')) {
  const miss = String(arg('miss')), page = await newPage(), dir = path.join(os.tmpdir(), `fuga-erro-${process.pid}`); mkdirSync(dir, { recursive: true });
  if (!BEAT[miss]?.cmd) { console.error('no command in beat', miss); process.exit(2); }
  const trap = BEAT[miss].branch === 'dentro';        // (the trap of the choice: the way is taken, and it ends badly by itself)
  const cp = BEAT[miss].branch ? 'escolha' : [...CHECKPOINTS].reverse().find((c) => BEATS.findIndex((x) => x.id === c) <= BEATS.findIndex((x) => x.id === miss)) ?? BEATS[0].id;
  await game(page, has('direct') ? miss : cp);          // (--direct: straight into the beat, as the clip the person approved begins)
  let play = player(page, trap ? null : miss, false, BEAT[miss].branch ?? 'pano'), n = 0, back = null;
  for (let i = 0; i < 9000; i++) {
    await frame(page); await page.screenshot({ path: path.join(dir, `f${String(n++).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 92 });
    const v = await play();
    if (v?.dead || (v && back === null && v.fail != null && !v.fuga)) { /* the reload is on its way */ }
    if (back === null && v?.fail != null) back = -1;
    if (back === -1) { const w = await view(page); if (w?.fuga && w.fail == null && w.t < 0.2) { back = i; play = player(page); } }
    if (back > 0 && i - back > FPS * 5) break;                // five seconds of the saved point played again
  }
  await page.keyboard.up('KeyE'); await page.close(); mp4(dir, String(arg('name', trap ? 'fuga-erro-dentro.mp4' : 'fuga-erro.mp4')));
}
if (has('film')) {
  const page = await newPage(), dir = path.join(os.tmpdir(), `fuga-film-${process.pid}`); mkdirSync(dir, { recursive: true });
  await page.goto(`${url}?film`, { timeout: 180000 }); await page.waitForFunction(() => window.__film?.build, null, { timeout: 180000 });
  const view0 = String(arg('view', 'inteira'));
  const span = await page.evaluate(async ([w, h, vn]) => { const c = document.createElement('canvas'); window.__f = window.__film.build({ width: w, height: h, canvas: c }); window.__c = c; const v = window.__film.listViews()[`fuga.${vn}`]; return [v.t0, v.t1]; }, [W, H, view0]);
  const total = Math.ceil((span[1] - span[0]) * FPS);
  for (let i = 0; i < total; i++) {
    const data = await page.evaluate((t) => { window.__f.stage.frame('fuga', t); window.__f.stage.draw(); return window.__c.toDataURL('image/jpeg', 0.92); }, span[0] + i / FPS);
    writeFileSync(path.join(dir, `f${String(i).padStart(5, '0')}.jpg`), Buffer.from(data.split(',')[1], 'base64'));
    if (i % 300 === 0) console.log(`film ${i}/${total}`);
  }
  await page.close(); mp4(dir, view0 === 'inteira' ? 'fuga-corrida.mp4' : `fuga-${view0}.mp4`);
}
if (errors.length) console.log('console errors:', [...new Set(errors)].slice(0, 8));
await browser.close(); srv.close();
