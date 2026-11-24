// Bakes the fall of the kitchen cupboard onto the dog (the chase, beat `empurra`) as a curve: `node tools/fuga/bake-armario.mjs`.
// A rigid box (2.1 m tall, 0.7 m deep) turning about the foot of its front, pushed past its balance (18.4 degrees), under gravity:
//   angle'' = g * ((H / 2) sin a - (D / 2) cos a) / ((H^2 + D^2) / 3)
// Its front comes down on the dog standing before it (a box: its near end `near` m from the cupboard's foot, its far end `far`, `tall` high).
// The blow takes most of its turning (restitution `bounce`) and the dog goes down under it: its back sinks from `tall` to `low` in `sink`
// seconds while the cupboard rides on it, bounces once, and comes to rest on the dog lying. Integrated at 480 Hz, kept at 60 Hz:
// data/anim/armario-queda.json { dt, tip: [radians], dog: [height of its back], hitAt, restAt, rest }. The game only reads the curve.
import { writeFileSync } from 'node:fs';

export const BOX = { H: 2.1, D: 0.7 }, DOG = { near: 0.55, far: 1.85, tall: 0.78, low: 0.4, sink: 0.3 }, PUSH = { from: 0.34, spin: 0.45 }, BOUNCE = 0.3;
/** How far over the cupboard's front can be with the dog's back `h` high: it lies on the dog's near top corner (the rest of the dog is under it). */
export const restOn = (h) => Math.atan2(DOG.near, h);
const g = 9.81, I = (BOX.H ** 2 + BOX.D ** 2) / 3, acc = (a) => g * ((BOX.H / 2) * Math.sin(a) - (BOX.D / 2) * Math.cos(a)) / I;
// the blow: the front meets the near top corner of the dog standing, at atan(near / tall); from there the dog gives way under it and the
// front follows it down, bouncing, until the dog lies and the cupboard leans on it
const touch = Math.atan2(DOG.near, DOG.tall);
const H = 1 / 480, tip = [], dog = [];
let a = PUSH.from, w = PUSH.spin, t = 0, hitAt = null, h = DOG.tall, bounces = 0, restAt = null;
for (let i = 0; t < 3; i++, t += H) {
  if (i % 8 === 0) { tip.push(+a.toFixed(4)); dog.push(+h.toFixed(4)); }
  if (restAt != null) continue;
  w += acc(a) * H; a += w * H;
  if (hitAt == null && a >= touch) hitAt = t;
  if (hitAt != null) h = DOG.tall + (DOG.low - DOG.tall) * Math.min(1, ((t - hitAt) / DOG.sink) ** 0.7);
  const lim = restOn(h);
  if (a > lim) { a = lim; if (w > 0) { if (h <= DOG.low + 1e-6 && w < 0.35) { w = 0; restAt = t; } else { w = -w * BOUNCE; bounces++; } } }
}
const out = { dt: 1 / 60, tip, dog, hitAt: +hitAt.toFixed(3), restAt: +(restAt ?? t).toFixed(3), rest: +restOn(DOG.low).toFixed(4), bounces, box: BOX, onDog: DOG, push: PUSH };
if (process.argv[1]?.endsWith('bake-armario.mjs')) {
  writeFileSync(new URL('../../data/anim/armario-queda.json', import.meta.url), JSON.stringify(out) + '\n');
  console.log(`armario-queda.json: ${tip.length} samples, the blow at ${out.hitAt} s, at rest at ${out.restAt} s on ${(out.rest * 180 / Math.PI).toFixed(1)} degrees`);
  console.log(tip.filter((_, i) => i % 6 === 0).map((v) => (v * 180 / Math.PI).toFixed(0)).join(' '));
}
