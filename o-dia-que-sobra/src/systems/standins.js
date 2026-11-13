// Stand-ins: the few objects the work needs that the scene does not draw yet (a bag of rubbish, the grime
// on a mirror, a pump valve, the items behind the counter). Each is small, built with the renderer's own
// materials, and the world uses the scene's own version when the scene has one (see world.js).
import { mulberry32 } from '../rng.js';

export function createStandins(r) {
  const T = r.THREE;
  const canvasTex = (w, h, draw) => {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    draw(cv.getContext('2d'), w, h);
    const t = new T.CanvasTexture(cv); t.magFilter = t.minFilter = T.NearestFilter; t.generateMipmaps = false; t.colorSpace = T.NoColorSpace;
    return t;
  };

  /** A rubbish bag, tied at the top. Centered on the floor of its own frame. */
  function saco() {
    const g = new T.Group();
    const body = new T.Mesh(new T.SphereGeometry(0.2, 7, 5), r.mat('#26302a'));
    body.scale.set(1, 1.15, 0.9); body.position.y = 0.23; g.add(body);
    const knot = new T.Mesh(new T.ConeGeometry(0.06, 0.16, 5), r.mat('#26302a')); knot.position.y = 0.5; g.add(knot);
    const lump = new T.Mesh(new T.BoxGeometry(0.1, 0.1, 0.1), r.mat('#3a4238')); lump.position.set(0.1, 0.2, 0.14); lump.rotation.set(0.4, 0.5, 0.2); g.add(lump);
    return g;
  }

  /** A patch of grime on a flat surface (mirror, basin). amount 1 = filthy, 0 = clean. */
  function smudge(w, h, seed = 1) {
    const rnd = mulberry32(seed * 977 + 3);
    const tex = canvasTex(24, 24, (g, W, H) => {
      g.clearRect(0, 0, W, H);
      for (let i = 0; i < 46; i++) {
        const a = 0.35 + rnd() * 0.5, x = rnd() * W, y = rnd() * H, s = 1 + rnd() * 4;
        g.fillStyle = `rgba(${96 + (rnd() * 30) | 0},${88 + (rnd() * 24) | 0},${70 + (rnd() * 20) | 0},${a})`;
        g.fillRect(x, y, s, s * (0.6 + rnd()));
      }
    });
    const mat = r.mat('#ffffff', { map: tex, transparent: true, opacity: 0.9, depthWrite: false, side: T.DoubleSide });
    const mesh = new T.Mesh(new T.PlaneGeometry(w, h), mat); mesh.renderOrder = 3;
    return { mesh, setAmount(a) { mat.opacity = 0.9 * Math.max(0, Math.min(1, a)); mesh.visible = a > 0.02; } };
  }

  /** The valve wheel of a pump, to be turned. Its axis is +z; the wheel is `wheel`. */
  function registro() {
    const g = new T.Group();
    const base = new T.Mesh(new T.CylinderGeometry(0.05, 0.06, 0.1, 6), r.mat('#6a6a70')); base.rotation.x = Math.PI / 2; base.position.z = 0.05; g.add(base);
    const wheel = new T.Group(); wheel.position.z = 0.12; g.add(wheel);
    const ring = new T.Mesh(new T.TorusGeometry(0.1, 0.014, 4, 10), r.mat('#c0382c')); wheel.add(ring);
    for (let i = 0; i < 2; i++) { const sp = new T.Mesh(new T.BoxGeometry(0.2, 0.014, 0.014), r.mat('#c0382c')); sp.rotation.z = i * Math.PI / 2; wheel.add(sp); }
    return { root: g, wheel };
  }

  /** A small item of the counter's back shelf: a blister pack in the item's colour with a white label. */
  function itemAtras(cor) {
    const g = new T.Group();
    const body = new T.Mesh(new T.BoxGeometry(0.12, 0.17, 0.045), r.mat(cor)); body.position.y = 0.085; g.add(body);
    const lab = new T.Mesh(new T.BoxGeometry(0.08, 0.05, 0.005), r.mat('#e8e0c8')); lab.position.set(0, 0.1, 0.0255); g.add(lab);
    return g;
  }

  /** A plank for the back-shelf items, with a name for the sign. */
  function plank(len) {
    const g = new T.Group();
    const b = new T.Mesh(new T.BoxGeometry(len, 0.04, 0.3), r.mat('#6b4e32')); b.position.y = 0.02; g.add(b);
    for (const x of [-len / 2 + 0.05, len / 2 - 0.05]) { const br = new T.Mesh(new T.BoxGeometry(0.03, 0.25, 0.25), r.mat('#3a2e22')); br.position.set(x, -0.12, -0.02); g.add(br); }
    return g;
  }

  return { saco, smudge, registro, itemAtras, plank };
}
