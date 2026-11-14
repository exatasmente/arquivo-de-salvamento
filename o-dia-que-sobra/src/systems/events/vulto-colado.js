// "O vulto colado" (weeks 3 and 4, low sanity): a figure keeps one step behind the player, always out of sight. The first time the player turns around fast it is there,
// a metre from the face, for half a second, with a hard hit of sound and a tremor of the picture, and then not. The jump scare the design now allows: rare, earned (the
// sanity is low), never in weeks 1 and 2 and never as a rule of every shape at the corner of the eye. With "reduce flashes" there is no figure and no tremor: a dark cut with
// the same sound. It checks that nobody is near (a customer would see it) and that the player is on their feet in a place with room.
const PLACES = new Set(['loja', 'escritorio', 'estoque', 'servico', 'bombas']);
export const can = ({ world, player, entity, customers, ui }) => {
  const a = world.areaAt(player.st.x, 1, player.st.z)?.id;
  return entity.hidden === null && !player.st.frozen && PLACES.has(a) && !ui.modalOpen
    && !customers.list.some((c) => !c.done && !c.inCar && ((c.human && Math.hypot(c.human.root.position.x - player.st.x, c.human.root.position.z - player.st.z) < 8) || (c.car && Math.hypot(c.car.root.position.x - player.st.x, c.car.root.position.z - player.st.z) < 6)));
};
export function run(ctx) {
  const { kit, player, sanity, progression, bus, event, render } = ctx;
  const est = ctx.est;
  const fig = kit.figure('sem-sombra', 77); const sil = kit.silhouette(fig.root, '#030304');
  const hist = []; let st = 'follow', t = 0, hold = 0;
  const spot = (d) => { const f = player.forward(); return kit.v3(player.st.x + f.x * d, 0, player.st.z + f.z * d); };
  return {
    get info() { return { st, t, vis: fig.root.visible }; },
    update(dt) {
      t += dt;
      if (st === 'follow') {
        hist.push({ t, yaw: player.st.yaw }); while (hist.length && t - hist[0].t > 1.2) hist.shift();
        const turned = hist.length > 3 && Math.abs(Math.atan2(Math.sin(player.st.yaw - hist[0].yaw), Math.cos(player.st.yaw - hist[0].yaw))) > 2.1;
        if (turned && t > 2) {
          const p = spot(1.05);
          if (player.blocked(p.x, p.z)) return t > 60;
          st = 'scare'; hold = 0;
          bus.emit('sfx', 'susto_golpe', {});
          sanity.add(event.sanidade, event.id); progression.seen(event.id); bus.emit('event:seen', event.id);
          if (kit.soft()) est.cut = 1;                                            // a dark cut, the same sound: no figure, no tremor
          else { fig.root.position.copy(p); kit.face(fig.root, player.eyePos()); fig.root.visible = true; sil.set(0.92); est.shake = 0.05; }
        }
        return t > 70;                                                              // never turned: it goes away with nothing said
      }
      hold += dt;
      if (hold > 0.5) { fig.root.visible = false; return true; }
      return false;
    },
    dispose() { kit.dispose(fig); },
  };
}
