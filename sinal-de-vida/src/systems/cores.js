// The colours the broken dog of the avenue blinks (secret S3): eight, one after the other. The sequence is not written anywhere in the code:
// it comes out of a seeded generator over the five colours of the keyboard, so the repository holds a number and the hash of the answer
// (data/story/secrets.json), never the colours. The test checks that what the dog blinks is what the radio's keyboard accepts.
import { mulberry32 } from '../../vendor/engine/rng.js';
import { COLORS } from './radio.js';

const SEED = 32023, LENGTH = 8;
export const FLASH = { each: 0.75, gap: 1.6, cycles: 3 };       // 0.75 s a colour (6 s for the eight), a pause, and three times: then the battery is done

/** The eight colours the dog blinks, as ids of the keyboard ('azul', ...). */
export function flashColors() { const r = mulberry32(SEED); return Array.from({ length: LENGTH }, () => COLORS[Math.floor(r() * COLORS.length)].id); }

/** What the sensor of the broken dog shows `t` seconds after it started: { hex } of a colour, or null (dark). The battery fades over the cycles. Pure. */
export function flashAt(t) {
  const cycle = LENGTH * FLASH.each + FLASH.gap;
  if (t < 0 || t >= cycle * FLASH.cycles) return null;
  const k = Math.floor(t / cycle), u = t - k * cycle;
  if (u >= LENGTH * FLASH.each) return null;
  const i = Math.floor(u / FLASH.each), on = (u - i * FLASH.each) < FLASH.each * 0.8;       // a short dark between two colours, so two equal colours in a row read as two
  if (!on) return null;
  const id = flashColors()[i], hex = COLORS.find((c) => c.id === id).hex;
  return { id, hex, i, k, power: 1 - k * 0.28 };
}
