// "A porta que parece aberta": a closed door looks open, a dark rectangle with the black behind it, where a closed
// door was a moment ago. Up close, or looked at for a moment, it is a closed door again.
const DOORS = ['porta-estoque', 'porta-deposito', 'porta-banheiro-m', 'porta-banheiro-f', 'porta-fundos', 'porta-escritorio', 'porta-estoque-escritorio'];
export function run({ world, kit, player, render, sanity, bus, progression, event, rng }) {
  const THREE = kit.THREE;
  const cand = DOORS.filter((id) => world.anchor(id) && !world.doorOpen(id)).filter((id) => { const d = kit.dist(world.anchor(id).pos); return d > 5 && d < 24; });
  if (!cand.length) return { update: () => true };
  const id = cand[Math.floor(rng() * cand.length)], an = world.anchor(id);
  const side = Math.sign(an.dir.x * (player.st.x - an.pos.x) + an.dir.z * (player.st.z - an.pos.z)) || 1;
  const m = render.mat('#020203', { transparent: true, opacity: 0, depthWrite: false });
  const void_ = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 2.0), m);
  const n = an.dir.clone().multiplyScalar(side);
  void_.position.set(an.pos.x + n.x * 0.06, 1.02, an.pos.z + n.z * 0.06);
  void_.rotation.y = Math.atan2(n.x, n.z); void_.renderOrder = 3;
  render.scene.add(void_);
  const ctr = void_.position.clone();
  let t = 0, stare = 0, st = 'in', a = 0;
  return {
    update(dt) {
      t += dt;
      if (st === 'in') {
        a = Math.min(0.97, a + dt * 0.9); m.opacity = a;
        const d = kit.dist(ctr);
        if (kit.look(ctr) > 0.94 && d < 12) stare += dt; else stare = Math.max(0, stare - dt);
        if (d < 2.6 || stare > 1.3) { st = 'out'; sanity.add(event.sanidade, event.id); progression.seen(event.id); bus.emit('event:seen', event.id); bus.emit('sfx', 'porta_range', { pos: ctr.toArray(), opts: { dur: 0.7 } }); }
        else if (t > 30) st = 'out2';
        return false;
      }
      a = Math.max(0, a - dt * (st === 'out' ? 2 : 0.6)); m.opacity = a;
      return a <= 0;
    },
    dispose() { render.scene.remove(void_); },
  };
}
/** nobody is using a door right now. Checked by the event system before the event begins; if it fails the event waits for another moment. */
export const can = ({ customers }) => !customers.list.some((c) => c.kind === 'walk' && (c.state === 'entering' || (c.state === 'leaving' && !c.inCar)));
