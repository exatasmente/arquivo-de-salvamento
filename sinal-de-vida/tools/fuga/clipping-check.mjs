// The interpenetration check of the chase through the building: `node tools/fuga/clipping-check.mjs [--strict] [--list] [--tol 0.03]`.
// It plays the three ways of the chase with every command right (systems/fuga.js: filmRec, the same poses the game and the film draw), 30
// times a second, and at each moment measures how far Jonas (a circle on the floor: 0.22 m, 0.26 m crouched) and the dog (three circles
// of 0.25 m along its 1.3 m) are inside:
//   - the walls of the hall, the corridor and the flat, and the things of data/scenes/predio.json (src/scenes/predio-colliders.js);
//   - in the street, the cars, the pillars of the viaduct, the skip, the lamp posts and the hydrant of data/scenes/rua.json;
//   - the kitchen cupboard as it stands, and as it falls: nothing of the dog or of him may be above the plane of its front coming down;
//   - each other (not while the dog has him: an attack is contact).
// A finding is "beat:who<>what" with the deepest overlap and when. It passes only if a line of tools/fuga/clipping-exceptions.json matches
// it (`match`: a regular expression on that key; `reason`: why it stays). The stairs, the fire escape and the shaft have no boxes (their
// ways are the plan's own: test/pes.test.mjs measures the feet there). --list prints what is inside the tolerance too; --strict fails when
// an exception matches nothing any more. Exit 0: clean; 1: findings.
import { readFileSync } from 'node:fs';
import * as FU from '../../src/systems/fuga.js';
import { BLOCK, CUPBOARD } from '../../src/scenes/predio-plan.js';
import { predioColliders } from '../../src/scenes/predio-colliders.js';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true; };
const TOL = Number(arg('tol', 0.03)), LIST = arg('list', false) === true, STRICT = arg('strict', false) === true;
const json = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const PREDIO = json('../../data/scenes/predio.json'), RUA = json('../../data/scenes/rua.json'), EXC = json('./clipping-exceptions.json').map((e) => ({ ...e, re: new RegExp(e.match), used: 0 }));
const Y = BLOCK.y;
// the street: what a body can not run through (the sizes of the models, as their colliders have them)
const SIZE = { carro: { sedan: [1.8, 4.4], van: [2.0, 5.0], furgao: [2.0, 5.2] }, pilar: [1.2, 1.2], cacamba: [2.4, 1.4], poste: [0.3, 0.3], hidrante: [0.4, 0.4] };
const street = RUA.entities.flatMap((e) => { const sz = e.type === 'carro' ? SIZE.carro[e.params?.tipo ?? 'sedan'] : SIZE[e.type]; if (!sz) return []; const c = Math.abs(Math.cos(e.rot?.[1] ?? 0)), s = Math.abs(Math.sin(e.rot?.[1] ?? 0)), hw = (c * sz[0] + s * sz[1]) / 2, hd = (s * sz[0] + c * sz[1]) / 2; return [{ id: e.id, floor: 'rua', min: [e.pos[0] - hw, e.pos[2] - hd], max: [e.pos[0] + hw, e.pos[2] + hd] }]; });
const STATIC = [...predioColliders(PREDIO), ...street];
const floorOf = (q) => { const h = q.h; if (h == null) return 'rua'; if (Math.abs(h - Y[0]) < 0.4 && q.pos[1] < BLOCK.zf) return 'hall'; if (Math.abs(h - Y[3]) < 0.4 && q.pos[1] < BLOCK.zf + 0.05) return 'andar'; if (Math.abs(h - 0.15) < 0.2 || Math.abs(h) < 0.2) return 'rua'; return null; };
/** How far a circle is inside a box (0: outside). */
const inBox = (p, r, b) => { const cx = Math.max(b.min[0], Math.min(b.max[0], p[0])), cz = Math.max(b.min[1], Math.min(b.max[1], p[1])), d = Math.hypot(p[0] - cx, p[1] - cz); if (d > 0) return Math.max(0, r - d); return r + Math.min(p[0] - b.min[0], b.max[0] - p[0], p[1] - b.min[1], b.max[1] - p[1]); };
const dogCircles = (d) => [-0.42, 0, 0.42].map((o) => [d.pos[0] - Math.sin(d.yaw ?? 0) * o, d.pos[1] - Math.cos(d.yaw ?? 0) * o]);
const found = new Map();
const note = (beat, who, what, depth, t, way) => { if (depth <= 0) return; const key = `${beat}:${who}<>${what}`, f = found.get(key); if (!f || depth > f.depth) found.set(key, { key, depth, t, way, n: (f?.n ?? 0) + 1 }); else f.n++; };

let samples = 0;
for (const way of FU.BRANCHES) {
  const run = FU.filmRec(undefined, { branch: way }), end = run.rec.failAt ?? run.total;
  for (let t = 0; t < end; t += 1 / 30) {
    const P = FU.chasePose(FU.recAt(run.rec, t), t); samples++;
    if (way !== 'pano' && !FU.BEAT[P.beat].branch) continue;                      // (what is common to the three ways is measured once)
    const j = P.jonas, d = P.dog, fj = floorOf(j), fd = d.hidden && d.h < -10 ? null : floorOf({ ...d, h: d.h ?? undefined });
    const rj = (j.crouch ?? 0) > 0.5 ? 0.26 : 0.22, tip = P.fx.tip ?? 0, falling = tip > 0.02;
    for (const b of STATIC) {
      if (b.id === 'armario' && falling) continue;                              // (the cupboard going over is measured below, as a plane)
      if (b.id === 'pano') continue;
      if (fj === b.floor && (j.y ?? 0) < 0.3) note(P.beat, 'jonas', b.id, inBox(j.pos, rj, b), t, way);
      if (fd === b.floor && (d.y ?? 0) < 0.3) for (const c of dogCircles(d)) note(P.beat, 'cao', b.id, inBox(c, 0.25, b), t, way);
    }
    // the cupboard over: its front is a plane through the foot of it (x0), `tip` from upright; under it at a distance `s` there is s / tan(tip) of room
    if (falling && fd === 'andar') {
      const room = (x) => { const s = CUPBOARD.x0 - x; return s <= 0 ? Infinity : s / Math.tan(tip); }, inZ = (z) => z > CUPBOARD.z0 - 0.25 && z < CUPBOARD.z1 + 0.25;
      const back = d.back ?? 0.78;
      for (const c of dogCircles(d)) if (inZ(c[1])) note(P.beat, 'cao', 'armario-caindo', back - room(c[0] + 0.25), t, way);
      if (fj === 'andar' && inZ(j.pos[1])) note(P.beat, 'jonas', 'armario-caindo', ((j.crouch ?? 0) > 0.5 ? 1.1 : 1.75) - room(j.pos[0] + rj), t, way);
    }
    if (fj && fj === fd && !(P.fx.attack >= 0) && !j.hidden) { for (const c of dogCircles(d)) note(P.beat, 'jonas', 'cao', rj + 0.25 - Math.hypot(c[0] - j.pos[0], c[1] - j.pos[1]), t, way); }
  }
}
const all = [...found.values()].sort((a, b) => b.depth - a.depth), bad = [], kept = [];
for (const f of all) { if (f.depth <= TOL) continue; const e = EXC.find((x) => x.re.test(f.key)); if (e) { e.used++; kept.push([f, e]); } else bad.push(f); }
const line = (f) => `${f.key.padEnd(44)} ${(f.depth * 100).toFixed(1).padStart(5)} cm at ${f.t.toFixed(2)} s (${f.way}, ${f.n} samples)`;
console.log(`${samples} moments of the chase, ${STATIC.length} boxes, tolerance ${(TOL * 100).toFixed(0)} cm`);
if (LIST) for (const f of all.filter((x) => x.depth <= TOL)) console.log('  within the tolerance  ' + line(f));
for (const [f, e] of kept) console.log('  kept      ' + line(f) + '\n            ' + e.reason);
for (const f of bad) console.log('  CLIP      ' + line(f));
const rot = EXC.filter((e) => !e.used);
if (STRICT) for (const e of rot) console.log(`  an exception matches nothing any more: ${e.match}`);
console.log(bad.length ? `${bad.length} interpenetration(s)` : `no interpenetration (${kept.length} kept by an exception)`);
process.exit(bad.length || (STRICT && rot.length) ? 1 : 0);
