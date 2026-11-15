// R1, week 3 (night 14): Rafael, who was paid back, rings the office phone before the canopy goes out: "do not stay in the yard tonight".
// Answered, it sets `r1:avisou` and the night of the dark canopy is easier (events/apagao-cobertura.js reads the flag). Missed, nothing.
export function run({ narrative, ui, bus, branches, time }) {
  let st = 'ring', t = 0, tried = false;
  return {
    update(dt) {
      t += dt;
      if (st === 'ring') {
        if (!tried && t > 1) {
          const ok = narrative.ringExtra(26, async () => {
            await ui.dialogue('Rafael', ['Patrão, é o Rafael. Não desliga.', 'Hoje não fica no pátio. Fica na loja, com a porta fechada.', 'Não pergunta. Eu também não gosto de saber.'], 17);
            branches.event('r1', 'avisou');
            bus.emit('sfx', 'telefone_desliga', {});
            st = 'done'; t = 0;
          }, () => { st = 'done'; t = 0; });
          if (ok) tried = true; else if (t > 60 || time.minutes > 125) return true;
        }
        return false;
      }
      return st === 'done' && t > 0.5;
    },
  };
}
export const can = ({ narrative }) => narrative.phase === 'free' && !narrative.ringing && !narrative.extraRinging;
