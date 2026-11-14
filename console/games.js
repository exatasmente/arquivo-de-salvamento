// The games on the home screen, in the order of the row. Each one: where it opens, its cover, its lines, its
// videos and how to read its memory card (the engine's save.js, read only: the home screen never writes a card).
import { readCard } from './vendor/engine/save.js';

export const GAMES = [
  {
    id: 'rinha',
    block: 1,
    title: 'RINHA',
    url: 'rinha/',
    cover: 'assets/rinha.jpg',
    hook: 'As criaturas que a gente capturava para lutar agora capturam a gente.',
    desc: 'Você saiu de casa com fome, atrás de maçãs, e acordou numa cela. Sete lutas até o Campeão da Rinha.',
    tags: '7 LUTAS',
    card: 'rinha.card.v1',
    saved(d) {
      if (d.campaign) return `SALVO · LUTA ${Math.min(7, d.campaign.fightNo || 1)} DE 7`;
      const best = d.record?.best || 0;
      return best > 0 ? `RECORDE · ${best} DE 7 LUTAS` : null;
    },
    videos: [
      ['Quanto custa uma maçã?', 'https://youtu.be/JX5kI8xQINc'],
      ['Quanto custa uma maçã? (parte 1, Short)', 'https://youtube.com/shorts/x_AhxWZpyrE'],
      ['Quanto custa uma maçã? (parte 2, Short)', 'https://youtube.com/shorts/RYriWfLZJUU'],
    ],
  },
  {
    id: 'o-dia-que-sobra',
    block: 2,
    title: 'O DIA QUE SOBRA',
    url: 'o-dia-que-sobra/',
    cover: 'assets/o-dia-que-sobra.jpg',
    hook: 'Quatro semanas de turno da madrugada num posto de gasolina.',
    desc: 'Abasteça, atenda, reponha, feche o caixa às seis. Algo no Posto Bom Dia não quer que a folga chegue.',
    tags: '4 SEMANAS · 5 FINAIS',
    card: 'o-dia-que-sobra.card.v1',
    saved(d) {
      if (d.run) return `SALVO · SEMANA ${d.run.week || 1} · DIA ${d.run.day || 1} DE 28`;
      const n = (d.endings || []).length;
      return n > 0 ? `${n} DE 5 FINAIS VISTOS` : null;
    },
    videos: [
      ['Acende', 'https://youtube.com/shorts/BiqFRosYJT8'],
      ['Cinco coisas paradas', 'https://youtube.com/shorts/pBOI3cmGj-8'],
      ['Quarenta metros', 'https://youtube.com/shorts/_aPtL1p4i0U'],
      ['Bomba 3', 'https://youtube.com/shorts/GxH8R4-DjTA'],
      ['A lâmpada', 'https://youtube.com/shorts/JFuOz8tpUfI'],
      ['Telas', 'https://youtube.com/shorts/BtKkVvfoWeo'],
    ],
  },
];

export const CHANNEL = [
  ['YouTube', 'https://www.youtube.com/@rd1o_br'],
  ['Instagram', 'https://www.instagram.com/rad1o_br/'],
  ['TikTok', 'https://www.tiktok.com/@rad1o_br'],
  ['Código aberto no GitHub', 'https://github.com/exatasmente/arquivo-de-salvamento'],
];

/** What the game's card in this browser says, for the line under its title: a line, or null when there is none. */
export function savedLine(game, storage) {
  const d = readCard(game.card, storage);
  if (!d) return null;
  try { return game.saved(d); } catch { return null; }
}
