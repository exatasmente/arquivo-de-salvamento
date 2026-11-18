// What is typed is checked by PBKDF2-SHA-256 (crypto.subtle, 200 000 iterations, a fixed salt per kind), never compared with a clear text:
// the answers live only in the design file, outside this repository. `normalize` makes the typed text comparable (upper case, no accents,
// one space between words). The same scheme as the sibling games' secrets module.
export const ITERATIONS = 200000;

export const normalize = (text) => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** The hash a secret is kept as: PBKDF2-SHA-256 of the normalized text, salted by `salt` (a fixed string per kind). */
export async function hashOf(salt, text) {
  const t = normalize(text);
  const subtle = globalThis.crypto?.subtle;
  if (!t || !subtle) return '';
  const enc = new TextEncoder();
  const key = await subtle.importKey('raw', enc.encode(t), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: ITERATIONS }, key, 256);
  return hex(bits);
}
/** Whether `typed` is one of the answers of `secret` ({ salt, hashes: [...] }). */
export async function check(secret, typed) {
  const h = await hashOf(secret.salt, typed);
  return h !== '' && secret.hashes.includes(h);
}
