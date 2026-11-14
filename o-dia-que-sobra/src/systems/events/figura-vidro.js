// "A figura no vidro" (week 4, low sanity): outside the shop's glass, far on the forecourt, a dark figure stands. The first time the player looks at it, it is no longer far:
// it is against the glass, half a metre from the player's face, for half a second, with a hard hit and a tremor, and gone. A jump scare of the kind the design allows now:
// rare and earned. With "reduce flashes", a dark cut with the same sound and no figure. It checks that the shop is lit, that the player is in the shop near the glass, and
// that no customer is at the front.
export const can = ({ world, player, customers }) => {
  const a = world.areaAt(player.st.x, 1, player.st.z)?.id;
  return a === 'loja' && player.st.z < 8 && world.posto.breakers.isOn('loja') && !customers.list.some((c) => !c.done && ((c.human && !c.inCar && c.human.root.position.z < 6) || (c.car && c.car.root.position.z > -4 && c.car.root.position.z < 3)));
};
export function run(ctx) {
  const { kit, player, sanity, progression, bus, event } = ctx;
  const est = ctx.est;
  const fig = kit.figure('sem-sombra', 91); const sil = kit.silhouette(fig.root, '#030304');
  const far = kit.v3(0, 0, -3.2), eye = kit.v3(); let st = 'far', t = 0, hold = 0, fade = 0;
  return {
    get info() { return { st, t, vis: fig.root.visible }; },
    update(dt) {
      t += dt;
      if (st === 'far') {
        if (kit.area() !== 'loja') return t > 12;
        far.x = Math.max(4, Math.min(14, player.st.x)); fig.root.position.copy(far); kit.face(fig.root, player.eyePos());
        eye.set(far.x, 1.2, far.z);
        const l = kit.look(eye);
        if (!fig.root.visible && l < 0.7 && t > 1) { fig.root.visible = true; }       // it appears when the player is looking elsewhere
        if (fig.root.visible) { fade = Math.min(0.7, fade + dt * 0.5); sil.set(fade); }
        if (fig.root.visible && l > 0.9 && kit.dist(far) < 20) {
          // seen: it is at the glass
          st = 'scare'; hold = 0;
          bus.emit('sfx', 'susto_golpe', {});
          sanity.add(event.sanidade, event.id); progression.seen(event.id); bus.emit('event:seen', event.id);
          if (kit.soft()) { est.cut = 1; fig.root.visible = false; }
          else { const f = player.forward(); fig.root.position.set(player.st.x + f.x * 1.1, 0, player.st.z + f.z * 1.1); kit.face(fig.root, player.eyePos()); sil.set(0.92); est.shake = 0.05; }
        }
        return t > 45;
      }
      hold += dt;
      if (hold > 0.5) { fig.root.visible = false; return true; }
      return false;
    },
    dispose() { kit.dispose(fig); },
  };
}
