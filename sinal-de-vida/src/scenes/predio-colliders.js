// What stands in the way inside the building of the chase, as boxes on the floor: its walls (from the plan, with their doorways and the
// window) and every thing of data/scenes/predio.json that a body can not walk through, by its type. Pure numbers: the models hang the same
// boxes on their entities (so the scene `predio` has colliders as the street and the gallery do) and the check of the chase's beats
// (tools/fuga/clipping-check.mjs) reads them.
//   FOOT[type](entity) -> [{ x, z, w, d }]      the boxes of an entity, relative to its place (unturned)
//   predioColliders(layout) -> [{ id, floor: 'hall' | 'andar', min: [x, z], max: [x, z] }]
import { BLOCK, DOOR, HALL, STAIR_CORNERS, CORR, APT, WINDOW } from './predio-plan.js';

const box = (x, z, w, d) => [{ x, z, w, d }];
export const FOOT = {
  predioCorreio: () => box(0.08, 0, 0.16, 2.6), predioBalcao: () => box(0, 0, 2.0, 0.8), predioCarrinho: () => box(0.05, 0.1, 0.8, 1.1), predioQuadroLuz: () => box(-0.2, -0.05, 0.4, 0.7),
  predioBanco: () => box(0, 0, 0.45, 1.6), predioVaso: () => box(0, 0, 0.44, 0.44), predioCaixas: () => box(0, 0, 0.6, 0.55), predioCozinha: () => box(-0.3, 0, 0.6, 2.2),
  predioGeladeira: () => box(0, 0.33, 0.7, 0.66), predioArmario: () => box(0.35, -0.5, 0.7, 1.0),
  predioMovel: (e) => ((e.params?.altura ?? 0.5) < 0.2 ? [] : box(0, 0, e.params?.largura ?? 1, e.params?.profundidade ?? 1)),
};
const Y = BLOCK.y, W = 0.2;
/** A wall along x (from x0 to x1, at z, `W` thick on the side `out` of it) with doorways [[xa, xb]]. */
const wallX = (id, floor, z, out, x0, x1, gaps = []) => { const o = []; let x = x0; for (const [a, b] of [...gaps].sort((p, q) => p[0] - q[0]).concat([[x1, x1]])) { if (a > x) o.push({ id, floor, min: [x, Math.min(z, z + out * W)], max: [a, Math.max(z, z + out * W)] }); x = b; } return o; };
const wallZ = (id, floor, x, out, z0, z1) => [{ id, floor, min: [Math.min(x, x + out * W), z0], max: [Math.max(x, x + out * W), z1] }];

export function predioColliders(layout) {
  const sw = STAIR_CORNERS[0], out = [
    // the hall
    ...wallZ('parede-hall-oeste', 'hall', HALL.x0, -1, HALL.z0, HALL.z1), ...wallZ('parede-hall-leste', 'hall', HALL.x1, 1, HALL.z0, HALL.z1),
    ...wallX('parede-hall-fundo', 'hall', HALL.z0, -1, HALL.x0, HALL.x1, [[sw[0] - 0.6, sw[0] + 0.6]]),
    ...wallX('parede-hall-frente', 'hall', HALL.z1, 1, HALL.x0, HALL.x1, [[DOOR.x - DOOR.w / 2, DOOR.x + DOOR.w / 2]]),
    // the corridor and the flat (third floor)
    ...wallZ('parede-corredor-oeste', 'andar', CORR.x0, -1, CORR.z0, CORR.z1), ...wallZ('parede-corredor-leste', 'andar', CORR.x1, 1, CORR.z0, CORR.z1),
    ...wallX('parede-corredor-norte', 'andar', CORR.z0, -1, CORR.x0, CORR.x1, [[sw[0] - 0.6, sw[0] + 0.6]]),
    ...wallX('parede-apto-corredor', 'andar', CORR.z1, 1, CORR.x0, CORR.x1, [[APT.door - APT.doorW / 2, APT.door + APT.doorW / 2]]),
    ...wallZ('parede-apto-oeste', 'andar', APT.x0, -1, APT.z0, APT.z1), ...wallZ('parede-apto-leste', 'andar', APT.x1, 1, APT.z0, APT.z1),
    ...wallX('parede-apto-frente', 'andar', APT.z1, 1, APT.x0, APT.x1, [[WINDOW.x - WINDOW.w / 2, WINDOW.x + WINDOW.w / 2]]),
  ];
  for (const e of layout.entities) {
    const f = FOOT[e.type]; if (!f) continue;
    const floor = Math.abs(e.pos[1] - Y[0]) < 0.6 ? 'hall' : Math.abs(e.pos[1] - Y[3]) < 0.6 ? 'andar' : null; if (!floor) continue;
    const c = Math.cos(e.rot?.[1] ?? 0), s = Math.sin(e.rot?.[1] ?? 0);
    for (const b of f(e)) { const x = e.pos[0] + b.x * c + b.z * s, z = e.pos[2] - b.x * s + b.z * c, hw = (Math.abs(c) * b.w + Math.abs(s) * b.d) / 2, hd = (Math.abs(s) * b.w + Math.abs(c) * b.d) / 2; out.push({ id: e.id, floor, min: [x - hw, z - hd], max: [x + hw, z + hd] }); }
  }
  return out;
}
