// R9, night 17: Dona Cida left her bag on the counter. Inside, a photograph of the station in 1998: an attendant with his back turned and the sign lit behind.
// Look at the bag, then choose: keep it to give back (she says what she knows on her next visit, week 4), keep the photo (it changes places on the following nights,
// branches/r9-foto.js) or hand it to the manager (he keeps it in the cupboard). The photograph never shows a face and no date.
import { makeThing, examinable } from './common.js';
import { bagProp, BAG_AT } from './r9-guardada.js';

const SEEN = 'cida:cida-bolsa';
export const can = ({ progression, customers, narrative }) => progression.st.recurringSeen.includes(SEEN) && !customers.list.some((c) => c.rec?.id === 'cida') && !narrative.ringing;
export function run(ctx) {
  const { render, kit, ui, branches, bus, time } = ctx;
  const bag = makeThing(render, 'bolsa');
  bag.position.set(BAG_AT[0], BAG_AT[1], BAG_AT[2]); bag.rotation.y = 0.35; bag.visible = true;
  const at = kit.v3(BAG_AT[0], BAG_AT[1] + 0.12, BAG_AT[2]);
  let st = 'there', t = 0, tid = null, after = 0;
  async function look() {
    st = 'talking';
    bus.emit('sfx', 'sacola', {});
    await ui.dialogue('Heitor', ['(A bolsa da Dona Cida. Ela saiu sem ela.)', '(Dentro, uma foto: o posto, alguns anos atrás. A placa acesa e um frentista de costas.)', '(Não dá para ver o rosto de ninguém.)'], 17, { self: true });
    const k = await branches.offer('r9');
    if (k === 'devolver' || k === 'ficar') {
      branches.keep(bagProp(ctx), 'branches/r9-guardada.js');
      await ui.dialogue('Heitor', [k === 'ficar' ? '(Fico com a foto. A bolsa espera por ela no balcão.)' : '(Guardo tudo como está. Ela volta, e eu devolvo.)'], 17, { self: true });
    } else await ui.dialogue('Heitor', ['(Deixo na mesa do escritório, com um bilhete para o Seu Amaro.)'], 17, { self: true });
    bag.visible = false; st = 'done'; after = 0;
  }
  tid = examinable(ctx, 'bolsa-r9', at, { text: 'Ver a bolsa esquecida', tap: () => look(), enabled: () => st === 'there' });
  ui.toast('Dona Cida esqueceu a bolsa no balcão.');
  return {
    get info() { return { st, t }; },
    update(dt) { t += dt; if (st === 'done') { after += dt; return after > 0.3; } return time.minutes > 350; },
    dispose() { if (tid) ctx.interaction.unregister(tid); render.scene.remove(bag); },
  };
}
