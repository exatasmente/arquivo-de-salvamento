// Clipping check of the posto: finds surfaces that share a plane (z-fighting) and measures how far a decal sits off its surface.
//
//   PLAYWRIGHT_CORE=<path to playwright-core> node tools/clipping-check.mjs [--strict] [--list] [--tol 0.0005]
//
// It builds the posto in the editor mode (every entity in a group of its own) and reads every triangle of the scene that
// faces along an axis. Two triangles are a CLIP when they face the same way, lie in planes closer than --tol (default 0.5 mm),
// overlap by more than 3 mm, and are not hidden inside a wall. Each distinct pair (entity/material <> entity/material, axis)
// is one finding. A finding passes only if a line of tools/clipping-exceptions.json matches it (`match` is a regular expression
// on "idA/materialA <> idB/materialB axN+"; `reason` says why it stays). Entities and ids are the layout ids of the scene;
// "?" is the structure the scene builds itself (walls, floors, canopy).
//   --list    also print the findings between --tol and 12 mm (decals: they are lifted by polygon offset, see scenes/paint.js `lift`)
//   --strict  fail when an exception no longer matches anything (the list must not rot)
// Exit code 0: no finding outside the exceptions. 1: findings (printed). 2: the page failed to build.
// Run it after changing a model or the layout of the posto, and on every new model of the visual stage.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..');
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1]?.startsWith('--') || i + 1 >= process.argv.length ? true : process.argv[i + 1]); };
const TOL = Number(arg('tol', 0.0005)), LIST = arg('list', false) === true, STRICT = arg('strict', false) === true;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const srv = await new Promise((res) => { const s = http.createServer((req, rs) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0])); if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rs.writeHead(404); rs.end(); return; } rs.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(rs); }); s.listen(0, '127.0.0.1', () => res(s)); });
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.setDefaultTimeout(120000);
const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
let out;
try {
  await page.goto(`http://127.0.0.1:${srv.address().port}/o-dia-que-sobra/tools/posto-preview.html?manual&editor&open=0`);
  await page.waitForFunction(() => window.__p, null, { timeout: 90000 });
  out = await page.evaluate(() => {
  const { posto, T } = window.__p; posto.group.updateMatrixWorld(true);
  const tris = []; const walls = posto.colliders.filter((c) => !c.door && c.max[1] >= 2.9 && c.max[1] < 3.3 && ((c.max[0]-c.min[0]) < 0.21 || (c.max[2]-c.min[2]) < 0.21));
  const inWall = (x, y, z) => walls.some((c) => x > c.min[0] + 1e-3 && x < c.max[0] - 1e-3 && z > c.min[2] + 1e-3 && z < c.max[2] - 1e-3 && y < c.max[1]);
  const satOverlap = (P, Q) => { for (const T2 of [P, Q]) for (let i = 0; i < 3; i++) { const a = T2[i], b = T2[(i + 1) % 3]; const nx = -(b[1] - a[1]), ny = b[0] - a[0], l = Math.hypot(nx, ny) || 1; let p0 = 1e9, p1 = -1e9, q0 = 1e9, q1 = -1e9; for (const x of P) { const d = (x[0] * nx + x[1] * ny) / l; p0 = Math.min(p0, d); p1 = Math.max(p1, d); } for (const x of Q) { const d = (x[0] * nx + x[1] * ny) / l; q0 = Math.min(q0, d); q1 = Math.max(q1, d); } if (Math.min(p1, q1) - Math.max(p0, q0) < 0.003) return false; } return true; };
  const v = [new T.Vector3(), new T.Vector3(), new T.Vector3()], e1 = new T.Vector3(), e2 = new T.Vector3(), n = new T.Vector3();
  const idOf = (o) => { let p = o; while (p) { if (p.userData?.entityId) return p.userData.entityId; p = p.parent; } return '?'; };
  posto.group.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    let p = o; while (p) { if (p.visible === false) return; p = p.parent; }
    if (o.material?.visible === false) return;
    const g = o.geometry, pos = g.attributes.position, idx = g.index, cnt = idx ? idx.count : pos.count;
    const side = o.material?.side === 2; const tr = o.material?.transparent === true;
    const id = idOf(o), mn = o.name || '';
    for (let i = 0; i < cnt; i += 3) {
      for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(pos, idx ? idx.getX(i + k) : i + k).applyMatrix4(o.matrixWorld);
      e1.subVectors(v[1], v[0]); e2.subVectors(v[2], v[0]); n.crossVectors(e1, e2); const area = n.length() / 2; if (area < 1e-5) continue; n.normalize();
      let ax = -1; for (let a = 0; a < 3; a++) if (Math.abs(n.getComponent(a)) > 0.999) ax = a; if (ax < 0) continue;
      const sg = n.getComponent(ax) > 0 ? 1 : -1, c = v[0].getComponent(ax);
      const u = (ax + 1) % 3, w = (ax + 2) % 3; const lo = [Math.min(v[0].getComponent(u), v[1].getComponent(u), v[2].getComponent(u)), Math.min(v[0].getComponent(w), v[1].getComponent(w), v[2].getComponent(w))], hi = [Math.max(v[0].getComponent(u), v[1].getComponent(u), v[2].getComponent(u)), Math.max(v[0].getComponent(w), v[1].getComponent(w), v[2].getComponent(w))];
      const P = v.map((q) => [q.getComponent(u), q.getComponent(w)]); tris.push({ ax, sg, c, lo, hi, id, mn, area, tr, side, P });
    }
  });
  // bucket
  const B = new Map();
  tris.forEach((t, i) => { const k = t.ax * 2 + (t.sg > 0 ? 1 : 0) + ':' + Math.round(t.c / 0.003); (B.get(k) || B.set(k, []).get(k)).push(i); });
  const res = new Map();
  for (const [k, list] of B) {
    const [h, b] = k.split(':'); 
    const lists = [list, B.get(h + ':' + (+b + 1)) || [], B.get(h + ':' + (+b + 2)) || [], B.get(h + ':' + (+b + 3)) || []];
    for (let a = 0; a < list.length; a++) {
      const A = tris[list[a]];
      for (let li = 0; li < 4; li++) for (let bi = li === 0 ? a + 1 : 0; bi < lists[li].length; bi++) {
        const Bt = tris[lists[li][bi]]; const d = Math.abs(A.c - Bt.c); if (d > 0.012) continue;
        const ow = Math.min(A.hi[0], Bt.hi[0]) - Math.max(A.lo[0], Bt.lo[0]), oh = Math.min(A.hi[1], Bt.hi[1]) - Math.max(A.lo[1], Bt.lo[1]);
        if (ow <= 0.005 || oh <= 0.005 || ow * oh < 0.0004) continue; if (!satOverlap(A.P, Bt.P)) continue; { const mid = [(Math.max(A.lo[0], Bt.lo[0]) + Math.min(A.hi[0], Bt.hi[0])) / 2, (Math.max(A.lo[1], Bt.lo[1]) + Math.min(A.hi[1], Bt.hi[1])) / 2]; const pt = [0, 0, 0]; const ax = A.ax; pt[ax] = A.c + A.sg * 0.02; pt[(ax + 1) % 3] = mid[0]; pt[(ax + 2) % 3] = mid[1]; if (inWall(...pt)) continue; if (A.ax === 1 && A.sg < 0 && A.c < 0.02) continue; }
        if (A.id === Bt.id && A.mn === Bt.mn && d < 1e-6 && false) continue;
        const key = [A.id + '/' + A.mn, Bt.id + '/' + Bt.mn].sort().join(' <> ') + ' ax' + A.ax + (A.sg > 0 ? '+' : '-');
        const e = res.get(key) || { n: 0, d: 9, area: 0, at: null }; e.n++; e.d = Math.min(e.d, d); e.area += ow * oh; if (!e.at) e.at = [A.lo[0].toFixed(2), A.lo[1].toFixed(2), A.c.toFixed(3)]; res.set(key, e);
      }
    }
  }
  return { n: tris.length, res: [...res.entries()].sort((a, b) => a[1].d - b[1].d || b[1].area - a[1].area) };
});
} catch (e) { console.error('the posto did not build:', e.message, errs); await browser.close(); srv.close(); process.exit(2); }
await browser.close(); srv.close();
const exc = JSON.parse(fs.readFileSync(path.join(here, 'clipping-exceptions.json'), 'utf8')).exceptions.map((e) => ({ ...e, re: new RegExp(e.match), hits: 0 }));
let bad = 0, near = 0;
for (const [k, e] of out.res) {
  const key = k;
  if (e.d > TOL) { if (LIST) { near++; console.log('near ' + (e.d * 1000).toFixed(1) + ' mm  ' + key); } continue; }
  const x = exc.find((q) => q.re.test(key));
  if (x) { x.hits++; continue; }
  bad++; console.log('CLIP  n=' + e.n + ' area=' + e.area.toFixed(3) + ' m2  ' + key + '  at ' + e.at.join(','));
}
const stale = exc.filter((x) => !x.hits);
if (STRICT) for (const x of stale) { bad++; console.log('STALE exception (matches nothing): ' + x.match); }
console.log(`${out.n} triangles; ${out.res.filter(([, e]) => e.d <= TOL).length} coplanar findings, ${exc.reduce((a, x) => a + x.hits, 0)} covered by ${exc.length} exceptions${LIST ? `, ${near} near-plane (decals)` : ''}; ${bad} to fix`);
process.exit(bad ? 1 : 0);
