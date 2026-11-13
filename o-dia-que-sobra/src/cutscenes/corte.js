// Scripted shift "corte" (part 7 of the video): the cut at the height. At the office monitor: first the grid of six
// pictures (2 s), then the store camera alone and, behind the counter, the figure in the old uniform, standing
// still; then you look back at the door between the office and the store, open, and the picture cuts to black.
// PROVISIONAL until phase 4: the monitor is not the game's SecurityCameraSystem. The pictures are drawn here, by
// rendering the real posto from the real ceiling cameras (cam1 to cam6) at 160 x 120, in black and white; the figure
// is only in the picture of cam1 (it is hidden in the main render, where it is never in front of the camera).
// First person, 28 s.
import { track, ramp, smooth, lerp, dialogue, withSegments } from './common.js';
import { buildCustomer } from '../models/customer.js';
import { castSpec } from './stagecraft.js';

const D = 28;
const views = {
  monitor: [0, 8, 'O monitor do escritório: a grade de seis imagens em preto e branco por 2 s, depois só a câmera da loja (provisório até a fase 4)'],
  figura: [8, 20, 'A câmera da loja no monitor inteiro: atrás do balcão, parada, uma figura de uniforme antigo (provisório até a fase 4)'],
  porta: [20, 28, 'Você olha para trás: a porta entre o escritório e a loja está aberta, o posto em silêncio; corte seco'],
};
const GRID = [0.9, 3.8], FIGURE_FROM = 8.3;
const say = dialogue([]);
const KEYS = [
  { t: 0, eye: [5.0, 1.55, 15.8], look: [5.95, 1.0, 18.8] },
  { t: 2.0, eye: [5.9, 1.45, 17.3], look: [5.95, 1.0, 18.8], ease: 'ss' },
  { t: 7.97, eye: [5.92, 1.45, 17.35], look: [5.95, 1.0, 18.8] },
  { t: 8.0, eye: [5.9, 1.45, 17.2], look: [5.95, 1.0, 18.8] },
  { t: 19.97, eye: [5.95, 1.45, 17.5], look: [5.95, 1.0, 18.8] },
  { t: 20.0, eye: [5.5, 1.62, 17.0], look: [5.2, 1.45, 15.0] },
  { t: 23.0, eye: [5.4, 1.62, 16.7], look: [5.0, 1.4, 12.2], ease: 'ss' },
  { t: 27.97, eye: [5.3, 1.62, 16.5], look: [5.0, 1.4, 11.6] },
];
const cam = track(KEYS);
const W_ = 160, H_ = 120;

const BASE = {
  name: 'corte', duration: D, views,
  anchors: { monitor: 'O monitor do escritório', balcao: 'O balcão da loja visto pela câmera 1', porta: 'A porta entre o escritório e a loja' },
  sfx: [
    { t: 0, name: 'fluorescente', opts: { dur: D, gain: 0.5 } },
    { t: GRID[0], name: 'estatica_camera', opts: { dur: 7, gain: 0.5 } },
    { t: 12.0, name: 'respiracao', opts: { dur: 8, gain: 0.5 } },
    { t: 21.0, name: 'porta_abre', opts: { pos: [5, 1, 12], gain: 0.6 } }, { t: 23.0, name: 'respiracao', opts: { dur: 5, gain: 0.5 } },
    ...say.sfx,
  ],
  build(ctx) {
    const { r } = ctx, T = r.THREE;
    const hands = ctx.hands(), W = ctx.world();
    const g = new T.Group();
    const fig = buildCustomer(r, castSpec(ctx.cast, 'frentista-antigo', { categoria: 'sobrenatural', roupa: 'frentista-antigo', sobrenatural: 'frentista-antigo', acessorios: ['bone'] }), { seed: 5 });
    fig.root.position.set(12.3, 0, 9.7); fig.root.rotation.y = Math.PI; fig.root.visible = false; fig.setPose('fixo', 0); g.add(fig.root);
    // the pictures of the cameras
    const rt = new T.WebGLRenderTarget(W_, H_, { minFilter: T.NearestFilter, magFilter: T.NearestFilter });
    const aux = new T.PerspectiveCamera(62, W_ / H_, 0.45, 60);
    const px = new Uint8Array(W_ * H_ * 4), id = new ImageData(W_, H_);
    const canvases = Array.from({ length: 6 }, () => { const c = document.createElement('canvas'); c.width = W_; c.height = H_; return c; });
    function shoot(i, withFigure, t) {
      const a = W.anchors['cam' + (i + 1)]; aux.position.copy(a.pos); aux.up.set(0, 1, 0); aux.lookAt(i === 0 ? new T.Vector3(12.3, 1.35, 9.7) : a.pos.clone().add(a.dir)); aux.updateMatrixWorld(); // cam1 aims at the counter: the provisional picture frames the figure
      aux.fov = i === 0 ? 34 : 62; aux.updateProjectionMatrix();
      fig.root.visible = withFigure;
      const arms = hands.arms.root, av = arms.visible; arms.visible = false;
      const prev = r.renderer.getRenderTarget();
      r.renderer.setRenderTarget(rt); r.renderer.render(r.scene, aux); r.renderer.readRenderTargetPixels(rt, 0, 0, W_, H_, px); r.renderer.setRenderTarget(prev);
      arms.visible = av; fig.root.visible = false;
      const d = id.data;
      for (let y = 0; y < H_; y++) for (let x = 0; x < W_; x++) {
        const s = ((H_ - 1 - y) * W_ + x) * 4, o = (y * W_ + x) * 4;
        const L = Math.min(255, Math.max(0, ((0.3 * px[s] + 0.59 * px[s + 1] + 0.11 * px[s + 2]) - 14) * 2.3) + ((x + y + Math.floor(t * 12)) % 7 === 0 ? 10 : 0));
        d[o] = L * 0.82; d[o + 1] = L; d[o + 2] = L * 0.86; d[o + 3] = 255;
      }
      canvases[i].getContext('2d').putImageData(id, 0, 0);
      return canvases[i];
    }
    return {
      group: g, hands: true, arms: hands.arms,
      anchors: { monitor: () => W.p('monitorTela'), balcao: () => [12.3, 1.0, 8.4], porta: () => W.p('porta-escritorio', 1.2) },
      pose(t) {
        const { rig } = hands;
        const c = cam(t);
        rig.hang(Math.sin(t * 1.1));
        const grid = t >= GRID[0] && t < GRID[1], single = t >= GRID[1] && t < 20;
        const fade = Math.max(1 - smooth(ramp(t, 0, 0.4)), t >= 27.6 ? smooth(ramp(t, 27.6, 27.97)) : 0);
        return {
          eye: c.eye, look: c.look, roll: 0, fade, dialog: say.at(t), noise: grid || single ? 0.07 : 0,
          world: { state: { telefoneToca: false, hora: 5.9, doors: { 'porta-escritorio': 1 } }, on: ['escritorio-teto'] },
          // the pictures are shot once the posto is posed for this frame
          late(f) {
            if (grid) f.screen = { kind: 'grid', images: [0, 1, 2, 3, 4, 5].map((i) => shoot(i, false, t)) };
            else if (single) f.screen = { kind: 'cam', image: shoot(0, t >= FIGURE_FROM, t), label: 'CAM 1', zoom: t >= 8 ? lerp(1.3, 1.6, smooth(ramp(t, 8, 19))) : 1, at: [0.5, 0.58] };
          },
        };
      },
    };
  },
};

// ---- one window per scene of the video (see withSegments in common.js)
const SEGS = [
  { name: 'c54-monitor', desc: 'Cena 54: o monitor do escritório mostra a grade de seis imagens em preto e branco por quase 3 s, depois só a câmera da loja (provisório até a fase 4)', pieces: [{ src: 0.4, d: 4.4 }] },
  { name: 'c55-figura', desc: 'Cena 55: a câmera da loja no monitor inteiro; atrás do balcão, parada, a figura de uniforme antigo (provisório até a fase 4)', pieces: [{ src: 8.0, d: 7.3 }] },
  { name: 'c56-porta', desc: 'Cena 56: você olha para trás: a porta entre o escritório e a loja está aberta, o posto em silêncio; corte seco para o preto', pieces: [{ src: 23.0, d: 5.0 }] },
];
const FULL = withSegments(BASE, SEGS);
export default { name: 'corte', duration: FULL.duration, views: FULL.views, anchors: BASE.anchors, sfx: FULL.sfx, build: FULL.build };
