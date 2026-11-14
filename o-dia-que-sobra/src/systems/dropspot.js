// Where a carried thing lands when the player lets go of it: on the floor in front of the feet (or at the feet), on free floor, never inside a wall
// or a shelf, never in a doorway, and always inside the map. Used by the stock boxes, the cleaning kit, the ladder and the bag of rubbish.
export function dropSpot({ player, world }, spread = 0) {
  const st = player.st, fx = -Math.sin(st.yaw), fz = -Math.cos(st.yaw), rx = Math.cos(st.yaw), rz = -Math.sin(st.yaw);
  const doors = world.doorIds().map((id) => world.anchor(id)?.pos).filter(Boolean);
  const size = world.posto.size || { x0: -45, x1: 45, z0: -48, z1: 40 };
  const ok = (x, z) => x > size.x0 + 1 && x < size.x1 - 1 && z > size.z0 + 1 && z < size.z1 - 1 && world.areaAt(x, 1, z) && !player.blocked(x, z) && !doors.some((d) => Math.hypot(d.x - x, d.z - z) < 1.1);
  for (const d of [0.9, 0.7, 0.5, 0.3]) {
    const x = st.x + fx * d + rx * spread, z = st.z + fz * d + rz * spread;
    if (ok(x, z)) return { x, z, yaw: st.yaw };
  }
  return { x: st.x, z: st.z, yaw: st.yaw };      // at the feet: the player is standing there, so it is free floor
}
