// Cell items: price, uses and what each does in a fight.
export const ITEMS = {
  taser: { label: 'TASER', price: 150, uses: 3, text: 'ATORDOA 2 S' },
  spray: { label: 'SPRAY', price: 120, uses: 2, text: 'ERRA MAIS, 4 S' },
  bandage: { label: 'BANDAGEM', price: 80, uses: 1, text: '+30 EQ, 1,5 S SEM GUARDA' },
};
export const ITEM_ORDER = ['taser', 'spray', 'bandage'];

/** The first item the player has, from the active one on, or null. */
export function owned(inv) { return ITEM_ORDER.filter((k) => (inv[k] ?? 0) > 0); }
export function cycle(inv, active, dir) {
  const list = owned(inv);
  if (!list.length) return null;
  if (list.includes(active)) return list[(list.indexOf(active) + dir + list.length) % list.length];
  // the active one ran out: the next owned item in the shop order after it
  const at = Math.max(0, ITEM_ORDER.indexOf(active));
  for (let i = 1; i <= ITEM_ORDER.length; i++) { const k = ITEM_ORDER[(at + (dir > 0 ? i : -i) + ITEM_ORDER.length * 2) % ITEM_ORDER.length]; if (list.includes(k)) return k; }
  return list[0];
}
