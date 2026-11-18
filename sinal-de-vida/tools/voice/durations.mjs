// Measures every mp3 of assets/audio/n1/ with ffprobe and writes assets/audio/n1/durations.json (id -> seconds).
// Run again whenever the lines are re-recorded: node tools/voice/durations.mjs
import { execFileSync } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const dir = path.resolve(new URL('../../assets/audio/n1/', import.meta.url).pathname);
const out = {};
for (const f of readdirSync(dir).filter((x) => x.endsWith('.mp3')).sort()) {
  const id = f.replace(/\.mp3$/, '');
  try {
    const s = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(dir, f)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const d = Number(s);
    if (!(d > 0)) throw new Error('no duration');
    out[id] = Math.round(d * 1000) / 1000;
  } catch { console.warn(`skipped ${f}: not readable (empty or being re-recorded?)`); }
}
writeFileSync(path.join(dir, 'durations.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`${Object.keys(out).length} files measured`);
