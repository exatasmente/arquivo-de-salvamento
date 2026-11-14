// Where a carried thing lands when the player lets go of it: on the floor in front of the feet or beside them, on free floor, never inside a wall or a
// shelf, never within about a metre of a door (a ladder there would shut the way in), and always inside the map. Used by the stock boxes, the cleaning
// kit, the ladder and the bag of rubbish. When there is no such spot within reach (standing in a doorway in a narrow place) it answers null and the
// caller keeps the thing in the hands with a short warning ("Aqui não: é a porta.").
export const DOOR_CLEAR = 1.15;
export function dropSpot({ player, world }) {
  const st = player.st, fx = -Math.sin(st.yaw), fz = -Math.cos(st.yaw);
  const doors = world.doorIds().map((id) => world.anchor(id)?.pos).filter(Boolean);
  const size = world.posto.size || { x0: -45, x1: 45, z0: -48, z1: 40 };
  const ok = (x, z) => x > size.x0 + 1 && x < size.x1 - 1 && z > size.z0 + 1 && z < size.z1 - 1 && world.areaAt(x, 1, z) && !player.blocked(x, z) && !doors.some((d) => Math.hypot(d.x - x, d.z - z) < DOOR_CLEAR);
  for (const d of [0.9, 0.7, 0.5, 0.3]) {                            // in front first
    const x = st.x + fx * d, z = st.z + fz * d;
    if (ok(x, z)) return { x, z, yaw: st.yaw };
  }
  for (const r of [0.9, 1.3, 1.7]) for (let k = 0; k < 12; k++) {     // then all round, farther and farther (out of a door's radius)
    const a = st.yaw + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI / 6, x = st.x - Math.sin(a) * r, z = st.z - Math.cos(a) * r;
    if (ok(x, z)) return { x, z, yaw: st.yaw };
  }
  return null;
}
/** A second spot beside the first (the bucket next to the squeegee); the first one if there is no room. */
export function beside(sp, player, world, side = 0.4) {
  const rx = Math.cos(sp.yaw), rz = -Math.sin(sp.yaw), x = sp.x + rx * side, z = sp.z + rz * side;
  const doors = world.doorIds().map((id) => world.anchor(id)?.pos).filter(Boolean);
  return !player.blocked(x, z) && world.areaAt(x, 1, z) && !doors.some((d) => Math.hypot(d.x - x, d.z - z) < DOOR_CLEAR) ? { x, z, yaw: sp.yaw } : sp;
}
export const REFUSE = 'Aqui não: é a porta.';
