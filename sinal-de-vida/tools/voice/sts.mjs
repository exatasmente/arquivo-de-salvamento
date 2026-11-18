// The Voice Changer of ElevenLabs (speech to speech): turns the recorded take of a line into the voice of Jonas, keeping the timing.
//
//   node tools/voice/sts.mjs <capture folder> [--id 01 | --id all] [--voice <voice id>] [--model <model id>] [--remove-noise] [--dry-run] [--yes]
//
// Reads <folder>/<id>.wav and writes <folder>/<id>.jonas.mp3. This is a PAID call: before it, the total duration and the estimated
// cost are printed, and nothing is sent without --yes (--dry-run only prints, and never calls). The key is read from the user's
// config folder inside this process and is never printed. After each conversion the duration of the output is compared with the
// input (50 ms of tolerance) and a warning is printed if they differ.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_VOICE = 'uNRH6oYhKWLYyXKl4HVH';
export const DEFAULT_MODEL = 'eleven_multilingual_sts_v2';
export const ENDPOINT = 'https://api.elevenlabs.io/v1/voice-changer';
/** The estimate from third-party information, to be checked on the account: about 1000 credits and US$ 0.12 per minute of input. */
export const CREDITS_PER_MINUTE = 1000;
export const USD_PER_MINUTE = 0.12;
export const TOLERANCE = 0.05;

/** The duration (seconds) of a PCM WAV from its header. */
export function wavSeconds(buf) {
  if (buf.toString('latin1', 0, 4) !== 'RIFF') throw new Error('not a wav');
  let o = 12, rate = 0, block = 0;
  while (o + 8 <= buf.length) {
    const id = buf.toString('latin1', o, o + 4), size = buf.readUInt32LE(o + 4);
    if (id === 'fmt ') { rate = buf.readUInt32LE(o + 12); block = buf.readUInt16LE(o + 20); }
    if (id === 'data') { const n = Math.min(size, buf.length - o - 8); return n / (rate * block); }
    o += 8 + size + (size & 1);
  }
  throw new Error('wav without data');
}
export const estimate = (seconds) => ({ credits: Math.round(seconds / 60 * CREDITS_PER_MINUTE), usd: +(seconds / 60 * USD_PER_MINUTE).toFixed(3) });
export const keyFile = () => path.join(homedir(), '.config', 'elevenlabs', 'key');

/** The real send: multipart POST. Returns the mp3 bytes. The key never leaves this function except in the request header. */
export async function sendToElevenLabs({ wav, voice, model, removeNoise, key }) {
  const form = new FormData();
  form.append('audio', new Blob([wav], { type: 'audio/wav' }), 'take.wav');
  form.append('model_id', model);
  if (removeNoise) form.append('remove_background_noise', 'true');
  const res = await fetch(`${ENDPOINT}/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, { method: 'POST', headers: { 'xi-api-key': key }, body: form });
  if (!res.ok) throw new Error(`ElevenLabs answered ${res.status}: ${(await res.text()).slice(0, 300).replaceAll(key, '***')}`);
  return Buffer.from(await res.arrayBuffer());
}

/** The duration of an mp3 (or any audio file) with ffprobe. */
export function probeSeconds(file) {
  return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim());
}

/**
 * The whole job, with its effects given (so a test can swap them): `send` converts, `probe` measures a file, `log` prints, `readKey` gives the key.
 * Returns { items, seconds, cost, sent }.
 */
export async function run({ dir, ids, voice = DEFAULT_VOICE, model = DEFAULT_MODEL, removeNoise = false, yes = false, dryRun = false }, { send = sendToElevenLabs, probe = probeSeconds, log = console.log, readKey = () => readFileSync(keyFile(), 'utf8').trim() } = {}) {
  const all = readdirSync(dir).filter((f) => f.endsWith('.wav')).map((f) => f.slice(0, -4)).sort();
  const pick = ids === 'all' || !ids ? all : [ids];
  const items = pick.map((id) => {
    const file = path.join(dir, `${id}.wav`);
    if (!existsSync(file)) throw new Error(`no ${id}.wav in the folder`);
    return { id, file, wav: readFileSync(file), out: path.join(dir, `${id}.jonas.mp3`) };
  });
  if (!items.length) throw new Error('no .wav in the folder');
  for (const it of items) it.seconds = wavSeconds(it.wav);
  const seconds = items.reduce((s, i) => s + i.seconds, 0), cost = estimate(seconds);
  for (const it of items) log(`  ${it.id}: ${it.seconds.toFixed(2)} s`);
  log(`voice ${voice}, model ${model}: ${items.length} line(s), ${seconds.toFixed(1)} s in total`);
  log(`estimated cost: about ${cost.credits} credits (US$ ${cost.usd.toFixed(2)}), at ${CREDITS_PER_MINUTE} credits and US$ ${USD_PER_MINUTE}/minute; check the real price on your account`);
  if (dryRun) { log('dry run: nothing was sent'); return { items, seconds, cost, sent: false }; }
  if (!yes) { log('nothing was sent: this call is paid. Run again with --yes to convert.'); return { items, seconds, cost, sent: false }; }
  const key = readKey();
  for (const it of items) {
    const mp3 = await send({ wav: it.wav, voice, model, removeNoise, key });
    writeFileSync(it.out, mp3);
    const got = probe(it.out), diff = Math.abs(got - it.seconds);
    log(`  ${it.id}.jonas.mp3: ${got.toFixed(2)} s${diff > TOLERANCE ? `  WARNING: ${diff.toFixed(3)} s off from the input (more than ${TOLERANCE * 1000} ms): the face and the voice will not match` : ' (matches the input)'}`);
    it.outSeconds = got;
  }
  return { items, seconds, cost, sent: true };
}

const arg = (name, d = null) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir || dir.startsWith('--')) { console.error('usage: see the head of this file'); process.exit(2); }
  run({ dir, ids: arg('id', 'all'), voice: String(arg('voice', DEFAULT_VOICE)), model: String(arg('model', DEFAULT_MODEL)), removeNoise: !!arg('remove-noise'), yes: !!arg('yes'), dryRun: !!arg('dry-run') })
    .catch((e) => { console.error(`error: ${e.message}`); process.exit(1); });
}
