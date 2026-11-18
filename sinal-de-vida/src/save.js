// The memory card is the engine's (vendor/engine/save.js); what this game keeps in it and where it shows (docs: kb design, "Cartão de memória").
//   block 1      the game in progress, saved at the start of every scene (the point a death returns to)
//   blocks 2-4   the nights, each with the summary of its decisions and the state it began in (to start again from that night)
//   blocks 11-12 Rinha and O Dia que Sobra, read (never written) from the same browser
//   block 13     the channel's block; broken until the secret ending
//   block 15     the secrets and the endings seen
import { openCard, readCard, BLOCKS, CORRUPT_BLOCK } from '../vendor/engine/save.js';
import { RUN_VERSION } from './systems/run.js';

export const KEY = 'sinal-de-vida.card.v2';
export const OTHERS = { rinha: 'rinha.card.v1', dia: 'o-dia-que-sobra.card.v1' };
export { BLOCKS, CORRUPT_BLOCK };
export const NIGHT_BLOCKS = { 'noite-1': 2, 'noite-2': 3, 'noite-3': 4 };

const empty = () => ({ v: 1, run: null, nights: {}, secrets: [], endings: [], meta: { intro: false, opts: {} } });

export function createCard(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  const card = openCard({ key: KEY, empty, storage });
  return {
    get data() { return card.data; },
    reload: card.read,
    hasRun() { return Boolean(card.data.run && card.data.run.v === RUN_VERSION); },
    clearRun() { card.data.run = null; return card.write(); },
    setMeta(m) { card.data.meta = { ...card.data.meta, ...m }; return card.write(); },
    save(run) { card.data.run = JSON.parse(JSON.stringify(run)); return card.write(); },
    /** The state a night began in (to start again from it) and, when it ends, the summary of its decisions. */
    nightStart(id, run) { card.data.nights[id] = { ...(card.data.nights[id] ?? {}), start: JSON.parse(JSON.stringify(run)), done: card.data.nights[id]?.done ?? false }; return card.write(); },
    nightDone(id, summary) { card.data.nights[id] = { ...(card.data.nights[id] ?? {}), done: true, summary }; return card.write(); },
    get introSeen() { return card.introSeen; },
    setIntroSeen: card.setIntroSeen,
    hasSecret: card.hasSecret,
    addSecret: card.addSecret,
    addEnding(id) { if (!card.data.endings.includes(id)) { card.data.endings.push(id); card.write(); return true; } return false; },
    /** What each of the 15 blocks holds, for the card screen. */
    blocks() {
      const out = card.emptyBlocks(), d = card.data;
      if (d.run && d.run.v === RUN_VERSION) out[0] = { n: 1, kind: 'run', ...d.run };
      for (const [id, n] of Object.entries(NIGHT_BLOCKS)) { const b = d.nights[id]; if (b) out[n - 1] = { n, kind: 'night', id, ...b }; }
      const rin = readCard(OTHERS.rinha), dia = readCard(OTHERS.dia);
      if (rin) out[10] = { n: 11, kind: 'other', game: 'Rinha', fights: Object.keys(rin.fights || {}).length, secrets: (rin.secrets || []).length };
      if (dia) out[11] = { n: 12, kind: 'other', game: 'O Dia que Sobra', nights: Object.keys(dia.nights || {}).length, secrets: (dia.secrets || []).length };
      out[CORRUPT_BLOCK - 1] = d.endings.includes('linha') ? { n: CORRUPT_BLOCK, kind: 'channel' } : { n: CORRUPT_BLOCK, kind: 'corrupt' };
      if (d.secrets.length || d.endings.length) out[14] = { n: 15, kind: 'secrets', secrets: [...d.secrets], endings: [...d.endings] };
      return out;
    },
  };
}
