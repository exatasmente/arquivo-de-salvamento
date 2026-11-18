// The sound decoy ("isca sonora"): a handheld clicker without a voice: a dented can-shaped body with a speaker grille, a
// carrying loop of wire, a patched battery pack taped on the side and a small lamp that blinks slowly while it is on.
//
//   const d = buildDecoy(r, { seed });  d.root (on the floor at the origin, 0.16 m tall; the game turns and throws it);
//   d.setActive(bool); d.update(dt, { active, t });  the lamp blinks at 1.5 per second (steady with reduced flashes);
//   d.setReducedFlashes(bool); d.tris
import { mulberry32 } from '../../vendor/engine/rng.js';
import { kitOf } from './kit.js';

export function buildDecoy(r, { seed = 1 } = {}) {
  const T = r.THREE, kit = kitOf(r), rnd = mulberry32((seed >>> 0) * 40503 + 17);
  const root = new T.Group(), b = new kit.Batch();
  const body = { c: ['#6a6e66', '#706a5a', '#5e6a70'][Math.floor(rnd() * 3)], map: 'metal' }, ochre = { c: '#a8803a', map: 'metal' }, dark = { c: '#26282c', map: 'metal' };
  b.cyl(body, 0.055, 0.065, 0.13, 10, [0, 0.0, 0]);                     // the body
  b.cyl(dark, 0.058, 0.058, 0.02, 10, [0, 0.0, 0]);                      // the base ring
  b.cyl(ochre, 0.06, 0.06, 0.015, 10, [0, 0.085, 0]);                    // the top band
  b.cyl(dark, 0.045, 0.045, 0.012, 10, [0, 0.13, 0]);                    // the lid
  for (let i = 0; i < 5; i++) b.box(dark, [0.07, 0.006, 0.006], [0, 0.04 + i * 0.012, 0.06], { cell: 1 }); // the grille slots (front)
  for (let i = 0; i < 4; i++) b.cyl({ c: '#aab0b8', map: 'metal' }, 0.006, 0.006, 0.02, 4, [Math.cos(i * 1.6) * 0.04, 0.138, Math.sin(i * 1.6) * 0.04]); // screws
  b.box({ c: '#5a5a50', map: 'tecido' }, [0.05, 0.09, 0.03], [0.07, 0.02, 0.0], { ry: 0.3 }); // the taped battery pack
  b.box({ c: '#1a1a1c' }, [0.052, 0.012, 0.032], [0.07, 0.06, 0.0], { ry: 0.3 });
  b.cyl({ c: '#c07a3a', map: 'metal' }, 0.003, 0.003, 0.14, 4, [0.035, 0.1, 0.02], { rz: 1.2 }); // a wire to the pack
  const loop = new T.TorusGeometry(0.035, 0.005, 4, 10); loop.rotateY(Math.PI / 2); b.geo({ c: '#1c1d20', map: 'borracha' }, loop, [0, 0.16, 0]);
  b.box(ochre, [0.03, 0.03, 0.01], [-0.054, 0.05, 0.02], { ry: -0.5 }); // a worn pictogram plate (just a patch)
  const built = b.build(); for (const m of [...built.children]) root.add(m);
  let tris = b.tris;
  const lampGeo = new T.SphereGeometry(0.012, 6, 4), lampMat = r.mat('#3a1a10', { emissive: 1, fogged: 0.3 });
  const lamp = new T.Mesh(lampGeo, lampMat); lamp.position.set(-0.03, 0.11, 0.05); lamp.userData.keep = true; root.add(lamp);
  tris += lampGeo.index.count / 3;
  const sh = new T.CircleGeometry(0.1, 10); sh.rotateX(-Math.PI / 2);
  const shadow = new T.Mesh(sh, r.mat('#000000', { opacity: 0.28, transparent: true, depthWrite: false })); shadow.position.y = 0.006; shadow.userData.keep = true; root.add(shadow);
  tris += sh.index.count / 3;
  let on = false, reduced = false;
  const paint = (t) => { const lit = on && (reduced || (t * 1.5) % 1 < 0.5); lampMat.uniforms.uColor.value.set(lit ? '#ffb030' : on ? '#3a2a10' : '#2a1a14'); };
  paint(0);
  return {
    root, height: 0.17, get tris() { return Math.round(tris); },
    setActive(v) { on = Boolean(v); paint(0); },
    setReducedFlashes(v) { reduced = Boolean(v); },
    update(dt, { active = on, t = 0 } = {}) { on = Boolean(active); paint(t); },
  };
}
