// The sound of the short video "radio-curto": the two recorded lines of the mix (assets/audio/cena-radio.mp3), the game's own synthesised
// radio sounds laid at the times of src/cutscenes/radio-curto.js (EVENTS, HISS), mixed and normalised to about -16 LUFS. Nothing is recorded.
//
//   node tools/cutscenes/radio-curto.mjs --playwright <folder of playwright-core> --url http://127.0.0.1:8741/sinal-de-vida/ \
//     [--chrome <Chrome>] --out <sound.wav>
// Then join it with the filmed picture: film.mjs --audio <sound.wav>. The browser is closed whatever happens.
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? d : process.argv[i + 1]; };
const GAME = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const pw = arg('playwright'), url = arg('url'), out = arg('out');
if (!pw || !url || !out) { console.error('usage: see the head of this file'); process.exit(2); }
const { chromium } = createRequire(import.meta.url)(path.resolve(pw));
const browser = await chromium.launch({ ...(arg('chrome') ? { executablePath: arg('chrome') } : {}), headless: true, args: ['--mute-audio'] });
const tmp = mkdtempSync(path.join(tmpdir(), 'curto-'));
try {
  const page = await browser.newPage();
  await page.goto(`${url.replace(/\/?$/, '/')}index.html?film`, { waitUntil: 'load' });
  const res = await page.evaluate(async () => {
    const { createAudio } = await import('./src/audio/index.js');
    const { EVENTS, HISS, TIMELINE } = await import('./src/cutscenes/radio-curto.js');
    const SR = 44100, len = Math.ceil(TIMELINE.total * SR), ctx = new OfflineAudioContext(1, len, SR), audio = createAudio(ctx, { seed: 3 });
    for (const e of EVENTS) {
      audio.play(e.name, { at: e.t, gain: e.gain });
    }
    audio.play('chiado', { at: HISS.from, dur: HISS.to - HISS.from, gain: 0.35 });
    const buf = await ctx.startRendering(), d = buf.getChannelData(0);
    const wav = new DataView(new ArrayBuffer(44 + d.length * 2)), w = (o, s) => [...s].forEach((c, i) => wav.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); wav.setUint32(4, 36 + d.length * 2, true); w(8, 'WAVEfmt '); wav.setUint32(16, 16, true); wav.setUint16(20, 1, true); wav.setUint16(22, 1, true);
    wav.setUint32(24, SR, true); wav.setUint32(28, SR * 2, true); wav.setUint16(32, 2, true); wav.setUint16(34, 16, true); w(36, 'data'); wav.setUint32(40, d.length * 2, true);
    for (let i = 0; i < d.length; i++) wav.setInt16(44 + i * 2, Math.max(-1, Math.min(1, d[i])) * 32767, true);
    let s = ''; const u8 = new Uint8Array(wav.buffer); for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode(...u8.subarray(i, i + 8192));
    return { b64: btoa(s), t: { say1: TIMELINE.say1, say2: TIMELINE.say2, total: TIMELINE.total } };
  });
  const synth = path.join(tmp, 'synth.wav'); writeFileSync(synth, Buffer.from(res.b64, 'base64'));
  const { say1, say2, total } = res.t, mp3 = path.join(GAME, 'assets/audio/cena-radio.mp3');
  // line 01 (data 2.9 s) and line 02 (data 7.396 s) of the recorded mix, each with a little of its own surroundings
  const a0 = 2.55, b0 = 7.15, da = Math.round((say1 - (2.9 - a0)) * 1000), db = Math.round((say2 - (7.396 - b0)) * 1000);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', mp3, '-i', synth, '-filter_complex',
    `[0:a]atrim=${a0}:6.7,asetpts=PTS-STARTPTS,afade=t=in:d=0.1,afade=t=out:st=3.95:d=0.2,adelay=${da}|${da}[a];` +
    `[0:a]atrim=${b0}:9.4,asetpts=PTS-STARTPTS,afade=t=in:d=0.1,afade=t=out:st=2.1:d=0.15,adelay=${db}|${db}[b];` +
    `[a][b][1:a]amix=inputs=3:normalize=0:duration=longest,loudnorm=I=-16:TP=-1.5:LRA=11,apad[o]`,
    '-map', '[o]', '-t', String(total), '-ar', '44100', '-ac', '1', path.resolve(out)]);
  console.log(`sound: ${out}`);
} finally { await browser.close(); rmSync(tmp, { recursive: true, force: true }); }
