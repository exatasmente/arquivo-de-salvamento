// Secret codes are never stored: only a PBKDF2-SHA-256 hash (200 000 iterations, a fixed salt per
// kind) of the normalised text. This first version of the game has no secret yet, so the table is
// empty and `check` never accepts anything; the hashes of the later secrets go in HASH.
const SALT = 'o-dia-que-sobra/arquivo-de-salvamento/v1:';
const ITER = 200000;
const HASH = {};

/** Capitals, no accents, a single space between words. */
export function normalize(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** kind: a key of HASH. Resolves to true when the text is the right one. */
export async function check(kind, text) {
  const t = normalize(text);
  if (!t || !HASH[kind] || !globalThis.crypto || !crypto.subtle) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(t), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(SALT + kind), iterations: ITER }, key, 256);
  return hex(bits) === HASH[kind];
}
