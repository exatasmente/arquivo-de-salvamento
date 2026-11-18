// The street as a list of entities, from a seed. The avenue runs along X (the road is z from -6.6 to 6.6, the
// sidewalks to +-11), the viaduct crosses it over x = 0 along Z, the manhole to the gallery is on the south
// sidewalk under the deck. The first street (seed 7) is what data/scenes/rua.json holds, with the hand-made
// places fixed (the boarding point, the delivery point, the marquise, the skip, the tower, the panels and the
// cable); the rest (the buildings, the lamps, the parked cars) comes from the seed. The game uses only this one street (seed 7, the
// file above, edited in the scene editor): the stretches of the exits are fixed stretches of it. No Math.random: only the engine's mulberry32.
import { mulberry32 } from '../../vendor/engine/rng.js';

export const STREET = { halfX: 58, road: 6.6, walk: 11, curb: 0.15, viaductX: 0, manhole: [-1.2, 9.5],
  // the walled-off entrance of the metro station that was never opened, on the south sidewalk: z0 is the side of the street (the door in the hoarding), z1 the back
  station: { x0: -10.4, x1: -6.4, z0: 7.9, z1: 10.9 } };
const PICTOS = ['farmacia', 'vialume', 'entrega', 'embarque', 'comida', 'caixa', 'nenhum', 'nenhum', 'nenhum'];

export function streetLayout(seed = 7) {
  const r = mulberry32(seed * 7919 + 11), P = Math.PI, E = [], H = STREET.curb;
  const add = (id, type, pos, rotY = 0, params = {}) => E.push({ id, type, pos: pos.map((v) => +v.toFixed(2)), rot: [0, +rotY.toFixed(3), 0], scale: [1, 1, 1], params });
  const pick = (l) => l[Math.floor(r() * l.length)];

  // the viaduct, its pillars, the manhole, the solar panels and the cable
  add('viaduto', 'viaduto', [0, 0, 0], 0, { comprimento: 90, largura: 10, altura: 7 });
  for (const [i, [x, z]] of [[-3.2, -8.6], [3.2, -8.6], [-3.2, 0], [3.2, 0], [-3.2, 8.6], [3.2, 8.6]].entries()) add(`pilar-${i + 1}`, 'pilar', [x, z === 0 ? 0 : H, z], 0, { raio: 0.6, altura: z === 0 ? 7 : 6.85 });
  const [mx, mz] = STREET.manhole;
  add('boca-rua', 'bocaRua', [mx, H, mz]);
  for (const [i, z] of [-8.6, 0, 8.6].entries()) add(`lampada-viaduto-${i + 1}`, 'lampada', [0, 6.95, z], 0, { queda: 0.3, cor: '#ffc078', alcance: 13 });
  add('bueiro-1', 'bueiro', [-3.4, 0, 5.9], 0); add('bueiro-2', 'bueiro', [14.5, 0, -5.9], 0);
  add('paineis', 'painelSolar', [16, H, 9.2], 0, { colunas: 3, fileiras: 2 });
  add('cabo-paineis', 'cabo', [7.6, H, 9.5], 0, { comprimento: 16.8, raio: 0.07 });
  add('caixa-dagua-alta', 'caixaDaguaAlta', [11, 0, -19], 0, { raio: 2.2, altura: 16 });

  // the places the video films
  add('ponto-embarque', 'pontoDeEmbarque', [-10, H, -8.3], 0);
  add('carro-embarque', 'carro', [-8.6, 0, -4.3], P / 2, { tipo: 'sedan', cor: '#8a8e92', luzes: true, porta: true });
  add('ponto-entrega', 'pontoDeEntrega', [14, H, -8.7], 0);
  add('marquise', 'marquise', [30, H, 9.2], 0, { largura: 15, profundidade: 4, altura: 3.6 });
  add('cacamba', 'cacamba', [-14, 0, 5.3], 0, { cor: '#6a5a3a', semente: 4 });
  add('semaforo', 'semaforo', [-19.5, H, 7.1], P, { cor: 2 });
  add('hidrante', 'hidrante', [-12, H, 7.3]); add('placa-perigo', 'placa', [5.8, H, -7.2], 0, { altura: 2.4, picto: 'perigo' });
  add('placa-seta', 'placa', [-30, H, 7.2], P, { altura: 2.4, picto: 'seta' });
  add('barreira-1', 'barreira', [-33, 0, 2.2], P / 2, { comprimento: 3 }); add('barreira-2', 'barreira', [-33, 0, -2.2], P / 2, { comprimento: 3 });
  for (let i = 0; i < 3; i++) add(`cone-${i + 1}`, 'cone', [-31 + i * 0.4, 0, 3.9 - i * 1.6]);
  for (const sx of [-1, 1]) { for (const z of [-4.5, 0, 4.5]) add(`barreira-fim-${sx < 0 ? 'o' : 'l'}${Math.round(z + 5)}`, 'barreira', [sx * (STREET.halfX - 0.8), 0, z], P / 2, { comprimento: 4 }); add(`cone-fim-${sx < 0 ? 'o' : 'l'}`, 'cone', [sx * (STREET.halfX - 2.5), 0, 2.2]); }
  add('entulho-1', 'entulho', [31, H, -9.4], 0.4, { semente: 3 });

  // the lamps along both sidewalks, a few out
  let n = 0;
  for (let x = -56; x <= 56; x += 16) {
    if (Math.abs(x) < 7 || (x > -14 && x < -5)) continue;
    add(`poste-s${++n}`, 'poste', [x, H, 7.3], P, { acesa: r() > 0.22, altura: 8, cor: r() < 0.8 ? '#ffc078' : '#d8e8ff' });
    add(`poste-n${n}`, 'poste', [x + 8, H, -7.3], 0, { acesa: r() > 0.22, altura: 8, cor: r() < 0.8 ? '#ffc078' : '#d8e8ff' });
  }
  // the buildings: two rows, front to the street, with gaps (alleys), none under the viaduct
  const row = (side) => {
    let x = -STREET.halfX - 2, i = 0;
    while (x < STREET.halfX) {
      const w = pick([9, 12, 12, 15, 18, 21]), d = 12 + Math.floor(r() * 10), cx = x + w / 2;
      const gap = Math.floor(r() * 3) * 2;
      const hit = (cx + w / 2 > -8 && cx - w / 2 < 8) || (side < 0 && cx + w / 2 > 4 && cx - w / 2 < 18);
      if (!hit) {
        const mq = side > 0 && cx > 20 && cx < 40;
        add(`predio-${side < 0 ? 'n' : 's'}${++i}`, 'predio', [cx, 0, side * (11.5 + d / 2)], side < 0 ? 0 : P, {
          largura: w, profundidade: d, andares: 3 + Math.floor(r() * 9), semente: Math.floor(r() * 9999), fachada: pick(['concreto', 'concreto', 'tijolo', 'vidro']),
          cor: pick(['#9a9894', '#8c8e92', '#a29a8c', '#8a8a96', '#94a0a4']), letreiro: pick(PICTOS), marquise: false, luzes: +(0.04 + r() * 0.08).toFixed(2),
        });
      }
      x += w + gap;
    }
  };
  row(-1); row(1);
  // parked cars, along the curbs, beside the hand-made places
  const spots = [[-27, 5.0, 'van'], [-21, 5.0, 'sedan'], [11, 5.0, 'furgao'], [20, 5.0, 'sedan'], [38, 5.0, 'sedan'], [-34, -5.0, 'sedan'], [-18, -5.0, 'van'], [24, -5.0, 'sedan'], [36, -5.0, 'furgao'], [48, 5.0, 'sedan']];
  spots.forEach(([x, z, tipo], i) => add(`carro-${i + 1}`, 'carro', [x + (r() - 0.5), 0, z + (r() - 0.5) * 0.3], P / 2 + (z < 0 ? P : 0) + (r() - 0.5) * 0.06, { tipo, cor: pick(['#6a7a8a', '#8a6a52', '#5a6a5a', '#7a7a80', '#9a8a6a', '#4a5a72']), luzes: false, porta: false }));
  return { scene: 'rua', version: 1, entities: E };
}
