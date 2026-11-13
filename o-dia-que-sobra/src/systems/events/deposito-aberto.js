// "O depósito aberto" (week 3, night 17): the door of the old storeroom is open by itself, and inside there is the promotion's material. From the
// night of the open door on, the player can go in without the badge or the seventh camera. It costs sanity the first time it is seen open.
export function run({ world, kit, bus, sanity, progression, event, ui, time }) {
  const id = 'porta-deposito', a = world.anchor(id).pos.clone().setY(1.2);
  let st = 'wait', t = 0, gaze = 0, away = 0;
  return {
    update(dt) {
      t += dt;
      if (st === 'wait') {
        if (kit.area() !== 'servico' || kit.look(a) < 0.5) away += dt; else away = 0;
        if (away > 1.5 || t > 100) { world.setDoor(id, 1); bus.emit('sfx', 'porta_range', { pos: a.toArray(), opts: { dur: 1.2 } }); progression.flag('deposito:aberto'); st = 'open'; t = 0; }
        return false;
      }
      if (kit.look(a) > 0.82 && kit.dist(a) < 12) gaze += dt; else gaze = Math.max(0, gaze - dt);
      if (st === 'open' && gaze > 0.8) { st = 'seen'; t = 0; sanity.add(event.sanidade, event.id); progression.seen(event.id); bus.emit('event:seen', event.id); ui.say('Heitor', '(A porta do depósito. Aberta. O que estava lá dentro?)', { seed: 18, ms: 3600 }); }
      if (st === 'seen' && t > 20) return true;
      return t > 100 || time.minutes > 330;
    },
  };
}
