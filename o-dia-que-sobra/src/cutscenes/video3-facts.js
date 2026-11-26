// The facts of the reels of the third video (video3.js) that need no 3D: who the entity is, the float of the drawer and the closing of the till.
// Kept apart so that tools/video3-check.mjs can run them in Node.
import { createCash } from '../systems/cash.js';
import { mulberry32 } from '../rng.js';

/** The entity of the shop of these reels (see the head of the file). */
export const ENT = { seed: 78, kind: 'walk', week: 1, night: 2, level: 0, tells: ['cam-ausente', 'sino-mudo'], bill: 5000, spec: { categoria: 'comum', roupa: 'civil' } };
/** What `cam-ausente` does in the monitor at week 1, level 0: `clear` = 1 - sutileza, and sutileza of week 1 is 0 (data/entidades.pt-BR.json). */
export const HIDE = 1;
/** The float of the drawer (data/items.json, "fundo"); tools/video3-check.mjs compares it with the file. */
export const FUNDO = { 5000: 2, 2000: 10, 1000: 10, 500: 10, 200: 15, 100: 30, 50: 20, 25: 20, 10: 25, 5: 20, 1: 40 };

/** Where a refused entity stops outside the glass (customers.js, `c.gazeAt`: x from the seed, z = 1.6). */
export const GAZE_AT = [Math.round((5 + mulberry32(ENT.seed * 11 + 1)() * 8) * 10) / 10, 1.6];

// The night's till, with the game's own CashSystem: four sales, the last one the entity's.
export function closing() {
  const cash = createCash({ emit() {} }, { items: { fundo: FUNDO } });
  cash.open();
  const sale = (price, bill, change) => { cash.receive(bill); cash.give(change); cash.ring(price); };
  sale(1250, 2000, [500, 200, 50]);              // R$ 12,50 paid with R$ 20: R$ 7,50 back
  sale(2590, 5000, [2000, 200, 200, 10]);        // R$ 25,90 paid with R$ 50: R$ 24,10 back
  sale(830, 1000, [100, 50, 10, 10]);            // R$ 8,30 paid with R$ 10: R$ 1,70 back
  const price = 1850;                            // the entity's: R$ 18,50 with a R$ 50 note, R$ 31,50 back
  cash.receive(ENT.bill); cash.give([2000, 1000, 100, 50]); cash.ring(price);
  cash.vanish([ENT.bill]);                       // its payment is not money: it leaves the drawer after the change
  const rep = cash.report(), res = cash.close(cash.real());
  return { fundo: rep.fundo, vendas: rep.vendas, expected: res.expected, declared: res.declared, real: res.real, divergence: res.divergence, gap: res.drawerGap };
}

