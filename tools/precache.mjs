// Writes into sw.js the list of files the service worker keeps for offline play, each with the hash of its
// contents, and a version made from all of them: a published change makes browsers update the set, fetching
// only the files whose hash changed.
//
//   node tools/precache.mjs           rewrite the list in sw.js (run it after `git add`, before the commit)
//   node tools/precache.mjs --check   exit 1 when sw.js does not match what is staged
//
// The list is what git has staged (not what is only in the working tree) under the site and the games,
// without the tools, the docs and the videos.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SW = path.join(ROOT, 'sw.js');
const KEEP = [/^index\.html$/, /^manifest\.webmanifest$/, /^console\//, /^icons\//, /^assets\//, /^rinha\//, /^o-dia-que-sobra\//];
const SKIP = [/\/tools\//, /\.md$/, /\.(mp4|webm|wav)$/i, /(^|\/)LICENSE$/, /\.d\.ts$/];

const staged = execFileSync('git', ['ls-files', '-s'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n').filter(Boolean)
  .map((line) => { const [meta, file] = line.split('\t'); return { file, blob: meta.split(' ')[1] }; })
  .filter(({ file }) => KEEP.some((re) => re.test(file)) && !SKIP.some((re) => re.test(file)))
  .sort((a, b) => a.file.localeCompare(b.file));

// Pages ask for a folder (rinha/), not for its index.html: both are kept.
// Each entry carries the hash of its contents (git's blob id, short): an update downloads only what changed.
const files = [];
for (const { file, blob } of staged) {
  const h = blob.slice(0, 12);
  if (file === 'index.html') files.push(['./', h]);
  else if (file.endsWith('/index.html')) files.push([file.slice(0, -'index.html'.length), h]);
  files.push([file, h]);
}
const version = createHash('sha256').update(staged.map((s) => `${s.file} ${s.blob}`).join('\n')).digest('hex').slice(0, 12);
const block = `// precache:start\nconst VERSION = '${version}';\nconst PRECACHE = [\n${files.map(([f, h]) => `  [${JSON.stringify(f)}, '${h}'],`).join('\n')}\n];\n// precache:end`;

const src = fs.readFileSync(SW, 'utf8');
const re = /\/\/ precache:start[\s\S]*?\/\/ precache:end/;
if (!re.test(src)) { console.error('sw.js has no precache block'); process.exit(1); }
const next = src.replace(re, block);
if (process.argv.includes('--check')) {
  if (next !== src) { console.error(`sw.js is stale: run node tools/precache.mjs (version would be ${version})`); process.exit(1); }
  console.log(`sw.js is current (${version}, ${files.length} entries)`);
} else {
  fs.writeFileSync(SW, next);
  console.log(`sw.js: version ${version}, ${files.length} entries`);
}
