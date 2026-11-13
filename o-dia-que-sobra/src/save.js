// The memory card: 15 blocks in localStorage, the same card the channel uses in every game.
// Block 1 is the run (night, money, what was seen), blocks 2 to 8 the finished nights, block 9 the
// record. Block 11 shows the other game's block when its card is in this browser (read only: this
// file never writes the other key). Block 13 is corrupted: it shows a broken icon and nothing readable.
export const KEY = 'o-dia-que-sobra.card.v1';
export const RINHA_KEY = 'rinha.card.v1';
export const BLOCKS = 15;
export const CORRUPT_BLOCK = 13;
export const RINHA_BLOCK = 11;

const empty = () => ({ v: 1, run: null, nights: {}, record: { best: 0, nights: 0 }, secrets: [], meta: { intro: false } });

/** What the other game left in this browser, or null. Read only. */
export function readRinha(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  try {
    const raw = storage && storage.getItem(RINHA_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || d.v !== 1) return null;
    return { fights: Object.keys(d.fights || {}).length, best: d.record?.best ?? 0, wins: d.record?.wins ?? 0, secrets: (d.secrets || []).length, campaign: Boolean(d.campaign) };
  } catch { return null; }
}

export function createCard(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  let data = empty();
  function read() {
    try {
      const raw = storage && storage.getItem(KEY);
      if (!raw) return (data = empty());
      const d = JSON.parse(raw);
      data = d && d.v === 1 ? { ...empty(), ...d } : empty();
    } catch { data = empty(); }
    return data;
  }
  function write() { try { storage && storage.setItem(KEY, JSON.stringify(data)); return true; } catch { return false; } }
  read();

  return {
    get data() { return data; },
    reload: read,
    hasRun() { return Boolean(data.run); },
    /** Saves the run state and, when a finished night is given, its record. */
    save(run, night) {
      data.run = { ...run };
      if (night) {
        data.nights[night.day] = { ...night };
        data.record.nights = Math.max(data.record.nights, Object.keys(data.nights).length);
        data.record.best = Math.max(data.record.best, night.points);
      }
      return write();
    },
    wipeRun() { data.run = null; data.nights = {}; return write(); },
    get introSeen() { return Boolean(data.meta && data.meta.intro); },
    setIntroSeen() { data.meta = { ...(data.meta || {}), intro: true }; write(); },
    hasSecret(id) { return data.secrets.includes(id); },
    addSecret(id) { if (!data.secrets.includes(id)) { data.secrets.push(id); write(); return true; } return false; },
    /** What each of the 15 blocks holds, for the card screen. */
    blocks() {
      const out = Array.from({ length: BLOCKS }, (_, i) => ({ n: i + 1, kind: 'empty' }));
      if (data.run) out[0] = { n: 1, kind: 'run', ...data.run };
      for (let d = 1; d <= 7; d++) if (data.nights[d]) out[d] = { n: d + 1, kind: 'night', ...data.nights[d] };
      if (data.record.nights > 0 || data.secrets.length) out[8] = { n: 9, kind: 'record', best: data.record.best, nights: data.record.nights, secrets: data.secrets.length };
      const rinha = readRinha(storage);
      if (rinha) out[RINHA_BLOCK - 1] = { n: RINHA_BLOCK, kind: 'rinha', ...rinha };
      out[CORRUPT_BLOCK - 1] = { n: CORRUPT_BLOCK, kind: 'corrupt' };
      return out;
    },
  };
}
