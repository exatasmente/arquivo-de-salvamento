// Screenshot script for the casa preview:
//   PLAYWRIGHT_CORE=<path to playwright-core> OUT_DIR=<folder for the images> node tools/casa-shots.mjs <port>
const { PLAYWRIGHT_CORE, OUT_DIR } = process.env;
if (!PLAYWRIGHT_CORE || !OUT_DIR) throw new Error('set PLAYWRIGHT_CORE and OUT_DIR');
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)(PLAYWRIGHT_CORE);
const port = process.argv[2], out = OUT_DIR.endsWith('/') ? OUT_DIR : OUT_DIR + '/';
const shots = process.argv[3] ? process.argv[3].split(',') : null;
const LIST = [
  ['quarto', 'v=quarto'], ['cama', 'v=cama'], ['geladeira', 'v=geladeira&adesivo=1'], ['geladeira-limpa', 'v=geladeira'], ['mesa-contas', 'v=mesa'],
  ['telefone-secretaria', 'v=telefone&recados=2&t=0.15'], ['vara-do-pai', 'v=vara'], ['janela-rua', 'v=janela'], ['sala', 'v=sala'], ['cozinha', 'v=cozinha'],
  ['porta-rua', 'v=porta'], ['rua-saindo-de-casa', 'v=rua'], ['rua-farmacia', 'v=rua-farmacia'], ['fachada-farmacia', 'v=fachada'], ['farmacia-interior', 'v=farmacia'],
  ['farmacia-balcao', 'v=balcao'], ['farmacia-frasco', 'v=frasco'], ['farmacia-pilhas', 'v=pilhas'], ['aereo-casa', 'v=aereo-casa&bright'], ['aereo-rua', 'v=aereo-rua&bright'],
];
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let bad = 0;
for (const [label, w, h] of [['', 1920, 1080], ['-celular', 390, 844]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errs = []; page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); page.on('pageerror', (e) => errs.push(String(e)));
  for (const [name, qs] of LIST) {
    if (shots && !shots.includes(name)) continue;
    if (w < 1000 && !['quarto', 'telefone-secretaria', 'farmacia-balcao', 'rua-farmacia', 'farmacia-frasco'].includes(name)) continue;
    await page.goto(`http://127.0.0.1:${port}/tools/casa-preview.html?manual&${qs}`);
    await page.waitForFunction(() => window.__c, null, { timeout: 15000 });
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${out}casa-${name}${label}.png` });
  }
  if (errs.length) { bad++; console.log('ERRORS', w, errs.slice(0, 6)); }
  await page.close();
}
await browser.close();
console.log(bad ? 'console errors' : 'console clean');
