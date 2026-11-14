// "O passante no canto do olho": something crosses the edge of the view, between the shelves or along the wall, at walking pace, and is gone when you turn.
// A thing of the head. It never stops and never turns its face.
import { apparition } from './aparicao.js';
export const can = ({ entity, customers }) => entity.hidden === null && !customers.list.some((c) => c.kind === 'walk' && c.state === 'scanning');
export function run(ctx) {
  const { kit, rng } = ctx;
  return apparition(ctx, {
    seed: 47, seekFor: 14, ttl: 6, cone: 0.88, maxDist: 12, alpha: 0.72, fadeIn: 2,
    // across the view, at a walking pace, toward the middle of it
    move(p) { const f = ctx.player.forward(), dx = p.x - ctx.player.st.x, dz = p.z - ctx.player.st.z, d = Math.hypot(dx, dz) || 1; let px = -dz / d, pz = dx / d; if (px * f.x + pz * f.z < 0) { px = -px; pz = -pz; } return [px * 1.1, pz * 1.1]; },
    where() {
      const p = kit.peripheral(rng, { min: 4, max: 8 }); if (!p) return null;
      return p;
    },
  });
}
