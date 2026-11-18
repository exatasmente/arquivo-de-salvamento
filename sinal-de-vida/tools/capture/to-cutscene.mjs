// Makes the per-frame face data (30 fps) that the cutscene reads, from a capture folder (the webcam page or import-livelink.mjs).
//
//   node tools/capture/to-cutscene.mjs <capture folder> [--id 01 | --id all] [--mapping tools/capture/mapping.json] [--out data/cutscenes/radio-teste.face.json]
//
// Per line: takes the neutral off, resamples to 30 fps, smooths (a centred filter: it does not delay), and maps to the contract of
// src/models/jonas.js with the gains of mapping.json (one set per source: webcam, livelink). With one --id the other lines already in
// the output file are kept. The output is { fps, lines: { <id>: { n, morphs: { name: [..] }, gaze: { x: [..], y: [..] }, head: { yaw, pitch, roll } } } }.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertTake } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, '..', '..');
const arg = (name, d = null) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const json = (p) => JSON.parse(readFileSync(p, 'utf8'));

function main() {
  const dir = process.argv[2];
  if (!dir || dir.startsWith('--')) { console.error('usage: see the head of this file'); process.exit(2); }
  const mapping = json(path.resolve(String(arg('mapping', path.join(HERE, 'mapping.json')))));
  const out = path.resolve(String(arg('out', path.join(GAME, 'data', 'cutscenes', 'radio-teste.face.json'))));
  const want = String(arg('id', 'all'));
  const ids = readdirSync(dir).filter((f) => f.endsWith('.face.json')).map((f) => f.slice(0, -'.face.json'.length)).filter((id) => want === 'all' || id === want).sort();
  if (!ids.length) { console.error(`no ${want === 'all' ? '' : want + '.'}face.json in the folder`); process.exit(1); }
  const result = want !== 'all' && existsSync(out) ? json(out) : { fps: mapping.fps ?? 30, lines: {} };
  result.fps = mapping.fps ?? 30;
  for (const id of ids) {
    const take = json(path.join(dir, `${id}.face.json`)), source = take.source ?? 'webcam';
    const nf = path.join(dir, source === 'livelink' ? 'neutral-livelink.json' : 'neutral.json');
    const neutral = existsSync(nf) ? json(nf) : null;
    result.lines[id] = convertTake({ ...take, source }, neutral, mapping);
    console.log(`${id}: ${result.lines[id].n} frames (${source}${neutral ? '' : ', no neutral'})`);
  }
  writeFileSync(out, JSON.stringify(result));
  console.log(`written: ${path.relative(process.cwd(), out) || out}`);
}
main();
