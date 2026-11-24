// The way of an actor of a cutscene (a dog of the fleet in the first one): from `from` through the corners `via` (optional) to `to`, all
// [x, z], walked at one speed. A pure function of the share u (0..1) of the way done, so the game and the film mode put the actor in the
// same place. The corners are rounded (the place is the middle of a short chord of the way) and the heading turns through them.
const ROUND = 0.35;      // metres of the way each side of a place that the chord takes (`round` of the way, if it has one: a person turns a corner wider than a dog)

/** The corners of the way and the length up to each. */
function legs(a) {
  const pts = [a.from, ...(a.via ?? []), a.to], at = [0];
  for (let i = 1; i < pts.length; i++) at.push(at[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, at, len: at[at.length - 1] };
}
function point({ pts, at, len }, s) {
  s = Math.max(0, Math.min(len, s));
  let i = 1; while (i < pts.length - 1 && at[i] < s) i++;
  const k = (s - at[i - 1]) / Math.max(1e-9, at[i] - at[i - 1]);
  return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k];
}
/** How long the way is, in metres. */
export const routeLength = (a) => legs(a).len;
/** Where the actor is at the share u of its way, and where it faces (yaw: 0 faces -Z, as the models do): { pos: [x, z], yaw }. */
export function routeAt(a, u) {
  const L = legs(a), s = Math.max(0, Math.min(1, u)) * L.len, r = Math.min(a.round ?? ROUND, L.len / 2);
  // (the chord keeps its length at the two ends of the way, so the heading there is the way's own)
  const m = Math.max(r, Math.min(L.len - r, s)), p = point(L, m - r), q = point(L, m + r), straight = L.pts.length === 2;
  const pos = straight ? point(L, s) : (s < r || s > L.len - r ? point(L, s) : [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]);
  return { pos, yaw: Math.atan2(-(q[0] - p[0]), -(q[1] - p[1])) };
}
