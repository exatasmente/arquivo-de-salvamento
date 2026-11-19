// What Jonas walks on, by what is under his feet: the footstep that sounds is the one of the surface, not one per scene. A scene's floor is its
// default (the tiled floor of the station, the pavement of the street: SOUNDS in game.js), a type of entity is a patch of another surface in
// its own footprint (a grate in the pavement, a drain in the floor), and a change of height since the last footstep (a platform, a curb of a
// stair) is a step up or down. The footprints are in the entity's own frame: x0..x1 by z0..z1, turned with it.
/** type of entity -> { kind: the surface (a route name of the footsteps: passo-grade), rect: the footprint in the entity's frame }. */
export const SURFACES = {
  bueiro: { kind: 'grade', rect: { x0: -0.5, x1: 0.5, z0: -0.375, z1: 0.375 } },
  bocaRua: { kind: 'grade', rect: { x0: -1.096, x1: 1.396, z0: -0.946, z1: 0.946 } },      // = scenes/grade.js footprint(): it is not imported, so this stays free of three.js (the test checks they agree)
  ralo: { kind: 'grade', rect: { x0: -0.31, x1: 0.31, z0: -0.31, z1: 0.31 } },
};
/** surface -> the footstep (a route of samples.js). `base` is the scene's own: 'passo' in the station, 'passo-rua' in the street. */
export const STEP_OF = { grade: 'passo-grade', escada: 'passo-escada', hall: 'passo-hall', concreto: 'passo-rua' };
/** A change of the ground this big between two footsteps is stairs (a platform of the base is 0.45 m, a curb 0.15 m). */
export const STAIR = 0.2;

/** The step sound for Jonas at (x, z): `surface` is what the scene says is under him (or null), `base` the scene's own step, `dy` the change of height since the last step. */
export function stepFor(surface, base, dy = 0) {
  if (Math.abs(dy) >= STAIR) return STEP_OF.escada;
  return (surface && STEP_OF[surface]) || base;
}

/** A surface patch of an entity line as a world rectangle { min, max } (a turned rectangle is its box). */
export function patchOf(e) {
  const s = SURFACES[e.type]; if (!s) return null;
  const yaw = e.rot?.[1] ?? 0, c = Math.cos(yaw), n = Math.sin(yaw), sc = e.scale ?? [1, 1, 1], R = s.rect;
  const cx = ((R.x0 + R.x1) / 2) * sc[0], cz = ((R.z0 + R.z1) / 2) * sc[2], hw = ((R.x1 - R.x0) / 2) * sc[0], hd = ((R.z1 - R.z0) / 2) * sc[2];
  const x = e.pos[0] + cx * c + cz * n, z = e.pos[2] - cx * n + cz * c, ex = hw * Math.abs(c) + hd * Math.abs(n), ez = hw * Math.abs(n) + hd * Math.abs(c);
  return { kind: s.kind, min: [x - ex, z - ez], max: [x + ex, z + ez] };
}
