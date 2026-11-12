// Cutscene 8, "fim-campanha": after the seventh fight the creatures sell you to the "Rinha Grande".
// At the negotiation table a stack of credit chips crosses to the other side while they nod; the
// lights of the shed come up on a banner with the name of the bigger pit, and you are taken
// toward it down the aisle. First person, 13 s. Scene: scenes/galpao.js.
import { buildScene } from '../scenes/galpao.js';
import { buildCreature } from '../models/creatures.js';
import { track, bob, ramp, smooth, lerp } from './common.js';

const D = 13;
const views = {
  mesa: [0, 4, 'Você de pé diante da mesa: as criaturas contam fichas e apontam para você'],
  trato: [4, 7.4, 'A pilha de fichas atravessa a mesa e uma das criaturas estende a mão aberta: negócio fechado'],
  faixa: [7.4, 11, 'Você é levado pelo corredor até a faixa acesa com o nome da Rinha Grande'],
  fim: [11, 13, 'A faixa enche a visão e a imagem escurece'],
};
const cam = track([
  { t: 0, eye: [0, 1.75, 7.2], look: [0, 1.5, -2.4] },
  { t: 4, eye: [0, 1.75, 6.4], look: [0.3, 1.5, -2.2], ease: 'ss' },
  { t: 7.4, eye: [0, 1.7, 6.0], look: [0, 1.7, -2.6], ease: 'ss' },
  { t: 8.4, eye: [-0.6, 1.65, 5.0], look: [-1, 2.4, -9], ease: 'ss' },
  { t: 9.6, eye: [-3.0, 1.65, 1.8], look: [-1.5, 3.0, -10] },
  { t: 10.6, eye: [-3.2, 1.65, -3.0], look: [-1, 3.6, -11.9] },
  { t: 11.6, eye: [-2.0, 1.65, -6.8], look: [0, 4.0, -11.9] },
  { t: 13, eye: [-0.6, 1.65, -8.8], look: [0, 4.3, -11.9] },
]);

export default {
  name: 'fim-campanha', prefix: 'fim', duration: D, cue: 'flashes', views,
  anchors: { mesa: 'A mesa de negociação', faixa: 'A faixa com o nome da Rinha Grande', fichas: 'A pilha de fichas que atravessa a mesa' },
  sfx: [{ t: 1.0, name: 'moeda' }, { t: 2.0, name: 'moeda' }, { t: 5.0, name: 'moeda' }, { t: 5.6, name: 'moeda' }, { t: 6.6, name: 'ui_ok' }, { t: 8.0, name: 'porta_cela' }, { t: 8.0, name: 'multidao', opts: { intensity: 0.5 } }, ...[8.6, 9.2, 9.8, 10.4, 11.0, 11.6].map((t) => ({ t, name: 'passo' }))],
  build(ctx) {
    const { r } = ctx, T = r.THREE;
    const sc = buildScene(r, { seed: ctx.seed });
    const seats = [['casca', 'lugarJavali'], ['fole', 'lugarLobo'], ['vigia', 'lugarUrso'], ['casca', 'lugarRaposa']];
    const crowd = seats.map(([sp, place], i) => {
      const an = buildCreature(r, sp, { seed: 50 + i });
      const holder = new T.Group(); holder.position.set(sc.anchors[place][0], 0, sc.anchors[place][2]); holder.rotation.y = sc.facing[place];
      holder.add(an.root); sc.group.add(holder); return { an, holder, base: sc.facing[place] };
    });
    // the banner: "RINHA GRANDE" painted on a tiny canvas
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 24; const g = cv.getContext('2d');
    g.fillStyle = '#3a0f14'; g.fillRect(0, 0, 128, 24); g.fillStyle = '#c9a24a'; g.fillRect(0, 0, 128, 2); g.fillRect(0, 22, 128, 2);
    g.font = 'bold 15px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#f0d27a'; g.fillText('RINHA GRANDE', 64, 12.5);
    const tx = new T.CanvasTexture(cv); tx.magFilter = tx.minFilter = T.NearestFilter; tx.generateMipmaps = false; tx.colorSpace = T.NoColorSpace;
    const banner = new T.Mesh(new T.PlaneGeometry(7.2, 1.35), r.mat('#ffffff', { map: tx, emissive: 1, fogged: 0.2 }));
    banner.position.set(0, 4.6, -11.85); sc.group.add(banner);
    const bl = new T.Mesh(new T.BoxGeometry(7.6, 1.55, 0.1), r.mat('#2a2e3a', { map: 'metal' })); bl.position.set(0, 4.6, -11.92); sc.group.add(bl);
    // the stack of chips that crosses the table (from the creatures near you to the one who buys)
    const chips = new T.Group(); sc.group.add(chips);
    const chipM = r.mat('#ffd23a', { emissive: 1, fogged: 0.4 });
    for (let i = 0; i < 6; i++) { const c = new T.Mesh(new T.CylinderGeometry(0.14, 0.14, 0.03, 8), chipM); c.position.y = i * 0.035; chips.add(c); }
    return {
      group: sc.group, lights: sc.lights,
      anchors: { mesa: () => sc.anchors.mesa, faixa: () => [0, 4.6, -11.85], fichas: () => chips.position.toArray() },
      pose(t, ambient) {
        sc.update(ambient);
        const speaker = Math.floor(t / 1.1) % 4, tt = (t % 1.1) / 1.1;
        crowd.forEach((c, i) => {
          c.an.update(ambient + i, undefined);
          const talk = i === speaker ? Math.sin(Math.PI * tt) : 0, J = c.an.joints;
          if (i === speaker) { J.shoulderR.rotation.x = -0.8 * talk; J.shoulderR.rotation.z = -0.3 * talk; J.elbowR.rotation.x = -1.2 * talk; }
          if (i === 2 && t > 5.6) { const k = smooth(ramp(t, 5.6, 6.4)); J.shoulderL.rotation.x = -1.2 * k; J.elbowL.rotation.x = -0.3 * k; } // the buyer reaches for the stack
          c.holder.rotation.set(talk * 0.12, c.base + Math.sin(t * 1.1 + i) * 0.08, 0);
          if (i === 2 && t > 5.6) c.holder.rotation.x += 0.1 * smooth(ramp(t, 5.6, 6.4)); // the buyer leans to take the stack
        });
        const u = smooth(ramp(t, 4.4, 6.2));
        chips.position.set(lerp(1.4, -0.4, u), 1.25 + Math.sin(Math.PI * u) * 0.12, lerp(-2.0, -1.6, u));
        // the lights come up over the banner as you are taken toward it
        sc.lights.level(3, 0.8 + 1.6 * smooth(ramp(t, 7.4, 9)));
        const c = cam(t), b = bob(t, ramp(t, 8.3, 9) * 0.8, 1.9);
        return { eye: [c.eye[0] + b[0] * 0.4, c.eye[1] + b[1], c.eye[2]], look: c.look, roll: c.roll + b[2], fade: Math.max(1 - smooth(ramp(t, 0, 0.9)), smooth(ramp(t, 12.0, 13))), daze: 0.1 + 0.3 * ramp(t, 11, 13) };
      },
    };
  },
};
