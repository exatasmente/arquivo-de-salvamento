// Cutscene 1, "casa": you wake up hungry, the fridge is empty, you go out by the back door.
// First person, 26 s. Scene: scenes/casa.js (the bed is on the west side, the kitchen on the east).
import { buildScene } from '../scenes/casa.js';
import { track, bob, footfalls, playerArms, liftArms, ramp, smooth, clamp, lerp } from './common.js';
import { nightDoor } from './night.js';

const D = 26;
// views: name -> [from, to, description]
const views = {
  acordar: [0, 4.5, 'Você acorda na cama, com fome: a visão abre devagar no teto e o corpo se ergue'],
  quarto: [4.5, 8, 'Você atravessa o quarto escuro até a porta, a vela da cabeceira ficando para trás'],
  cozinha: [8, 11.5, 'A cozinha apertada: a mesa com a tigela vazia e a geladeira ao fundo'],
  geladeira: [11.5, 17, 'A mão abre a geladeira: a luz acende sobre as prateleiras vazias'],
  vazia: [17, 19, 'Dentro da geladeira não há nada: a cabeça cai de decepção'],
  portaFundos: [19, 23, 'Você vai até a porta dos fundos e a empurra: lá fora anoitece'],
  saida: [23, 26, 'A porta aberta, o ar de fora e a escuridão que engole a visão'],
};

// camera: eye and look-at points in the world of scenes/casa.js
const KEYS = [
  // wake-up: head on the pillow, the blanket and the bedside candle in the frame; the body rises beside the bed
  { t: 0.0, eye: [-3.45, 0.95, 1.75], look: [-2.85, 0.5, 1.5], roll: 0.1 },
  { t: 1.6, eye: [-3.4, 1.0, 1.75], look: [-2.7, 0.55, 1.45], roll: 0.08, ease: 'ss' },
  { t: 3.0, eye: [-3.05, 1.3, 1.75], look: [-2.45, 0.6, 1.3], roll: 0.04 },
  { t: 4.5, eye: [-2.2, 1.55, 0.9], look: [-2.85, 0.55, 1.6], roll: 0 },
  // the room: walk to the door, then a look back over the shoulder at the bed and the candle
  { t: 6.0, eye: [-1.2, 1.65, 0.6], look: [-3.0, 0.85, 1.75] },
  { t: 7.4, eye: [-0.25, 1.65, 0.3], look: [-2.9, 0.8, 1.8] },
  { t: 7.7, eye: [-0.2, 1.65, 0.27], look: [-2.5, 0.9, 1.5], ease: 'ss' },
  { t: 7.97, eye: [-0.12, 1.65, 0.26], look: [-2.5, 0.9, 1.5] }, // the bedroom view holds its framing to its last instant
  { t: 8.0, eye: [-0.1, 1.65, 0.25], look: [1.9, 1.2, 0.4] },  // and the kitchen view starts on the kitchen: a cut at the boundary
  { t: 9.8, eye: [1.1, 1.65, 0.45], look: [2.2, 0.85, 0.55], ease: 'ss' },
  { t: 11.5, eye: [1.5, 1.65, 0.5], look: [3.3, 1.2, 0.5] },
  { t: 12.6, eye: [2.2, 1.62, 0.1], look: [3.3, 1.15, 0.6], ease: 'ss' },
  { t: 14.4, eye: [2.3, 1.6, 0.0], look: [3.6, 1.0, 0.75], ease: 'ss' },
  { t: 17.0, eye: [2.3, 1.55, 0.0], look: [3.7, 0.95, 0.8] },
  { t: 18.2, eye: [2.25, 1.42, 0.0], look: [3.6, 0.55, 0.8], ease: 'ss' },
  { t: 19.0, eye: [2.25, 1.38, 0.0], look: [3.6, 0.45, 0.8] }, // the head is still down at the end of the fridge view
  { t: 19.6, eye: [2.5, 1.55, 0.2], look: [3.3, 0.9, 0.3], ease: 'ss' },
  { t: 20.4, eye: [2.55, 1.65, -0.5], look: [3.03, 1.2, -2.3] },
  { t: 22.2, eye: [2.9, 1.65, -1.4], look: [3.03, 1.2, -2.3], ease: 'ss' },
  { t: 23.6, eye: [3.0, 1.65, -1.9], look: [3.03, 1.3, -2.9] },
  { t: 26.0, eye: [3.03, 1.65, -2.7], look: [3.03, 1.5, -4.2] },
];
const cam = track(KEYS);
const walking = (t) => (t > 3.0 && t < 11.0 ? 1 : 0) + (t > 19.2 && t < 23.2 ? 1 : 0);

export default {
  name: 'casa', duration: D, cue: 'casa', views,
  anchors: { geladeira: 'A porta da geladeira', portaFundos: 'A porta dos fundos da casa', cama: 'A cama de onde você acorda', tigela: 'A tigela vazia na mesa' },
  // Sounds from the numbers of the camera: the night bed all along, the footfalls of bob(t) while it walks
  // (3 to 11 s, 19.2 to 23.2 s), the fridge opening with the door (12.5 to 13.5 s) and its hum until it shuts
  // (19.05 s), the back door pushed open (22.5 to 23.5 s).
  sfx: [
    { t: 0, name: 'noite', opts: { dur: D, vol: 0.3 } },
    ...footfalls(3.0, 11.0, 1.9, { vol: 0.6 }),
    { t: 12.75, name: 'geladeira', opts: { dur: 6.3 } },
    ...footfalls(19.2, 23.2, 1.9, { vol: 0.6 }),
    { t: 22.6, name: 'porta_cela' },
  ],
  build(ctx) {
    const { r } = ctx;
    const sc = buildScene(r, { seed: ctx.seed });
    nightDoor(sc); // the sky outside the back door is night
    const { arms, rig } = playerArms(r, { bare: true }); liftArms(arms, 0.3);
    const A = sc.anchors;
    return {
      group: sc.group, lights: sc.lights, arms,
      anchors: { geladeira: () => A.geladeira, portaFundos: () => A.portaFundos, cama: () => A.cama, tigela: () => A.tigela },
      pose(t, ambient) {
        sc.update(ambient);
        // the fridge: shut, the hand pulls it open (12.4 to 13.4 s), it stays open and empty to the end of the view (19 s) and shuts just after
        const open = smooth(ramp(t, 12.5, 13.5)) * (1 - smooth(ramp(t, 19.05, 19.5)));
        sc.parts.setFridge(open);
        sc.parts.setBackDoor(smooth(ramp(t, 22.5, 23.5)));
        const c = cam(t), w = walking(t) ? 1 : 0, b = bob(t, w * 0.9);
        const eye = [c.eye[0] + b[0] * 0.3, c.eye[1] + b[1], c.eye[2]];
        // hands: loose, a little forward; the right one pulls the fridge door and pushes the back door
        const sway = Math.sin(t * 1.4);
        if (t >= 12.0 && t < 13.8) {
          const u = smooth(ramp(t, 12.0, 12.7)) * (1 - smooth(ramp(t, 13.2, 13.8)));
          rig.hang(sway); rig.reach('right', [lerp(0.2, 0.15, u), lerp(-0.4, -0.12, u), lerp(-0.34, -0.62, u)]);
        } else if (t >= 22.0 && t < 23.9) {
          const u = smooth(ramp(t, 22.0, 22.6)) * (1 - smooth(ramp(t, 23.3, 23.9)));
          rig.hang(sway); rig.reach('right', [lerp(0.2, 0.1, u), lerp(-0.4, 0.0, u), lerp(-0.34, -0.66, u)]);
        } else if (t < 4.0) { // the hand on the empty stomach
          const u = smooth(ramp(t, 1.4, 2.6)) * (1 - smooth(ramp(t, 3.4, 4.2)));
          rig.hang(sway); rig.reach('left', [lerp(-0.22, -0.05, u), lerp(-0.4, -0.5, u), lerp(-0.34, -0.2, u)]);
        } else rig.hang(sway * (walking(t) ? 2 : 1));
        // opening the eyes: a slow blink over the first 2 s, hunger makes the sight narrow a little at 17 to 19 s
        let fade = 0.5 * (1 - smooth(ramp(t, 0.0, 1.1))); // the eyes open already ajar: never a black frame
        fade = Math.max(fade, 0.25 * Math.max(0, Math.sin(t * 1.9 + 0.5)) * (t < 3 ? 1 - ramp(t, 1.5, 3) : 0));
        fade = Math.max(fade, smooth(ramp(t, 24.2, 25.9)));
        return { eye, look: c.look, roll: c.roll + b[2], fade, daze: t < 3.6 ? 0.35 * (1 - ramp(t, 1, 3.6)) : t > 17.4 && t < 19 ? 0.25 : 0, fovK: 1 };
      },
    };
  },
};
void clamp;
