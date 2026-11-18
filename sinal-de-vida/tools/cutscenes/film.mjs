// Films a view of the game's film mode frame by frame and joins it with a recorded sound: the video of a cutscene that is acted to a
// recording (the cutscene "radio-teste"). Also a sheet with one frame of each cut, and the cutscene's views written to the manifest.
//
//   node tools/cutscenes/film.mjs --playwright <folder of playwright-core> --url http://127.0.0.1:8739/sinal-de-vida/ \
//     [--chrome <a Chrome or Chromium to use instead of playwright's own>] [--cutscene radio-teste] [--view radio-teste.cena] [--audio <the mixed .wav>] [--out <video.mp4>] [--sheet <sheet.png>]
//     [--at 1.5,12,30 --stills <folder>]   (only these moments, as PNG: to look at the picture while staging)
//     [--size 1280x720] [--fps 30] [--manifest]   (--manifest rewrites this cutscene's views and anchors in src/film-manifest.json)
//
// The game must be served (any static server). Needs ffmpeg. The browser is closed whatever happens.
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (name, d = null) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const GAME = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const pw = arg('playwright'), url = arg('url'), cutscene = arg('cutscene', 'radio-teste'), view = arg('view', `${cutscene}.cena`);
if (!pw || !url) { console.error('usage: see the head of this file'); process.exit(2); }
const [W, Hh] = String(arg('size', '1280x720')).split('x').map(Number), FPS = Number(arg('fps', 30));
const { chromium } = createRequire(import.meta.url)(path.resolve(pw));

const browser = await chromium.launch({ ...(arg('chrome') ? { executablePath: String(arg('chrome')) } : {}), headless: true, args: ['--mute-audio', '--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const tmp = mkdtempSync(path.join(tmpdir(), 'film-'));
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: W, height: Hh } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${url.replace(/\/?$/, '/')}index.html?film`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.setup === 'function', null, { timeout: 120000 });
  const info = await page.evaluate(([w, h]) => window.setup({ width: w, height: h }), [W, Hh]);
  if (!info.views.includes(view)) throw new Error(`no view ${view}`);
  const dur = info.durations[view];
  const meta = await page.evaluate(async (cn) => { const m = (await import('./src/cutscenes/index.js')).CUTSCENES[cn]; return { cuts: m.cuts ?? [], desc: m.shotDesc ?? {}, manifest: window.__film.manifest() }; }, cutscene);
  console.log(`gpu: ${info.gpu}; ${view}: ${dur} s; ${meta.cuts.length} cuts`);
  await page.evaluate(([v, d]) => window.shot({ from: v, duration: d }), [view, dur]);
  const grab = async (t, file, png = false) => {
    const data = await page.evaluate(([tt, asPng]) => { const u = window.frame(tt); if (!asPng) return u; return document.querySelectorAll('canvas').length && window.__film.current.paint ? (() => { const c = document.createElement('canvas'); const img = new Image(); return new Promise((res) => { img.onload = () => { c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0); res(c.toDataURL('image/png')); }; img.src = u; }); })() : u; }, [t, png]);
    writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
  };

  if (arg('at')) {
    const dir = path.resolve(String(arg('stills', tmp))); mkdirSync(dir, { recursive: true });
    for (const t of String(arg('at')).split(',').map(Number)) { const f = path.join(dir, `t${t.toFixed(2).padStart(6, '0')}.jpg`); await grab(t, f); console.log(f); }
  }
  if (arg('sheet')) {
    const files = [];
    for (const [i, c] of meta.cuts.entries()) { const f = path.join(tmp, `cut${String(i).padStart(2, '0')}.jpg`); await grab(c.t0 + (c.t1 - c.t0) * (c.kind === 'forte' ? 0.8 : 0.55), f); files.push(f); console.log(`  cut ${i + 1}: ${c.t0.toFixed(2)}-${c.t1.toFixed(2)} s  ${c.kind}${c.line ? ` (fala ${c.line})` : ''}`); }
    const cols = Math.ceil(Math.sqrt(files.length)), rows = Math.ceil(files.length / cols);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', '1', '-i', path.join(tmp, 'cut%02d.jpg'), '-vf', `scale=640:-1,tile=${cols}x${rows}:padding=6:margin=6:color=black`, '-frames:v', '1', '-pix_fmt', 'rgb24', path.resolve(String(arg('sheet')))]);
    console.log(`sheet: ${arg('sheet')} (${cols}x${rows}, in the order of the cuts)`);
  }
  if (arg('out')) {
    const n = Math.round(dur * FPS);
    for (let i = 0; i < n; i++) { await grab(i / FPS, path.join(tmp, `f${String(i).padStart(5, '0')}.jpg`)); if (i % 150 === 0) console.log(`  frame ${i}/${n}`); }
    const audio = arg('audio') ? ['-i', path.resolve(String(arg('audio')))] : [];
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', path.join(tmp, 'f%05d.jpg'), ...audio, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', ...(audio.length ? ['-c:a', 'aac', '-b:a', '160k'] : []), '-t', String(dur), '-movflags', '+faststart', path.resolve(String(arg('out')))]);
    console.log(`video: ${arg('out')} (${n} frames)`);
  }
  if (arg('manifest')) {
    const file = path.join(GAME, 'src', 'film-manifest.json'), cur = JSON.parse(readFileSync(file, 'utf8')), own = (k) => k.startsWith(`${cutscene}.`);
    for (const part of ['views', 'anchors']) cur[part] = { ...Object.fromEntries(Object.entries(cur[part]).filter(([k]) => !own(k))), ...Object.fromEntries(Object.entries(meta.manifest[part]).filter(([k]) => own(k))) };
    writeFileSync(file, JSON.stringify(cur, null, 2) + '\n');
    console.log('manifest: views and anchors of the cutscene written');
  }
  console.log(JSON.stringify(await page.evaluate(() => window.report())));
} finally {
  await browser.close();
  rmSync(tmp, { recursive: true, force: true });
}
if (errors.length) { console.error(`console errors:\n${errors.join('\n')}`); process.exit(1); }
