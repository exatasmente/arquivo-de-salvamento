// Vault: the secrets of the game that live in the public code without being readable in it.
//  - Typed codes are never stored: only a PBKDF2-SHA-256 hash (200 000 iterations, a salt per kind) of the normalised text.
//  - Text that has to be in the code (the screens of the old account, the words of the man of 03:33) is sealed with AES-GCM.
//    The first is sealed with a key derived from the very phrase that opens the account (so reading the code is not enough:
//    the phrase is the key); the second with a key derived from a fixed text in this file, which anyone who reads the code can
//    derive: it is not clear text, but it is not a lock either. The prize is the story, and the secret is for who plays.
// The answers are in kb/games/o-dia-que-sobra.md of the Breu, never in this repository.
const SALT_H = 'o-dia-que-sobra/vault/hash/v1:', SALT_K = 'o-dia-que-sobra/vault/key/v1:';
const HASH = {
  senha: '8aee007c4ba79c25fc85eea4ec0f0d95953810394e1841949bed0cfa9ade6ccf',
  data: ['f7bf8ac86555366f78f299cf80eb43fda4ad76eb578e8e478159932908b86583', '5753a1957bda082f30373c789cb102288a39e300717493e0aa036a83a874d4e2'],
};
const SEALED = {
  s1: 'X+ajTj77VzxGN20lRr73ki5tV71BMxOqG6eGtuui5zxhXARN8+XDQkdMCVyCpEDuHbG83lJzATB9cxWhuxWbmCGUl09LeK4cLvFQhXoawjB0KWOsTaI0NGMfSe1HEZXcvwhqTyUg2ucmF63N9IoZet1VpiKdeSTEPFmUUUVgmTjIe+61KNGap/As7ydZ2JT9SWm2x4uhjKk80yyoBuBACI5j3Nkgi1Mw4iTaAkEG+FXpCxOK0323XnBr8frlZddrsPz/rc21CmMR+bBu942QwSCqc9DjdMmOBFlvgn6ME6ESJsTtNSORT3HCf15D2ZMZF9ImN33G2Yxl2sIHqwX1u0xO6xZngg8Lr2dvEjRK/yphYwCUz0hLLHBRxvigdmPkSyiT8smpY4flkB5WpRD2/8eRbmMaQqZtRRed+NRT0bmDNCaEhCcrm2nUur5dVoZb+6MgEcXJEngUrhbush8IbnAaCStAEezJHycTqzwDjoktBHfIzmDTp/Q5LPRv6GNwpk8UrDAdyph5D6BIn0trUOaa1H7h/5Q0NsA38Q++uZMSxdDB3lHjTO9E26ZG7JX3NCu7mK9uXLNj2XWfw288QYo61HFDdrjPOYLH3RBqWWTN+bjzDR1GI7a8nzYPit85dXKzehdLw1zc861TZ+IIdGBOOG1oGkC7OO2iloX0jG8Wmlv8Psw0mGdvVzkjP1C1E8mZmXH6mNCoa0rYAkqrk0FcCaORGX1fnBIWZGHgqrIjQPj62mNVQ6mHs6Vj9AuSttp6V9OigCTG1dTSPY/quFjxdhJOKFmwIhBgrrNzy96V66loueNiadVeTfu84c+vh3lGR9BhvlbM0ICkxBnwrTwEkLTltcgRiZc/ebl0vITu/IQhb3BljX+BC7+R1Fs4/FpIb+Nkksw8gjcApOlx32Ds40so1KMIc7XIY4w0jiRifQIVcQR8NBqmyflGuFR93koRfQT3xpKg7qy0GX4cf3zESV66FUBjJ1rMtodvEpZZXXAB3QwZzxkcESoIK44cTgLdv/wRKhOqhaUxroRy4TRKcNAz/VZv0/GXmqDFGKxSfyWxKYNsqZB24xcvmxmCCS7F5AY2EoWXqpdX0OWvMTcSqqhVwXi/40Ebnahjd7/lgMiZfSb3Chy3u2fwmPIs79N877U5XcjXzJ29V5SZBYcz9WMCq4QxMlsMxn+agGzVqH4=',
  s4: '7RCak+5sRkUCO2ywZQBmX7nXnKMdKZ+42NQ2dNOM0CvKGkbM3StyTJ3KmW8ym90O5Q9UW+8AHiCt4TGjmOD4g8r7yCXRhzOZtY6nB9Vve1uoZayLpWvxnKSHUecpHQ9Nq6XmyvyvmdEeZMfBcssCe+GvIXQj9w==',
};
const S4_SEED = 'posto-bom-dia/café/três-noites';

/** Capitals, no accents, a single space between words. */
export function normalize(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const subtle = () => (globalThis.crypto && globalThis.crypto.subtle) || null;

async function pbkdf2(text, salt, iterations) {
  const key = await subtle().importKey('raw', enc.encode(text), 'PBKDF2', false, ['deriveBits']);
  return subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations }, key, 256);
}
/** kind: a key of HASH. Resolves to true when the text is the right one. */
export async function check(kind, text) {
  const t = normalize(text);
  if (!t || !HASH[kind] || !subtle()) return false;
  const h = hex(await pbkdf2(t, SALT_H + kind, 200000));
  return [].concat(HASH[kind]).includes(h);
}
async function unseal(blob, text, salt, iterations) {
  const bits = await pbkdf2(text, salt, iterations);
  const key = await subtle().importKey('raw', bits, 'AES-GCM', false, ['decrypt']);
  const raw = unb64(blob);
  const plain = await subtle().decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, key, raw.slice(12));
  return JSON.parse(new TextDecoder().decode(plain));
}
/** The screens of the old account (report and schedule), opened with the phrase itself. Resolves to { relatorio, escala } or null. */
export async function openAccount(text) {
  try { return subtle() ? await unseal(SEALED.s1, normalize(text), SALT_K + 's1', 200000) : null; } catch { return null; }
}
/** What the man of 03:33 says on the third night of coffee: { data, carro } (null when the crypto is not there). */
let s4 = null;
export async function openCoffee() {
  if (s4) return s4;
  try { s4 = subtle() ? await unseal(SEALED.s4, S4_SEED, SALT_K + 's4', 50000) : null; } catch { s4 = null; }
  return s4;
}
