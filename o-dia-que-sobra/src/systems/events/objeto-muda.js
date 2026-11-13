// "O objeto que mudou de lugar": while the player's eyes are elsewhere, something loose in the station is moved a little and
// turned (the chair, the bucket, the squeegee, a bottle on the gondola, the ladder), through the scene's `displace`.
// It is only seen when looked at again, and it disturbs the work (what the hands look for is not where it was).
// It goes back when it is out of sight.
const WHERE = { cadeira: 'cadeira', balde: 'balde', rodo: 'rodo', produto: 'prateleira1', escada: 'escada' };
export function run({ world, kit, sanity, bus, progression, event, rng }) {
  const P = world.posto, ids = (P.displaceIds || []).filter((id) => WHERE[id]);
  if (!ids.length) return { update: () => true };
  const id = ids[Math.floor(rng() * ids.length)];
  const a = world.anchor(id) || world.anchor(WHERE[id]);
  const ctr = a ? a.pos.clone().setY(0.9) : kit.v3(9, 0.9, 10);
  let st = 'wait', t = 0, away = 0, seen = 0;
  return {
    update(dt) {
      t += dt;
      if (st === 'wait') {
        if (kit.look(ctr) < 0.35) away += dt; else away = 0;
        if (away > 1.2) {
          const s = rng() < 0.5 ? 1 : -1;
          P.displace(id, [s * (0.5 + rng() * 0.6), 0, (rng() - 0.5) * 0.8], s * 0.9);
          st = 'moved'; t = 0; bus.emit('sfx', 'objeto_cai', { pos: ctr.toArray(), opts: { gain: 0.35 } });
        } else if (t > 70) return true;
        return false;
      }
      if (st === 'moved') {
        const d = P.displaced(id) ? kit.v3(ctr.x + P.displaced(id).offset[0], ctr.y, ctr.z + P.displaced(id).offset[2]) : ctr;
        if (kit.dist(d) < 8 && kit.look(d) > 0.82) { seen += dt; if (seen > 0.7) { st = 'seen'; t = 0; sanity.add(event.sanidade, event.id); progression.seen(event.id); bus.emit('event:seen', event.id); bus.emit('hint', 'Isto não estava aqui.'); } }
        if (t > 80) return true;
        return false;
      }
      if (kit.look(ctr) < 0.3 && t > 15) return true;   // back where it was, out of sight
      return t > 60;
    },
    dispose() { P.displace(id, [0, 0, 0], 0); },
  };
}
