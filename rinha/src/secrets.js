// Secret codes are never stored: only a PBKDF2-SHA-256 hash (200 000 iterations, a fixed salt
// per kind) of the normalised text. Reading this file does not give the answers, and trying
// them one by one is slow. The tally on the cell wall is the clue for the number, so its
// counts have to be in the code: they are kept as a small sum instead of a literal.
const SALT = 'rinha/arquivo-de-salvamento/v1:';
const ITER = 200000;
const HASH = {
  phrase: '302fc2d279d01d65c1b12d286188ed598dae27b1419c2147a907c85d9bd6a82e',
  code: 'bdde78224295e4b32808d456d0230e72cbee7276189ae4541ac56820d19f02d6',
};

/** Capitals, no accents, a single space between words. */
export function normalize(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** kind: 'phrase' or 'code'. Resolves to true when the text is the right one. */
export async function check(kind, text) {
  const t = normalize(text);
  if (!t || !globalThis.crypto || !crypto.subtle) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(t), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(SALT + kind), iterations: ITER }, key, 256);
  return hex(bits) === HASH[kind];
}

// the six tally groups on the wall, left to right
const K = [162, 92, 152, 223, 160, 166];
export const tallyGroups = () => K.map((k, i) => (k - i * 3 - 5 + 100) % 10);
