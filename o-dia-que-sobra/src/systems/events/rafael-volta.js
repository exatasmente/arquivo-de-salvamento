// "Rafael volta" (week 3): the scene rafael-6 of the cast. Rafael comes back on the bike, without the helmet, and
// pays with an old coin that is not money. The event owns the scene (the recurring list skips it until this has run).
export function run({ customers, progression, bus, event }) {
  let t = 0, done = false;
  return {
    update(dt) {
      t += dt;
      if (!done && Math.floor(t) !== Math.floor(t - dt)) {
        if (customers.spawnRecurring('rafael', 'rafael-6')) { done = true; progression.seen(event.id); bus.emit('event:seen', event.id); }
        else if (t > 60) return true;
      }
      return done && t > 3;
    },
  };
}
