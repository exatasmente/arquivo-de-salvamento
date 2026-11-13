// MirrorSystem: the bathroom mirrors show the player's own body (models/human.js, dressed as Heitor), drawn into a small
// render target from where the mirror sees it, and put on the glass of the nearest mirror. It is a true planar mirror:
// the scene is drawn from the player's eye reflected through the mirror plane, with the near plane on the glass (so the
// wall behind it never shows), and the picture is flipped. The only thing that is not the room as it is, is the body,
// and it is drawn from the player's own recorded movement, `delay` seconds ago: normally a frame, in "O espelho" half a second.
import { buildHuman } from '../models/human.js';
import { poseWalk } from '../look.js';

const W = 72, H = 96, MAX_D = 4.6;
const HIST = 120;   // steps of 1/60 s (2 s)

export function createMirror({ world, render, player }) {
  const THREE = render.THREE;
  const mirrors = [];
  const props = world.posto.props || {};
  const body = buildHuman(render, { seed: 41, outfit: 'civil', glove: 'none', shirt: '#9a7a3a', pants: '#2e3c4e', height: 1.75, build: 'lean' });
  body.root.visible = false; render.scene.add(body.root);
  const rt = new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, generateMipmaps: false });
  rt.texture.colorSpace = THREE.NoColorSpace;
  const cam = new THREE.PerspectiveCamera(60, W / H, 0.1, 60);
  cam.matrixAutoUpdate = false;
  // the scene's own mirror handles (posto.mirrors[id]: setTexture, setFlipX, center, normal, w, h)
  for (const [id, mm] of Object.entries(world.posto.mirrors || {})) {
    const toV = (v) => (Array.isArray(v) ? new THREE.Vector3(...v) : new THREE.Vector3().copy(v));
    const c = toV(mm.center()), n = toV(mm.normal()); n.y = 0; n.normalize();
    mm.setFlipX?.(true);
    mirrors.push({ id, mm, c, n, w: mm.w, h: mm.h, right: new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), n).normalize() });
  }
  const hist = []; let delay = 0, shown = null, phase = 0, simT = 0;
  const v = new THREE.Vector3(), e = new THREE.Vector3(), ep = new THREE.Vector3();

  const eye = () => player.eyePos();
  const info = (m) => { const d = v.copy(eye()).sub(m.c); return { front: d.dot(m.n), dist: Math.hypot(d.x, d.z) }; };
  function nearest() {
    let best = null, bd = MAX_D;
    for (const m of mirrors) { const i = info(m); if (i.front > 0.3 && i.dist < bd && Math.abs(v.dot(m.right)) < 1.6) { bd = i.dist; best = m.id; } }
    return best;
  }
  const byId = (id) => mirrors.find((m) => m.id === id);
  /** Dot of the look direction with the direction to a mirror (1: looking right at it). */
  function facing(id) { const m = byId(id); return m ? player.forward().dot(e.copy(m.c).sub(eye()).normalize()) : -1; }

  function setSurface(m, on) {
    m.mm.setTexture(on ? rt.texture : null);
  }

  function sampleAt(back) { return hist[Math.max(0, hist.length - 1 - back)] || hist[0]; }
  function poseBody() {
    const s = sampleAt(Math.round(delay * 60));
    if (!s) return;
    body.root.position.set(s.x, 0, s.z); body.root.rotation.y = s.yaw + Math.PI;
    body.root.scale.set(1, s.crouch ? 0.72 : 1, 1);
    poseWalk(body.joints, s.phase, s.moving ? 1 : 0);
  }

  return {
    cam, mirrors, rt, setDelay(s) { delay = s; }, get delay() { return delay; }, get shown() { return shown; },
    nearest, facing, distTo: (id) => { const m = byId(id); return m ? info(m).dist : 99; },
    /** Every simulation step: keep the player's recent movement. */
    update(dt, t) {
      simT = t; const s = player.st;
      if (s.moving) phase += dt * 7.5 * (s.running ? 1.4 : 1);
      hist.push({ x: s.x, z: s.z, yaw: s.yaw, crouch: s.crouch, moving: s.moving, phase });
      if (hist.length > HIST) hist.shift();
    },
    /** Before the main picture: draw the mirror in front of the player, if there is one (and put it on the glass). */
    draw() {
      const id = nearest(), m = id && facing(id) > 0.25 ? byId(id) : null;
      if (shown && shown !== (m && m.id)) { setSurface(byId(shown), false); shown = null; }
      if (!m) return;
      if (shown !== m.id) shown = m.id;
      setSurface(m, false);   // the glass must not show the picture it is being drawn into
      const E = eye();
      // the eye reflected through the plane; the camera looks along the normal, off-axis through the glass
      const d = E.clone().sub(m.c).dot(m.n);
      ep.copy(E).addScaledVector(m.n, -2 * d);
      cam.position.copy(ep);
      cam.up.set(0, 1, 0);
      cam.matrixWorld.lookAt(ep, v.copy(ep).add(m.n), cam.up); cam.matrixWorld.setPosition(ep);
      cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
      const rel = e.copy(m.c).sub(ep), cy = rel.y, depth = Math.max(0.2, rel.dot(m.n));
      // the camera's own x axis, from its matrix
      const rx = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
      const cxl = rel.dot(rx);
      const near = Math.max(0.1, depth - (globalThis.__mirK ?? 0.004)), k = near / depth;
      cam.projectionMatrix.makePerspective((cxl - m.w / 2) * k, (cxl + m.w / 2) * k, (cy + m.h / 2) * k, (cy - m.h / 2) * k, near, 60);
      cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
      poseBody(); body.root.visible = true;
      const prev = render.renderer.getRenderTarget();
      render.renderer.setRenderTarget(rt); render.renderer.render(render.scene, cam); render.renderer.setRenderTarget(prev);
      body.root.visible = false;
      setSurface(m, true);
    },
    reset() { hist.length = 0; delay = 0; if (shown) { setSurface(byId(shown), false); shown = null; } },
  };
}
