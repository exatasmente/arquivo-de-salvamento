// "A cobertura apaga" (week 3, night 14): the whole canopy goes dark; the breaker is on the board in the back, and a car with its high beams on
// waits at pump 4 with nobody in it. The lights come back when the player turns the breaker on (the work is on the clipboard).
export function run({ chores, customers, world, kit, bus, sanity, progression, event, ui, time }) {
  if (!chores.trip('cobertura')) return { update: () => true };
  const br = world.posto.breakers;
  const car = customers.spawnEmptyCar(4, 9040 + progression.st.day);
  const carPos = kit.v3();
  let t = 0, seen = false, off = 0;
  bus.emit('sfx', 'apagao', {});
  return {
    update(dt) {
      t += dt;
      if (car) {
        car.car.root.getWorldPosition(carPos);
        if (!seen && car.state !== 'arriving' && kit.dist(carPos) < 26 && kit.look(carPos.clone().setY(1)) > 0.8) {
          seen = true; sanity.add(event.sanidade, event.id); progression.seen(event.id); bus.emit('event:seen', event.id);
          ui.say('Heitor', '(Farol alto na bomba 4. Ninguém no carro.)', { seed: 17, ms: 3600 });
        }
      }
      if (br.isOn('cobertura')) { off += dt; if (off > 4 || t > 160) { if (!seen) { progression.seen(event.id); bus.emit('event:seen', event.id); } return true; } }
      return time.minutes > 345;
    },
    dispose() { if (car) { customers.releaseEmptyCar(car); } },
  };
}
