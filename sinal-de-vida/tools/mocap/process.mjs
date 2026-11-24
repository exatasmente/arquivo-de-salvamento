// pose file (from the capture page) -> take for the retarget.
//   node tools/mocap/process.mjs <name>.pose.json --name <clip name> [--out tools/mocap/takes] [--fps 30] [--trim 0.5,6.2] [--yaw 0]
//        [--face start|camera] [--camera static|follow] [--fov 65] [--sigma 0.05] [--no-level] [--no-depth]
// Writes <out>/<clip name>.json and prints what it did. Nothing is read or written outside those two paths.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanTake } from './clean.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (!x.startsWith('--')) { a._.push(x); continue; }
    const k = x.slice(2); if (k.startsWith('no-')) { a[k.slice(3)] = false; continue; }
    const v = argv[i + 1]; if (v === undefined || v.startsWith('--')) a[k] = true; else { a[k] = v; i++; }
  }
  return a;
}
export function run(argv) {
  const a = parseArgs(argv);
  if (!a._[0] || !a.name) { console.error('usage: node tools/mocap/process.mjs <name>.pose.json --name <clip name> [--out <folder>] [--fps 30] [--trim a,b] [--yaw deg] [--face start|camera] [--camera static|follow] [--fov 65] [--sigma 0.05] [--no-level] [--no-depth]'); return 2; }
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(a.name)) { console.error('--name: letters, digits, - and _ only'); return 2; }
  const doc = JSON.parse(readFileSync(a._[0], 'utf8'));
  if (doc.kind !== 'pose') { console.error('not a pose file'); return 2; }
  const o = {};
  if (a.fps) o.fps = Number(a.fps); if (a.sigma) o.sigma = Number(a.sigma); if (a.fov) o.fov = Number(a.fov); if (a.yaw) o.yaw = Number(a.yaw);
  if (a.trim) o.trim = String(a.trim).split(',').map(Number); if (a.face) o.face = a.face; if (a.camera) o.camera = a.camera;
  if (a.level === false) o.level = false; if (a.depth === false) o.depth = false;
  const { take, report } = cleanTake(doc, o);
  const out = path.resolve(String(a.out ?? path.join(HERE, 'takes'))); mkdirSync(out, { recursive: true });
  take.name = a.name;
  const file = path.join(out, `${a.name}.json`); writeFileSync(file, JSON.stringify(take));
  console.log(`${file}\n${JSON.stringify(report, null, 2)}`);
  return 0;
}
import { fileURLToPath as f2 } from 'node:url';
if (process.argv[1] === f2(import.meta.url)) process.exit(run(process.argv.slice(2)));
