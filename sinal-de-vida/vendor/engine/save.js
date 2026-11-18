// The memory card every game of the channel saves on (docs/engine.md, "Save"): a versioned JSON under one
// key of the browser's storage, read without ever breaking (a missing, broken or older card is an empty one),
// written without ever throwing (a full or blocked storage returns false), shown as 15 blocks. What a game
// keeps in it, and which block shows what, stays the game's: it opens its card here and builds on it.
// A game can also read, never write, another game's card in the same browser (the next game's hook).

export const BLOCKS = 15;
/** The block every card shows as corrupted until a game says otherwise (the channel's running thread). */
export const CORRUPT_BLOCK = 13;
export const VERSION = 1;

const defaultStorage = () => (typeof localStorage !== 'undefined' ? localStorage : null);

/**
 * A game's card. empty() makes the empty card ({ v: 1, ...the game's fields, secrets: [], meta: {} });
 * a stored card of this version is laid over it (fields the game added later get their empty value).
 * Returns { data (live: read() replaces it), read(), write() → true when saved, introSeen, setIntroSeen(),
 * hasSecret(id), addSecret(id) → true when new, emptyBlocks() → the 15 blocks, all empty }.
 */
export function openCard({ key, empty, storage = defaultStorage() }) {
  if (typeof key !== 'string' || !key) throw new Error('a card needs its key');
  let data = empty();
  function read() {
    try {
      const raw = storage && storage.getItem(key);
      if (!raw) return (data = empty());
      const d = JSON.parse(raw);
      data = d && d.v === VERSION ? { ...empty(), ...d } : empty();
    } catch { data = empty(); }
    return data;
  }
  function write() { try { storage && storage.setItem(key, JSON.stringify(data)); return true; } catch { return false; } }
  read();
  return {
    get data() { return data; },
    read,
    write,
    get introSeen() { return Boolean(data.meta && data.meta.intro); },
    setIntroSeen() { data.meta = { ...(data.meta || {}), intro: true }; write(); },
    hasSecret(id) { return data.secrets.includes(id); },
    addSecret(id) { if (!data.secrets.includes(id)) { data.secrets.push(id); write(); return true; } return false; },
    emptyBlocks() { return Array.from({ length: BLOCKS }, (_, i) => ({ n: i + 1, kind: 'empty' })); },
  };
}

/** Another game's card in this browser, as it is stored (this version only), or null. Never writes. */
export function readCard(key, storage = defaultStorage()) {
  try {
    const raw = storage && storage.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d && d.v === VERSION ? d : null;
  } catch { return null; }
}
