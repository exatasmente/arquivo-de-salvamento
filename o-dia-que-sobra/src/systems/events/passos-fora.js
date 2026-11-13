// "Passos lá fora": steps in the gravel, far off, on the parking side. Nobody there. A noise to register, nothing more.
export function run({ world, bus, sanity, event, rng, progression }) {
  const a = world.anchor('vaga' + (7 + Math.floor(rng() * 6)));
  if (!a) return { update: () => true };
  let t = 0, n = 0;
  return {
    update(dt) {
      t += dt;
      if (t > 1 + n * 1.3 && n < 3) { n++; bus.emit('sfx', 'passos_longe', { pos: [a.pos.x, 0.2, a.pos.z], opts: { n: 2 } }); if (n === 1) { bus.emit('incident', 'barulho', { id: event.id }); sanity.add(event.sanidade, event.id); progression.seen?.(event.id); } }
      return t > 6;
    },
  };
}
