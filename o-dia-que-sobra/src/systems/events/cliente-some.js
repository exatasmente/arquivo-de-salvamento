// "O cliente que some": somebody is at the counter who did not come in (the bell did not ring), waiting. When the
// player looks, they speak ("Atende aqui?"). When the player looks away, they are gone. Sometimes a customer really
// was there: the next night's morning call carries the complaint. The player never knows which kind it was.
import { buildCustomer } from '../../models/customer.js';
export function run({ world, kit, ui, sanity, progression, bus, event, rng, render }) {
  const real = rng() < 0.5;
  const h = buildCustomer(render, { categoria: 'comum', roupa: 'civil' }, { seed: 7000 + progression.st.day });
  const b = world.anchor('balcao');
  h.root.position.copy(b.pos).setY(0); h.root.rotation.y = Math.atan2(b.dir.x, b.dir.z); h.root.visible = false; render.scene.add(h.root);
  const ctr = h.root.position.clone().setY(1.2);
  let st = 'wait', t = 0, seen = 0, away = 0, spoke = false;
  return {
    update(dt, simT) {
      t += dt; h.update?.(simT, { pose: 'parado' });
      if (st === 'wait') {
        const a = kit.area();
        if ((a === 'loja' || a === 'escritorio') && kit.look(ctr) < 0.5 && kit.dist(ctr) > 3.5) { h.root.visible = true; st = 'there'; t = 0; }
        else if (t > 50) return true;
        return false;
      }
      if (st === 'there') {
        if (kit.look(ctr) > 0.8 && kit.dist(ctr) < 9) {
          seen += dt;
          if (seen > 0.6 && !spoke) {
            spoke = true; sanity.add(event.sanidade, event.id); progression.seen(event.id); bus.emit('event:seen', event.id);
            if (real) progression.relatar('cliente-balcao');
            bus.emit('incident', 'cliente-suspeito', { id: event.id });
            ui.say('Cliente', 'Atende aqui?', { seed: 61, ms: 2400 });
          }
        }
        if (spoke) { if (kit.look(ctr) < 0.3) away += dt; if (away > 0.9) { h.root.visible = false; st = 'gone'; t = 0; } }
        if (t > 40) { h.root.visible = false; return true; }
        return false;
      }
      return t > 2;
    },
    dispose() { render.scene.remove(h.root); },
  };
}
/** the counter is free (a real customer is not standing there) and the door is shut (nobody is coming in). Checked by the event system before the event begins; if it fails the event waits for another moment. */
export const can = ({ customers, world }) => !world.doorOpen('porta-loja') && !customers.list.some((c) => c.kind === 'walk' && ['scanning', 'ready', 'placing', 'asking', 'watch', 'queue'].includes(c.state));
