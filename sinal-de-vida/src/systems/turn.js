// A turn on the spot, as his feet can step it (2026-11-19): how long it takes and how it goes over that time. The clips of the turn
// (tools/models/jonas_gait.py: 'turn_l90' and the others) were made along this same curve, so a body turned by it keeps its feet where the
// clip puts them down. Whoever turns him on the spot (the player's controller, a way of a cutscene) uses these and tells the model
// `turn: { a, k }`: the whole turn (radians, + to his left) and how far into its time it is (0..1).
/** Seconds a turn on the spot of `a` radians takes. */
export const turnTime = (a) => 0.24 + 0.2 * Math.abs(a);
/** The share of the turn made at the share `k` of its time. */
export const turnEase = (k) => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, k)));
/** Under this (radians) he does not turn on the spot: he turns as he sets off. */
export const TURN_MIN = 0.6;
