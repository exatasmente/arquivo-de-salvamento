// R6, night 10, for who let the woman of the party wait in the shop: she comes in from the door, stands by the shelves and stays an hour. While she is there the Sun
// does not come (`entity.truce`) and no scare event starts (the branch holds the events). She talks if she is talked to. After the hour she thanks Heitor and goes.
// Her boyfriend comes back at four (branches/r6-bebado.js).
import { buildCustomer } from '../../models/customer.js';

const DOOR = [9.0, 2.6], SPOT = [10.6, 5.9], STAY = 60;       // where she comes in, where she waits, minutes
export const can = ({ progression, narrative, customers }) => progression.hasFlag('r6:deixou') && !narrative.ringing && !customers.list.some((c) => c.kind === 'walk' && c.state !== 'leaving' && !c.noCounter);
export function run(ctx) {
  const { render, kit, ui, branches, bus, time, entity, interaction } = ctx;
  const h = buildCustomer(render, { categoria: 'comum', roupa: 'festa-ela', acessorios: ['bolsa'], look: { female: true, hair: '#3a2418', hairStyle: 'long', skin: '#d2a884', height: 1.66 } }, { seed: 93 });
  h.root.position.set(DOOR[0], 0, DOOR[1]); render.scene.add(h.root);
  const until = time.minutes + STAY;
  entity.truce(until + 2);
  const ctr = kit.v3(SPOT[0], 1.1, SPOT[1]);
  let st = 'in', t = 0, tid = null, talks = 0;
  const lines = [['Obrigada por deixar. Ele vai esfriar a cabeça lá fora.', 'Eu fico quietinha aqui, juro.'], ['Você é a primeira pessoa calma que eu vejo hoje.'], ['Ele ainda está no carro?', 'Não precisa responder.']];
  tid = interaction.register({ id: 'moca-r6', reach: 3.4, priority: 1.4, aim: () => ({ c: ctr, r: 0.7 }), enabled: () => st === 'wait', label: () => ({ text: 'Falar com a moça da festa' }), tap: async () => { await ui.dialogue('Moça da festa', lines[Math.min(talks++, lines.length - 1)], 93); } });
  return {
    get info() { return { st, t }; },
    update(dt, simT) {
      t += dt;
      const p = h.root.position;
      if (st === 'in') {
        const dx = SPOT[0] - p.x, dz = SPOT[1] - p.z, d = Math.hypot(dx, dz);
        if (d > 0.08) { p.x += dx / d * Math.min(d, 1.2 * dt); p.z += dz / d * Math.min(d, 1.2 * dt); h.root.rotation.y = Math.atan2(dx, dz); h.update?.(simT, { pose: 'parado', andando: 1, fase: t * 7 }); }
        else { st = 'wait'; h.root.rotation.y = Math.PI * 0.8; }
        return false;
      }
      if (st === 'wait') {
        h.update?.(simT, { pose: 'parado', andando: 0 });
        if (time.minutes >= until) {
          st = 'bye'; t = 0;
          ui.say('Moça da festa', 'Acho que ele já foi. Obrigada de verdade.', { seed: 93, ms: 3800 });
          bus.emit('sfx', 'porta_sino', { pos: [9, 1, 3.3] });
        }
        return false;
      }
      // she goes out through the door
      const dx = DOOR[0] - p.x, dz = DOOR[1] - p.z, d = Math.hypot(dx, dz);
      if (t > 1.5 && d > 0.15) { p.x += dx / d * Math.min(d, 1.3 * dt); p.z += dz / d * Math.min(d, 1.3 * dt); h.root.rotation.y = Math.atan2(dx, dz); h.update?.(simT, { pose: 'parado', andando: 1, fase: t * 7 }); }
      else if (d <= 0.15) { h.root.visible = false; branches.event('r6', 'companhia'); return true; }
      return false;
    },
    dispose() { if (tid) interaction.unregister(tid); render.scene.remove(h.root); },
  };
}
