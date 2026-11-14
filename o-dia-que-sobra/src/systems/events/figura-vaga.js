// "A figura no estacionamento" (week 3, night 18): somebody in an old attendant's uniform stands by a parked car, back turned. It is
// seen through the shop's glass or from the pumps; when the player looks away and back, nobody. It foreshadows the last night's call.
export function run({ world, kit, bus, sanity, progression, event, ui, player }) {
  const fig = kit.figure('frentista-antigo', 12);
  const a = world.anchor('vaga12').pos;
  const spot = kit.v3(a.x + 1.9, 0, a.z - 0.6);
  let st = 'wait', t = 0, watched = 0, away = 0;
  return {
    update(dt) {
      t += dt;
      if (st === 'wait') {
        // it is put there when the player is on the shop side and not looking at the stall
        const ar = kit.area();
        if ((ar === 'loja' || ar === 'bombas') && kit.look(spot.clone().setY(1.2)) < 0.5) { fig.root.position.copy(spot); fig.root.rotation.y = Math.atan2(spot.x - player.st.x, spot.z - player.st.z); fig.root.visible = true; fig.setPose?.('costas', 0); st = 'on'; t = 0; }
        return t > 120;
      }
      if (st === 'on') {
        if (kit.look(spot.clone().setY(1.2)) > 0.9 && kit.dist(spot) < 40) watched += dt; else watched = Math.max(0, watched - dt);
        if (watched > 0.9) { st = 'seen'; t = 0; away = 0; sanity.add(event.sanidade, event.id); progression.seen(event.id); bus.emit('event:seen', event.id); bus.emit('sfx', 'passos_cascalho', { pos: spot.toArray(), opts: { n: 2 } }); ui.say('Heitor', '(Alguém ao lado do carro do fundo. De costas.)', { seed: 16, ms: 3400 }); }
        return t > 45;
      }
      if (kit.look(spot.clone().setY(1.2)) < 0.4) away += dt;
      if (away > 0.8) { fig.root.visible = false; return true; }
      return t > 30;
    },
    dispose() { kit.dispose(fig); },
  };
}
