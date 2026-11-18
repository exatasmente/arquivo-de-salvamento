// Imports a take of the Live Link Face app (iPhone) as the face of a line, in the same <id>.face.json the webcam page writes.
//
//   node tools/capture/import-livelink.mjs <take folder | .csv> --out <folder> --id <line id> [--neutral <neutral take .csv>] [--fps 30|60]
//        [--head-degrees]   (the head columns are in degrees, not radians)
//
// The CSV: one row per frame, a timecode column and one column per ARKit blendshape (PascalCase), sometimes HeadYaw/HeadPitch/HeadRoll,
// and extra columns that are ignored. Missing columns and empty cells do not stop the import: they are counted and reported.
// If the take folder has a reference video (.mov/.mp4), its sound is written to <id>.wav (mono, 48 kHz), for tools/voice/sts.mjs.
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BLENDSHAPES, averageNeutral, normalizeName } from './lib.mjs';

/** The seconds of a timecode cell: "HH:MM:SS:FF" or "HH:MM:SS:FF.fff" (frames, with a fraction of a frame), "HH:MM:SS.fff", or plain seconds. */
export function parseTimecode(cell, fps = 30) {
  const s = String(cell).trim(); if (!s) return NaN;
  const p = s.split(':');
  if (p.length === 1) return Number(s);
  const n = p.map(Number); if (n.some((x) => Number.isNaN(x))) return NaN;
  if (p.length === 3) return n[0] * 3600 + n[1] * 60 + n[2];
  return n[0] * 3600 + n[1] * 60 + n[2] + n[3] / fps;
}

const splitRow = (line) => line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));

/** The frame rate a timecode column implies: the largest frame field seen (<= 29 is 30 fps, <= 59 is 60). */
function guessFps(rows, col) {
  let max = 0;
  for (const r of rows) { const p = String(r[col] ?? '').split(':'); if (p.length === 4) max = Math.max(max, Math.floor(Number(p[3]) || 0)); }
  return max === 0 ? null : max <= 29 ? 30 : 60;
}

/**
 * Parses the CSV text. Returns { frames: [{ t, b, h }], fps, head, missing: { name: count }, absent: [names of blendshapes with no column], extra: n, hasHead }.
 * A blank cell keeps the last value of its channel (0 before the first), and is counted in `missing`.
 */
export function parseLiveLinkCsv(text, { fps = null, headDegrees = false } = {}) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error('the CSV has no rows');
  const header = splitRow(lines[0]), rows = lines.slice(1).map(splitRow);
  const tcCol = header.findIndex((h) => /time|stamp/i.test(h));
  if (tcCol < 0) throw new Error('no timecode column (a header with "time" or "stamp")');
  const shapeCol = BLENDSHAPES.map((b) => header.findIndex((h) => normalizeName(h) === b));
  const headCol = ['HeadYaw', 'HeadPitch', 'HeadRoll'].map((n) => header.findIndex((h) => h.toLowerCase() === n.toLowerCase()));
  const useFps = fps ?? guessFps(rows, tcCol) ?? 30;
  const absent = BLENDSHAPES.filter((_, i) => shapeCol[i] < 0);
  const known = new Set([tcCol, ...shapeCol, ...headCol].filter((c) => c >= 0));
  const missing = {}, last = new Array(BLENDSHAPES.length).fill(0), lastH = [0, 0, 0], num = (c) => (c === undefined || c === '' || Number.isNaN(Number(c)) ? null : Number(c));
  const frames = []; let t0 = null;
  for (const r of rows) {
    const tc = parseTimecode(r[tcCol], useFps); if (Number.isNaN(tc)) { missing.timecode = (missing.timecode ?? 0) + 1; continue; }
    t0 ??= tc;
    const b = BLENDSHAPES.map((name, i) => {
      if (shapeCol[i] < 0) return 0;
      const v = num(r[shapeCol[i]]);
      if (v === null) { missing[name] = (missing[name] ?? 0) + 1; return last[i]; }
      return (last[i] = Math.max(0, Math.min(1, v)));
    });
    const h = headCol.map((c, i) => { if (c < 0) return 0; const v = num(r[c]); if (v === null) { const k = ['HeadYaw', 'HeadPitch', 'HeadRoll'][i]; missing[k] = (missing[k] ?? 0) + 1; return lastH[i]; } return (lastH[i] = headDegrees ? v * Math.PI / 180 : v); });
    frames.push({ t: +(tc - t0).toFixed(4), b, h });
  }
  if (!frames.length) throw new Error('no row with a readable timecode');
  return { frames, fps: useFps, missing, absent, extra: header.length - known.size, hasHead: headCol.every((c) => c >= 0) };
}

const arg = (name, d = null) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };

function findTake(input) {
  if (statSync(input).isFile()) return { csv: input, video: null };
  const files = readdirSync(input), csvs = files.filter((f) => /\.csv$/i.test(f)), vids = files.filter((f) => /\.(mov|mp4)$/i.test(f));
  if (csvs.length !== 1) throw new Error(`expected one .csv in ${input}, found ${csvs.length}`);
  return { csv: path.join(input, csvs[0]), video: vids[0] ? path.join(input, vids[0]) : null };
}

function main() {
  const input = process.argv[2], out = arg('out'), id = arg('id');
  if (!input || input.startsWith('--') || !out || !id || !/^[A-Za-z0-9_-]{1,40}$/.test(String(id))) { console.error('usage: see the head of this file'); process.exit(2); }
  const take = findTake(input), opts = { fps: arg('fps') ? Number(arg('fps')) : null, headDegrees: !!arg('head-degrees') };
  const r = parseLiveLinkCsv(readFileSync(take.csv, 'utf8'), opts);
  const duration = r.frames[r.frames.length - 1].t + 1 / r.fps;
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, `${id}.face.json`), JSON.stringify({ id, source: 'livelink', duration: +duration.toFixed(3), names: BLENDSHAPES, frames: r.frames.map((f) => ({ t: f.t, b: f.b.map((v) => +v.toFixed(4)), h: f.h.map((v) => +v.toFixed(4)) })), missing: r.missing }));
  console.log(`${id}: ${r.frames.length} frames at ${r.fps} fps, ${duration.toFixed(2)} s`);
  if (r.absent.length) console.log(`  warning: no column for ${r.absent.length} blendshape(s): ${r.absent.join(', ')}`);
  if (!r.hasHead) console.log('  warning: no HeadYaw/HeadPitch/HeadRoll columns: the head will not turn');
  for (const [k, n] of Object.entries(r.missing)) console.log(`  warning: ${k}: ${n} empty frame(s) (kept the last value)`);
  if (r.extra) console.log(`  ${r.extra} extra column(s) ignored`);
  if (arg('neutral')) {
    const n = parseLiveLinkCsv(readFileSync(findTake(String(arg('neutral'))).csv, 'utf8'), opts);
    writeFileSync(path.join(out, 'neutral-livelink.json'), JSON.stringify(averageNeutral(n.frames)));
    console.log(`  neutral: mean of ${n.frames.length} frames -> neutral-livelink.json`);
  } else console.log('  no --neutral: nothing is taken off (neutral-livelink.json is used if it exists)');
  if (take.video) {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', take.video, '-vn', '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', path.join(out, `${id}.wav`)]);
    console.log(`  audio: ${id}.wav (from ${path.basename(take.video)}); the CSV is taken to start with the video: confirm by ear (mapping.json: livelink.lag)`);
  } else console.log('  no reference video in the take: no <id>.wav written');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
