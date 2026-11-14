// "A sombra errada": on the floor of the shop, the stock room or the office, a long dark shape lies where nothing stands to cast it, and it points TOWARD the nearest lamp,
// not away from it, as a shadow never does. It is there while nobody looks and is gone when it is looked at straight, or when the flashlight lands on it. A thing of the
// world (the light is real; the shadow is not), commoner as the sanity falls and the weeks go. It checks that the lamp is on and that nobody is shopping.
export const can = ({ world, customers }) => world.posto.breakers.isOn('loja') && !customers.list.some((c) => c.kind === 'walk' && ['scanning', 'ready', 'placing'].includes(c.state));
export function run(ctx) {
  const { kit, world, render, sanity, progression, bus, event, rng } = ctx;
  const THREE = kit.THREE;
  const geo = new THREE.CircleGeometry(0.5, 14); geo.rotateX(-Math.PI / 2);
  const mat = render.mat('#000000', { transparent: true, opacity: 0, depthWrite: false, fogged: 1 });
  const m = new THREE.Mesh(geo, mat); m.scale.set(0.9, 1, 3.0); m.position.y = 0.025; m.visible = false; m.renderOrder = 2; render.scene.add(m);
  let st = 'seek', t = 0, seen = 0, a = 0, ctr = null;
  return {
    get info() { return { st, a, vis: m.visible, at: ctr && ctr.toArray() }; },
    update(dt) {
      t += dt;
      if (st === 'seek') {
        if (t > 14) return true;
        if (Math.floor(t * 2) !== Math.floor((t - dt) * 2)) {
          const p = kit.peripheral(rng, { min: 3, max: 7 }); if (!p) return false;
          const ar = world.areaAt(p.x, 1, p.z)?.id; if (!['loja', 'estoque', 'escritorio'].includes(ar)) return false;
          // the nearest lamp that is on: the shadow will lie toward it
          let best = null, bd = 1e9;
          for (const l of world.lights) { if (!l.on || l.burnt || l.kind === 'placa' || (world.posto.breakers && !world.posto.breakers.powered(l))) continue; const d = Math.hypot(l.pos[0] - p.x, l.pos[2] - p.z); if (d < bd) { bd = d; best = l; } }
          if (!best || bd > 7) return false;
          ctr = p; m.position.set(p.x, 0.025, p.z); m.rotation.y = Math.atan2(best.pos[0] - p.x, best.pos[2] - p.z); m.visible = true; st = 'show'; t = 0;
        }
        return false;
      }
      const eye = kit.v3(ctr.x, 0.3, ctr.z);
      if (st === 'show') {
        a = Math.min(0.62, a + dt * 0.5); mat.opacity = a;
        const looked = kit.look(eye) > 0.78 && kit.dist(ctr) < 9, flashed = kit.flashOn(eye);
        seen = looked || flashed ? seen + dt : Math.max(0, seen - dt);
        if (seen > 0.45) { st = 'gone'; t = 0; sanity.add(event.sanidade, event.id); progression.seen(event.id); bus.emit('event:seen', event.id); if (!kit.soft()) { a = 0; mat.opacity = 0; m.visible = false; } }
        else if (t > 24) st = 'gone';
        return false;
      }
      a = Math.max(0, a - dt * (kit.soft() ? 1.2 : 3)); mat.opacity = a;
      if (a <= 0) { m.visible = false; return true; }
      return false;
    },
    dispose() { render.scene.remove(m); geo.dispose(); },
  };
}
