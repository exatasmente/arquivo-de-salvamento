// "A silhueta na vitrine": a dark figure stands outside the shop's glass, on the forecourt, looking in. It is there when the player is not looking at it and gone
// when looked at straight (or lit by the flashlight). A thing of the head: rare with a steady mind, commoner as the sanity falls and the weeks go.
import { apparition } from './aparicao.js';
const STRIP = [4, 6, 8, 10, 12, 14].map((x) => [x, -1.4]);
export const can = ({ world, customers }) => world.posto.breakers.isOn('loja') && !customers.list.some((c) => c.car && ['waiting', 'ordered', 'parked'].includes(c.state) && c.car.root.position.z > -3.5 && c.car.root.position.z < 2);
export function run(ctx) {
  const { kit, rng, lighting } = ctx;
  return apparition(ctx, {
    seed: 23, seekFor: 20, ttl: 22, cone: 0.9, maxDist: 22, alpha: 0.78,
    where() {
      if (kit.area() !== 'loja') return null;
      // somewhere along the glass that the player sees only at the edge of the view, outside, in the half dark
      const c = STRIP.map(([x, z]) => kit.v3(x, 0, z)).filter((p) => { const l = kit.look(p.clone().setY(1.2)); return l > 0.3 && l < 0.82 && kit.dist(p) > 4; });
      return c.length ? c[Math.floor(rng() * c.length)] : null;
    },
  });
}
