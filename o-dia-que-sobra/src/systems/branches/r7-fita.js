// R7, night 12: an old VHS tape lies in front of the security monitor, on the counter beside the register, labelled by hand ("NÃO APAGAR"). Look at it, then choose:
//   see it   the picture (branches/tape.js: the station, the attendant from behind, the sign, a month and a year in the corner, never a day), -15 sanity,
//            and the man of 03:33 says other things afterwards (a flag, `r7:viu`, read by data/recurring.pt-BR.json) with one more hint for whoever asks him again;
//   erase it the manager asked for secrecy (trust up, the Sun's attention down);
//   keep it  it goes in the drawer, and on the next nights it is back on the monitor, alone, rewound (r7-fita-volta.js).
// The tape never writes a date or any answer: the story is only in what it shows.
import { makeThing, examinable, unseen } from './common.js';
import { showTape } from './tape.js';

export const TAPE_AT = [15.4, 1.0, 8.62];      // on the counter, to the right of the monitor
export const can = ({ narrative }) => !narrative.ringing;
export function run(ctx) {
  const { render, kit, ui, branches, bus, time } = ctx;
  const tape = makeThing(render, 'fita');
  tape.position.set(TAPE_AT[0], TAPE_AT[1], TAPE_AT[2]); tape.rotation.y = 0.3;   // (it is laid down when the player is not looking)
  const at = kit.v3(TAPE_AT[0], TAPE_AT[1] + 0.05, TAPE_AT[2]);
  let st = 'hidden', t = 0, tid = null, after = 0;
  async function look() {
    st = 'talking';
    bus.emit('sfx', 'cracha_pega', {});
    await ui.dialogue('Heitor', ['(Uma fita VHS. Na etiqueta, à mão: "NÃO APAGAR".)', '(O gravador do monitor ainda aceita fita. Alguém a deixou aqui na frente.)'], 12, { self: true });
    const k = await branches.offer('r7');
    if (k === 'ver') {
      bus.emit('sfx', 'secretaria_inicio', {});
      const off = showTape(12);
      bus.emit('sfx', 'estatica_camera', { opts: { dur: 5, gain: 0.5 } });
      await ui.dialogue('Heitor', ['(Chiado. O posto, ao entardecer. A placa do Sol acesa.)', '(Um frentista na bomba 4, de costas. Parado. Não vira.)', '(No canto da imagem, só o mês e o ano. A fita acaba no meio do movimento.)'], 12, { self: true });
      off();
    } else if (k === 'apagar') {
      bus.emit('sfx', 'secretaria_fita', { opts: { dur: 3 } });
      await ui.dialogue('Heitor', ['(Gravo por cima, sem ver. Chiado, só.)', '(O gerente pediu para isso não circular. Pelo menos nisso eu obedeço.)'], 12, { self: true });
    } else await ui.dialogue('Heitor', ['(Guardo na gaveta de baixo do balcão. Não é hoje.)'], 12, { self: true });
    tape.visible = false; st = 'done'; after = 0;
  }
  tid = examinable(ctx, 'fita-r7', at, { text: 'Ver a fita', tap: () => look(), enabled: () => st === 'there', r: 0.3 });
  return {
    get info() { return { st, t }; },
    update(dt) { t += dt; if (st === 'hidden' && unseen(kit, at, t)) { st = 'there'; tape.visible = true; } if (st === 'done') { after += dt; return after > 0.3; } return time.minutes > 350; },
    dispose() { if (tid) ctx.interaction.unregister(tid); render.scene.remove(tape); },
  };
}
