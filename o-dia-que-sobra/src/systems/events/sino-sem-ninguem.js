// "O sino sem ninguém": the bell over the shop door rings, the door has not opened, nobody comes in. (On the camera,
// in phase 4, somebody did.) The player takes it as they take a noise: a little sanity, and an occurrence to register.
export function run({ world, bus, sanity, progression, event, ui }) {
  let t = 0, rung = false;
  return {
    update(dt, simT) {
      t += dt;
      if (!rung) {
        rung = true; world.state.sino = simT;
        bus.emit('sfx', 'sino_fantasma', { pos: world.anchor('sino').pos.toArray() });
        bus.emit('incident', 'barulho', { id: event.id });
        sanity.add(event.sanidade, event.id); progression.seen(event.id); bus.emit('event:seen', event.id);
        ui.say('Heitor', '(O sino. A porta nem abriu.)', { seed: 8, ms: 3200 });
      }
      return t > 6;
    },
  };
}
