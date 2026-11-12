// Cutscene 4, "cela-acordar": you wake up in the cell. The camera passes slowly along the tally
// wall (4 s, no close-up), stops 3 s at the panel with "FRASE:" blinking, shows the crow on the
// grate looking at the coin on the floor (2 s), goes down to the coin and up to the crow again.
// First person, 17 s. Scene: scenes/cela.js (the tally counts come from ctx.groups).
import { buildScene } from '../scenes/cela.js';
import { buildAnimal } from '../models/animals.js';
import { track, bob, playerArms, liftArms, ramp, smooth } from './common.js';

const D = 17;
const views = {
  acordar: [0, 2.2, 'Você acorda na cama de uma cela futurista, a visão ainda turva'],
  riscos: [2.2, 6.2, 'A câmera passa devagar pela parede do fundo, com os grupos de riscos da esquerda para a direita'],
  painel: [6.2, 9.2, 'Parada de frente para o painel ao lado da porta: o campo "FRASE:" pisca'],
  corvo: [9.2, 11.2, 'Um corvo pousado na grade do respiro, olhando fixo para a moeda no chão'],
  moeda: [11.2, 14, 'A câmera desce até a moeda brilhante no chão da cela'],
  corvoDeNovo: [14, 17, 'A câmera sobe de novo ao corvo, que continua olhando a moeda'],
};

const COIN = [0.7, 0.02, -0.9];
const CROW = [-2.78, 1.56, -1.4];
const cam = track([
  { t: 0.0, eye: [-2.05, 0.9, 2.15], look: [-1.2, 2.9, 1.6], roll: 0.15 }, // wakes up looking at the ceiling
  { t: 1.2, eye: [-2.05, 0.92, 2.15], look: [-1.1, 2.9, 0.6], roll: 0.1, ease: 'ss' }, // the first seconds look up at the ceiling: the tally wall is not in the frame yet
  { t: 2.2, eye: [-1.5, 1.5, 1.0], look: [-0.8, 3.0, 0.0], roll: 0.02 },
  { t: 2.9, eye: [-0.95, 1.6, 0.45], look: [-0.5, 1.75, -2.8], roll: 0 },
  { t: 5.0, eye: [0.7, 1.6, 0.45], look: [0.35, 1.75, -2.8] }, // the tally wall stays in view to the end of this view (about 4 s of it)
  { t: 6.17, eye: [0.95, 1.6, 0.45], look: [0.45, 1.75, -2.8] },
  { t: 6.2, eye: [1.1, 1.55, 0.05], look: [2.5, 1.35, -0.55], ease: 'ss' }, // the next view opens on the panel: no tally wall in its frames
  { t: 6.9, eye: [1.2, 1.55, -0.1], look: [2.5, 1.35, -0.55], ease: 'ss' },
  { t: 9.17, eye: [1.35, 1.55, -0.55], look: [2.5, 1.35, -0.55] }, // the panel view holds to its last instant
  { t: 9.2, eye: [-1.3, 1.6, -1.15], look: [-2.8, 1.62, -1.4], ease: 'ss' }, // the crow view opens on the crow at the grate (a cut, no sweep)
  // the crow is seen close to the grate, from far enough along the wall that the tally board stays out of the frame
  { t: 9.9, eye: [-1.3, 1.6, -1.15], look: [-2.8, 1.62, -1.4], ease: 'ss' },
  { t: 11.2, eye: [-1.3, 1.6, -1.15], look: [-2.8, 1.62, -1.4], ease: 'ss' },
  { t: 12.4, eye: [0.2, 1.1, -0.35], look: [0.7, 0.3, -0.9], ease: 'ss' },
  { t: 14.0, eye: [0.35, 0.55, -0.45], look: [0.7, 0.05, -0.9], ease: 'ss' },
  { t: 14.9, eye: [1.1, 1.15, 0.0], look: [0.4, 0.0, -0.9], ease: 'ss' }, // backs away and up, the coin still in the frame
  { t: 15.9, eye: [-0.3, 1.4, -0.9], look: [-2.8, 1.58, -1.4], ease: 'ss' },
  { t: 17.0, eye: [-1.3, 1.6, -1.15], look: [-2.8, 1.62, -1.4] },
]);

export default {
  name: 'cela-acordar', prefix: 'cela', duration: D, cue: 'cela', views,
  anchors: { riscos: 'A parede dos riscos, ao fundo da cela', painel: 'O painel com o campo FRASE ao lado da porta', corvo: 'O corvo pousado na grade', moeda: 'A moeda brilhante no chão' },
  sfx: [{ t: 1.0, name: 'passo' }, { t: 2.6, name: 'passo' }, { t: 3.2, name: 'passo' }, { t: 3.8, name: 'passo' }, { t: 4.4, name: 'passo' }, { t: 5.0, name: 'passo' }, { t: 5.6, name: 'passo' }, { t: 6.2, name: 'passo' }, { t: 9.6, name: 'corvo' }, { t: 13.0, name: 'moeda' }, { t: 15.3, name: 'corvo' }],
  build(ctx) {
    const { r } = ctx;
    const sc = buildScene(r, { seed: ctx.seed, groups: ctx.groups ?? undefined });
    sc.parts.setCoin(true); sc.parts.setPanel('idle', '');
    const crow = buildAnimal(r, 'corvo', { seed: 5, scale: 1.45 });
    const perch = new r.THREE.Group(); perch.position.set(...CROW); perch.add(crow.root); sc.group.add(perch); // the crow moves its own root up and down
    const { arms, rig } = playerArms(r, { bare: true }); liftArms(arms, 0.3);
    return {
      group: sc.group, lights: sc.lights, arms,
      anchors: { riscos: () => sc.anchors.riscos, painel: () => sc.anchors.painelTela, corvo: () => CROW, moeda: () => COIN },
      pose(t, ambient) {
        sc.update(ambient); crow.update(ambient, 0);
        // the crow turns its head to the coin and, now and then, to you
        const glance = smooth(ramp(t, 15.2, 15.8)) * (1 - smooth(ramp(t, 16.2, 16.8))) * 0.5;
        // three-quarter view: the beak points along the wall toward the coin's side, head bowed to the floor
        perch.rotation.set(0, 0.3 + glance, 0);
        const walk = t > 2.2 && t < 6.6 ? 1 : 0, b = bob(t, walk * 0.7, 1.7);
        const c = cam(t);
        const eye = [c.eye[0], c.eye[1] + b[1] * (t > 2.2 ? 1 : 0), c.eye[2]];
        const sway = Math.sin(t * 1.3);
        rig.hang(sway * (t < 2.6 ? 1 : 1.5)); // the hands stay low at the corners of the view
        const fade = 1 - smooth(ramp(t, 0.1, 1.2)) + 0.4 * Math.max(0, Math.sin(t * 2.2)) * (t < 2 ? 1 : 0);
        return { eye, look: c.look, roll: c.roll + b[2], fade: Math.min(1, fade), daze: t < 2.4 ? 0.3 * (1 - ramp(t, 0.4, 2.4)) : 0, blur: t < 1.6 ? 0.5 * (1 - ramp(t, 0.2, 1.6)) : 0 };
      },
    };
  },
};
