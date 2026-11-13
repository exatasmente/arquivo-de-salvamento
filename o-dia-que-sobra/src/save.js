// The memory card is the engine's (vendor/engine/save.js); what this game keeps in it and where it shows.
// Block 1 is the run (night, money, what was seen), blocks 2 to 8 the finished nights, block 9 the record (and
// the endings seen, the secrets found). Block 11 shows the other game's block when its card is in this browser
// (read only: never written from here). Block 13 is corrupted: a broken icon and nothing readable, until the
// first ending ("O Dia que Sobra") has been seen: then it can be opened (the hook of the next game, in ui.js).
import { openCard, readCard, BLOCKS, CORRUPT_BLOCK } from '../vendor/engine/save.js';

export const KEY = 'o-dia-que-sobra.card.v1';
export const RINHA_KEY = 'rinha.card.v1';
export { BLOCKS, CORRUPT_BLOCK };
export const RINHA_BLOCK = 11;

const empty = () => ({ v: 1, run: null, nights: {}, record: { best: 0, nights: 0 }, secrets: [], endings: [], meta: { intro: false } });

/** What the other game left in this browser, or null. Read only. */
export function readRinha(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  const d = readCard(RINHA_KEY, storage);
  if (!d) return null;
  return { fights: Object.keys(d.fights || {}).length, best: d.record?.best ?? 0, wins: d.record?.wins ?? 0, secrets: (d.secrets || []).length, campaign: Boolean(d.campaign) };
}

export function createCard(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  const card = openCard({ key: KEY, empty, storage });
  return {
    get data() { return card.data; },
    reload: card.read,
    hasRun() { return Boolean(card.data.run); },
    /** Saves the run state and, when a finished night is given, its record. */
    save(run, night) {
      const data = card.data;
      data.run = { ...run };
      if (night) {
        data.nights[night.day] = { ...night };
        data.record.nights = Math.max(data.record.nights, Object.keys(data.nights).length);
        data.record.best = Math.max(data.record.best, night.points);
      }
      return card.write();
    },
    wipeRun() { card.data.run = null; card.data.nights = {}; return card.write(); },
    get introSeen() { return card.introSeen; },
    setIntroSeen: card.setIntroSeen,
    /** Endings seen (1..5), across every run: the card keeps them when a new game starts. */
    get endings() { return [...(card.data.endings || [])]; },
    hasEnding(id) { return (card.data.endings || []).includes(id); },
    addEnding(id) { const data = card.data; data.endings = data.endings || []; if (!data.endings.includes(id)) { data.endings.push(id); card.write(); return true; } return false; },
    hasSecret: card.hasSecret,
    addSecret: card.addSecret,
    /** What each of the 15 blocks holds, for the card screen. */
    blocks() {
      const data = card.data;
      const out = card.emptyBlocks();
      if (data.run) out[0] = { n: 1, kind: 'run', ...data.run };
      // the nights of the campaign (1..24) share the blocks 2 to 7: the latest night of each stretch of four
      for (let d = 1; d <= 24; d++) if (data.nights[d]) { const slot = Math.min(6, Math.floor((d - 1) / 4)) + 1; out[slot] = { n: slot + 1, kind: 'night', ...data.nights[d] }; }
      if (data.record.nights > 0 || data.secrets.length || (data.endings || []).length) out[8] = { n: 9, kind: 'record', best: data.record.best, nights: data.record.nights, secrets: data.secrets.length, endings: (data.endings || []).length };
      const rinha = readRinha(storage);
      if (rinha) out[RINHA_BLOCK - 1] = { n: RINHA_BLOCK, kind: 'rinha', ...rinha };
      out[CORRUPT_BLOCK - 1] = { n: CORRUPT_BLOCK, kind: 'corrupt' };
      return out;
    },
  };
}
