// Checks the conditions of the reels of the third video (src/cutscenes/video3.js, facts in video3-facts.js), in Node, with the game's own code:
//   1. the seed of the entity gives, in week 1 at level 0, exactly the two tells the video shows (`cam-ausente`, `sino-mudo`) through the real `tellsFor`;
//   2. the till of the closing (the game's CashSystem, the entity's note taken out by `vanish`) closes short by exactly the note, "faltou";
//   3. the float written in the reel is the one of data/items.json.
// Run: node tools/video3-check.mjs
import fs from 'node:fs';
import { createNonexistent } from '../src/systems/nonexistent.js';
import { ENT, FUNDO, closing } from '../src/cutscenes/video3-facts.js';
import { money } from '../src/util.js';

const read = (f) => JSON.parse(fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8'));
const fail = (m) => { console.error('FAIL', m); process.exitCode = 1; };
const entidades = read('data/entidades.pt-BR.json'), items = read('data/items.json');

const progression = { st: { week: ENT.week, day: ENT.night, tutorialDone: true, ent: { known: [] } }, ties: { sol: 0 }, calendar: () => ({ noite: ENT.night }), complaint() {} };
const nx = createNonexistent({ on() {}, emit() {} }, { data: { entidades }, progression, time: { parse: () => 0, minutes: 0 }, ui: {} });
const tells = nx.tellsFor({ seed: ENT.seed, kind: ENT.kind, human: {} }, ENT.level);
if (tells.length !== ENT.tells.length || !ENT.tells.every((t) => tells.includes(t))) fail(`tells of seed ${ENT.seed}: ${tells.join(',')} (want ${ENT.tells.join(',')})`);
if (ENT.night === 4) fail('the entity must not be on night 4 (the false-note branch also closes R$ 50 short)');
if (nx.clear(ENT.level) !== 1) fail(`clear(${ENT.level}) is ${nx.clear(ENT.level)}, the reel assumes cam-ausente hides the entity all the time`);

const c = closing();
if (c.divergence !== ENT.bill || c.gap >= 0) fail(`closing: divergence ${money(c.divergence)} (gap ${c.gap}), the note is ${money(ENT.bill)}`);
for (const d of Object.keys(items.fundo)) if ((FUNDO[d] || 0) !== items.fundo[d]) fail(`float ${d}: ${FUNDO[d]} in the reel, ${items.fundo[d]} in data/items.json`);
for (const d of Object.keys(FUNDO)) if (!(d in items.fundo)) fail(`float ${d} is not in data/items.json`);
if (!process.exitCode) console.log(`ok: seed ${ENT.seed} gives ${tells.join(' + ')}; the drawer closes ${money(c.divergence)} short, the note is ${money(ENT.bill)}`);

// 4. ent-fora: the refused entity of the game stands outside the glass for `olhar` seconds (data/entidades.pt-BR.json), longer than the view that shows it,
//    and `GAZE_AT` is the point customers.js gives it (x from the seed, z 1.6), in front of the shop window (x 10.8 to 15.2 of the wall at z 3) or beside it.
{
  const { GAZE_AT } = await import('../src/cutscenes/video3-facts.js');
  const dur = Number(/\(([\d.]+) s\)$/.exec(read('src/film-manifest.json').views['video3.ent-fora'] || '')?.[1]);   // the manifest repeats the duration of the view
  const olhar = entidades.recusa?.entidade?.olhar;
  if (!olhar) fail('data/entidades.pt-BR.json has no recusa.entidade.olhar');
  else if (!dur) fail('video3.ent-fora has no duration in src/film-manifest.json');
  else if (olhar[0] < dur) fail(`the view ent-fora (${dur} s) is longer than the shortest gaze of the game (${olhar[0]} s)`);
  if (!(GAZE_AT[0] >= 5 && GAZE_AT[0] <= 13 && GAZE_AT[1] === 1.6)) fail(`gaze point ${GAZE_AT} is not one of customers.js`);
  if (!process.exitCode) console.log(`ok: ent-fora stands at ${GAZE_AT.join(', ')}, the game keeps it there for ${olhar?.join(' to ')} s`);
}
