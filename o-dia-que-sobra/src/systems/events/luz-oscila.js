// "A luz que oscila": a lamp of the shop dims and comes back, slowly, three times. Only the building. It costs a point of sanity at most.
export function run({ lighting, world, bus, sanity, event, rng }) {
  const ids = ['loja1', 'loja2', 'loja3'].filter((id) => world.light(id));
  if (!ids.length) return { update: () => true };
  const id = ids[Math.floor(rng() * ids.length)];
  let t = 0, done = false;
  return {
    update(dt) {
      t += dt;
      const k = t < 9 ? 0.18 + 0.82 * (0.5 + 0.5 * Math.cos(t * 2.1)) ** 2 : 1;   // three slow dips
      lighting.dimLight(id, k);
      if (t > 2 && !done) { done = true; bus.emit('sfx', 'lampada_estalo', { pos: world.light(id).pos, opts: { gain: 0.5 } }); bus.emit('sfx', 'luz_oscila', { pos: world.light(id).pos, opts: { dur: 2.4 } }); sanity.add(event.sanidade, event.id); }
      return t > 9.5;
    },
    dispose() { lighting.dimLight(id, null); },
  };
}
