// "O carro vazio": a car pulls up at a pump and nobody gets out. Close up there is no driver, and
// the pump keeps counting by itself. Seeing it takes sanity. When the player has looked and gone,
// or after a while, the car leaves without a sound.
export function run(ctx) {
  const { customers, world, progression, sanity, bus, ui, player, event } = ctx;
  const THREE = world.r.THREE;
  const pumpN = Number((event.local || 'bomba-3').split('-')[1]) || 3;
  const n = customers.freePump(pumpN);
  if (!n) return { update: () => true };
  const car = customers.spawnEmptyCar(n, 4242 + progression.st.day);
  if (!car) return { update: () => true };
  let seen = false, tSeen = 0, tParked = 0, away = 0, dispCents = 0;
  const pos = new THREE.Vector3(), to = new THREE.Vector3();
  const capKey = 'bomba' + n;

  return {
    update(dt) {
      if (car.state === 'arriving') return false;
      if (!car.started) { car.started = true; bus.emit('loop', capKey, 'bomba_corre', { on: true, pos: world.anchor('bomba' + n).pos.toArray() }); }
      tParked += dt;
      // the pump counts alone: slowly, up to a value, then stays
      if (dispCents < 1840) { dispCents = Math.min(1840, dispCents + 55 * dt); world.pumpDisplay(n, dispCents); }
      car.car.root.getWorldPosition(pos);
      to.copy(pos).sub(player.eyePos()); const dist = to.length(); to.normalize();
      const look = player.forward().dot(to);
      if (!seen && dist < 6.5 && look > 0.75) {
        seen = true; tSeen = 0;
        sanity.add(event.sanidade, event.id);
        progression.seen(event.id);
        for (const c of event.consequencias || []) if (c.startsWith('registrar:')) progression.flag(c);
        bus.emit('sfx', 'coracao', { gain: 0.8 });
        ui.say('Heitor', 'Não tem ninguém no carro. E a bomba está contando.', { seed: 9, ms: 4200 });
        bus.emit('event:seen', event.id);
      }
      if (seen) {
        tSeen += dt;
        if (dist > 9 || look < -0.2) away += dt; else away = Math.max(0, away - dt);
        if ((away > 2.5 && tSeen > 6) || tSeen > 60) return leave();
      } else if (tParked > 100) return leave();
      return false;
    },
    dispose() { bus.emit('loop', capKey, 'bomba_corre', { on: false }); customers.unreserve(n); },
  };
  function leave() { bus.emit('loop', capKey, 'bomba_corre', { on: false }); world.pumpDisplay(n, 0); customers.releaseEmptyCar(car); return true; }
}
