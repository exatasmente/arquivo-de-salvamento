// The fixed camera planes of a scene (docs: "Câmera"): the picture is cinema, a plane per stretch with cuts between them. A scene lists
// its shots, each with a zone on the floor: while Jonas is in the zone of the shot that is on, it stays; when he leaves, it cuts to the
// shot whose zone he is in. Pure.
const inside = (z, [x, y], m = 0) => x >= z.min[0] - m && x <= z.max[0] + m && y >= z.min[1] - m && y <= z.max[1] + m;
const dist2 = (z, [x, y]) => { const cx = (z.min[0] + z.max[0]) / 2, cy = (z.min[1] + z.max[1]) / 2; return (cx - x) ** 2 + (cy - y) ** 2; };

/** The index of the shot that should be on for a person at `pos` ([x, z]); `current` stays while its zone still holds the person. */
export function pickShot(shots, pos, current = -1) {
  if (!shots.length) return -1;
  if (current >= 0 && shots[current] && inside(shots[current].zone, pos, 0.15)) return current;
  const hit = shots.findIndex((s) => inside(s.zone, pos));
  if (hit >= 0) return hit;
  let best = 0, bd = Infinity;
  shots.forEach((s, i) => { const d = dist2(s.zone, pos); if (d < bd) { bd = d; best = i; } });
  return best;
}
/** The yaw that "forward" has on the floor for a shot (the stick is read against it). */
export const shotYaw = (s) => Math.atan2(-(s.at[0] - s.eye[0]), -(s.at[2] - s.eye[2]));
