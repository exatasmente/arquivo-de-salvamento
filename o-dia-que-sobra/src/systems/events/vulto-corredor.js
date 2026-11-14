// "O vulto do corredor": at the dark end of the stock room, the back area or the bathrooms, a figure stands far down the way. A thing of the world as well as of the
// head: it is a place that is dark. Gone when you look at it or put the flashlight on it. Checks that the place is really dark and nobody is there.
import { apparition } from './aparicao.js';
const WHERE = new Set(['estoque', 'servico', 'banheiros', 'deposito']);
export const can = ({ world, player, lighting, customers }) => {
  const a = world.areaAt(player.st.x, 1, player.st.z)?.id;
  return Boolean(a) && (WHERE.has(a) || a.startsWith('banheiro')) && !customers.list.some((c) => c.kind === 'walk' && c.state === 'inside');
};
export function run(ctx) {
  const { kit, rng, lighting, world } = ctx;
  return apparition(ctx, {
    seed: 61, seekFor: 12, ttl: 16, cone: 0.9, maxDist: 20, alpha: 0.85, fadeIn: 0.8,
    where() {
      const p = kit.peripheral(rng, { min: 6, max: 12 }); if (!p) return null;
      const a = world.areaAt(p.x, 1, p.z)?.id;
      if (!a || a === 'loja' || a === 'escritorio' || lighting.litAt(p.x, p.z)) return null;      // only a dark place of the back
      return p;
    },
  });
}
