// Generates the game's recorded sound effects with ElevenLabs Sound Effects (docs: POST /v1/sound-generation), from prompts.json.
//   node tools/sfx/generate.mjs --out <raw folder> [--only id,id] [--budget 9000] [--force]
// The key is read here and nowhere else: from ELEVENLABS_API_KEY or ~/.config/elevenlabs/key. It is never printed or written.
// A sound already in the folder is not asked again (unless --force); the credits asked for (40 per second) are tallied in <out>/ledger.json,
// and the run stops before passing the budget.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? d : process.argv[i + 1]; };
const out = arg('out'); if (!out) { console.error('usage: --out <folder> [--only a,b] [--budget N] [--force]'); process.exit(2); }
const budget = Number(arg('budget', 9000)), only = arg('only')?.split(','), force = process.argv.includes('--force');
const P = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'prompts.json'), 'utf8'));
const key = (process.env.ELEVENLABS_API_KEY || (existsSync(`${homedir()}/.config/elevenlabs/key`) ? readFileSync(`${homedir()}/.config/elevenlabs/key`, 'utf8') : '')).trim();
if (!key) { console.error('no ElevenLabs key found'); process.exit(2); }
mkdirSync(out, { recursive: true });
const ledgerFile = path.join(out, 'ledger.json');
const ledger = existsSync(ledgerFile) ? JSON.parse(readFileSync(ledgerFile, 'utf8')) : { credits: 0, runs: [] };
for (const s of P.sounds) {
  if (only && !only.includes(s.id)) continue;
  const file = path.join(out, `${s.id}.mp3`);
  if (existsSync(file) && !force) { console.log(`have ${s.id}`); continue; }
  const cost = Math.round(s.dur * 40);
  if (ledger.credits + cost > budget) { console.log(`STOP: ${s.id} would pass the budget (${ledger.credits} + ${cost} > ${budget})`); break; }
  const body = { text: s.text, model_id: P.model, duration_seconds: s.dur, prompt_influence: s.influence, ...(s.loop ? { loop: true } : {}) };
  const res = await fetch(`https://api.elevenlabs.io/v1/sound-generation?output_format=${P.output_format}`, { method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) { console.log(`FAIL ${s.id}: ${res.status} ${(await res.text()).slice(0, 300).replace(key, '')}`); break; }
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  ledger.credits += cost; ledger.runs.push({ id: s.id, dur: s.dur, cost });
  writeFileSync(ledgerFile, JSON.stringify(ledger, null, 1));
  console.log(`ok ${s.id} (${s.dur}s, ${cost} credits; tally ${ledger.credits})`);
}
