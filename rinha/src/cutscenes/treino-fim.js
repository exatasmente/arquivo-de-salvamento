// Cutscene 5, "treino-fim": the end of the training, you save at the terminal. The memory card
// screen shows for 3 s with all 15 blocks in view (no zoom): the grid is 5 columns by 3 rows,
// block 13 is the middle one of the last row, with a broken icon. First person, 7 s.
// Scene: scenes/treino.js. ctx.blocks (card.blocks()) is drawn when the game passes it.
import { buildScene } from '../scenes/treino.js';
import { buildCreature } from '../models/creatures.js';
import { GUIDE_END } from './treino-aula.js';
import { track, bob, playerArms, defaultBlocks, ramp, smooth, lerp } from './common.js';

// The instructor who led you here (the walk of treino-aula) is where that walk left him, and goes on to stand by the terminal, out of the way.
const GUIDE_STOP = [GUIDE_END.x, GUIDE_END.z];

const D = 7;
const views = {
  terminal: [0, 3, 'Você atravessa o salão de treino até o terminal de salvar, no canto'],
  cartao: [3, 6, 'A tela do cartão de memória, por 3 s: a grade de 15 blocos, com o bloco 13 de ícone quebrado'],
  fim: [6, 7, 'A tela se apaga e a visão volta ao terminal'],
};
const TERM = [-7.1, 1.0, -4.8];
const cam = track([
  { t: 0, eye: [-2.8, 1.65, -1.0], look: [-6, 1.2, -4.2] },
  { t: 1.6, eye: [-4.4, 1.6, -2.6], look: [-7.1, 1.15, -4.8] },
  { t: 3.0, eye: [-5.2, 1.55, -3.6], look: [-7.1, 1.1, -4.8], ease: 'ss' },
  { t: 6.0, eye: [-5.3, 1.55, -3.7], look: [-7.1, 1.1, -4.8] },
  { t: 7.0, eye: [-5.3, 1.55, -3.7], look: [-7.1, 1.1, -4.8] },
]);

export default {
  name: 'treino-fim', prefix: 'treino', duration: D, cue: 'treino', views,
  anchors: { terminal: 'O terminal de salvar', cartao: 'A tela do cartão de memória' },
  sfx: [{ t: 0.6, name: 'passo' }, { t: 1.2, name: 'passo' }, { t: 1.8, name: 'passo' }, { t: 2.4, name: 'passo' }, { t: 2.6, name: 'painel_tecla', opts: { key: 5 } }, { t: 3.0, name: 'salvar' }],
  build(ctx) {
    const { r } = ctx;
    const sc = buildScene(r, { seed: ctx.seed });
    const { arms, rig } = playerArms(r, { bare: false });
    const guide = buildCreature(r, 'mestre', { seed: 3, scale: 1.0 }), holder = new r.THREE.Group(); holder.add(guide.root); sc.group.add(holder); holder.scale.setScalar(1.2);
    return {
      group: sc.group, lights: sc.lights, arms,
      anchors: { terminal: () => TERM, cartao: () => TERM },
      pose(t, ambient) {
        sc.update(ambient);
        const g = smooth(ramp(t, 0, 2.4));
        guide.update(ambient);
        holder.position.set(lerp(GUIDE_END.x, GUIDE_STOP[0], g), 0, lerp(GUIDE_END.z, GUIDE_STOP[1], g));
        holder.rotation.y = lerp(GUIDE_END.yaw, Math.atan2(-7.5 - GUIDE_STOP[0], -4.8 - GUIDE_STOP[1]), smooth(ramp(t, 0.4, 2.4)));
        const c = cam(t), b = bob(t, t < 2.8 ? 0.8 : 0);
        const u = smooth(ramp(t, 2.0, 2.6)) * (1 - smooth(ramp(t, 3.0, 3.4)));
        rig.hang(Math.sin(t * 1.5)); rig.reach('right', [lerp(0.2, 0.06, u), lerp(-0.4, -0.08, u), lerp(-0.34, -0.55, u)]);
        const card = t >= 3.0 && t < 6.0 ? { blocks: ctx.blocks ?? defaultBlocks(), saving: true, sel: 0 } : null;
        return { eye: [c.eye[0] + b[0] * 0.3, c.eye[1] + b[1], c.eye[2]], look: c.look, roll: c.roll + b[2], fade: smooth(ramp(t, 6.4, 7.0)), card };
      },
    };
  },
};
