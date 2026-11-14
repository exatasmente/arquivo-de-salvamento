// "A bomba 4" (secret S2). The pump 4 turns on by itself in front of a car with nobody in it, counts, and stops at
// 34,70 on the display (upside down it reads OLhE). When the player looks, somebody in an old attendant's uniform
// stands behind the car with their back turned; when the player looks away and then back, there is nobody.
export function run({ customers, world, kit, bus, sanity, progression, event, ui, player }) {
  const n = 4, GOAL = 3470;
  const car = customers.spawnEmptyCar(n, 4470 + progression.st.day);
  if (!car) return { update: () => true };
  const fig = kit.figure('frentista-antigo', 12);
  const spot = world.anchor('carroBomba4').pos.clone().add(kit.v3(-1.3, 0, -1.35));
  let st = 'arrive', t = 0, cents = 0, away = 0, seen = false, watched = 0;
  const carPos = kit.v3(), key = 'bomba' + n;
  return {
    get info() { return { st, seen, vis: fig.root.visible, away }; },
    update(dt) {
      t += dt;
      car.car.root.getWorldPosition(carPos);
      if (st === 'arrive') {
        if (car.state === 'arriving') { if (t > 45) return true; return false; }
        st = 'run'; t = 0;
        bus.emit('loop', key, 'bomba_corre', { on: true, pos: world.anchor(key).pos.toArray() });
        bus.emit('sfx', 'bomba4_liga', { pos: world.anchor(key).pos.toArray(), opts: { dur: 6 } });
        bus.emit('incident', 'carro-sem-motorista', { id: event.id });
        return false;
      }
      if (st === 'run') {
        cents = Math.min(GOAL, cents + 150 * dt); world.pumpDisplay(n, cents);
        if (cents >= GOAL) { st = 'stopped'; t = 0; bus.emit('loop', key, 'bomba_corre', { on: false }); bus.emit('sfx', 'bomba_bip', { pos: world.anchor(key).pos.toArray() }); }
        return false;
      }
      if (st === 'stopped') {
        // he is there when the player looks (placed while the player looks elsewhere, so he is never seen arriving)
        if (!fig.root.visible && kit.look(carPos) < 0.55 && kit.dist(carPos) < 24) {
          fig.root.position.copy(spot); fig.root.rotation.y = Math.atan2(spot.x - player.st.x, spot.z - player.st.z); fig.root.visible = true; fig.setPose?.('costas', 0);
        }
        if (fig.root.visible && !seen && kit.dist(spot) < 22 && kit.look(spot.clone().setY(1.2)) > 0.86) {
          watched += dt;
          if (watched > 0.9) { seen = true; away = 0; sanity.add(event.sanidade, event.id); progression.seen(event.id); bus.emit('event:seen', event.id); bus.emit('sfx', 'passos_longe', { pos: spot.toArray(), opts: { n: 1 } }); ui.say('Heitor', '(Alguém atrás do carro. De costas.)', { seed: 12, ms: 3400 }); }
        } else if (!seen) watched = 0;
        if (seen) {
          if (kit.look(spot.clone().setY(1.2)) < 0.4) away += dt; else away = Math.max(0, away - dt * 0.5);
          if (fig.root.visible && away > 0.8) { fig.root.visible = false; t = 0; st = 'gone'; }
        }
        if (t > 90) return leave();
        return false;
      }
      if (st === 'gone') {   // nobody there when looked at again; the car leaves a little later, without a sound
        if (t > 7) return leave();
        return false;
      }
      return true;
    },
    dispose() { bus.emit('loop', key, 'bomba_corre', { on: false }); kit.dispose(fig); customers.unreserve(n); },
  };
  function leave() { world.pumpDisplay(n, 0); customers.releaseEmptyCar(car); return true; }
}
/** pump 4 is free: nobody is being served there. Checked by the event system before the event begins; if it fails the event waits for another moment. */
export const can = ({ customers }) => customers.freePump(4) === 4;
