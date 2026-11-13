// Props of the Posto Bom Dia: the discrete objects of the scene (pumps, shelves, products, register,
// cameras...). The posto builds them by the same functions the catalog uses, so the library of objects
// shows what the filming shows.
//
// Every prop is `def(c, o)`: `c` is a local frame of the merging builder (see scenes/paint.js), `o` the
// options. The static geometry is merged by material; whatever moves (door leaf, nozzle, drawer, display)
// is a loose mesh in `c.dyn`. A def returns extras: setters, `update(t, state)`, hit boxes.
//
//   buildProp(r, name, { seed, ...options }) -> { root, kind, ...extras }
//     root: THREE.Group, the object on the floor (y = 0) near the origin, front toward +z.
//   placeProp(builder, name, { pos, ry, area, ...options }) -> { dyn, kind, ...extras }  (used by posto.js)
import { D, FUEL, FUEL_KEYS, paintFuel, fuelUV, createBuilder, createDisplay, paintSol, paintPoster, canvasTexture, cellUV, drawSeg, tex, mulberry32, mergeGeos, tecladoUV } from '../scenes/paint.js';
import { buildCar } from './car.js';
import { buildMoto } from './moto.js';

/** name -> { label (pt-BR, short), desc (pt-BR, one sentence), scene } */
export const PROPS = {
  bomba: { label: 'Bomba de combustível', desc: 'Bomba ocre com mostrador de sete segmentos de cinco dígitos, teclado numérico com LIGAR e CANCELAR, quatro bicos coloridos (comum, aditivada, etanol, diesel), o adesivo do Sol e um registro vermelho embaixo, que gira.', scene: 'posto' },
  'teclado-bomba': { label: 'Teclado da bomba', desc: 'Painel de teclas do corpo da bomba: dígitos de 0 a 9, CANCELAR vermelho e LIGAR verde, com uma luz de bomba ligada.', scene: 'posto' },
  bico: { label: 'Bico da bomba', desc: 'Bico de abastecimento na cor do combustível, solto.', scene: 'posto' },
  produto: { label: 'Produto de prateleira', desc: 'Garrafa, lata, salgadinho, biscoito ou óleo de motor, com a embalagem pintada em poucos pixels.', scene: 'posto' },
  prateleira: { label: 'Prateleira da loja', desc: 'Gôndola de dois lados com três fileiras de produtos e etiquetas com o desenho de cada um; as embalagens podem trocar para as de 1998.', scene: 'posto' },
  'prateleira-antiga': { label: 'Prateleira com produtos de 1998', desc: 'A mesma gôndola com as embalagens antigas do Sol: cores desbotadas, listras e o Sol de propaganda em tudo.', scene: 'posto' },
  'produto-antigo': { label: 'Produto de 1998', desc: 'Garrafa, lata, salgadinho, biscoito ou óleo com a embalagem antiga do Sol, de cor desbotada e listras.', scene: 'posto' },
  'prateleira-parede': { label: 'Prateleira de parede', desc: 'Módulo de parede com três fileiras de produtos e etiquetas.', scene: 'posto' },
  'caixa-estoque': { label: 'Caixa do estoque', desc: 'Caixa de papelão com o número da caixa pintado nos quatro lados.', scene: 'posto' },
  'estante-estoque': { label: 'Estante do estoque', desc: 'Prateleira alta de metal, de quatro níveis, para as caixas.', scene: 'posto' },
  carrinho: { label: 'Carrinho de carga', desc: 'Carrinho de plataforma solto, com alça, rodinhas que giram e lugar para até quatro caixas em cima.', scene: 'posto' },
  'caixa-registradora': { label: 'Caixa registradora', desc: 'Caixa registradora bege com visor e gaveta de dinheiro que abre.', scene: 'posto' },
  leitor: { label: 'Leitor de código', desc: 'Leitor de mesa com a faixa vermelha acesa.', scene: 'posto' },
  balcao: { label: 'Balcão da loja', desc: 'Balcão de atendimento de um metro, com o adesivo do Sol na frente.', scene: 'posto' },
  cafeteira: { label: 'Cafeteira', desc: 'Cafeteira de balcão com jarra, bandeja e um copo do Sol ao lado; pode passar café sozinha, com luz acesa, fio de café e vapor.', scene: 'posto' },
  copo: { label: 'Copo do Sol', desc: 'Copo de café de papel creme com o adesivo do Sol, de pé.', scene: 'posto' },
  'adesivo-sol': { label: 'Adesivo do Sol', desc: 'Adesivo recortado do Sol de propaganda, com borda creme e uma ponta descolada, preso numa tábua.', scene: 'posto' },
  geladeira: { label: 'Geladeira da loja', desc: 'Geladeira vertical de porta de vidro com bebidas e luz fria por dentro.', scene: 'posto' },
  telefone: { label: 'Telefone', desc: 'Telefone de mesa bege com teclado, que treme quando toca.', scene: 'posto' },
  monitor: { label: 'Monitor das câmeras', desc: 'Monitor de tubo cinza com a imagem de seis câmeras em grade.', scene: 'posto' },
  computador: { label: 'Computador', desc: 'Torre bege, monitor de tubo e teclado do escritório.', scene: 'posto' },
  'mesa-escritorio': { label: 'Mesa do escritório', desc: 'Mesa de madeira com gavetas e uma cadeira giratória.', scene: 'posto' },
  armario: { label: 'Armário de metal', desc: 'Armário alto de duas portas que abrem, oco por dentro, com uma prateleira e uma caixa; grande o bastante para alguém se esconder.', scene: 'posto' },
  cofre: { label: 'Cofre', desc: 'Cofre pequeno de metal com mostrador giratório.', scene: 'posto' },
  'camera-teto': { label: 'Câmera de teto', desc: 'Câmera de segurança presa ao teto, com luz vermelha que pisca.', scene: 'posto' },
  lanterna: { label: 'Lanterna', desc: 'Lanterna de mão preta, deitada.', scene: 'posto' },
  rodo: { label: 'Rodo', desc: 'Rodo de cabo longo encostado; solto, para poder mudar de lugar.', scene: 'posto' },
  balde: { label: 'Balde', desc: 'Balde de plástico amarelado para a limpeza; solto, para poder mudar de lugar.', scene: 'posto' },
  escada: { label: 'Escada', desc: 'Escada de alumínio de cinco degraus, aberta e solta: dá para pôr embaixo de uma lâmpada.', scene: 'posto' },
  frasco: { label: 'Frasco de comprimidos', desc: 'Frasco branco liso, sem rótulo, sem marca e sem texto.', scene: 'posto' },
  lixeira: { label: 'Lixeira', desc: 'Lixeira de metal verde-musgo, redonda, que mostra um saco cheio quando é preciso esvaziar.', scene: 'posto' },
  conteiner: { label: 'Contêiner de lixo', desc: 'Contêiner de lixo grande, verde desbotado, com tampa.', scene: 'posto' },
  'quadro-forca': { label: 'Quadro de força', desc: 'Quadro de disjuntores de metal numa tábua, com porta e oito chaves (uma por área), cada uma com a etiqueta e a cor de estado.', scene: 'posto' },
  relogio: { label: 'Relógio de parede', desc: 'Relógio redondo de parede com dois ponteiros.', scene: 'posto' },
  calendario: { label: 'Calendário', desc: 'Calendário de quatro semanas com o Sol no alto, sem escrita.', scene: 'posto' },
  'quadro-tarefas': { label: 'Quadro de tarefas', desc: 'Quadro de cortiça com folhas e pictogramas de tarefas.', scene: 'posto' },
  cartaz: { label: 'Cartaz da loja', desc: 'Cartaz com o Sol e o slogan do posto.', scene: 'posto' },
  'placa-sol': { label: 'Placa alta do Sol', desc: 'Placa alta com o desenho chapado do Sol dos dois lados e o painel de combustíveis.', scene: 'posto' },
  poste: { label: 'Poste', desc: 'Poste de luz do estacionamento, com braço e lâmpada.', scene: 'posto' },
  cracha: { label: 'Crachá', desc: 'Crachá de frentista antigo, preso por um cordão, sem texto.', scene: 'posto' },
  sino: { label: 'Sino da porta', desc: 'Sino de latão preso a uma mola sobre a porta.', scene: 'posto' },
  porta: { label: 'Porta', desc: 'Porta de madeira, de metal ou de vidro, que abre e fecha.', scene: 'posto' },
  pia: { label: 'Pia', desc: 'Pia de porcelana com torneira, em bancada.', scene: 'posto' },
  vaso: { label: 'Vaso sanitário', desc: 'Vaso sanitário de porcelana com caixa de descarga.', scene: 'posto' },
  cabine: { label: 'Cabine do banheiro', desc: 'Cabine de divisórias com porta, onde dá para se esconder.', scene: 'posto' },
  espelho: { label: 'Espelho', desc: 'Espelho de parede de banheiro com moldura escura e superfície própria, que aceita uma textura de reflexo.', scene: 'posto' },
  interruptor: { label: 'Interruptor', desc: 'Interruptor de parede, do lado de fora do banheiro.', scene: 'posto' },
  luminaria: { label: 'Luminária', desc: 'Luminária fluorescente, de cobertura ou de mesa, cujo tubo pode estar queimado (escuro, com as pontas marrons).', scene: 'posto' },
  mancha: { label: 'Mancha no chão', desc: 'Mancha escura no chão, para o rodo: some aos poucos conforme se limpa.', scene: 'posto' },
  calibrador: { label: 'Calibrador de pneus', desc: 'Coluna de ar para calibrar pneus, com mangueira.', scene: 'posto' },
  'prateleira-balcao': { label: 'Prateleira atrás do balcão', desc: 'Módulo baixo com óleo de motor, carregador de celular, pilhas, fita isolante, chaveiros e caixas de fósforo, para o que o cliente pede ao frentista.', scene: 'posto' },
  'saco-lixo': { label: 'Saco de lixo', desc: 'Saco de lixo preto, cheio e amarrado, que se carrega até o contêiner.', scene: 'posto' },
  'carro-vidro-escuro': { label: 'Carro de vidro escuro', desc: 'Carro comum de vidros quase pretos, sem motorista à vista: só para e fica ali.', scene: 'posto' },
  moto: { label: 'Moto de entrega', desc: 'Moto genérica de pequeno porte, com baú atrás e farol, que pode levar o entregador.', scene: 'posto' },
  caminhao: { label: 'Caminhão baú', desc: 'Caminhão baú genérico, de cabine reta e baú claro, que abastece diesel.', scene: 'posto' },
};

// ---------------------------------------------------------------------------------------------
// Palette (ocre and brown, faded; no colour of a real chain)
const M = {
  ocre: D('#ffffff', 'column'), brown: D('#7a5434', 'plastic'), dark: D('#2a2622', 'rubber'), steel: D('#ffffff', 'steel'),
  shelf: D('#ffffff', 'shelf'), wood: D('#ffffff', 'wood'), beige: D('#ffffff', 'plastic'), board: D('#ffffff', 'cardboard'),
  counter: D('#ffffff', 'counter'), rubber: D('#ffffff', 'rubber'), green: D('#ffffff', 'green'), fridge: D('#ffffff', 'fridge'),
  prod: D('#ffffff', 'produtos'), caixas: D('#ffffff', 'caixas'), porcelain: D('#ffffff', 'porcelain'), fuel: D('#ffffff', 'fuel'),
  sol: D('#ffffff', 'solSticker'), grid: D('#ffffff', 'grid'), doorMetal: D('#ffffff', 'doorMetal'), doorWood: D('#ffffff', 'doorWood'),
  cream: D('#e0d4b0', 'plastic'), gray: D('#8c8c88', 'steel'), black: D('#1c1a18', 'rubber'),
};

// ---------------------------------------------------------------------------------------------
// Products
export const PRODUTOS = {
  garrafa: { w: 0.07, h: 0.26, d: 0.07, cells: [0, 1, 2], deep: 2 },
  lata: { w: 0.066, h: 0.12, d: 0.066, cells: [3, 4, 5], deep: 2 },
  salgadinho: { w: 0.22, h: 0.3, d: 0.05, cells: [6, 7, 8], deep: 3 },
  biscoito: { w: 0.13, h: 0.19, d: 0.04, cells: [9, 10, 11], deep: 3 },
  oleo: { w: 0.1, h: 0.2, d: 0.08, cells: [12, 13], deep: 2 },
};
export const PRODUTO_TIPOS = Object.keys(PRODUTOS);

const gcache = new WeakMap();
const rectInset = ([u0, v0, u1, v1]) => { const e = 0.5 / 64; return [u0 + e, v0 + e, u1 - e, v1 - e]; };
function capRect(cell) { const [u0, , u1, v1] = cellUV(cell); const e = 0.5 / 64; return [u0 + e, v1 - 1.5 / 64, u1 - e, v1 - e]; }
function bodyRect(cell) { const [u0, v0, u1, v1] = cellUV(cell); const e = 0.5 / 64; return [u0 + e, v0 + e, u1 - e, v1 - 2.5 / 64]; }
function remap(g, [u0, v0, u1, v1]) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + (u1 - u0) * uv.getX(i), v0 + (v1 - v0) * uv.getY(i));
  return g;
}
/** Box whose six faces (+x -x +y -y +z -z) use the given uv rects. */
export function boxFaces(T, w, h, d, rects) {
  const g = new T.BoxGeometry(w, h, d), uv = g.attributes.uv;
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k, q = rects[f];
    uv.setXY(i, uv.getX(i) ? q[2] : q[0], uv.getY(i) ? q[3] : q[1]);
  }
  return g;
}
const triCount = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
const tmpM = (T, p = [0, 0, 0], rot = [0, 0, 0]) => new T.Matrix4().compose(new T.Vector3(...p), new T.Quaternion().setFromEuler(new T.Euler(...rot)), new T.Vector3(1, 1, 1));

/** Geometry (one product, bottom at y = 0) and its triangle count, cached per renderer. */
function productGeo(r, tipo, cell) {
  let m = gcache.get(r); if (!m) gcache.set(r, (m = new Map()));
  const key = tipo + cell; if (m.has(key)) return m.get(key);
  const T = r.THREE, P = PRODUTOS[tipo], cap = capRect(cell), body = bodyRect(cell), full = rectInset(cellUV(cell));
  let geo;
  if (tipo === 'garrafa') {
    geo = mergeGeos(T, [
      { geo: remap(new T.CylinderGeometry(0.035, 0.035, 0.17, 8), body), matrix: tmpM(T, [0, 0.085, 0]) },
      { geo: remap(new T.CylinderGeometry(0.014, 0.034, 0.04, 8), cap), matrix: tmpM(T, [0, 0.19, 0]) },
      { geo: remap(new T.CylinderGeometry(0.014, 0.014, 0.05, 6), cap), matrix: tmpM(T, [0, 0.235, 0]) }]);
  } else if (tipo === 'lata') {
    geo = remap(new T.CylinderGeometry(0.033, 0.033, 0.12, 8), body); geo.translate(0, 0.06, 0);
    // lid on top: same uv cap rect
    const lid = remap(new T.CylinderGeometry(0.028, 0.033, 0.01, 8), cap); lid.translate(0, 0.125, 0);
    geo = mergeGeos(T, [{ geo, matrix: tmpM(T) }, { geo: lid, matrix: tmpM(T) }]);
  } else {
    const g = boxFaces(T, P.w, P.h, P.d, [cap, cap, cap, cap, full, full]); g.translate(0, P.h / 2, 0);
    geo = g;
    if (tipo === 'oleo') {
      const nk = remap(new T.CylinderGeometry(0.02, 0.025, 0.04, 6), cap); nk.translate(0, P.h + 0.02, 0);
      geo = mergeGeos(T, [{ geo: g, matrix: tmpM(T) }, { geo: nk, matrix: tmpM(T) }]);
    }
  }
  const out = { geo, tris: triCount(geo.index ? geo.toNonIndexed() : geo) };
  m.set(key, out); return out;
}
/** Add one product at (x, y, z) with the bottom at y. */
function addProduto(c, tipo, cell, x, y, z, ry = 0) {
  const { geo } = productGeo(c.r, tipo, cell);
  c.geo(geo, M.prod, [x, y, z], [0, ry, 0]);
}

// ---------------------------------------------------------------------------------------------
// What lives behind the counter: its own small atlas (4x4 cells of 16 px), painted here. No tobacco, no
// alcohol, no medicine: batteries, motor oil, a generic phone charger, tape, key rings, matchboxes.
export const ATRAS = {
  pilha: { cell: 0, w: 0.1, h: 0.16, pitch: 0.115, per: 1, label: 'Pilhas' },
  'oleo-motor': { cell: -1, w: 0.1, h: 0.2, pitch: 0.115, per: 1, label: 'Óleo de motor' },
  carregador: { cell: 1, w: 0.09, h: 0.14, pitch: 0.105, per: 1, label: 'Carregador de celular' },
  fita: { cell: 2, w: 0.085, h: 0.05, pitch: 0.1, per: 2, label: 'Fita isolante' },
  chaveiro: { cell: 3, w: 0.05, h: 0.09, pitch: 0.062, per: 1, label: 'Chaveiro' },
  palito: { cell: 4, w: 0.055, h: 0.032, pitch: 0.068, per: 2, label: 'Palito de fósforo' },
};

function paintAtras(g) {
  const px = (c, x, y, w, h) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  g.clearRect(0, 0, 64, 64);
  // 0: battery blister card
  px('#b23a28', 0, 0, 16, 16); px('#e6c24a', 0, 0, 16, 3); px('#7a2418', 0, 15, 16, 1);
  for (let i = 0; i < 4; i++) { px('#2c2e32', 2 + i * 3 + (i > 1 ? 1 : 0), 5, 2, 8); px('#c8a64a', 2 + i * 3 + (i > 1 ? 1 : 0), 4, 2, 1); }
  // 1: charger package
  px('#d8dce0', 16, 0, 16, 16); px('#3a6aa6', 16, 0, 16, 3); px('#2a2e34', 21, 6, 6, 6); px('#8a8e94', 22, 3 + 2, 1, 3); px('#8a8e94', 25, 5, 1, 3); px('#2a2e34', 27, 8, 4, 1);
  // 2: tape roll: black with a pale band
  px('#1e1e1e', 32, 0, 16, 16); px('#5a5a54', 32, 6, 16, 4); px('#2e2e2c', 32, 7, 16, 1);
  // 3: key-ring tag (teal), with a hole at the top
  px('#3a8a86', 48, 0, 16, 16); px('#a8d4ca', 52, 4, 8, 1); px('#1c3a38', 54, 1, 4, 3);
  // 4: matchbox (box front), 5: its side with the striker
  px('#c8902a', 0, 16, 16, 16); px('#a82a1c', 2, 18, 12, 3); px('#e8d8a0', 2, 24, 12, 4);
  px('#2e2a26', 16, 16, 16, 16); px('#5a4a3a', 16, 20, 16, 2);
  // 7: the other key-ring tag (red)
  px('#b8503a', 48, 16, 16, 16); px('#e0b8a0', 52, 20, 8, 1); px('#40201a', 54, 17, 4, 3);
}
const atrasCache = new WeakMap();
function atrasDesc(r) {
  let d = atrasCache.get(r);
  if (!d) {
    const c = document.createElement('canvas'); c.width = c.height = 64; paintAtras(c.getContext('2d'));
    d = D('#ffffff', null); d.texture = canvasTexture(r, c); d.key += 'atras'; atrasCache.set(r, d);
  }
  return d;
}
/** Geometry of one slot of an item (bottom at y = 0, centred on x and z) and its triangle count. */
function atrasGeo(r, tipo, variante = 0) {
  const T = r.THREE, A = ATRAS[tipo], cell = A.cell + (tipo === 'chaveiro' && variante % 2 ? 4 : 0);
  const face = rectInset(cellUV(cell)), side = rectInset(cellUV(tipo === 'palito' ? 5 : cell));
  const parts = [];
  if (tipo === 'pilha') parts.push({ geo: boxFaces(T, A.w, A.h, 0.018, [side, side, side, side, face, face]), matrix: tmpM(T, [0, A.h / 2 + 0.01, 0], [-0.12, 0, 0]) });
  else if (tipo === 'carregador') parts.push({ geo: boxFaces(T, A.w, A.h, 0.03, [side, side, side, side, face, face]), matrix: tmpM(T, [0, A.h / 2 + 0.005, 0], [-0.1, 0, 0]) });
  else if (tipo === 'chaveiro') parts.push({ geo: boxFaces(T, A.w, A.h, 0.008, [side, side, side, side, face, face]), matrix: tmpM(T, [0, A.h / 2 + 0.01, 0], [-0.15, 0, 0]) });
  else if (tipo === 'fita') {
    const g = remap(new T.CylinderGeometry(0.042, 0.042, 0.025, 10), face);
    parts.push({ geo: g, matrix: tmpM(T, [0, 0.0125, 0]) }, { geo: g, matrix: tmpM(T, [0, 0.0375, 0]) });
  } else if (tipo === 'palito') {
    const g = boxFaces(T, A.w, 0.016, 0.036, [side, side, face, face, face, face]);
    parts.push({ geo: g, matrix: tmpM(T, [0, 0.008, 0]) }, { geo: g, matrix: tmpM(T, [0, 0.024, 0], [0, 0.12, 0]) });
  }
  const geo = mergeGeos(T, parts);
  return { geo, tris: triCount(geo) };
}
/** One item at the local point (x, y, z). */
function addAtras(c, tipo, x, y, z, variante = 0, ry = 0) {
  if (tipo === 'oleo-motor') { addProduto(c, 'oleo', PRODUTOS.oleo.cells[variante % 2], x, y, z, ry); return; }
  c.geo(atrasGeo(c.r, tipo, variante).geo, atrasDesc(c.r), [x, y, z], [0, ry, 0]);
}

// ---------------------------------------------------------------------------------------------
const NOZZLE = (T) => mergeGeos(T, [
  { geo: new T.BoxGeometry(0.05, 0.15, 0.06), matrix: tmpM(T, [0, 0.0, 0.07]) },
  { geo: new T.BoxGeometry(0.025, 0.03, 0.1), matrix: tmpM(T, [0, -0.06, 0.12]) },
  { geo: new T.CylinderGeometry(0.011, 0.011, 0.16, 5), matrix: tmpM(T, [0, -0.12, 0.05]) }]);

function nozzleMesh(c, key) {
  const m = c.mesh(NOZZLE(c.T), D(FUEL[key].color), [0, 0, 0]); m.name = 'bico-' + key; m.userData.bico = key; return m;
}

// The breaker board: one switch per area, with a three-letter label painted on a 3x5 pixel font.
export const BREAKERS = ['loja', 'cobertura', 'estoque', 'banheiros', 'escritorio', 'servico', 'estacionamento', 'placa'];
const BREAKER_CODES = ['LOJ', 'COB', 'ETQ', 'BAN', 'ESC', 'SRV', 'VAG', 'PLC'];
const FONT3 = { L: '100100100100111', O: '111101101101111', J: '001001001101111', C: '111100100100111', B: '110101110101110', E: '111100110100111',
  T: '111010010010010', Q: '111101101111001', A: '010101111101101', N: '101111111111101', S: '111100111001111', R: '110101110101101', V: '101101101101010',
  G: '111100101101111', P: '111101111100100' };
const labelCache = new WeakMap();
function breakerLabels(r) {
  let l = labelCache.get(r);
  if (!l) {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 16; const g = cv.getContext('2d');
    BREAKER_CODES.forEach((code, k) => {
      const x0 = (k % 4) * 16, y0 = (k >> 2) * 8;
      g.fillStyle = '#d8d0b8'; g.fillRect(x0, y0, 16, 8);
      g.fillStyle = '#2a2622';
      [...code].forEach((ch, ci) => { const bits = FONT3[ch]; for (let q = 0; q < 15; q++) if (bits[q] === '1') g.fillRect(x0 + 2 + ci * 4 + (q % 3), y0 + 1 + ((q / 3) | 0), 1, 1); });
    });
    const desc = D('#ffffff', null); desc.texture = canvasTexture(r, cv); desc.key += 'qforca';
    l = { desc, uv: (k) => { const u0 = (k % 4) / 4, v1 = 1 - (k >> 2) * 0.5, e = 0.5 / 64; return [u0 + e, v1 - 0.5 + e, u0 + 0.25 - e, v1 - e]; } };
    labelCache.set(r, l);
  }
  return l;
}

// ---------------------------------------------------------------------------------------------
// The pump's keypad: ten digits, CANCELAR (red) and LIGAR (green) on one painted atlas ('teclado'). The caps are
// static (merged); what moves is one loose "pressed" glow and a loose LED. Each key has an invisible hit box carrying
// userData { interactId: 'teclado<n>', kind: 'teclado', tecla: '0'..'9' | 'ligar' | 'cancelar' }.
const tecladoCache = new WeakMap();
function tecladoDesc(r) {
  let d = tecladoCache.get(r);
  if (!d) { d = D('#ffffff', 'teclado'); tecladoCache.set(r, d); }
  return d;
}
export const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'cancelar', 'ligar'];
function pumpKeypad(c, o = {}) {
  const { T, r } = c, cx = o.cx ?? 0, cy = o.cy ?? 0.5, zf = o.z ?? 0.05, id = o.n ? 'teclado' + o.n : 'teclado';
  const atlas = tecladoDesc(r), side = tecladoUV('vazio');
  c.box([0.44, 0.42, 0.012], M.dark, [cx, cy, zf + 0.002]);
  const root = new T.Group(); root.name = 'teclado'; root.userData.interactId = id; c.dyn.add(root);
  const hitMat = new T.MeshBasicMaterial({ visible: false });
  const spots = {}, keys = {};
  const put = (name, x, y, w, h, live) => {
    const g = boxFaces(T, w, h, 0.02, [side, side, side, side, tecladoUV(name), side]);
    c.geo(g, atlas, [x, y, zf + 0.018]);
    if (!live) return;
    const hit = new T.Mesh(new T.BoxGeometry(w + 0.012, h + 0.012, 0.12), hitMat);
    hit.position.set(x, y, zf + 0.06); hit.name = 'tecla-' + name; hit.userData.interactId = id; hit.userData.kind = 'teclado'; hit.userData.tecla = name;
    root.add(hit); keys[name] = hit; spots[name] = { x, y, w, h };
  };
  const rows = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], [null, '0', null]];
  rows.forEach((row, ri) => row.forEach((k, ci) => put(k ?? 'vazio', cx + (ci - 1) * 0.12, cy + (2 - ri) * 0.07, 0.105, 0.058, Boolean(k))));
  put('cancelar', cx - 0.0875, cy - 0.14, 0.17, 0.058, true); put('ligar', cx + 0.0875, cy - 0.14, 0.17, 0.058, true);
  // the glow of a pressed key
  const glow = new T.Mesh(new T.PlaneGeometry(1, 1), r.mat('#ffee99', { emissive: 1, fogged: 0.5, transparent: true, opacity: 0.45, depthWrite: false }));
  glow.visible = false; glow.renderOrder = 3; root.add(glow);
  let pressed = null, lit = false;
  // the lamp over the keys: lit while the pump is running
  const led = new T.Mesh(new T.PlaneGeometry(0.034, 0.012), r.glow('#17301c')); led.position.set(cx, cy + 0.228, zf + 0.0045); root.add(led);
  const onC = new T.Color('#5aff7a'), offC = new T.Color('#17301c');
  const ray = new T.Raycaster();
  const api = {
    root, keys, ids: TECLAS, id, led,
    /** Light up (or release) a key, e.g. while the person's tap is on it. */
    setPressed(key, v = true) {
      if (!v) { if (pressed === key || key === undefined) { pressed = null; glow.visible = false; } return; }
      const s = spots[key]; if (!s) return;
      pressed = key; glow.position.set(s.x, s.y, zf + 0.0295); glow.scale.set(s.w, s.h, 1); glow.visible = true;
    },
    get pressed() { return pressed; },
    /** The pump-running lamp. */
    setLed(on) { lit = Boolean(on); led.material.uniforms.uColor.value.copy(lit ? onC : offC); },
    get ledOn() { return lit; },
    /** Which key a mesh of the hit belongs to (a raycast result's object), or null. */
    keyOf(obj) { for (let o2 = obj; o2; o2 = o2.parent) if (o2.userData?.tecla) return o2.userData.tecla; return null; },
    /** Which key a ray (THREE.Vector3 origin and unit direction) points at, up to `far` metres, or null. */
    keyAtRay(origin, dir, far = 3) {
      root.updateWorldMatrix(true, true); ray.set(origin, dir); ray.far = far;
      const h = ray.intersectObjects(Object.values(keys), false)[0];
      return h ? h.object.userData.tecla : null;
    },
    /** World position of the centre of a key (THREE.Vector3). */
    worldPos(key, out = new T.Vector3()) { const s = spots[key]; root.updateWorldMatrix(true, false); return out.set(s.x, s.y, zf + 0.03).applyMatrix4(root.matrixWorld); },
  };
  return api;
}

/** A loose Sun sticker of `size` metres, hidden, at p facing rot, in `parent` (the game shows it when it should appear). */
function sunDecal(c, size, p, rot = [0, 0, 0], parent = c.dyn) {
  const m = c.mesh(new c.T.PlaneGeometry(size, size), D('#ffffff', 'adesivoSol'), p, rot, parent); m.visible = false; m.name = 'adesivo-sol'; return m;
}

/** A paper cup with the Sun on it, standing at the origin: a Group of loose meshes. */
function cupGroup(c, parent = c.dyn) {
  // an empty paper cup, 10 cm tall, with the Sun on it (open at the top: the inside shows from above)
  const { T } = c, g = new T.Group(); g.name = 'copo'; parent.add(g);
  c.mesh(new T.CylinderGeometry(0.04, 0.029, 0.1, 8), D('#ece0c4', 'plastic'), [0, 0.05, 0], [0, 0, 0], g);
  c.mesh(new T.CylinderGeometry(0.0435, 0.0435, 0.009, 8), D('#d8c89e', 'plastic'), [0, 0.098, 0], [0, 0, 0], g);
  c.mesh(new T.CylinderGeometry(0.036, 0.036, 0.004, 8), D('#8a7a5a', 'plastic'), [0, 0.097, 0], [0, 0, 0], g);
  c.mesh(new T.PlaneGeometry(0.052, 0.052), D('#ffffff', 'adesivoSol'), [0, 0.05, 0.0365], [0, 0, 0], g);
  return g;
}

const DEFS = {
  bomba(c, o) {
    const { T, r } = c;
    c.box([0.95, 0.12, 0.55], D('#8a7a68', 'concrete'), [0, 0.06, 0]);
    c.box([0.85, 1.08, 0.46], M.ocre, [0, 0.66, 0], [0, 0, 0], [0.5, 0.5]);
    // the head is wide enough for the five-digit display on the left and the keypad on the right
    c.box([1.24, 0.52, 0.52], D('#9a6c3c', 'plastic'), [0, 1.44, 0]);
    c.box([1.3, 0.06, 0.58], M.dark, [0, 1.73, 0]);
    c.box([0.68, 0.24, 0.02], M.dark, [-0.22, 1.45, 0.255]);
    const display = createDisplay(r);
    const dm = new T.Mesh(new T.PlaneGeometry(0.6, 0.6 * 24 / 84), r.glow('#ffffff', { map: display.texture })); dm.position.set(-0.22, 1.45, 0.267); c.dyn.add(dm);
    const keypad = pumpKeypad(c, { n: o.n, cx: 0.36, cy: 1.45, z: 0.26 });
    const nozzles = {}, nozzleAt = {};
    FUEL_KEYS.forEach((k, i) => {
      if (o.fuels && !o.fuels.includes(k)) return; // an entity may leave a fuel out
      const x = i % 2 ? 0.2 : -0.2, y = i < 2 ? 0.98 : 0.58;
      c.box([0.17, 0.15, 0.12], D('#2a2622', 'rubber'), [x, y, 0.29]);
      c.quad(0.11, 0.11, M.fuel, [x, y + 0.17, 0.2315], [0, 0, 0], fuelUV(k));
      const L = y - 0.075 - 0.25;
      c.box([0.025, L, 0.025], M.black, [x + 0.07, y - 0.075 - L / 2, 0.3]);
      const n = nozzleMesh(c, k); n.position.set(x, y, 0.29); n.userData.home = n.position.clone();
      nozzles[k] = n; nozzleAt[k] = [x, y, 0.4];
    });
    if (o.adesivo !== false) { // the 1998 advertising stickers: the Sun of the poster, die-cut, on the front and on both sides of the body
      const ad = D('#ffffff', 'adesivoSol');
      c.quad(0.26, 0.26, ad, [0, 0.82, 0.2325], [0, 0, 0]);
      for (const sx of [-1, 1]) c.quad(0.4, 0.4, ad, [sx * 0.4275, 0.78, 0.02], [0, sx * Math.PI / 2, 0]);
    } else c.quad(0.16, 0.16, M.sol, [0, 0.78, 0.2315], [0, 0, 0]);
    c.quad(0.22, 0.22, M.sol, [0, 0.66, -0.2315], [0, Math.PI, 0]);
    // the shut-off valve low on the front, between the hoses: a red hand wheel that turns (a loose group)
    c.box([0.12, 0.12, 0.02], D('#8a7a68', 'concrete'), [0, 0.3, 0.24]);
    c.cyl(0.022, 0.022, 0.08, 6, M.gray, [0, 0.3, 0.29], [Math.PI / 2, 0, 0]);
    const valveRoot = new T.Group(); valveRoot.position.set(0, 0.3, 0.335); c.dyn.add(valveRoot);
    const wheelMat = D('#c0402a', 'plastic');
    c.mesh(new T.TorusGeometry(0.062, 0.014, 4, 10), wheelMat, [0, 0, 0], [0, 0, 0], valveRoot);
    c.mesh(new T.BoxGeometry(0.124, 0.016, 0.016), wheelMat, [0, 0, 0], [0, 0, 0], valveRoot);
    c.mesh(new T.BoxGeometry(0.016, 0.124, 0.016), wheelMat, [0, 0, 0], [0, 0, 0], valveRoot);
    c.mesh(new T.CylinderGeometry(0.02, 0.02, 0.03, 6), M.gray, [0, 0, 0.005], [Math.PI / 2, 0, 0], valveRoot);
    c.mesh(new T.BoxGeometry(0.024, 0.03, 0.03), D('#e8e0c8', 'plastic'), [0.062, 0, 0.012], [0, 0, 0], valveRoot); // the knob that shows the turn
    const valveHit = c.hit([0.2, 0.2, 0.16], [0, 0.3, 0.3], 'registro', 'registro');
    const valve = { root: valveRoot, hit: valveHit, angle: 0, setAngle(rad) { valve.angle = rad; valveRoot.rotation.z = rad; } };
    // jammed: the display light goes out
    const lit = new T.Color('#ffffff'), unlit = new T.Color('#070504');
    const pumpState = { jammed: false };
    const setJammed = (v) => { pumpState.jammed = Boolean(v); dm.material.uniforms.uColor.value.copy(pumpState.jammed ? unlit : lit); };
    c.hit([1.3, 1.85, 0.6], [0, 0.92, 0], 'bomba', 'bomba');
    return { display, setDisplay: (text) => display.set(text), nozzles, nozzleAt, displayMesh: dm, keypad, valve, setJammed, get jammed() { return pumpState.jammed; } };
  },

  bico(c, o) {
    const key = FUEL[o.tipo] ? o.tipo : 'comum';
    const m = nozzleMesh(c, key); m.position.set(0, 0.16, 0); m.rotation.x = Math.PI / 2;
    return { nozzle: m, tipo: key };
  },

  produto(c, o) {
    if (ATRAS[o.tipo]) { addAtras(c, o.tipo, 0, 0, 0, o.variante ?? 0); return { tipo: o.tipo }; }
    const tipo = PRODUTOS[o.tipo] ? o.tipo : 'garrafa', P = PRODUTOS[tipo];
    const cells = P.cells, cell = o.cell ?? cells[(o.variante ?? 0) % cells.length];
    const old = D('#ffffff', 'produtos98');
    // `solto`: the product is a loose mesh (it can be moved by the game: posto.displace); `antigo`: the 1998 packaging
    if (o.solto) {
      const mesh = c.mesh(productGeo(c.r, tipo, cell).geo, o.antigo ? old : M.prod, [0, 0, 0]);
      return { tipo, cell, mesh, hit: c.hit([P.w + 0.03, P.h + 0.03, P.d + 0.03], [0, P.h / 2, 0], 'produto', 'produto') };
    }
    c.geo(productGeo(c.r, tipo, cell).geo, o.antigo ? old : M.prod, [0, 0, 0]);
    return { tipo, cell };
  },
  'produto-antigo': (c, o) => DEFS.produto(c, { ...o, antigo: true }),

  prateleira: (c, o) => gondola(c, { faces: 2, ...o }),
  'prateleira-antiga': (c, o) => gondola(c, { faces: 2, antigo: true, ...o }),
  'prateleira-balcao': (c, o) => balcaoShelf(c, o),
  'prateleira-parede': (c, o) => gondola(c, { faces: 1, length: 2.4, depth: 0.34, ...o }),

  'caixa-estoque'(c, o) {
    const n = o.n ?? 1, cell = n >= 1 && n <= 12 ? n - 1 : 15, face = rectInset(cellUV(cell)), plain = rectInset(cellUV(12));
    const { T } = c;
    const g = boxFaces(T, 0.5, 0.35, 0.4, [face, face, plain, plain, face, face]);
    const res = c.sub((s) => s.geo(g, M.caixas, [0, 0.175, 0]));
    c.hit([0.5, 0.35, 0.4], [0, 0.175, 0], 'caixa-estoque', 'caixa');
    return { n, mesh: res.meshes[0] };
  },

  'estante-estoque'(c, o) {
    const L = o.length ?? 2.4, levels = o.levels ?? [0.12, 0.72, 1.32, 1.92], H = 2.3, depth = o.depth ?? 0.5;
    for (const x of [-L / 2 + 0.03, L / 2 - 0.03, 0]) for (const z of [-depth / 2 + 0.03, depth / 2 - 0.03]) c.box([0.05, H, 0.05], D('#7a8aa0', 'steel'), [x, H / 2, z], [0, 0, 0], [0.5, 0.5]);
    for (const y of levels) c.box([L, 0.04, depth], D('#b0a488', 'wood'), [0, y, 0], [0, 0, 0], [0.8, 0.8]);
    return { levels };
  },

  carrinho(c) {
    const { T } = c;
    // the whole cart is loose (own meshes in `dyn`) so the game can push it around
    c.sub((s) => {
      s.box([0.6, 0.05, 0.9], M.steel, [0, 0.2, 0.05]);
      s.box([0.6, 0.3, 0.05], M.steel, [0, 0.38, -0.4]);
      s.box([0.04, 0.9, 0.04], M.gray, [-0.25, 0.65, -0.42], [0.15, 0, 0]); s.box([0.04, 0.9, 0.04], M.gray, [0.25, 0.65, -0.42], [0.15, 0, 0]);
      s.box([0.54, 0.04, 0.04], M.gray, [0, 1.07, -0.5]);
      s.box([0.5, 0.03, 0.04], M.gray, [0, 0.62, -0.46]);
      for (const x of [-0.3, 0.3]) s.box([0.03, 0.12, 0.06], M.gray, [x, 0.15, 0.4]);
    });
    const wheels = [];
    for (const [x, z] of [[-0.3, -0.35], [0.3, -0.35], [-0.3, 0.4], [0.3, 0.4]]) {
      const w = new T.Group(); w.position.set(x, 0.09, z); c.dyn.add(w);
      c.mesh(new T.CylinderGeometry(0.09, 0.09, 0.05, 8), M.rubber, [0, 0, 0], [0, 0, Math.PI / 2], w);
      c.mesh(new T.BoxGeometry(0.056, 0.05, 0.05), M.gray, [0, 0, 0], [0, 0, 0], w); // a spoke, so the roll shows
      wheels.push(w);
    }
    const handleAnchor = new T.Object3D(); handleAnchor.position.set(0, 1.07, -0.5); handleAnchor.name = 'alcaCarrinho'; c.dyn.add(handleAnchor);
    // up to four numberless boxes on the deck: two on the deck, two stacked
    const plain = rectInset(cellUV(12)), load = [];
    const boxGeo4 = boxFaces(T, 0.5, 0.35, 0.4, [plain, plain, plain, plain, plain, plain]);
    [[0, 0.27, 0], [0, -0.15, 0], [0, 0.27, 1], [0, -0.15, 1]].forEach(([x, z, up], i) => {
      const m = c.mesh(boxGeo4, M.caixas, [x, 0.225 + 0.175 + up * 0.35, z], [0, i % 2 ? 0.05 : -0.04, 0]); m.visible = false; load.push(m);
    });
    const state = { load: 0 };
    const setLoad = (n) => { state.load = Math.max(0, Math.min(4, n | 0)); load.forEach((m, i) => { m.visible = i < state.load; }); };
    const hit = c.hit([0.7, 1.1, 1.0], [0, 0.55, 0], 'carrinho', 'carrinho');
    return { setLoad, get load() { return state.load; }, handleAnchor, wheels, hit, footprint: [-0.36, -0.58, 0.36, 0.52],
      /** roll the wheels as the cart moves `d` metres forward */
      roll(d) { for (const w of wheels) w.rotation.x += d / 0.09; } };
  },

  'caixa-registradora'(c) {
    const { T, r } = c;
    c.box([0.44, 0.12, 0.4], M.beige, [0, 0.06, 0]);
    c.box([0.44, 0.07, 0.3], M.beige, [0, 0.155, -0.04], [-0.18, 0, 0]);
    c.box([0.32, 0.02, 0.15], M.grid, [0, 0.2, 0.05], [-0.18, 0, 0], [0.3, 0.3]);
    c.box([0.32, 0.17, 0.1], M.beige, [0, 0.3, -0.13]);
    const scr = new T.Mesh(new T.PlaneGeometry(0.26, 0.11), r.glow('#74d8a0')); scr.position.set(0, 0.3, -0.078); c.dyn.add(scr);
    const gav = new T.Group(); gav.position.set(0, 0.06, 0.2); c.dyn.add(gav);
    c.mesh(new T.BoxGeometry(0.42, 0.09, 0.03), M.cream, [0, 0, 0.0], [0, 0, 0], gav);
    const trayParts = [{ geo: new T.BoxGeometry(0.4, 0.02, 0.3), matrix: tmpM(T, [0, 0, -0.17]) }];
    for (let i = 0; i < 4; i++) trayParts.push({ geo: new T.BoxGeometry(0.08, 0.025, 0.12), matrix: tmpM(T, [-0.15 + i * 0.1, 0.01, -0.29]) });
    const tray = c.mesh(mergeGeos(T, trayParts), D('#8a7a5a', 'rubber'), [0, 0, 0], [0, 0, 0], gav);
    c.hit([0.46, 0.45, 0.45], [0, 0.22, 0], 'caixa-registradora', 'caixa');
    return { gaveta: gav, tray, screen: scr, setGaveta: (k) => { gav.position.z = 0.2 + 0.28 * k; } };
  },

  leitor(c) {
    const { T, r } = c;
    c.box([0.2, 0.05, 0.14], M.dark, [0, 0.025, 0]);
    const b = new T.Mesh(new T.PlaneGeometry(0.15, 0.01), r.glow('#ff3a2a')); b.rotation.x = -Math.PI / 2; b.position.set(0, 0.052, 0); c.dyn.add(b);
    c.hit([0.22, 0.12, 0.16], [0, 0.06, 0], 'leitor', 'leitor');
    return { beam: b, update: (t) => { b.visible = Math.floor(t * 6) % 7 !== 0; } };
  },

  balcao(c, o) {
    const L = o.length ?? 5.7;
    c.box([L, 0.95, 0.6], M.counter, [0, 0.475, 0], [0, 0, 0], [1.2, 1.2]);
    c.box([L + 0.04, 0.05, 0.74], D('#e0c8a0', 'counter'), [0, 0.975, 0.04], [0, 0, 0], [1.2, 1.2]);
    c.box([L - 0.2, 0.06, 0.06], M.brown, [0, 0.04, 0.32]);
    c.quad(0.5, 0.5, M.sol, [-L / 2 + 0.7, 0.55, 0.3015], [0, 0, 0]);
    c.hit([L, 1.0, 0.7], [0, 0.5, 0], 'balcao', 'balcao');
  },

  cafeteira(c) {
    const { T, r } = c;
    c.box([0.34, 0.04, 0.3], M.dark, [0, 0.02, 0]);
    c.box([0.3, 0.42, 0.16], M.beige, [0, 0.25, -0.07]);
    c.box([0.3, 0.06, 0.28], M.black, [0, 0.45, 0.0]);
    c.box([0.14, 0.04, 0.12], M.gray, [0, 0.31, 0.05]);
    c.cyl(0.07, 0.07, 0.15, 8, D('#a0b8b8', 'steel'), [0, 0.12, 0.06]);
    c.cyl(0.05, 0.05, 0.06, 8, D('#3a2418', 'rubber'), [0, 0.2, 0.06]);
    c.box([0.04, 0.04, 0.04], D('#d03a2a', 'plastic'), [0.1, 0.4, 0.15]);
    const cup = c.mesh(new T.CylinderGeometry(0.035, 0.026, 0.09, 8), D('#ffffff', 'solSticker'), [0.2, 0.045, 0.1]); cup.name = 'copo';
    c.hit([0.4, 0.55, 0.34], [0.05, 0.27, 0], 'cafeteira', 'cafeteira');
    // brewing on its own: the lamp, the thread of coffee, the drops and the steam (all a function of time)
    const lamp = new T.Mesh(new T.PlaneGeometry(0.05, 0.022), r.glow('#c8801c', { fogged: 0.1 })); lamp.position.set(-0.1, 0.45, 0.1415); c.dyn.add(lamp);
    const lampOn = new T.Color('#ffb040'), lampIdle = new T.Color('#c8801c'), lampOff = new T.Color('#3a2a1a'); // amber: bright while it brews, dimmer while it is just on, dark when switched off
    const ink = D('#2a1a10', 'rubber');
    const stream = c.mesh(new T.CylinderGeometry(0.006, 0.006, 0.07, 5), ink, [0, 0.26, 0.05]);
    const drops = [0, 1].map(() => c.mesh(new T.SphereGeometry(0.009, 4, 3), ink, [0, 0.25, 0.05]));
    const puffs = [0, 1, 2, 3].map((i) => {
      const mat = r.mat('#ffffff', { map: tex(r, 'vapor'), transparent: true, opacity: 0.5, depthWrite: false, emissive: 0.35, fogged: 1, side: T.DoubleSide });
      const g = new T.Group(); g.position.set((i % 2 ? 0.015 : -0.015), 0.28, 0.06); c.dyn.add(g);
      for (const ry of [0, Math.PI / 2]) { const m = new T.Mesh(new T.PlaneGeometry(0.11, 0.15), mat); m.rotation.y = ry; m.renderOrder = 2; g.add(m); }
      return { g, mat };
    });
    const st = { brewing: false, on: true };
    const show = () => { lamp.material.uniforms.uColor.value.copy(st.brewing ? lampOn : st.on ? lampIdle : lampOff); stream.visible = st.brewing; drops.forEach((d) => { d.visible = st.brewing; }); puffs.forEach((p) => { p.g.visible = st.brewing; }); };
    show();
    return { cupAt: [0, 0.1, 0.06], copo: cup, lamp, setBrewing(v) { st.brewing = Boolean(v); show(); }, get brewing() { return st.brewing; },
      /** The amber power light (default on). */
      setOn(v) { st.on = Boolean(v); show(); }, get on() { return st.on; },
      update(t) {
        if (!st.brewing) return;
        stream.scale.y = 0.88 + 0.12 * Math.sin(t * 23); stream.scale.x = stream.scale.z = 0.9 + 0.2 * Math.sin(t * 17 + 1);
        drops.forEach((d, i) => { const k = (t * 1.7 + i * 0.5) % 1; d.position.y = 0.3 - k * 0.1; d.visible = k < 0.9; });
        puffs.forEach((p, i) => {
          const k = (t * 0.3 + i / 4) % 1;
          p.g.position.y = 0.3 + k * 0.4; p.g.scale.setScalar(0.5 + k * 1.1); p.g.rotation.y = i + k * 1.4; p.mat.opacity = 0.85 * Math.sin(Math.PI * k);
        });
      } };
  },

  copo(c) {
    const g = cupGroup(c);
    return { copo: g };
  },

  'adesivo-sol'(c) {
    c.box([0.6, 0.6, 0.03], M.wood, [0, 1.2, 0]);
    const m = sunDecal(c, 0.44, [0, 1.2, 0.0235]); m.visible = true;
    return { sticker: [m] };
  },

  'teclado-bomba'(c) {
    c.box([0.52, 0.5, 0.1], D('#9a6c3c', 'plastic'), [0, 0.5, 0]);
    return { keypad: pumpKeypad(c, { cx: 0, cy: 0.5, z: 0.05 }) };
  },

  geladeira(c, o) {
    const { T, r } = c, W = 1.2, H = 2.0, Dp = 0.7;
    c.box([W, 0.12, Dp], M.dark, [0, 0.06, 0]);
    c.box([0.06, H, Dp], M.fridge, [-W / 2 + 0.03, H / 2, 0]); c.box([0.06, H, Dp], M.fridge, [W / 2 - 0.03, H / 2, 0]);
    c.box([W, 0.08, Dp], M.fridge, [0, H - 0.04, 0]); c.box([W - 0.1, H - 0.2, 0.04], D('#d8d6c8', 'plastic'), [0, H / 2 + 0.04, -Dp / 2 + 0.02]);
    c.box([W, 0.2, 0.05], M.fridge, [0, H - 0.1, Dp / 2 - 0.025]);
    c.quad(0.3, 0.3, M.sol, [0, H - 0.1, Dp / 2 + 0.003], [0, 0, 0]);
    const lv = [0.3, 0.8, 1.3, 1.7], rnd = mulberry32((o.seed ?? 1) * 17 + 3);
    lv.forEach((y, i) => {
      c.box([W - 0.1, 0.02, Dp - 0.1], D('#c8d4d8', 'steel'), [0, y, -0.02]);
      const tipo = i % 2 ? 'lata' : 'garrafa', P = PRODUTOS[tipo], pitch = P.w + 0.02, n = Math.floor((W - 0.2) / pitch);
      for (let k = 0; k < n; k++) for (let dd = 0; dd < 2; dd++)
        addProduto(c, tipo, P.cells[(k + (rnd() > 0.7 ? 1 : 0)) % P.cells.length], -((n - 1) * pitch) / 2 + k * pitch, y + 0.01, 0.18 - dd * (P.d + 0.01));
    });
    const lt = new T.Mesh(new T.PlaneGeometry(W - 0.2, 0.06), r.glow('#b8e0f0', { fogged: 0.4 })); lt.rotation.x = Math.PI / 2; lt.position.set(0, H - 0.1, 0.25); c.dyn.add(lt);
    const glass = new T.Mesh(new T.PlaneGeometry(W - 0.12, H - 0.45), r.mat('#4a6478', { transparent: true, opacity: 0.28, depthWrite: false }));
    glass.position.set(0, H / 2 - 0.1, Dp / 2 - 0.02); glass.renderOrder = 2; c.dyn.add(glass);
    c.hit([W, H, Dp], [0, H / 2, 0], 'geladeira', 'geladeira');
    const sticker = [sunDecal(c, 0.2, [0.32, 1.2, Dp / 2 + 0.012])];
    return { glass, light: lt, sticker, update: (t, st) => { lt.visible = !(st?.geladeiraPisca) || Math.floor(t * 9) % 5 !== 0; } };
  },

  telefone(c) {
    const { T, r } = c;
    c.box([0.2, 0.06, 0.24], M.cream, [0, 0.03, 0]);
    c.box([0.12, 0.012, 0.1], M.grid, [0, 0.07, 0.06], [-0.2, 0, 0], [0.12, 0.12]);
    c.box([0.04, 0.05, 0.05], M.cream, [-0.07, 0.08, -0.08]); c.box([0.04, 0.05, 0.05], M.cream, [0.07, 0.08, -0.08]);
    const hs = new T.Group(); hs.position.set(0, 0.11, -0.08); c.dyn.add(hs);
    c.mesh(mergeGeos(T, [{ geo: new T.BoxGeometry(0.2, 0.035, 0.05), matrix: tmpM(T) }, { geo: new T.BoxGeometry(0.05, 0.05, 0.06), matrix: tmpM(T, [-0.09, -0.02, 0]) },
      { geo: new T.BoxGeometry(0.05, 0.05, 0.06), matrix: tmpM(T, [0.09, -0.02, 0]) }]), M.cream, [0, 0, 0], [0, 0, 0], hs);
    const led = new T.Mesh(new T.BoxGeometry(0.015, 0.008, 0.015), r.glow('#ff2a1a')); led.position.set(0.08, 0.063, 0.1); led.visible = false; c.dyn.add(led);
    c.hit([0.24, 0.16, 0.28], [0, 0.08, 0], 'telefone', 'telefone');
    return { handset: hs, led, update: (t, st) => {
      const on = Boolean(st?.telefoneToca), s = on ? Math.sin(t * 38) : 0;
      hs.position.y = 0.11 + (on ? 0.006 * Math.abs(s) : 0); hs.rotation.z = on ? 0.03 * s : 0; led.visible = on && Math.floor(t * 4) % 2 === 0;
    } };
  },

  monitor(c) { return crtUnit(c, { cams: true, base: 'monitor' }); },
  computador(c) {
    const res = crtUnit(c, { cams: false, base: 'computador' });
    c.box([0.2, 0.42, 0.42], M.beige, [-0.38, 0.21, -0.02]);
    c.box([0.17, 0.02, 0.02], M.dark, [-0.38, 0.38, 0.2]); c.box([0.17, 0.05, 0.02], D('#a89c80', 'plastic'), [-0.38, 0.3, 0.2]);
    c.box([0.44, 0.025, 0.15], M.beige, [0.1, 0.0125, 0.36]); c.box([0.4, 0.012, 0.11], M.grid, [0.1, 0.03, 0.36], [0, 0, 0], [0.2, 0.2]);
    c.box([0.06, 0.02, 0.09], M.beige, [0.42, 0.01, 0.36]);
    return res;
  },

  'mesa-escritorio'(c) {
    const W = 2.2, Dp = 0.8;
    c.box([W, 0.05, Dp], M.wood, [0, 0.74, 0], [0, 0, 0], [0.8, 0.8]);
    c.box([0.5, 0.7, Dp - 0.06], M.wood, [-W / 2 + 0.3, 0.37, 0], [0, 0, 0], [0.8, 0.8]);
    c.box([0.05, 0.7, Dp - 0.06], M.wood, [W / 2 - 0.05, 0.37, 0], [0, 0, 0], [0.8, 0.8]);
    for (const dy of [0.2, 0.5]) c.box([0.4, 0.02, 0.02], M.brown, [-W / 2 + 0.3, dy, Dp / 2 - 0.02]);
    // swivel chair, in front: a loose group, so the game can move it (posto.displace('cadeira', ...))
    const { T } = c, chair = new T.Group(); chair.name = 'cadeira'; chair.position.set(0.2, 0, 0.9); c.dyn.add(chair);
    const seat = D('#9a7a56', 'plastic');
    for (const m of c.sub((s) => {
      s.cyl(0.03, 0.03, 0.4, 5, M.black, [0, 0.2, 0]); s.box([0.44, 0.07, 0.44], seat, [0, 0.46, 0]);
      s.box([0.42, 0.5, 0.06], seat, [0, 0.78, 0.22], [-0.1, 0, 0]);
      for (let i = 0; i < 5; i++) s.box([0.3, 0.025, 0.04], M.black, [Math.cos(i * 1.256) * 0.14, 0.03, Math.sin(i * 1.256) * 0.14], [0, -i * 1.256, 0]);
    }).meshes) chair.add(m);
    c.hit([W, 0.8, Dp], [0, 0.4, 0], 'mesa-escritorio', 'mesa');
    return { chair };
  },

  armario(c, o) {
    const { T } = c, W = 0.9, H = 1.9, Dp = 0.5, t = 0.03, body = D('#ffffff', 'green');
    // a hollow shell: back, sides, top, floor, a lip on the front and one shelf with a cardboard box on it
    c.box([W, H, t], body, [0, H / 2, -Dp / 2 + t / 2], [0, 0, 0], [0.5, 0.5]);
    for (const sx of [-1, 1]) c.box([t, H, Dp], body, [sx * (W / 2 - t / 2), H / 2, 0], [0, 0, 0], [0.5, 0.5]);
    c.box([W, t, Dp], body, [0, H - t / 2, 0], [0, 0, 0], [0.5, 0.5]);
    c.box([W, 0.05, Dp], body, [0, 0.025, 0], [0, 0, 0], [0.5, 0.5]);
    c.box([W, 0.06, 0.03], body, [0, H - 0.06, Dp / 2 - 0.015]);
    c.box([W - 2 * t, 0.02, 0.2], D('#ffffff', 'shelf'), [0, 1.45, -Dp / 2 + t + 0.1], [0, 0, 0], [0.7, 0.7]);
    c.box([0.2, 0.1, 0.14], M.board, [0.2, 1.51, -Dp / 2 + t + 0.1]);
    // two doors on hinges at the outer edges; the hit stays the first child that carries an id
    c.hit([W, H, Dp], [0, H / 2, 0], 'armario', 'esconderijo');
    const hw = (W - 0.02) / 2, hh = H - 0.14, leaves = [];
    for (const sx of [-1, 1]) {
      const piv = new T.Group(); piv.position.set(sx * (W / 2 - 0.005), 0.07, Dp / 2 - 0.0125); c.dyn.add(piv);
      c.mesh(new T.BoxGeometry(hw, hh, 0.025), body, [-sx * hw / 2, hh / 2, 0], [0, 0, 0], piv);
      const trim = mergeGeos(T, [{ geo: new T.BoxGeometry(0.02, 0.15, 0.03), matrix: tmpM(T, [-sx * (hw - 0.05), 0.93, 0.02]) },
        ...[0, 1, 2, 3].map((i) => ({ geo: new T.BoxGeometry(0.12, 0.012, 0.01), matrix: tmpM(T, [-sx * 0.2, 1.62 + (i >> 1) * 0.03, 0.013]) }))]);
      c.mesh(trim, M.black, [0, 0, 0], [0, 0, 0], piv);
      leaves.push({ piv, sx });
    }
    const st = { open: 0 };
    const setOpen = (k) => { st.open = Math.max(0, Math.min(1, k)); for (const { piv, sx } of leaves) piv.rotation.y = -sx * 1.9 * st.open; };
    setOpen(o.open ?? 0);
    return { setOpen, get open() { return st.open; }, doors: leaves.map((l) => l.piv), shelfAt: [-0.2, 1.46, -Dp / 2 + t + 0.1] };
  },

  cofre(c) {
    c.box([0.5, 0.45, 0.45], D('#ffffff', 'doorMetal'), [0, 0.225, 0], [0, 0, 0], [0.5, 0.5]);
    c.cyl(0.07, 0.07, 0.03, 10, M.gray, [0, 0.27, 0.235], [Math.PI / 2, 0, 0]);
    c.box([0.015, 0.1, 0.01], M.black, [0, 0.27, 0.255]);
    c.box([0.04, 0.12, 0.04], M.gray, [0.15, 0.23, 0.24]);
    c.hit([0.52, 0.47, 0.47], [0, 0.23, 0], 'cofre', 'cofre');
  },

  'camera-teto'(c) {
    // a security camera of the time, readable as a camera from across the room: a beige box about 30 x 12 x 12 cm on a bracket,
    // a sun hood over it, a dark lens and a red recording LED (a loose glow, seen from every side, lit in the dark)
    const { T, r } = c, body = D('#e2decf', 'plastic', { emissive: 0.4 }), cs = Math.cos(0.28), sn = Math.sin(0.28);
    const at = (ly, lz) => [0.07 + ly * cs - lz * sn, ly * sn + lz * cs]; // a point of the tilted body (local y, z about the pivot) -> world [y, z]
    const put = (ly, lz) => { const q = at(ly, lz); return [0, q[0], q[1]]; };
    c.cyl(0.075, 0.075, 0.02, 8, M.gray, [0, 0.19, 0]);
    c.box([0.05, 0.07, 0.05], M.black, [0, 0.155, 0]);
    c.box([0.12, 0.12, 0.30], body, put(0, 0.12), [0.28, 0, 0]);
    c.box([0.15, 0.012, 0.27], D('#9a968a', 'plastic', { emissive: 0.3 }), put(0.07, 0.14), [0.28, 0, 0]);
    c.box([0.125, 0.02, 0.07], M.black, put(-0.05, 0.02), [0.28, 0, 0]);
    c.cyl(0.048, 0.054, 0.06, 8, M.black, put(0, 0.31), [Math.PI / 2 + 0.28, 0, 0]);
    c.cyl(0.036, 0.036, 0.01, 8, D('#0a1218', 'rubber'), put(0, 0.345), [Math.PI / 2 + 0.28, 0, 0]);
    const lp = at(0.045, 0.27);
    const led = new T.Mesh(new T.SphereGeometry(0.034, 6, 4), r.glow('#ff3020', { fogged: 0.05 })); led.position.set(0.05, lp[0], lp[1] + 0.012); c.dyn.add(led);
    const core = new T.Mesh(new T.SphereGeometry(0.014, 4, 3), r.glow('#ffd8c8', { fogged: 0 })); core.position.copy(led.position); core.position.z += 0.012; c.dyn.add(core);
    c.hit([0.16, 0.24, 0.4], [0, 0.07, 0.13], 'camera-teto', 'camera');
    return { led };
  },

  lanterna(c) {
    const { T, r } = c;
    c.cyl(0.03, 0.03, 0.18, 8, M.black, [0, 0.03, 0], [0, 0, Math.PI / 2]);
    c.cyl(0.042, 0.032, 0.06, 8, M.dark, [0.11, 0.03, 0], [0, 0, Math.PI / 2]);
    const ln = new T.Mesh(new T.CircleGeometry(0.036, 8), r.glow('#f0e0a0', { fogged: 0.3 })); ln.rotation.y = Math.PI / 2; ln.position.set(0.142, 0.03, 0); c.dyn.add(ln);
    c.hit([0.3, 0.1, 0.1], [0.03, 0.04, 0], 'lanterna', 'lanterna');
  },

  rodo(c) {
    c.sub((s) => { // loose meshes: the game hides it in the hands and can move it (posto.displace)
      s.cyl(0.012, 0.012, 1.35, 5, M.wood, [0, 0.75, -0.05], [0.08, 0, 0]);
      s.box([0.45, 0.04, 0.06], M.brown, [0, 0.06, 0.04]); s.box([0.45, 0.012, 0.015], M.rubber, [0, 0.025, 0.04]);
    });
    c.hit([0.5, 1.45, 0.2], [0, 0.72, 0], 'rodo', 'rodo');
  },

  balde(c) {
    c.sub((s) => {
      s.cyl(0.17, 0.13, 0.3, 8, D('#d8c470', 'plastic'), [0, 0.15, 0]);
      s.cyl(0.12, 0.12, 0.005, 8, D('#2a4a54', 'rubber'), [0, 0.28, 0]);
      s.box([0.34, 0.012, 0.012], M.gray, [0, 0.33, 0], [0, 0, 0]);
    });
    c.hit([0.36, 0.34, 0.36], [0, 0.17, 0], 'balde', 'balde');
  },

  escada(c) {
    const H = 1.5;
    c.sub((s) => {
      for (const x of [-0.22, 0.22]) {
        s.box([0.04, H + 0.1, 0.03], M.steel, [x, H / 2, 0.1], [-0.2, 0, 0]);
        s.box([0.04, H + 0.1, 0.03], M.steel, [x, H / 2, -0.35], [0.2, 0, 0]);
      }
      for (let i = 0; i < 5; i++) s.box([0.46, 0.02, 0.12], D('#c0c0b8', 'steel'), [0, 0.28 + i * 0.28, 0.1 - (0.28 + i * 0.28) * 0.2 + 0.02]);
      s.box([0.5, 0.03, 0.3], D('#c0c0b8', 'steel'), [0, H, -0.12]);
    });
    const hit = c.hit([0.55, 1.6, 0.8], [0, 0.8, -0.1], 'escada', 'escada');
    return { height: H, hit, footprint: [-0.3, -0.5, 0.3, 0.3] };
  },

  frasco(c) {
    // a plain white bottle: no label, no brand, no text. Loose, so the game can hide it or hold it.
    const white = D('#ffffff', 'porcelain', { emissive: 0.7 }), cap = D('#ece8da', 'porcelain', { emissive: 0.7 });
    c.sub((s) => {
      s.cyl(0.03, 0.03, 0.07, 10, white, [0, 0.035, 0]);
      s.cyl(0.02, 0.03, 0.014, 10, white, [0, 0.077, 0]);
      s.cyl(0.02, 0.02, 0.012, 10, white, [0, 0.09, 0]);
      s.cyl(0.0225, 0.0225, 0.02, 10, cap, [0, 0.106, 0]);
    });
    const hit = c.hit([0.08, 0.12, 0.08], [0, 0.06, 0], 'frasco', 'frasco');
    return { hit, setVisible(v) { c.dyn.visible = Boolean(v); }, get visible() { return c.dyn.visible; } };
  },

  lixeira(c) {
    const { T } = c;
    c.cyl(0.22, 0.18, 0.7, 8, M.green, [0, 0.35, 0], [0, 0, 0], [1, 1, 1]);
    c.cyl(0.24, 0.24, 0.04, 8, M.black, [0, 0.72, 0]);
    // the bag that fills it: a black sack bulging over the rim, tied (a loose group, hidden until full)
    const bag = new T.Group(); bag.position.set(0, 0.7, 0); bag.visible = false; c.dyn.add(bag);
    bagParts(c, bag, 0.19);
    c.hit([0.5, 0.75, 0.5], [0, 0.37, 0], 'lixeira', 'lixeira');
    const st = { full: false };
    return { bag, setFull(v) { st.full = Boolean(v); bag.visible = st.full; }, get full() { return st.full; } };
  },

  'saco-lixo'(c) {
    const { T } = c, bag = new T.Group(); c.dyn.add(bag);
    bagParts(c, bag, 0.25);
    bag.position.y = 0.02;
    const hit = c.hit([0.5, 0.55, 0.5], [0, 0.27, 0], 'saco-lixo', 'saco');
    return { bag, hit };
  },

  conteiner(c) {
    c.box([1.9, 1.1, 1.1], M.green, [0, 0.65, 0], [0, 0, 0], [0.8, 0.8]);
    c.box([1.96, 0.06, 1.16], M.dark, [0, 1.23, 0], [0.12, 0, 0]);
    c.box([1.9, 0.08, 0.08], M.black, [0, 0.1, 0.5]);
    for (const x of [-0.8, 0.8]) c.cyl(0.08, 0.08, 0.06, 8, M.rubber, [x, 0.08, 0.56], [0, 0, Math.PI / 2]);
    c.hit([1.9, 1.3, 1.1], [0, 0.65, 0], 'conteiner', 'lixeira');
  },

  'quadro-forca'(c) {
    const { T, r } = c, X = [-0.18, -0.06, 0.06, 0.18], ROW = [1.5, 1.16];
    c.box([0.8, 2.0, 0.04], M.wood, [0, 1.0, -0.06], [0, 0, 0], [0.8, 0.8]);
    c.box([0.6, 0.8, 0.14], D('#ffffff', 'doorMetal'), [0, 1.3, 0.03], [0, 0, 0], [0.6, 0.6]);
    c.box([0.5, 0.7, 0.01], D('#2a2c2a', 'rubber'), [0, 1.3, 0.103]);
    const labels = breakerLabels(r), plate = D('#8a8c84', 'steel');
    const off = D('#b8342a', 'plastic'), on = D('#d8d0b8', 'plastic');
    const offM = c.builder.material(off, c.area, true), onM = c.builder.material(on, c.area, true);
    const green = new T.Color('#5ad070'), red = new T.Color('#d03a2a');
    const switches = {};
    BREAKERS.forEach((area, i) => {
      const x = X[i % 4], y0 = ROW[i >> 2];
      c.box([0.075, 0.15, 0.008], plate, [x, y0, 0.112]);
      c.quad(0.085, 0.045, labels.desc, [x, y0 - 0.1, 0.1095], [0, 0, 0], labels.uv(i));
      const pivot = new T.Group(); pivot.position.set(x, y0 - 0.015, 0.12); c.dyn.add(pivot);
      const lever = c.mesh(new T.BoxGeometry(0.035, 0.075, 0.026), on, [0, 0.032, 0], [0, 0, 0], pivot);
      const lamp = new T.Mesh(new T.PlaneGeometry(0.022, 0.012), r.glow('#5ad070')); lamp.position.set(x, y0 + 0.062, 0.1175); c.dyn.add(lamp);
      const hit = c.hit([0.08, 0.14, 0.06], [x, y0, 0.125], 'disjuntor-' + area, 'disjuntor');
      const sw = { area, pivot, lever, hit, on: true };
      sw.set = (v) => {
        sw.on = Boolean(v); pivot.rotation.x = sw.on ? 0.5 : -0.5; lever.material = sw.on ? onM : offM;
        lamp.material.uniforms.uColor.value.copy(sw.on ? green : red);
      };
      sw.set(true); switches[area] = sw;
    });
    // the door hinges on the left and opens toward whoever stands in front
    const door = new T.Group(); door.position.set(-0.3, 1.3, 0.15); c.dyn.add(door);
    c.mesh(new T.BoxGeometry(0.6, 0.8, 0.025), D('#ffffff', 'doorMetal'), [0.3, 0, 0.0], [0, 0, 0], door);
    c.mesh(new T.BoxGeometry(0.035, 0.07, 0.03), M.gray, [0.52, 0, 0.022], [0, 0, 0], door);
    c.hit([0.8, 1.0, 0.1], [0, 1.3, 0.04], 'quadro-forca', 'quadro-forca');
    const prev = BREAKERS.map(() => true);
    const breakers = {
      areas: BREAKERS, switches,
      setOn(area, v) { const sw = switches[area]; if (!sw) return false; sw.set(v); return true; },
      isOn: (area) => switches[area]?.on ?? true,
    };
    return { breakers, door, update: (_t, st) => {
      door.rotation.y = -1.9 * (st?.quadroAberto ?? 0);
      // `st.disjuntores` (one flag per area, in the order of `breakers.areas`) is applied only when a flag changes
      const flags = st?.disjuntores;
      if (Array.isArray(flags)) BREAKERS.forEach((area, i) => { const v = flags[i] !== 0 && flags[i] !== false; if (v !== prev[i]) { prev[i] = v; breakers.setOn(area, v); } });
    } };
  },

  relogio(c) {
    const { T, r } = c;
    c.cyl(0.19, 0.19, 0.03, 12, D('#2a2622', 'rubber'), [0, 2.4, 0.015], [Math.PI / 2, 0, 0]);
    c.cyl(0.17, 0.17, 0.005, 12, D('#e6dcc0', 'plastic'), [0, 2.4, 0.032], [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.283; c.box([0.012, 0.025, 0.004], M.black, [Math.sin(a) * 0.145, 2.4 + Math.cos(a) * 0.145, 0.036], [0, 0, -a]); }
    const hh = new T.Mesh(new T.BoxGeometry(0.014, 0.1, 0.006), r.mat('#1c1a18')); hh.geometry.translate(0, 0.045, 0); hh.position.set(0, 2.4, 0.04);
    const mm = new T.Mesh(new T.BoxGeometry(0.01, 0.15, 0.006), r.mat('#1c1a18')); mm.geometry.translate(0, 0.07, 0); mm.position.set(0, 2.4, 0.043);
    c.dyn.add(hh, mm);
    c.hit([0.4, 0.4, 0.1], [0, 2.4, 0.03], 'relogio', 'relogio');
    const set = (hours) => { const h = ((hours % 12) + 12) % 12, m = (hours % 1 + 1) % 1; hh.rotation.z = -h / 12 * 6.283; mm.rotation.z = -m * 6.283; };
    set(0);
    return { setTime: set, update: (_t, st) => { if (st?.hora !== undefined) set(st.hora); } };
  },

  calendario(c) {
    const { T, r } = c;
    const cv = document.createElement('canvas'); cv.width = 32; cv.height = 40; const g = cv.getContext('2d');
    g.fillStyle = 'rgb(226,214,184)'; g.fillRect(0, 0, 32, 40);
    g.fillStyle = 'rgb(110,74,44)'; g.fillRect(0, 0, 32, 2);
    const sol = document.createElement('canvas'); sol.width = sol.height = 64; paintSol(sol.getContext('2d'), 64, 0.1); g.drawImage(sol, 9, 3, 14, 14);
    for (let w = 0; w < 4; w++) for (let d = 0; d < 7; d++) {
      g.fillStyle = d === 6 ? 'rgb(180,90,60)' : 'rgb(90,74,56)'; g.fillRect(2 + d * 4, 20 + w * 4, 3, 3);
    }
    const t = canvasTexture(r, cv);
    const m = new T.Mesh(new T.PlaneGeometry(0.4, 0.5), r.mat('#ffffff', { map: t })); m.position.set(0, 1.55, 0.022); c.dyn.add(m);
    c.box([0.44, 0.54, 0.02], M.dark, [0, 1.55, 0.002]);
    c.hit([0.45, 0.55, 0.08], [0, 1.55, 0.02], 'calendario', 'calendario');
    return { canvas: cv, texture: t, mesh: m, redraw: () => { t.needsUpdate = true; } };
  },

  'quadro-tarefas'(c) {
    const { T, r } = c;
    const cv = document.createElement('canvas'); cv.width = 48; cv.height = 32; const g = cv.getContext('2d');
    g.fillStyle = 'rgb(176,136,84)'; g.fillRect(0, 0, 48, 32);
    const R = mulberry32(5);
    for (let i = 0; i < 6; i++) {
      const x = 3 + (i % 3) * 15, y = 3 + (i >> 1 & 1 ? 0 : 0) + ((i / 3) | 0) * 15;
      g.fillStyle = 'rgb(232,226,204)'; g.fillRect(x, y, 12, 12);
      g.fillStyle = 'rgb(90,70,50)';
      for (let k = 0; k < 3; k++) { g.fillRect(x + 2, y + 2 + k * 3, 2, 2); g.fillRect(x + 5, y + 3 + k * 3, 5, 1); }
      if (R() > 0.4) { g.fillStyle = 'rgb(60,120,70)'; g.fillRect(x + 8, y + 9, 3, 1); }
    }
    const t = canvasTexture(r, cv);
    c.box([1.14, 0.84, 0.03], M.wood, [0, 1.5, 0.0]);
    const m = new T.Mesh(new T.PlaneGeometry(1.06, 0.76), r.mat('#ffffff', { map: t })); m.position.set(0, 1.5, 0.028); c.dyn.add(m);
    c.hit([1.14, 0.84, 0.08], [0, 1.5, 0.03], 'quadro-tarefas', 'quadro');
  },

  cartaz(c, o) {
    const { T, r } = c, w = o.w ?? 1.9, h = w / 2;
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64; paintPoster(cv.getContext('2d'), 128, 64);
    const t = canvasTexture(r, cv);
    c.box([w + 0.06, h + 0.06, 0.02], M.brown, [0, o.y ?? 1.9, 0.0]);
    const m = new T.Mesh(new T.PlaneGeometry(w, h), r.mat('#ffffff', { map: t })); m.position.set(0, o.y ?? 1.9, 0.022); c.dyn.add(m);
    c.hit([w, h, 0.08], [0, o.y ?? 1.9, 0.03], 'cartaz', 'cartaz');
  },

  'placa-sol'(c) {
    const { T, r } = c;
    c.cyl(0.18, 0.22, 10.6, 8, D('#ffffff', 'column'), [0, 5.3, 0], [0, 0, 0], [1, 1, 1]);
    c.box([0.9, 0.5, 0.9], D('#8a7a68', 'concrete'), [0, 0.25, 0]);
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
    const t = canvasTexture(r, cv);
    const state = { smile: -1, ray: -2 };
    const redraw = (smile, ray) => { if (state.smile === smile && state.ray === ray) return; state.smile = smile; state.ray = ray; paintSol(g, 64, smile, ray); t.needsUpdate = true; };
    redraw(0, -1);
    const mat = r.glow('#ffffff', { map: t, fogged: 0.5 });
    const front = new T.Mesh(new T.PlaneGeometry(4.0, 4.0), mat); front.position.set(0, 9.2, 0.2); c.dyn.add(front);
    const back = new T.Mesh(new T.PlaneGeometry(4.0, 4.0), mat); back.position.set(0, 9.2, -0.2); back.rotation.y = Math.PI; c.dyn.add(back);
    c.box([3.6, 0.16, 0.34], D('#ffffff', 'canopyBand'), [0, 7.0, 0]);
    c.box([2.4, 1.75, 0.3], D('#ffffff', 'column'), [0, 6.0, 0], [0, 0, 0], [0.8, 0.8]);
    // fuel board: four stickers with a price in seven segments, both sides
    const pc = document.createElement('canvas'); pc.width = 64; pc.height = 48; const pg = pc.getContext('2d');
    pg.fillStyle = 'rgb(30,24,20)'; pg.fillRect(0, 0, 64, 48);
    const prices = ['579', '629', '419', '589'];
    FUEL_KEYS.forEach((k, i) => {
      const ico = document.createElement('canvas'); ico.width = ico.height = 16; paintFuel(ico.getContext('2d'), 0, 0, k); pg.drawImage(ico, 2, 1 + i * 12, 11, 11);
      for (let d = 0; d < 3; d++) drawSeg(pg, 17 + d * 14, 2 + i * 12, 11, 9, prices[i][d], 'rgb(255,150,50)', 'rgb(60,30,16)', 2);
      pg.fillStyle = 'rgb(255,150,50)'; pg.fillRect(17 + 14 - 3, 9 + i * 12, 1, 1);
    });
    const pt = canvasTexture(r, pc);
    const pm = r.mat('#ffffff', { map: pt, emissive: 0.85, fogged: 0.6 });
    const b1 = new T.Mesh(new T.PlaneGeometry(2.2, 1.65), pm); b1.position.set(0, 6.0, 0.155); c.dyn.add(b1);
    const b2 = new T.Mesh(new T.PlaneGeometry(2.2, 1.65), pm); b2.position.set(0, 6.0, -0.155); b2.rotation.y = Math.PI; c.dyn.add(b2);
    c.hit([4, 4, 0.5], [0, 9.2, 0], 'placa-sol', 'placa');
    // the breaker of the sign: without power both faces and the price board go dark
    const lit = new T.Color('#ffffff'), dead = new T.Color('#26262c');
    const setPower = (on) => { mat.uniforms.uColor.value.copy(on ? lit : dead); pm.uniforms.uColor.value.copy(on ? lit : dead); };
    return { redraw, setPower, update: (t0, st) => {
      const s = Math.max(0, Math.min(1, st?.placaSorriso ?? 0)), q = Math.round(s * 8) / 8;
      const flick = Math.floor(t0 * 7) % 9 === 0 || Math.floor(t0 * 3) % 7 === 0 ? 4 : -1; // one ray fails now and then
      redraw(q, flick);
    }, mesh: [front, back] };
  },

  poste(c) {
    const { T, r } = c;
    c.cyl(0.07, 0.1, 7.2, 6, M.gray, [0, 3.6, 0]);
    c.box([1.4, 0.06, 0.08], M.gray, [0.6, 7.2, 0]);
    c.box([0.5, 0.1, 0.22], M.dark, [1.2, 7.14, 0]);
    const lamp = new T.Mesh(new T.PlaneGeometry(0.4, 0.16), r.glow('#f4d890')); lamp.rotation.x = Math.PI / 2; lamp.position.set(1.2, 7.085, 0); c.dyn.add(lamp);
    c.hit([0.3, 7.2, 0.3], [0, 3.6, 0], 'poste', 'poste');
    const st = { level: 1, burnt: false };
    const show = () => { lamp.visible = st.level > 0.05 && !st.burnt; };
    return { lamp, setLevel: (k) => { st.level = k; show(); }, setBurnt: (v) => { st.burnt = Boolean(v); show(); }, get burnt() { return st.burnt; } };
  },

  cracha(c) {
    // an old attendant's badge: a faded card of about 11 x 15 cm (a hand's breadth, so it reads from across the canopy) on a cord of 40 cm from the hook, a dark photo with no face to read; it sways a little
    const { T, r } = c;
    const cv = document.createElement('canvas'); cv.width = 36; cv.height = 52; const g = cv.getContext('2d');
    g.fillStyle = 'rgb(220,210,172)'; g.fillRect(0, 0, 36, 52); g.fillStyle = 'rgb(96,78,56)'; g.fillRect(0, 0, 36, 1); g.fillRect(0, 51, 36, 1); g.fillRect(0, 0, 1, 52); g.fillRect(35, 0, 1, 52);
    g.fillStyle = 'rgb(176,112,52)'; g.fillRect(1, 1, 34, 11);
    const sun = document.createElement('canvas'); sun.width = sun.height = 32; paintSol(sun.getContext('2d'), 32, 0.2); g.drawImage(sun, 21, 1, 13, 11);
    g.fillStyle = 'rgb(236,224,186)'; g.fillRect(3, 4, 14, 2); g.fillRect(3, 8, 9, 2);
    g.fillStyle = 'rgb(46,38,34)'; g.fillRect(8, 16, 20, 20); g.fillStyle = 'rgb(66,56,50)'; g.beginPath(); g.arc(18, 24, 6, 0, 7); g.fill(); g.fillRect(11, 30, 14, 6);
    g.fillStyle = 'rgb(100,84,64)'; for (let i = 0; i < 3; i++) g.fillRect(5, 40 + i * 3, 26 - i * 7, 1);
    const t = canvasTexture(r, cv);
    const grp = new T.Group(); grp.position.set(0, 0.5, 0); c.dyn.add(grp); // pivot at the hook
    c.box([0.05, 0.03, 0.03], M.gray, [0, 0.5, 0]);
    c.mesh(new T.BoxGeometry(0.02, 0.4, 0.02), D('#2a2218', 'rubber'), [0, -0.2, 0], [0, 0, 0], grp);
    c.mesh(new T.BoxGeometry(0.03, 0.025, 0.012), M.gray, [0, -0.412, 0], [0, 0, 0], grp);
    const card = new T.Mesh(new T.PlaneGeometry(0.11, 0.155), r.mat('#ffffff', { map: t, side: T.DoubleSide, emissive: 0.6, fogged: 0.4 })); card.position.set(0, -0.49, 0); card.rotation.x = 0.45; grp.add(card); // leaning a little: its face turns down to whoever stands below
    c.hit([0.14, 0.6, 0.1], [0, 0.25, 0], 'cracha', 'cracha');
    return { card: grp, update: (tt) => { grp.rotation.z = Math.sin(tt * 0.9) * 0.06; grp.rotation.y = Math.sin(tt * 0.6 + 1) * 0.12; } };
  },

  sino(c) {
    const { T } = c;
    c.box([0.04, 0.12, 0.03], M.gray, [0, 2.2, 0]);
    const piv = new T.Group(); piv.position.set(0, 2.14, 0); c.dyn.add(piv);
    c.mesh(new T.ConeGeometry(0.05, 0.08, 6), D('#c8a040', 'steel'), [0, -0.06, 0], [0, 0, 0], piv);
    c.mesh(new T.SphereGeometry(0.012, 4, 3), M.dark, [0, -0.11, 0], [0, 0, 0], piv);
    return { pivot: piv, update: (t, st) => {
      const t0 = st?.sino; const age = t0 === undefined || t0 === null ? 99 : t - t0;
      piv.rotation.z = age >= 0 && age < 2.5 ? Math.sin(age * 28) * 0.5 * Math.exp(-age * 1.8) : 0;
    } };
  },

  porta(c, o) {
    const { T, r } = c, w = o.w ?? 0.95, h = o.h ?? 2.1, kind = o.tipo ?? 'madeira', sw = o.swing ?? 1, hl = o.hinge === 'right' ? 1 : -1;
    const frame = D('#7a5434', 'plastic');
    c.box([0.06, h + 0.05, 0.26], frame, [-w / 2 - 0.03, (h + 0.05) / 2, 0]); c.box([0.06, h + 0.05, 0.26], frame, [w / 2 + 0.03, (h + 0.05) / 2, 0]);
    c.box([w + 0.12, 0.05, 0.26], frame, [0, h + 0.025, 0]);
    const piv = new T.Group(); piv.position.set(hl * w / 2, 0, 0); c.dyn.add(piv);
    let leaf;
    if (kind === 'vidro') {
      leaf = new T.Mesh(new T.PlaneGeometry(w - 0.02, h - 0.02), r.mat('#ffffff', { map: tex(r, 'glassDoor'), side: T.DoubleSide })); leaf.position.set(-hl * w / 2, h / 2, 0); piv.add(leaf);
      const pane = new T.Mesh(new T.PlaneGeometry(w - 0.06, h - 0.06), r.mat('#58708a', { transparent: true, opacity: 0.25, depthWrite: false, side: T.DoubleSide })); pane.position.set(-hl * w / 2, h / 2, 0.002); pane.renderOrder = 2; piv.add(pane);
    } else {
      const m = kind === 'metal' ? M.doorMetal : M.doorWood;
      if (o.visor) {
        // a small peephole of wired glass at eye height: the leaf is four slabs round a real opening
        const lw = w - 0.02, vw = 0.24, vh = 0.36, vy = 1.72, lo = vy - vh / 2, hi = vy + vh / 2, cx = -hl * w / 2;
        leaf = new T.Group(); leaf.position.set(cx, 0, 0); piv.add(leaf);
        c.mesh(new T.BoxGeometry(lw, lo - 0.01, 0.045), m, [0, (lo + 0.01) / 2, 0], [0, 0, 0], leaf);
        c.mesh(new T.BoxGeometry(lw, h - 0.01 - hi, 0.045), m, [0, (hi + h - 0.01) / 2, 0], [0, 0, 0], leaf);
        for (const sx of [-1, 1]) c.mesh(new T.BoxGeometry((lw - vw) / 2, vh, 0.045), m, [sx * (vw + (lw - vw) / 2) / 2, vy, 0], [0, 0, 0], leaf);
        c.mesh(new T.PlaneGeometry(vw, vh), D('#d8dccc', 'aramado', { side: 2 }), [0, vy, 0], [0, 0, 0], leaf);
        const pane = new T.Mesh(new T.PlaneGeometry(vw, vh), r.mat('#58708a', { transparent: true, opacity: 0.22, depthWrite: false, side: T.DoubleSide })); pane.position.set(0, vy, 0.004); pane.renderOrder = 2; leaf.add(pane);
      } else leaf = c.mesh(new T.BoxGeometry(w - 0.02, h - 0.02, 0.045), m, [-hl * w / 2, h / 2, 0], [0, 0, 0], piv);
    }
    const hit = c.hit([w, h, 0.2], [0, h / 2, 0], o.id ?? 'porta', 'porta'); hit.visible = true;
    // `sticker`: a Sun sticker on each face of the leaf (hidden), turning with it
    const sticker = o.sticker && kind !== 'vidro' ? [sunDecal(c, 0.2, [-hl * w / 2, 1.5, 0.031], [0, 0, 0], piv), sunDecal(c, 0.2, [-hl * w / 2, 1.5, -0.031], [0, Math.PI, 0], piv)] : [];
    return { pivot: piv, leaf, hit, w, h, sticker, setOpen: (k) => { piv.rotation.y = -hl * sw * 1.65 * k; } };
  },

  pia(c) {
    c.box([0.6, 0.8, 0.45], M.counter, [0, 0.4, 0]);
    c.box([0.62, 0.05, 0.47], M.porcelain, [0, 0.82, 0]);
    c.box([0.44, 0.04, 0.3], D('#b8b8aa', 'porcelain'), [0, 0.845, 0.02]);
    c.cyl(0.015, 0.015, 0.16, 5, M.gray, [0, 0.93, -0.12]); c.box([0.02, 0.02, 0.1], M.gray, [0, 1.0, -0.07]);
    c.hit([0.62, 1.05, 0.47], [0, 0.52, 0], 'pia', 'pia');
  },

  vaso(c) {
    c.box([0.38, 0.4, 0.5], M.porcelain, [0, 0.2, 0.05]);
    c.cyl(0.19, 0.17, 0.05, 8, D('#cfcfc0', 'porcelain'), [0, 0.43, 0.08]);
    c.box([0.4, 0.4, 0.16], M.porcelain, [0, 0.6, -0.18]);
    c.box([0.05, 0.05, 0.03], M.gray, [0.12, 0.8, -0.1]);
    c.hit([0.42, 0.8, 0.6], [0, 0.4, 0], 'vaso', 'vaso');
  },

  cabine(c, o) {
    const { T } = c, W = o.w ?? 1.1, Dp = o.depth ?? 1.5, side = D('#ffffff', 'doorMetal');
    c.box([0.03, 1.8, Dp], side, [-W / 2, 1.0, 0], [0, 0, 0], [0.6, 0.6]);
    c.box([0.03, 1.8, Dp], side, [W / 2, 1.0, 0], [0, 0, 0], [0.6, 0.6]);
    c.box([W, 1.8, 0.03], side, [0, 1.0, -Dp / 2], [0, 0, 0], [0.6, 0.6]);
    const door = new T.Group(); door.position.set(-W / 2 + 0.02, 0.1, Dp / 2); c.dyn.add(door);
    c.mesh(new T.BoxGeometry(W - 0.04, 1.75, 0.025), side, [(W - 0.04) / 2, 0.9, 0], [0, 0, 0], door);
    const hit = c.hit([W, 1.9, 0.2], [0, 0.95, Dp / 2], o.id ?? 'cabine', 'esconderijo');
    const toilet = o.vaso !== false;
    if (toilet) { c.box([0.38, 0.4, 0.5], M.porcelain, [0, 0.2, -Dp / 2 + 0.35]); c.box([0.4, 0.4, 0.16], M.porcelain, [0, 0.6, -Dp / 2 + 0.1]); }
    return { door, hit, setOpen: (k) => { door.rotation.y = -1.6 * k; } };
  },

  espelho(c, o) {
    const { T, r } = c, w = o.w ?? 0.7, h = o.h ?? 0.9;
    c.box([w + 0.06, h + 0.06, 0.02], M.black, [0, 1.55, 0]);
    const dflt = tex(r, 'mirror');
    const m = new T.Mesh(new T.PlaneGeometry(w, h), r.mat('#ffffff', { map: dflt, emissive: 0.15 })); m.position.set(0, 1.55, 0.022); m.name = 'espelho'; c.dyn.add(m);
    c.hit([w, h, 0.06], [0, 1.55, 0.03], o.id ?? 'espelho', 'espelho');
    const u = m.material.uniforms, st = { custom: false, flip: false };
    const sticker = [sunDecal(c, 0.13, [w / 2 - 0.1, 1.55 - h / 2 + 0.1, 0.03])];
    return {
      glass: m, w, h, sticker,
      /** A texture (or a canvas) on the mirror's own surface, e.g. a rendered reflection; null brings back the painted glass. */
      setTexture(t, opts = {}) {
        if (!t) { u.map.value = dflt; u.uEmissive.value = 0.15; u.uFogged.value = 1; st.custom = false; return; }
        u.map.value = t.isTexture ? t : canvasTexture(r, t); u.uHasMap.value = 1; u.uEmissive.value = opts.emissive ?? 1; u.uFogged.value = opts.fogged ?? 0.35; st.custom = true;
      },
      /** Mirror the picture left to right (a reflection render usually needs it). */
      setFlipX(v) {
        if (st.flip === Boolean(v)) return; st.flip = Boolean(v);
        const uv = m.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i)); uv.needsUpdate = true;
      },
      get custom() { return st.custom; }, get flipX() { return st.flip; },
      /** World centre and outward unit normal of the glass (Vector3), for the camera that renders the reflection. */
      center(out = new T.Vector3()) { m.updateWorldMatrix(true, false); return m.getWorldPosition(out); },
      normal(out = new T.Vector3()) { m.updateWorldMatrix(true, false); return m.getWorldDirection(out); },
    };
  },

  interruptor(c) {
    c.box([0.08, 0.12, 0.02], M.cream, [0, 1.3, 0]); c.box([0.02, 0.05, 0.02], M.black, [0, 1.3, 0.016]);
    c.hit([0.12, 0.16, 0.08], [0, 1.3, 0.02], 'interruptor', 'interruptor');
  },

  luminaria(c, o) {
    const { T, r } = c, kind = o.kind ?? 'fluorescente';
    let tube;
    const ends = [];
    if (kind === 'cobertura') {
      c.box([1.0, 0.1, 0.6], D('#ffffff', 'canopyBand'), [0, 0.05, 0]);
      tube = new T.Mesh(new T.PlaneGeometry(0.86, 0.46), r.glow('#f4e4b0', { fogged: 0.5 })); tube.rotation.x = Math.PI / 2; tube.position.set(0, 0.0, 0);
      for (const z of [-0.2, 0.2]) { const e = new T.Mesh(new T.PlaneGeometry(0.86, 0.07), r.mat('#3a2c1c', { emissive: 0.1 })); e.rotation.x = Math.PI / 2; e.position.set(0, 0.002, z); ends.push(e); }
    } else if (kind === 'mesa') {
      c.cyl(0.08, 0.1, 0.03, 8, M.dark, [0, 0.015, 0]); c.cyl(0.012, 0.012, 0.3, 5, M.dark, [0, 0.18, 0], [0, 0, 0.3]);
      c.cyl(0.02, 0.09, 0.1, 8, D('#6a8a5a', 'green'), [0.07, 0.36, 0], [0, 0, 0.5]);
      tube = new T.Mesh(new T.CircleGeometry(0.075, 8), r.glow('#ffe0a0', { fogged: 0.4 })); tube.rotation.x = Math.PI / 2; tube.position.set(0.07, 0.31, 0);
    } else {
      c.box([0.28, 0.06, 1.3], D('#d8d4c4', 'plastic'), [0, 0.03, 0]);
      tube = new T.Mesh(new T.PlaneGeometry(0.2, 1.2), r.glow('#e8f0e0', { fogged: 0.5 })); tube.rotation.x = Math.PI / 2; tube.position.set(0, -0.003, 0);
      for (const z of [-0.5, 0.5]) { const e = new T.Mesh(new T.PlaneGeometry(0.2, 0.2), r.mat('#3a2c1c', { emissive: 0.1 })); e.rotation.x = Math.PI / 2; e.position.set(0, -0.0015, z); ends.push(e); }
    }
    c.dyn.add(tube);
    // a burnt tube: dark all along, with brown ends
    for (const e of ends) { e.visible = false; c.dyn.add(e); }
    const bright = new T.Color(tube.material.uniforms.uColor.value), off = new T.Color('#2a2a28'), burntC = new T.Color('#161513');
    const st = { level: 1, burnt: false };
    const paint = () => tube.material.uniforms.uColor.value.copy(st.burnt ? burntC : off).lerp(bright, st.burnt ? 0 : Math.max(0, Math.min(1, st.level)));
    return {
      tube, setLevel: (k) => { st.level = k; paint(); },
      setBurnt: (v) => { st.burnt = Boolean(v); for (const e of ends) e.visible = st.burnt; paint(); },
      get burnt() { return st.burnt; },
    };
  },

  mancha(c, o) {
    const { T, r } = c, size = o.size ?? 0.9;
    const m = new T.Mesh(new T.PlaneGeometry(size, size), r.mat(o.tint ?? '#ffffff', { map: tex(r, 'stain'), transparent: true, opacity: 0.8, depthWrite: false }));
    m.rotation.set(-Math.PI / 2, 0, o.rot ?? 0); m.position.y = 0.012; m.renderOrder = 1; c.dyn.add(m);
    const hit = c.hit([size, 0.2, size], [0, 0.1, 0], o.id ?? 'mancha', 'mancha');
    const st = { dirt: 1 };
    /** 0 = clean (gone), 1 = full stain; in between it shrinks and fades */
    const setDirt = (k) => {
      st.dirt = Math.max(0, Math.min(1, k)); m.visible = st.dirt > 0.02;
      m.material.opacity = 0.8 * Math.min(1, st.dirt * 1.6); m.scale.setScalar(0.5 + 0.5 * st.dirt);
    };
    return { mesh: m, hit, setDirt, get dirt() { return st.dirt; }, setVisible: (v) => setDirt(v ? 1 : 0) };
  },

  calibrador(c) {
    c.box([0.3, 1.1, 0.25], D('#ffffff', 'column'), [0, 0.55, 0], [0, 0, 0], [0.5, 0.5]);
    c.box([0.2, 0.15, 0.02], M.dark, [0, 0.9, 0.135]);
    c.cyl(0.012, 0.012, 0.4, 4, M.black, [0.17, 0.5, 0.05]);
    c.hit([0.35, 1.1, 0.3], [0, 0.55, 0], 'calibrador', 'calibrador');
  },
};

/** A tied black sack of radius `rad` (loose meshes) in the group `g`. */
function bagParts(c, g, rad) {
  const { T } = c, plastic = D('#24282a', 'plastic');
  const body = c.mesh(new T.SphereGeometry(rad, 7, 5), plastic, [0, rad * 0.85, 0], [0, 0, 0], g); body.scale.set(1, 0.95, 1);
  c.mesh(new T.CylinderGeometry(rad * 0.18, rad * 0.5, rad * 0.55, 6), plastic, [0, rad * 1.75, 0], [0, 0, 0], g);
  c.mesh(new T.SphereGeometry(rad * 0.22, 5, 4), plastic, [0, rad * 2.1, 0], [0, 0, 0], g);
  c.mesh(new T.ConeGeometry(rad * 0.16, rad * 0.5, 4), plastic, [rad * 0.22, rad * 2.2, 0], [0, 0, -0.9], g);
  c.mesh(new T.ConeGeometry(rad * 0.16, rad * 0.5, 4), plastic, [-rad * 0.2, rad * 2.2, rad * 0.05], [0, 0, 0.8], g);
}

function crtUnit(c, { cams, base }) {
  const { T, r } = c;
  c.box([0.42, 0.04, 0.4], M.cream, [base === 'monitor' ? 0 : 0.18, 0.02, 0]);
  const x0 = base === 'monitor' ? 0 : 0.18;
  c.box([0.4, 0.36, 0.1], D('#cfc8b0', 'plastic'), [x0, 0.22, 0.12]);
  c.box([0.3, 0.26, 0.22], D('#cfc8b0', 'plastic'), [x0, 0.22, -0.04]);
  c.box([0.2, 0.18, 0.12], D('#bdb69e', 'plastic'), [x0, 0.22, -0.2]);
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 48; const g = cv.getContext('2d');
  const rnd = mulberry32(base === 'monitor' ? 31 : 7);
  const state = { mode: cams ? 'cams' : 'idle' };
  const draw = (t) => {
    if (state.mode === 'cams') {
      for (let k = 0; k < 6; k++) {
        const x = (k % 3) * 21, y = (k >> 1 >= 1 ? 0 : 0) + ((k / 3) | 0) * 24;
        for (let j = 0; j < 12; j++) { g.fillStyle = `rgb(${60 + ((rnd() * 80) | 0)},${70 + ((rnd() * 80) | 0)},${64 + ((rnd() * 80) | 0)})`; g.fillRect(x + ((rnd() * 20) | 0), y + ((rnd() * 22) | 0), 3, 2); }
        g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x, y, 20, 1); g.fillRect(x, y, 1, 22);
      }
    } else {
      g.fillStyle = 'rgb(10,22,18)'; g.fillRect(0, 0, 64, 48);
      if (Math.floor(t * 2) % 2 === 0) { g.fillStyle = 'rgb(110,255,190)'; g.fillRect(6, 30, 4, 2); }
    }
    tex2.needsUpdate = true;
  };
  const tex2 = canvasTexture(r, cv);
  draw(0);
  const screen = new T.Mesh(new T.PlaneGeometry(0.31, 0.23), r.glow('#ffffff', { map: tex2, emissive: 0.8, fogged: 0.6 })); screen.position.set(x0, 0.23, 0.1705); c.dyn.add(screen);
  c.hit([0.45, 0.4, 0.4], [x0, 0.22, 0.05], base === 'monitor' ? 'monitor' : 'computador', base);
  let custom = false;
  const sticker = [sunDecal(c, 0.055, [x0 + 0.14, 0.078, 0.1725])];
  return {
    screen, canvas: cv, sticker,
    /** a canvas or a THREE.Texture shown on the screen; null returns to the default picture */
    setScreen(src) {
      if (!src) { custom = false; screen.material.uniforms.map.value = tex2; return; }
      custom = true; screen.material.uniforms.map.value = src.isTexture ? src : canvasTexture(r, src);
    },
    update(t) { if (!cams && !custom) draw(t); },
  };
}

// Shelf behind the counter: three boards, two item types per board (left and right half). Each type is one mesh
// with setStock(), like a gondola row, and has `slotAt(i)` (the local point of slot i).
function balcaoShelf(c, o) {
  const L = o.length ?? 1.6, depth = 0.3, half = L / 2, levels = [0.55, 0.9, 1.25];
  const types = o.rows ?? ['oleo-motor', 'carregador', 'pilha', 'fita', 'chaveiro', 'palito'];
  c.box([L, 0.1, depth], D('#8a6a48', 'wood'), [0, 0.05, 0]);
  c.box([L, 1.45, 0.03], M.shelf, [0, 0.73, -depth / 2 + 0.015], [0, 0, 0], [0.7, 0.7]);
  for (const x of [-L / 2 + 0.02, L / 2 - 0.02]) c.box([0.04, 1.45, depth], M.shelf, [x, 0.73, 0], [0, 0, 0], [0.7, 0.7]);
  c.box([L + 0.04, 0.05, depth + 0.04], D('#a07850', 'wood'), [0, 1.47, 0]);
  const rows = [];
  levels.forEach((y, lv) => {
    c.box([L - 0.08, 0.03, depth - 0.03], M.shelf, [0, y, 0.0], [0, 0, 0], [0.7, 0.7]);
    for (let side = 0; side < 2; side++) {
      const tipo = types[lv * 2 + side], A = ATRAS[tipo], x0 = side ? 0.04 : -half + 0.06, x1 = side ? half - 0.06 : -0.04;
      const slots = Math.floor((x1 - x0) / A.pitch), cx = (x0 + x1) / 2, z0 = 0.05;
      const at = (i) => [cx - ((slots - 1) * A.pitch) / 2 + i * A.pitch, y + 0.015, z0];
      // a label strip with the drawing of the item on the front edge of the board
      if (A.cell >= 0) c.quad(0.12, 0.05, atrasDesc(c.r), [cx, y + 0.005, depth / 2 - 0.0], [0, 0, 0], rectInset(cellUV(A.cell)));
      else c.quad(0.12, 0.05, M.prod, [cx, y + 0.005, depth / 2 - 0.0], [0, 0, 0], cellUV(PRODUTOS.oleo.cells[0]));
      let perSlot = 0;
      const res = c.sub((s) => {
        for (let i = 0; i < slots; i++) { const p = at(i); addAtras(s, tipo, p[0], p[1], p[2], i); }
        perSlot = 3 * (tipo === 'oleo-motor' ? productGeo(c.r, 'oleo', PRODUTOS.oleo.cells[0]).tris : atrasGeo(c.r, tipo, 0).tris); // draw ranges count vertices
      });
      const mesh = res.meshes[0];
      const hit = c.hit([x1 - x0, 0.3, 0.3], [cx, y + 0.17, 0.05], 'atras-' + tipo, 'prateleira');
      const row = { face: 0, nivel: lv, tipo, label: A.label, slots, mesh, hit, stock: slots, slotAt: at,
        localAt: [cx, 0, 0.9], localDir: [0, 0, -1],
        setStock(k) { row.stock = Math.max(0, Math.min(slots, k | 0)); mesh.geometry.setDrawRange(0, row.stock * perSlot); mesh.visible = row.stock > 0; } };
      mesh.userData.row = row; hit.userData.row = row;
      rows.push(row);
    }
  });
  return { rows, length: L, depth, setStockAll: (k) => rows.forEach((w) => w.setStock(k)) };
}

// ---------------------------------------------------------------------------------------------
// Gondola: a body with boards and rows of products. Each row is its own mesh (setStock moves the draw range).
function gondola(c, o) {
  const { r } = c, faces = o.faces, L = o.length ?? 3.0, depth = o.depth ?? 0.52, half = depth / 2;
  const levels = [0.22, 0.67, 1.12], rnd = mulberry32((o.seed ?? 1) * 101 + 7);
  let vintageMat = null;
  const autoRows = Array.from({ length: faces * 3 }, (_, i) => PRODUTO_TIPOS[(i + ((rnd() * 5) | 0)) % 5]); // always drawn, so the seed gives the same rows whatever is fixed
  const rowTypes = autoRows.map((t, i) => (PRODUTOS[o.rows?.[i]] ? o.rows[i] : t));
  const back = faces === 2 ? 0 : -half;
  c.box([L, 0.15, depth], D('#8a6a48', 'wood'), [0, 0.075, 0]);
  c.box([L, 1.6, 0.04], M.shelf, [0, 0.8, back + (faces === 2 ? 0 : 0.02)], [0, 0, 0], [0.7, 0.7]);
  for (const x of [-L / 2 + 0.02, L / 2 - 0.02]) c.box([0.04, 1.6, depth], M.shelf, [x, 0.8, 0], [0, 0, 0], [0.7, 0.7]);
  c.box([L + 0.04, 0.05, depth + 0.04], D('#a07850', 'wood'), [0, 1.62, 0]);
  const rows = [];
  for (let f = 0; f < faces; f++) {
    const dir = f === 0 ? 1 : -1;
    for (let lv = 0; lv < 3; lv++) {
      const y = levels[lv], tipo = rowTypes[f * 3 + lv], P = PRODUTOS[tipo];
      const boardD = faces === 2 ? half - 0.02 : depth - 0.04;
      c.box([L - 0.08, 0.03, boardD], M.shelf, [0, y, faces === 2 ? dir * (boardD / 2 + 0.02) : back + 0.03 + boardD / 2], [0, 0, 0], [0.7, 0.7]);
      const cell = P.cells[(f + lv + ((o.seed ?? 1) % 3)) % P.cells.length];
      // label strips on the front edge: the drawing of the product
      for (let k = 0; k < Math.floor(L / 0.9); k++) c.quad(0.14, 0.06, M.prod, [-L / 2 + 0.45 + k * 0.9, y + 0.005, dir * (half + 0.001)], [0, f === 0 ? 0 : Math.PI, 0], cellUV(cell));
      const pitch = P.w + 0.015, slots = Math.floor((L - 0.14) / pitch), per = Math.max(1, Math.min(P.deep, Math.floor((boardD - 0.04) / (P.d + 0.01))));
      const z0 = faces === 2 ? dir * (half - 0.06) : back + 0.03 + boardD - 0.06;
      let perSlot = 0;
      const res = c.sub((s) => {
        for (let k = 0; k < slots; k++) for (let d = 0; d < per; d++) {
          const v = rnd() > 0.9 ? 1 : 0, cc = P.cells[(P.cells.indexOf(cell) + v) % P.cells.length];
          addProduto(s, tipo, cc, -((slots - 1) * pitch) / 2 + k * pitch, y + 0.015, z0 - dir * d * (P.d + 0.01), f === 0 ? 0 : Math.PI);
        }
        perSlot = 3 * per * productGeo(r, tipo, cell).tris; // draw ranges count vertices
      });
      const mesh = res.meshes[0], plainMat = mesh.material;
      const hit = c.hit([L, 0.45, 0.3], [0, y + 0.25, dir * (half - 0.1)], 'prateleira-fileira', 'prateleira');
      const row = { face: f, nivel: lv, tipo, cell, slots, mesh, hit, stock: slots, vintage: false,
        /** The row's products become the packaging of 1998 (true) or the usual ones (false). */
        setVintage(v) { row.vintage = Boolean(v); mesh.material = row.vintage ? (vintageMat ??= c.builder.material(D('#ffffff', 'produtos98'), c.area)) : plainMat; },
        localAt: [0, 0, dir * (half + 0.7)], localDir: [0, 0, -dir],
        setStock(k) { row.stock = Math.max(0, Math.min(slots, k | 0)); mesh.geometry.setDrawRange(0, row.stock * perSlot); mesh.visible = row.stock > 0; } };
      mesh.userData.row = row; hit.userData.row = row;
      rows.push(row);
    }
  }
  if (o.antigo) rows.forEach((w) => w.setVintage(true));
  return { rows, length: L, depth, setStockAll: (k) => rows.forEach((w) => w.setStock(k)), setVintageAll: (v) => rows.forEach((w) => w.setVintage(v)) };
}

// ---------------------------------------------------------------------------------------------
const WALL_KINDS = new Set(['relogio', 'calendario', 'quadro-tarefas', 'cartaz', 'espelho', 'interruptor', 'sino', 'cracha']);
export function hasProp(name) { return Object.prototype.hasOwnProperty.call(DEFS, name); }

/** Place a prop in a posto builder: static parts go to the shared buckets, the rest to `dyn`. */
export function placeProp(builder, name, { pos = [0, 0, 0], ry = 0, area = 'externa', euler = null, scale = null, ...opts } = {}) {
  if (!hasProp(name)) throw new Error('objeto desconhecido: ' + name);
  // `euler` ([rx, ry, rz]) and `scale` ([sx, sy, sz]) are optional (the editor's entities); without them it is the plain yaw placement
  const tilted = (euler && (euler[0] || euler[2])) || (scale && scale.some((v) => v !== 1));
  let c;
  if (tilted) {
    const T = builder.ctx({ area }).T;
    const m = new T.Matrix4().compose(new T.Vector3(...pos), new T.Quaternion().setFromEuler(new T.Euler(euler?.[0] ?? 0, euler?.[1] ?? ry, euler?.[2] ?? 0)), new T.Vector3(...(scale ?? [1, 1, 1])));
    c = builder.ctx({ pos, ry, area, matrix: m });
    c.dyn.rotation.set(euler?.[0] ?? 0, euler?.[1] ?? ry, euler?.[2] ?? 0); if (scale) c.dyn.scale.set(...scale);
  } else c = builder.ctx({ pos, ry, area });
  const extras = DEFS[name](c, opts) || {};
  // descriptors, not a spread: the getters of the extras (`jammed`, `load`, `full`...) stay live
  return Object.defineProperties({ dyn: c.dyn, kind: name }, Object.getOwnPropertyDescriptors(extras));
}

/** A prop alone, on the floor near the origin, facing +z. Unknown name throws. */
export function buildProp(r, name, opts = {}) {
  if (name === 'moto') { const m = buildMoto(r, { seed: opts.seed ?? 1 }); m.setLights(true); return { ...m, kind: name }; }
  if (name === 'carro-vidro-escuro') { const t = buildCar(r, { seed: opts.seed ?? 1, style: 'sedan', vidro: 'escuro' }); t.setDriver(true); return { ...t, kind: name }; }
  if (name === 'caminhao') { const t = buildCar(r, { seed: opts.seed ?? 1, style: 'caminhao' }); t.setDriver(true); return { ...t, kind: name }; }
  if (!hasProp(name)) throw new Error('objeto desconhecido: ' + name);
  const b = createBuilder(r);
  const p = placeProp(b, name, { area: 'prop', ...opts });
  b.flush(p.dyn);
  if (WALL_KINDS.has(name)) { // wall objects stand against a board so the object rests on the floor
    const T = r.THREE, bd = new T.Mesh(new T.BoxGeometry(1.5, 2.7, 0.04), b.material(M.wood, 'prop', true)); bd.position.set(0, 1.35, -0.03); p.dyn.add(bd);
  }
  return Object.defineProperties({ root: p.dyn }, Object.getOwnPropertyDescriptors(p));
}
