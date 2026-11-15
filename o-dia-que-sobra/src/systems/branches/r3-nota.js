// R3, night 4: a forged note of R$ 20 came in with the change of somebody's payment. Heitor finds it in the drawer and takes it out, but the sale stays
// on the register's report: when the till is closed the drawer is R$ 20 short, and the choice (put it back, register it, adjust the count) is made there
// (systems/branches.js, `cashGap`, asked by shift.js). Nothing is shown as a number until then.
export function run({ cash, ui, progression, bus }) {
  cash.ring(2000);   // the sale was rung with the forged note as the payment; the note is out of the drawer, so the real money is not there
  progression.flag('r3:nota');
  let started = false, finished = false;
  return {
    update() {
      if (!started) {
        started = true;
        bus.emit('sfx', 'gaveta_abre', {});
        ui.dialogue('Heitor', ['(Uma nota de vinte na gaveta. Lisa demais, a marca d\'água não aparece.)', '(É falsa. Entrou na troca de alguém. Eu a tiro daqui.)'], 41).then(() => { finished = true; });
      }
      return finished;
    },
  };
}
/** the till is open. Checked before it begins; if it fails the script waits for another moment. */
export const can = ({ cash, progression }) => cash.opened && !cash.closed && !progression.hasFlag('r3:nota');
