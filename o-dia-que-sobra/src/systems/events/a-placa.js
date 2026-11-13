// "A placa": while nobody looks at it, the smile of the Sun on the tall sign widens. The player sees the change the
// next time they look up at it. It never goes back: the base of the smile (events.js) is wider every night after.
export function run({ est, kit, world, sanity, progression, event, bus, ui, time }) {
  const p = world.anchor('placaSol').pos.clone();
  const base = est.placa, goal = Math.min(1, base + 0.4);
  let t = 0, seen = false, since = 0;
  return {
    update(dt) {
      t += dt;
      const looking = kit.look(p) > 0.93 && kit.dist(p) < 80;
      if (!seen) {
        if (!looking && est.placa < goal) est.placa = Math.min(goal, est.placa + dt * 0.1);   // only while it is not looked at
        if (looking && est.placa >= goal - 0.001) { since += dt; if (since > 0.8) {
          seen = true; sanity.add(event.sanidade, event.id); progression.seen(event.id); bus.emit('event:seen', event.id);
          ui.say('Heitor', '(O sorriso estava menor. Eu vi.)', { seed: 5, ms: 3600 });
        } } else since = 0;
      }
      return seen ? t > 1.5 : time.minutes > 345;
    },
  };
}
