// R2, night 3: the street dweller stands by the kerb and asks to lie down on the pavement near the light "until it is day". Talk to him, then choose:
// let him (he sleeps there until five, tie +), give him a coffee and let him (tie ++), or send him away (the manager is pleased). What it does later
// (weeks 3 and 4) is in data/branches.pt-BR.json (`passos`) and in branches.js (the whistle) and branches/r2-camera.js (the one sent away).
// His lines: data/branches.pt-BR.json, record r2, `dialogo`. No sanity, no occurrence: he is a person.
import { sleepSpot, moradorFigure, lieDown } from './common.js';

const D2 = (data) => data.branches.ramos.find((r) => r.id === 'r2').dialogo;

function sleeper(ctx, sp) {
  const h = moradorFigure(ctx);
  lieDown(h.root, sp); h.root.visible = true;
  return {
    data: { x: sp.x, z: sp.z },
    update(dt, simT) { h.update?.(simT, { pose: 'parado', andando: 0 }); return ctx.time.minutes >= 300; },   // he is gone by five
    dispose() { ctx.render.scene.remove(h.root); },
  };
}
export function restoreProp(ctx) { const sp = sleepSpot(ctx.world, ctx.render.THREE); return sp ? sleeper(ctx, sp) : null; }

export function can({ world, render, customers, player, entity }) {
  const sp = sleepSpot(world, render.THREE);
  return Boolean(sp) && !player.blocked(sp.x, sp.z) && entity.state === 'ausente' && !customers.list.some((c) => c.car && Math.hypot(c.car.root.position.x - sp.x, c.car.root.position.z - sp.z) < 3.4);
}
export function run(ctx) {
  const { world, render, kit, ui, interaction, branches, time, est, data, bus } = ctx;
  const sp = sleepSpot(world, render.THREE), L = D2(data), h = moradorFigure(ctx);
  h.root.position.set(sp.x, 0, sp.z); h.root.rotation.y = Math.atan2(sp.face[0] - sp.x, sp.face[1] - sp.z);
  const ctr = h.root.position.clone().setY(1.1);
  let st = 'wait', t = 0, tid = null, out = 0;
  est.morador = { name: 'Morador de rua' };
  async function talk() {
    st = 'talking';
    await ui.dialogue('Morador de rua', L.abre, 88);
    const k = await branches.offer('r2');
    await ui.dialogue('Morador de rua', L[k] || L.deixar, 89);
    if (k === 'cafe') { bus.emit('sfx', 'cafeteira', {}); ui.toast('Você serve um café da cafeteira da loja.'); }
    if (k === 'mandar') { st = 'leave'; t = 0; out = 0; return; }
    st = 'sleep';
  }
  return {
    get info() { return { st, t }; },
    update(dt, simT) {
      t += dt; h.update?.(simT, { pose: 'parado', andando: 0 });
      if (st === 'wait') {
        // he is there when the player is not looking his way (or is far)
        if (kit.look(ctr) < 0.5 || kit.dist(ctr) > 14) {
          h.root.visible = true; st = 'there'; t = 0;
          tid = interaction.register({ id: 'morador-r2', reach: 3.4, priority: 1.4, aim: () => ({ c: ctr, r: 0.7 }), enabled: () => st === 'there', label: () => ({ text: 'Falar com o morador de rua' }), tap: () => talk() });
        } else if (t > 40) return true;
        return false;
      }
      if (st === 'there') { if (t > 150 || (t > 90 && kit.look(ctr) < 0.3 && (out += dt) > 1)) { h.root.visible = false; return true; } return false; }
      if (st === 'leave') { out += dt; h.root.position.x += Math.sin(h.root.rotation.y + 2.4) * dt * 1.1; h.root.position.z += Math.cos(h.root.rotation.y + 2.4) * dt * 1.1; if (out > 2.5) { h.root.visible = false; return true; } return false; }
      if (st === 'sleep') {
        h.root.visible = false;
        const p = sleeper(ctx, sp); branches.keep(p, 'branches/r2-morador.js');
        return true;
      }
      return false;
    },
    dispose() { if (tid) interaction.unregister(tid); render.scene.remove(h.root); est.morador = null; void time; },
  };
}
