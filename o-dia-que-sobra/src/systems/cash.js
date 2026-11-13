// CashSystem: the till. The drawer holds notes and coins by value; what a customer pays goes in,
// what the player hands back as change comes out of it. At the start of the night the player opens it
// (the float is counted); at 06:00 the player counts it against the register's report. The report
// is float + everything the register rang up; the drawer is what is really in it, so a wrong change,
// a torn note taken in, or a miscount all show up as a divergence.
export const DENOMS = [10000, 5000, 2000, 1000, 500, 200, 100, 50, 25, 10, 5, 1];   // cents, largest first
export const NOTES = [200, 500, 1000, 2000, 5000, 10000];
export const COINS = [1, 5, 10, 25, 50, 100];

export function createCash(bus, { items }) {
  const stock = {};
  let float = 0, sales = 0, opened = false, torn = 0, closed = false, tornList = [];
  const sum = (s) => DENOMS.reduce((a, d) => a + d * (s[d] || 0), 0);
  function reset() {
    for (const d of DENOMS) stock[d] = Number(items.fundo[d] || 0);
    float = sum(stock); sales = 0; opened = false; torn = 0; closed = false; tornList = [];
  }
  reset();
  return {
    stock, reset, DENOMS,
    get opened() { return opened; }, get closed() { return closed; },
    get float() { return float; }, get sales() { return sales; }, get torn() { return torn; },
    open() { opened = true; bus.emit('cash:open', float); },
    /** A customer's payment goes into the drawer. torn: a note that cannot be banked. */
    receive(bill, isTorn = false) {
      stock[bill] = (stock[bill] || 0) + 1;
      if (isTorn) { torn += bill; tornList.push(bill); }
    },
    /** pieces: values handed back as change. The ones the drawer does not have are refused before this is called. */
    give(pieces) { for (const v of pieces) stock[v] = Math.max(0, (stock[v] || 0) - 1); },
    ring(cents) { sales += Math.round(cents); },
    have: (d) => stock[d] || 0,
    /** Real value of the drawer (a torn note is not money). */
    real: () => sum(stock) - torn,
    expected: () => float + sales,
    report() { return { fundo: float, vendas: sales, esperado: float + sales }; },
    /** Counts the drawer at 06:00. declared: cents the player says it holds. */
    close(declared) {
      closed = true;
      const real = sum(stock) - torn, expected = float + sales;
      return { declared, real, expected, divergence: Math.abs(real - expected), miscount: declared !== real, drawerGap: real - expected, torn };
    },
    snapshot() { return { ...stock }; },
    sum,
  };
}
