// "cartao" (part 8 of the video): after the cut, the screen of the memory card saves the night; block 13 stays
// corrupted (the icon is broken) and, when the other game's card is in this browser, its block shows too.
// The last box is the thought of the protagonist. First person, 12 s. The card screen is drawn flat, no zoom.
import { track, smooth, ramp, dialogue, BABBLE_SEEDS, defaultBlocks, withSegments } from './common.js';

const D = 12;
const views = {
  salvando: [0, 7, 'A tela do cartão de memória salva a noite; o bloco 13, de ícone quebrado, fica à vista'],
  fim: [7, 12, 'A noite salva; a última caixa: "Nem todo arquivo foi salvo."'],
};
const say = dialogue([{ t: 7.4, who: '', text: 'Nem todo arquivo foi salvo.', seed: BABBLE_SEEDS.heitor, hold: 2.2 }]);
const cam = track([{ t: 0, eye: [5.5, 1.5, 15.0], look: [5.5, 1.3, 12.0] }, { t: 12, eye: [5.5, 1.5, 15.0], look: [5.5, 1.3, 12.0] }]);
const hasRinha = () => { try { return Boolean(localStorage.getItem('rinha.card.v1')); } catch { return false; } };

const BASE = {
  name: 'cartao', duration: D, views,
  anchors: { bloco13: 'O bloco 13 do cartão, de ícone quebrado' },
  sfx: [
    { t: 0.6, name: 'ui_ok' },
    { t: 0.8, name: 'tecla', opts: { dur: 1, gain: 0.5 } }, { t: 2.2, name: 'tecla', opts: { gain: 0.5 } }, { t: 3.6, name: 'tecla', opts: { gain: 0.5 } },
    { t: 6.2, name: 'ui_ok' },
    ...say.sfx,
  ],
  build(ctx) {
    return {
      hands: false,
      anchors: { bloco13: () => [0, 0, 0] },
      pose(t) {
        const c = cam(t);
        const blocks = ctx.blocks ?? defaultBlocks({ rinha: hasRinha() });
        return {
          eye: c.eye, look: c.look, fade: Math.max(1 - smooth(ramp(t, 0, 0.6)), smooth(ramp(t, 11.2, 11.95))), dialog: say.at(t),
          card: { blocks, saving: t < 6.2, sel: null, veil: t < 6.2 ? 0.3 : 0.94, alpha: t < 6.2 ? 1 : 0.5 },
          dim: t < 6.2 ? 0 : 0.9, world: { state: { hora: 6 }, on: ['escritorio-teto'] },
        };
      },
    };
  },
};

// ---- one window per scene of the video (see withSegments in common.js)
const SEGS = [
  { name: 'c58-salvando', desc: 'Cena 58: a tela do cartão de memória salvando a noite, o bloco 13 de ícone quebrado à vista, sem zoom; sem texto', pieces: [{ src: 1.0, d: 3.5 }] },
  { name: 'c59-nem-todo', desc: 'Cena 59: a tela do cartão ao fim do salvamento; a última caixa', pieces: [{ src: 7.0, d: 3.2 }],
    say: [{ t: 0.3, who: '', text: 'Nem todo arquivo foi salvo.', seed: BABBLE_SEEDS.heitor, hold: 1.0 }] },
];
const FULL = withSegments(BASE, SEGS);
export default { name: 'cartao', duration: FULL.duration, views: FULL.views, anchors: BASE.anchors, sfx: FULL.sfx, build: FULL.build };
