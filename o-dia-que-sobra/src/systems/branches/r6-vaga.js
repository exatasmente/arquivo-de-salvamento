// R6, night 10, for who did not get involved: his car is in the stall at the back all night, with nobody inside (an echo of Valdir's). It is placed while the player is not
// looking; seen from close, a little sanity. It is a prop (`branches.keep`): it leaves at 05:40 and a saved night brings it back in its stall.
const SEED = 4410;
function carProp(ctx, seenAlready) {
  const { world, render, traffic, kit, ui, sanity, bus, branches, time } = ctx;
  // the stall farthest back (the one nearest the old cars): reserve every free one, keep that, give the rest back
  const got = []; for (let i = 0; i < 12; i++) { const q = traffic.reserveLot(4.3, 1.8, () => 0); if (!q) break; got.push(q); }
  const sp = got.sort((p, q) => q.z - p.z)[0] || null;
  for (const q of got) if (q !== sp) traffic.releaseLot(q);
  if (!sp) return null;
  const car = world.car(SEED, { color: '#4a4c54', fuel: 'etanol' });
  car.setDriver(false); car.setLights(false);
  car.root.position.set(sp.x, 0, sp.z); car.root.rotation.y = sp.yaw; car.root.visible = false;
  render.scene.add(car.root);
  const col = { min: [sp.x - 2.2, 0, sp.z - 1.0], max: [sp.x + 2.2, 1.5, sp.z + 1.0], id: 'veiculo-r6', vehicle: true };
  if (Math.abs(Math.sin(sp.yaw)) < 0.5) { col.min = [sp.x - 1.0, 0, sp.z - 2.2]; col.max = [sp.x + 1.0, 1.5, sp.z + 2.2]; }
  const eye = kit.v3(sp.x, 1.2, sp.z);
  let seen = seenAlready, shown = false;
  return {
    data: { at: [sp.x, sp.z], get seen() { return seen; } },
    update() {
      if (!shown && (kit.look(eye) < 0.45 || kit.dist(eye) > 28)) { shown = true; car.root.visible = true; world.colliders.push(col); }
      if (shown && !seen && kit.dist(eye) < 11 && kit.look(eye) > 0.8) {
        seen = true; sanity.add(-3, 'r6-vaga'); bus.emit('event:seen', 'r6-vaga'); branches.event('r6', 'vaga');
        ui.say('Heitor', '(O carro dele. No fundo, vazio, a noite inteira. Não tem ninguém dentro.)', { seed: 93, ms: 4200 });
      }
      return time.minutes >= 340;
    },
    dispose() { render.scene.remove(car.root); const i = world.colliders.indexOf(col); if (i >= 0) world.colliders.splice(i, 1); traffic.releaseLot(sp); },
  };
}
export function restoreProp(ctx, data) { return carProp(ctx, Boolean(data?.seen)); }
export const can = ({ progression, narrative, traffic }) => progression.hasFlag('r6:calou') && !narrative.ringing && traffic.lotAvailable();
export function run(ctx) { const p = carProp(ctx, false); if (p) ctx.branches.keep(p, 'branches/r6-vaga.js'); return { update: () => true }; }
