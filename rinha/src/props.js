// Props: the discrete objects of the scenes (beds, shelves, cages, trees...), built by functions
// that the scenes call at the same point where the code used to be inline, and that the asset
// library builds alone through buildProp().
//
// Every builder is `(r, k, ...free variables)`: `r` is the renderer, `k` the kit of the caller
// (its parent group receives the meshes) and the rest are the values the scene used to hold in
// local variables (positions, sizes, the shared random generator). Each builder returns the
// meshes the scene needs to move or measure, if any.
import { kit, tex, screenPanel, keypadTexture } from './textures/paint.js';
import { mergeGeos } from './render.js';
import { mulberry32 } from './rng.js';

/** name -> { label (pt-BR, short), desc (pt-BR, one sentence), scene } */
export const PROPS = {
  // ---- casa
  cama: { label: 'Cama', desc: 'Cama de solteiro com lençol, travesseiro e cobertor jogado, cabeceira escura.', scene: 'casa' },
  'criado-mudo': { label: 'Criado-mudo com vela', desc: 'Criado-mudo de madeira com um pires e um toco de vela acesa.', scene: 'casa' },
  'guarda-roupa': { label: 'Guarda-roupa', desc: 'Guarda-roupa alto de madeira escura, com a fresta da porta e duas dobradiças.', scene: 'casa' },
  tapete: { label: 'Tapete', desc: 'Tapete retangular gasto, torto sobre o chão do quarto.', scene: 'casa' },
  'roupas-no-chao': { label: 'Roupas no chão', desc: 'Duas peças de roupa largadas no chão do quarto.', scene: 'casa' },
  quadros: { label: 'Quadros', desc: 'Dois porta-retratos tortos na parede, só com formas coloridas e sem rostos.', scene: 'casa' },
  fogao: { label: 'Fogão', desc: 'Fogão branco e sujo, baixo, encostado na parede da cozinha.', scene: 'casa' },
  'bancada-pia': { label: 'Bancada com pia', desc: 'Bancada de madeira com tampo de pedra, pia de metal e torneira.', scene: 'casa' },
  'prateleira-latas': { label: 'Prateleira com latas', desc: 'Prateleira de parede com três latas de cores gastas.', scene: 'casa' },
  'mesa-tigela': { label: 'Mesa com tigela', desc: 'Mesa de cozinha de quatro pés com uma tigela vazia e uma colher.', scene: 'casa' },
  cadeira: { label: 'Cadeira', desc: 'Cadeira simples de madeira com encosto baixo.', scene: 'casa' },
  geladeira: { label: 'Geladeira', desc: 'Geladeira velha de porta articulada, quase vazia por dentro, com luz interna.', scene: 'casa' },
  lampada: { label: 'Lâmpada pendurada', desc: 'Lâmpada nua pendurada num fio fino.', scene: 'casa' },
  // ---- cela
  'cama-cela': { label: 'Cama da cela', desc: 'Cama baixa da cela, com lençol claro e um cobertor dobrado.', scene: 'cela' },
  'vaso-cela': { label: 'Vaso da cela', desc: 'Bloco de metal com vaso e caixa de descarga, no canto da cela.', scene: 'cela' },
  compartimento: { label: 'Compartimento da parede', desc: 'Painel que desliza e mostra uma cavidade escura com fichas douradas.', scene: 'cela' },
  'porta-cela': { label: 'Porta da cela', desc: 'Porta de metal com faixa de luz laranja, batente e trinco.', scene: 'cela' },
  'painel-cela': { label: 'Painel da porta', desc: 'Painel ao lado da porta, com tela verde e teclado luminoso.', scene: 'cela' },
  moeda: { label: 'Moeda brilhante', desc: 'Disco dourado no chão com uma faísca em forma de cruz.', scene: 'cela' },
  'banco-cela': { label: 'Banquinho de metal', desc: 'Banquinho de metal parafusado no chão, com uma bandeja de sobras.', scene: 'cela' },
  // ---- galpao
  jaula: { label: 'Jaula', desc: 'Jaula de grades com cantoneiras escuras, trinco laranja e palha no chão.', scene: 'galpao' },
  'mesa-negociacao': { label: 'Mesa de negociação', desc: 'Mesa alta com livros, balança, folhas e uma pilha de fichas.', scene: 'galpao' },
  banqueta: { label: 'Banqueta alta', desc: 'Banqueta larga de madeira, alta, com base de metal.', scene: 'galpao' },
  'lampada-galpao': { label: 'Lâmpada do galpão', desc: 'Lâmpada industrial presa por uma corrente, com um cone de luz.', scene: 'galpao' },
  caixote: { label: 'Caixote', desc: 'Caixote de madeira, com um segundo menor em cima quando é grande.', scene: 'galpao' },
  barril: { label: 'Barril', desc: 'Barril de metal azulado.', scene: 'galpao' },
  corrente: { label: 'Corrente com gancho', desc: 'Corrente que desce do teto com uma barra e dois ganchos.', scene: 'galpao' },
  // ---- pomar
  'casa-fundos': { label: 'Casa dos fundos', desc: 'Fundos da casa com telhado, porta acesa, janelas e soleira.', scene: 'pomar' },
  cerca: { label: 'Cerca', desc: 'Trecho de cerca de madeira com mourões e duas réguas.', scene: 'pomar' },
  escada: { label: 'Escada', desc: 'Escada de madeira inclinada, de sete degraus.', scene: 'pomar' },
  cesto: { label: 'Cesto de maçãs', desc: 'Cesto de palha com seis maçãs.', scene: 'pomar' },
  macieira: { label: 'Macieira', desc: 'Macieira de copa redonda, carregada de maçãs.', scene: 'pomar' },
  // ---- treino
  tatame: { label: 'Tatame', desc: 'Tapete azul de treino com borda de borracha escura.', scene: 'treino' },
  'marcas-de-fita': { label: 'Marcas de fita', desc: 'Fitas amarelas no chão: postura, setas de passo, anéis de esquiva e distância.', scene: 'treino' },
  boneco: { label: 'Boneco de treino', desc: 'Boneco acolchoado numa base, com cabeça, tronco e braços caídos.', scene: 'treino' },
  'saco-de-pancada': { label: 'Saco de pancada', desc: 'Saco pesado pendurado numa viga por uma corrente.', scene: 'treino' },
  armarios: { label: 'Armários', desc: 'Três armários de metal lado a lado.', scene: 'treino' },
  relogio: { label: 'Relógio de parede', desc: 'Relógio redondo de parede com dois ponteiros.', scene: 'treino' },
  prateleira: { label: 'Prateleira da loja', desc: 'Prateleira com choque, spray e rolo de atadura, e pilhas de pano em cima.', scene: 'treino' },
  'itens-loja': { label: 'Itens da loja', desc: 'Choque elétrico, spray de pimenta e rolo de atadura, grandes o bastante para distinguir.', scene: 'treino' },
  'banco-treino': { label: 'Banco', desc: 'Banco de madeira com duas bolsas de pano.', scene: 'treino' },
  'suporte-varas': { label: 'Suporte de varas', desc: 'Suporte de madeira com cinco varas inclinadas.', scene: 'treino' },
  'terminal-salvar': { label: 'Terminal de salvar', desc: 'Console com tela acesa e a fenda do cartão de memória.', scene: 'treino' },
  'rede-de-carga': { label: 'Rede de carga', desc: 'Cordas penduradas num canto, feitas de caixas finas.', scene: 'treino' },
  tablado: { label: 'Tablado', desc: 'Plataforma baixa de metal onde o instrutor fica.', scene: 'treino' },
};

// ============================================================================================
// casa

export function buildCama(r, k, bed) {
  const dark = k.mat('#3a2e26', 'wood');
  k.box([1.0, 0.3, 2.1], dark, [bed[0], 0.15, bed[2]]);
  k.box([0.92, 0.12, 2.0], k.mat('#c0b49a', 'sheet'), [bed[0], 0.36, bed[2]], [0, 0, 0], [0.8, 0.8]);
  k.box([0.6, 0.11, 0.38], k.mat('#d0c8b4', 'sheet'), [bed[0], 0.48, bed[2] + 0.7], [0.04, 0, 0], [0.5, 0.5]);
  k.box([0.88, 0.07, 1.0], k.mat('#6a5a70', 'cloth'), [bed[0] + 0.03, 0.46, bed[2] - 0.35], [0, 0.1, 0.12], [0.8, 0.8]); // thrown-back blanket
  k.box([1.0, 0.7, 0.05], dark, [bed[0], 0.55, bed[2] + 1.07]);
}

export function buildCriadoMudo(r, k, stand) {
  k.box([0.45, 0.5, 0.4], k.mat('#7a5a3e', 'wood'), [stand[0], 0.25, stand[2]]);
  k.cyl(0.06, 0.05, 0.1, 6, k.mat('#c8c0a8', 'concrete'), [stand[0], 0.55, stand[2]]);
  k.cyl(0.03, 0.03, 0.16, 5, k.glow('#ffd890'), [stand[0] + 0.1, 0.58, stand[2] + 0.05]); // candle stub
  k.sphere(0.05, k.glow('#ffe8a0', { fogged: 0.2 }), [stand[0] + 0.1, 0.7, stand[2] + 0.05]);
}

export function buildGuardaRoupa(r, k, x0) {
  const dark = k.mat('#3a2e26', 'wood'), metal = k.mat('#8c929c', 'metal');
  const ward = k.box([0.6, 2.0, 1.1], k.mat('#6e5238', 'wood'), [x0 + 0.3, 1.0, -1.5], [0, 0, 0], [2, 2]);
  k.box([0.02, 1.9, 0.02], dark, [x0 + 0.61, 1.0, -1.5]);
  k.box([0.04, 0.12, 0.03], metal, [x0 + 0.62, 1.0, -1.58]); k.box([0.04, 0.12, 0.03], metal, [x0 + 0.62, 1.0, -1.42]);
  return ward;
}

export function buildTapete(r, k) {
  k.add(new r.THREE.PlaneGeometry(1.7, 1.2), k.mat('#c8c8c8', 'rug'), [-2.2, 0.01, -0.5], [-Math.PI / 2, 0, 0.2]);
}

export function buildRoupasNoChao(r, k) {
  k.box([0.5, 0.05, 0.35], k.mat('#7a8a9a', 'cloth'), [-3.0, 0.03, -1.1], [0, 0.6, 0]);
  k.box([0.35, 0.07, 0.3], k.mat('#8a6a5a', 'cloth'), [-2.6, 0.04, -0.7], [0, 1.2, 0]);
}

/** Picture frames on a wall group (local x along the wall, y up, front toward +z). */
export function buildQuadros(r, k, south) {
  const T = r.THREE;
  const frames = [[-2.6, 1.55], [-1.2, 1.5]];
  frames.forEach(([lx, ly], i) => {
    const sg = new T.Group(); south.add(sg);
    k.box([0.4, 0.5, 0.04], k.mat('#3a2e26', 'wood'), [lx, ly, 0.03], [0, 0, 0.03 * (i ? -1 : 1)], [1, 1], sg);
    k.add(new T.PlaneGeometry(0.3, 0.4), k.mat(i ? '#8a9a7a' : '#a8908a', 'plaster'), [lx, ly, 0.056], [0, 0, 0.03 * (i ? -1 : 1)], sg);
  });
}

export function buildFogao(r, k, z0) {
  k.box([0.7, 0.9, 0.6], k.mat('#d0ccc0', 'stove'), [0.75, 0.45, z0 + 0.32], [0, 0, 0], [0.7, 0.7]);
}

export function buildBancadaPia(r, k, z0) {
  const metal = k.mat('#8c929c', 'metal');
  k.box([1.3, 0.9, 0.6], k.mat('#8a7458', 'wood'), [1.75, 0.45, z0 + 0.32], [0, 0, 0], [2.5, 2.5]);
  k.box([1.34, 0.05, 0.64], k.mat('#9a9a92', 'concrete'), [1.75, 0.92, z0 + 0.32]);
  k.box([0.5, 0.06, 0.4], k.mat('#7a808a', 'metal'), [1.7, 0.945, z0 + 0.32]);
  k.cyl(0.016, 0.016, 0.28, 5, metal, [1.7, 1.1, z0 + 0.12]);
}

export function buildPrateleiraLatas(r, k, z0) {
  k.box([1.8, 0.05, 0.25], k.mat('#6e5238', 'wood'), [1.7, 1.75, z0 + 0.15]);
  const cans = ['#a85040', '#c8b060', '#7a8a6a'];
  cans.forEach((c, i) => k.cyl(0.04, 0.04, 0.11, 6, k.mat(c, 'metal'), [1.15 + i * 0.13, 1.83, z0 + 0.16]));
}

export function buildMesaTigela(r, k, tbl) {
  const dark = k.mat('#3a2e26', 'wood'), metal = k.mat('#8c929c', 'metal');
  k.box([1.1, 0.05, 0.7], k.mat('#8a6a46', 'wood'), [tbl[0], 0.75, tbl[2]], [0, 0.1, 0], [0.8, 0.8]);
  for (const [dx, dz] of [[-0.5, -0.3], [0.5, -0.3], [-0.5, 0.3], [0.5, 0.3]]) k.box([0.06, 0.73, 0.06], dark, [tbl[0] + dx, 0.365, tbl[2] + dz]);
  k.cyl(0.11, 0.07, 0.06, 8, k.mat('#c8c0a8', 'concrete'), [tbl[0] - 0.1, 0.81, tbl[2]]); // empty bowl
  k.box([0.02, 0.01, 0.12], metal, [tbl[0] + 0.12, 0.78, tbl[2] + 0.05], [0, 0.5, 0]);
}

export function buildCadeira(r, k, ch) {
  const dark = k.mat('#3a2e26', 'wood');
  k.box([0.42, 0.05, 0.42], k.mat('#7a5a3e', 'wood'), [ch[0], 0.45, ch[2]]);
  k.box([0.42, 0.5, 0.05], k.mat('#7a5a3e', 'wood'), [ch[0], 0.72, ch[2] + 0.2]);
  for (const [dx, dz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) k.box([0.04, 0.44, 0.04], dark, [ch[0] + dx, 0.22, ch[2] + dz]);
}

/** Fridge on the east wall; the front faces -x. Returns the door pivot, the door, the light and the cavity. */
export function buildGeladeira(r, k, F) {
  const T = r.THREE, metal = k.mat('#8c929c', 'metal');
  const shellGeo = k.boxGeo(F.d, F.hgt, F.w, [1, 1]); // along x: depth, y: height, z: width
  { const idx = shellGeo.index.array; const keep = []; for (let i = 0; i < idx.length; i++) { if (i >= 6 && i < 12) continue; keep.push(idx[i]); } shellGeo.setIndex(keep); }
  k.add(shellGeo, k.mat('#d8d4c0', 'fridge'), [F.x, F.hgt / 2 + 0.03, F.z]);
  const cav = k.box([F.d - 0.08, F.hgt - 0.1, F.w - 0.08], k.mat('#c4ccd0', 'fridgeIn', { side: T.BackSide }), [F.x + 0.02, F.hgt / 2 + 0.03, F.z], [0, 0, 0], [0.6, 0.9]);
  for (const y of [0.55, 0.95, 1.35]) k.box([F.d - 0.1, 0.02, F.w - 0.1], k.mat('#b8d0d8', 'metal'), [F.x + 0.02, y, F.z]);
  k.cyl(0.05, 0.05, 0.14, 6, k.mat('#c8d0a0', 'metal'), [F.x + 0.12, 0.64, F.z - 0.18]); // a jar, nearly empty
  k.cyl(0.04, 0.04, 0.12, 6, k.mat('#d8c060', 'metal'), [F.x + 0.18, 1.04, F.z + 0.2]);
  k.sphere(0.07, k.mat('#8aa070', 'leaves'), [F.x + 0.1, 0.1, F.z + 0.05], [1, 0.6, 1]);
  const frontX = F.x - F.d / 2;
  const fPivot = new T.Group(); fPivot.position.set(frontX - 0.02, F.hgt / 2 + 0.03, F.z + F.w / 2); k.group.add(fPivot);
  const fDoor = k.box([0.05, F.hgt, F.w], k.mat('#e0dccc', 'fridge'), [0, 0, -F.w / 2], [0, 0, 0], [0.7, 1.7], fPivot);
  k.box([0.04, 0.5, 0.04], metal, [-0.05, 0.1, -F.w + 0.1], [0, 0, 0], [1, 1], fPivot);
  const fLight = k.box([0.4, 0.02, 0.4], k.glow('#dff4ff', { fogged: 0.3 }), [F.x + 0.02, 1.66, F.z]);
  fLight.visible = false;
  return { fPivot, fDoor, fLight, cav };
}

/** A bare bulb on a cord. `cord` and `bulb` are the centres of the cord and of the bulb. */
export function buildLampada(r, k, cord = [2.0, 2.3, -0.1], bulb = [2.0, 2.08, -0.1]) {
  const dark = k.mat('#3a2e26', 'wood');
  k.cyl(0.005, 0.005, 0.4, 3, dark, cord);
  return k.sphere(0.06, k.glow('#ffe0a0', { fogged: 0.2 }), bulb);
}

// ============================================================================================
// cela

export function buildCamaCela(r, k, bedC) {
  const darkM = k.mat('#4a5060', 'metal');
  k.box([1.04, 0.32, 2.1], darkM, [bedC[0], 0.16, bedC[2]]);
  k.box([0.96, 0.14, 2.0], k.mat('#d8d0bc', 'sheet', { }), [bedC[0], 0.39, bedC[2]], [0, 0, 0], [0.8, 0.8]);
  k.box([0.62, 0.13, 0.4], k.mat('#e4dcc8', 'sheet'), [bedC[0], 0.52, bedC[2] + 0.72], [0.05, 0, 0], [0.5, 0.5]);
  k.box([0.92, 0.1, 1.05], k.mat('#a08468', 'cloth'), [bedC[0] + 0.02, 0.51, bedC[2] - 0.35], [0, 0.06, 0.03], [0.8, 0.8]);
  // a bundle of the blanket at the foot: lumps
  k.box([0.8, 0.07, 0.5], k.mat('#b09878', 'cloth'), [bedC[0], 0.6, bedC[2] - 0.78], [0.03, 0.1, 0], [0.8, 0.8]);
}

export function buildVasoCela(r, k, z0) {
  const steel = k.mat('#9aa2b4', 'metal'), darkM = k.mat('#4a5060', 'metal');
  k.box([0.55, 0.5, 0.5], steel, [2.1, 0.25, z0 + 0.3]); k.box([0.4, 0.12, 0.4], darkM, [2.1, 0.55, z0 + 0.3]);
  k.box([0.45, 0.25, 0.1], steel, [2.1, 0.75, z0 + 0.05]);
}

/** The sliding panel with the dark cavity and credit chips behind it. */
export function buildCompartimento(r, k, z0) {
  const T = r.THREE, darkM = k.mat('#4a5060', 'metal');
  const comp = new T.Group(); comp.position.set(0, 0.48, z0 + 0.03); k.group.add(comp);
  const compPanel = k.box([0.9, 0.62, 0.05], k.mat('#b4bccc', 'scifi'), [0, 0, 0], [0, 0, 0], [0.9, 0.9], comp);
  k.box([0.2, 0.025, 0.03], darkM, [0, 0, 0.04], [0, 0, 0], [1, 1], comp);
  // inside: a dark cavity with credit chips (shown when open)
  k.box([0.9, 0.6, 0.35], k.mat('#262a34', 'metal', { side: T.BackSide }), [0, 0.48, z0 - 0.17]);
  const chips = new T.Group(); chips.position.set(0, 0.25, z0 - 0.15); chips.visible = false; k.group.add(chips);
  for (let i = 0; i < 6; i++) k.cyl(0.07, 0.07, 0.025, 8, k.glow('#ffd23a'), [-0.2 + (i % 3) * 0.2, 0.012 + ((i / 3) | 0) * 0.027, 0], [0, 0, 0], chips);
  return { comp, chips, compPanel };
}

/** The cell door with its frame (east wall): the leaf group slides along z. */
export function buildPortaCela(r, k, DOOR, x1, doorW, doorZ) {
  const T = r.THREE;
  const doorM = k.mat('#aeb6c8', 'scifi');
  const door = new T.Group(); door.position.set(x1 + 0.1, 0, doorZ); k.group.add(door);
  k.box([0.1, DOOR.h, doorW], doorM, [0, DOOR.h / 2, 0], [0, 0, 0], [1.5, 1.5], door);
  k.box([0.04, 0.25, 0.6], k.mat('#333b4c', 'metal'), [-0.07, 1.1, 0.0], [0, 0, 0], [1, 1], door);
  k.box([0.04, 0.05, doorW], k.glow('#ff8a50'), [-0.06, 1.9, 0], [0, 0, 0], [1, 1], door);
  const frameM = k.mat('#59606f', 'metal');
  k.box([0.34, DOOR.h + 0.15, 0.1], frameM, [x1 + 0.05, (DOOR.h + 0.15) / 2, DOOR.l0 - 0.05]);
  k.box([0.34, DOOR.h + 0.15, 0.1], frameM, [x1 + 0.05, (DOOR.h + 0.15) / 2, DOOR.l1 + 0.05]);
  k.box([0.34, 0.15, doorW + 0.2], frameM, [x1 + 0.05, DOOR.h + 0.075, doorZ]);
  return door;
}

/** The panel beside the door: body, screen and keypad. Returns the live screen and its meshes. */
export function buildPainelCela(r, k, px, pz) {
  const T = r.THREE;
  k.box([0.14, 1.12, 0.6], k.mat('#5b6374', 'metal'), [px + 0.02, 1.3, pz], [0, 0, 0], [0.6, 0.6]);
  const scr = screenPanel(r);
  const screenM = r.mat('#ffffff', { map: scr.texture, emissive: 1, fogged: 0.5 });
  const screen = k.add(new T.PlaneGeometry(0.46, 0.23), screenM, [px - 0.052, 1.62, pz], [0, -Math.PI / 2, 0]);
  const pad = k.add(new T.PlaneGeometry(0.36, 0.48), r.mat('#ffffff', { map: keypadTexture(r), emissive: 0.45, fogged: 0.8 }), [px - 0.052, 1.14, pz], [0, -Math.PI / 2, 0]);
  k.box([0.03, 0.05, 0.5], k.glow('#5ee6d0'), [px - 0.04, 0.78, pz]);
  return { scr, screen, pad };
}

/** The coin: a glowing disc with a spinning cross-shaped spark. */
export function buildMoeda(r, k, coinPos) {
  const T = r.THREE;
  const coin = new T.Group(); coin.position.set(...coinPos); k.group.add(coin);
  const gold = k.glow('#ffd23a', { fogged: 0.3 });
  k.cyl(0.14, 0.14, 0.02, 10, gold, [0, 0.01, 0], [0, 0, 0], coin);
  const spark = new T.Group(); coin.add(spark);
  const sparkM = k.glow('#fff0a0', { fogged: 0.2 });
  k.box([0.5, 0.01, 0.035], sparkM, [0, 0.03, 0], [0, 0, 0], [1, 1], spark);
  k.box([0.035, 0.01, 0.5], sparkM, [0, 0.03, 0], [0, 0, 0], [1, 1], spark);
  return { coin, spark };
}

export function buildBancoCela(r, k) {
  const steel = k.mat('#9aa2b4', 'metal');
  k.cyl(0.2, 0.2, 0.42, 8, steel, [1.5, 0.21, 1.9]);
  k.box([0.34, 0.03, 0.26], steel, [1.5, 0.45, 1.9], [0, 0.4, 0]);
}

// ============================================================================================
// galpao

const uvScale = (g, su, sv) => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return g; };

/** The bars, frame, lock and floor of a cage (no people). Returns the group and the front plane. */
export function buildJaula(r, k, cx, cz, ry, y, w = 2.4, d = 2.2, ch = 2.4) {
  const T = r.THREE;
  const dark = k.mat('#3a3e48', 'metal');
  const barM = k.mat('#c8ccd8', 'bars', { side: T.DoubleSide });
  const g = new T.Group(); g.position.set(cx, y, cz); g.rotation.y = ry; k.group.add(g);
  // local: back wall at z = -d/2, front bars at +d/2
  const front = k.add(uvScale(new T.PlaneGeometry(w, ch), w / 0.8, ch / 0.8), barM, [0, ch / 2, d / 2], [0, 0, 0], g);
  k.add(uvScale(new T.PlaneGeometry(d, ch), d / 0.8, ch / 0.8), barM, [-w / 2, ch / 2, 0], [0, Math.PI / 2, 0], g);
  k.add(uvScale(new T.PlaneGeometry(d, ch), d / 0.8, ch / 0.8), barM, [w / 2, ch / 2, 0], [0, Math.PI / 2, 0], g);
  k.box([w + 0.1, 0.1, 0.1], dark, [0, ch, d / 2], [0, 0, 0], [1, 1], g); k.box([w + 0.1, 0.1, 0.1], dark, [0, 0.05, d / 2], [0, 0, 0], [1, 1], g);
  k.box([0.1, 0.1, d], dark, [-w / 2, ch, 0], [0, 0, 0], [1, 1], g); k.box([0.1, 0.1, d], dark, [w / 2, ch, 0], [0, 0, 0], [1, 1], g);
  for (const sx of [-1, 1]) k.box([0.1, ch, 0.1], dark, [sx * w / 2, ch / 2, d / 2], [0, 0, 0], [1, 1], g);
  k.box([0.06, ch, 0.06], dark, [0, ch / 2, d / 2], [0, 0, 0], [1, 1], g); // door post
  k.box([0.16, 0.2, 0.1], k.glow('#ff7a40', { fogged: 0.5 }), [0.0, 1.1, d / 2 + 0.06], [0, 0, 0], [1, 1], g); // lock, on the door post
  k.add(new T.PlaneGeometry(w, d), k.mat('#b09a70', 'burlap', { }), [0, 0.03, 0], [-Math.PI / 2, 0, 0], g);
  return { g, front };
}

/** The high table with the things on it: ledgers, a balance scale, papers and a stack of chips. */
export function buildMesaNegociacao(r, k, tbl) {
  const steel = k.mat('#7a808c', 'metal'), dark = k.mat('#3a3e48', 'metal');
  const tm = k.mat('#8a6e4c', 'wood');
  k.box([4.0, 0.18, 1.4], tm, [tbl[0], 1.12, tbl[2]], [0, 0, 0], [1.5, 1.5]);
  for (const [dx, dz] of [[-1.8, -0.55], [1.8, -0.55], [-1.8, 0.55], [1.8, 0.55]]) k.box([0.22, 1.05, 0.22], k.mat('#5a4430', 'wood'), [tbl[0] + dx, 0.52, tbl[2] + dz], [0, 0, 0], [1, 1]);
  k.box([3.6, 0.1, 0.1], dark, [tbl[0], 0.45, tbl[2] - 0.55], [0, 0, 0], [1, 1]); k.box([3.6, 0.1, 0.1], dark, [tbl[0], 0.45, tbl[2] + 0.55], [0, 0, 0], [1, 1]);
  // things on the table: ledgers, a balance scale, a chain coil, a lamp
  k.box([0.5, 0.06, 0.38], k.mat('#5a3a30', 'wood'), [-1.2, 1.24, tbl[2] + 0.1], [0, 0.3, 0], [1, 1]);
  k.box([0.45, 0.04, 0.34], k.mat('#d8d0b8', 'sheet'), [-0.55, 1.23, tbl[2] - 0.2], [0, -0.2, 0], [0.5, 0.5]);
  k.box([0.45, 0.04, 0.34], k.mat('#d8d0b8', 'sheet'), [-0.35, 1.25, tbl[2] - 0.25], [0, 0.1, 0], [0.5, 0.5]);
  k.cyl(0.03, 0.05, 0.7, 5, steel, [0.8, 1.55, tbl[2]]); k.box([0.9, 0.03, 0.04], steel, [0.8, 1.9, tbl[2]], [0, 0, 0.08]);
  for (const sx of [-0.42, 0.42]) { k.cyl(0.18, 0.18, 0.02, 8, steel, [0.8 + sx, 1.5 + (sx > 0 ? 0.04 : -0.04) + 0.15, tbl[2]]); }
  for (let i = 0; i < 5; i++) k.cyl(0.14, 0.14, 0.03, 8, k.glow('#ffd23a', { fogged: 0.4 }), [1.4, 1.24 + i * 0.035, tbl[2] + 0.2]); // a stack of credit chips
}

export function buildBanqueta(r, k, sx, sz) {
  const dark = k.mat('#3a3e48', 'metal');
  k.cyl(0.4, 0.34, 0.1, 8, k.mat('#6a4e34', 'wood'), [sx, 0.78, sz]);
  k.cyl(0.08, 0.1, 0.74, 5, dark, [sx, 0.37, sz]); k.cyl(0.34, 0.34, 0.04, 8, dark, [sx, 0.02, sz]);
}

export function buildLampadaGalpao(r, k, h, lx, ly, lz) {
  const chainM = k.mat('#6a6e78', 'metal');
  k.cyl(0.02, 0.02, h - ly - 0.1, 3, chainM, [lx, (h + ly) / 2, lz]);
  k.cyl(0.18, 0.62, 0.42, 8, k.mat('#2a2e38', 'metal'), [lx, ly + 0.25, lz]);
  k.cyl(0.56, 0.56, 0.05, 8, k.glow('#fffaf0', { fogged: 0.2 }), [lx, ly + 0.03, lz]);
  k.shaft(lx, ly, lz, 0.55, 2.6, '#fff4dc', 0.06);
}

export function buildCaixote(r, k, cx, cz, ry, s) {
  const crate = k.mat('#a08058', 'crate');
  k.box([s, s, s], crate, [cx, s / 2, cz], [0, ry, 0], [1, 1]);
  if (s > 1.15) k.box([s * 0.7, s * 0.7, s * 0.7], crate, [cx + 0.05, s + s * 0.35, cz], [0, ry + 0.4, 0], [1, 1]);
}

export function buildBarril(r, k, bx, bz) {
  k.cyl(0.42, 0.42, 0.95, 8, k.mat('#4a5a6a', 'metal'), [bx, 0.47, bz]);
}

export function buildCorrente(r, k, h, cx, cz, len) {
  const steel = k.mat('#7a808c', 'metal'), chainM = k.mat('#6a6e78', 'metal');
  k.cyl(0.03, 0.03, len, 4, chainM, [cx, h - len / 2 - 0.6, cz]);
  k.box([0.4, 0.14, 0.14], steel, [cx, h - len - 0.65, cz]);
  k.cyl(0.015, 0.015, 0.4, 3, chainM, [cx - 0.12, h - len - 0.9, cz]); k.cyl(0.015, 0.015, 0.4, 3, chainM, [cx + 0.12, h - len - 0.9, cz]);
}

// ============================================================================================
// pomar

// A part for mergeGeos: geometry plus its matrix.
export function part(T, geo, [x, y, z], rot = [0, 0, 0], sc = [1, 1, 1]) {
  return { geo, matrix: new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rot[0], rot[1], rot[2])), new T.Vector3(sc[0], sc[1], sc[2])) };
}

/**
 * One apple-tree variant: merged trunk, merged canopy and the apple positions. R draws the layout;
 * exr is a second generator for the extra apples, so the layout does not move.
 */
export function macieiraVariant(T, R, exr) {
  const trunk = [part(T, new T.CylinderGeometry(0.11, 0.2, 1.7, 5), [0, 0.85, 0]),
    part(T, new T.CylinderGeometry(0.05, 0.09, 1.1, 4), [0.35, 1.9, 0], [0, 0, -0.55]),
    part(T, new T.CylinderGeometry(0.05, 0.09, 1.1, 4), [-0.3, 1.85, 0.1], [0, 0, 0.6])];
  const blobs = [[0, 2.6, 0, 1.2], [0.85 + R() * 0.2, 2.2, 0.3, 0.95], [-0.9, 2.3, -0.2 + R() * 0.3, 1.0], [0.1, 3.15, -0.4, 0.85], [-0.1, 2.1, 0.8, 0.8]];
  const leaves = blobs.map(([x, y, z, rad]) => part(T, new T.SphereGeometry(rad, 6, 3), [x, y, z], [R() * 3, R() * 6, 0], [1, 0.8, 1]));
  const apples = [];
  for (const [x, y, z, rad] of blobs) for (let i = 0; i < 2; i++) {
    const a = R() * 6.28, el = -(0.15 + R() * 0.55);
    const c = Math.sqrt(1 - el * el);
    apples.push([x + Math.cos(a) * c * rad * 0.9, y + el * rad * 0.8, z + Math.sin(a) * c * rad * 0.9]);
  }
  // more apples, from a generator of their own so the tree layout above does not change: the trees are loaded
  for (const [x, y, z, rad] of blobs) for (let i = 0; i < 3; i++) {
    const a = exr() * 6.28, el = -0.55 + exr() * 0.8, c = Math.sqrt(1 - el * el);
    apples.push([x + Math.cos(a) * c * rad * 1.02, y + el * rad * 0.85, z + Math.sin(a) * c * rad * 1.02]);
  }
  return { trunk: mergeGeos(trunk), leaves: mergeGeos(leaves), apples };
}

/** The back of the house behind the camera start: walls, roof, lit door and windows, doorstep, light spill. */
export function buildCasaFundos(r, k, hz) {
  const T = r.THREE;
  const house = new T.Group(); k.group.add(house);
  k.box([11, 3.2, 5], k.mat('#a89a84', 'plaster'), [0, 1.6, hz + 2.5], [0, 0, 0], [2, 2], house);
  k.box([11.8, 0.16, 5.8], k.mat('#5a4234', 'wood'), [0, 3.28, hz + 2.5], [0, 0, 0], [2, 2], house);
  k.box([11.4, 0.14, 3.4], k.mat('#5a4234', 'wood'), [0, 3.72, hz + 1.6], [0.35, 0, 0], [2, 2], house);
  k.box([11.4, 0.14, 3.4], k.mat('#5a4234', 'wood'), [0, 3.72, hz + 3.4], [-0.35, 0, 0], [2, 2], house);
  const doorGlow = k.mat('#ffb060', null, { emissive: 0.85, fogged: 0.5 });
  k.add(new T.PlaneGeometry(0.95, 2.05), doorGlow, [0, 1.025, hz - 0.015], [0, Math.PI, 0], house);
  k.add(new T.PlaneGeometry(1.2, 0.9), doorGlow, [-2.6, 1.6, hz - 0.015], [0, Math.PI, 0], house);
  k.add(new T.PlaneGeometry(1.2, 0.9), k.mat('#2a2e50', null, { emissive: 0.7, fogged: 0.5 }), [2.6, 1.6, hz - 0.015], [0, Math.PI, 0], house);
  const fr = k.mat('#4a3a2c', 'wood');
  k.box([1.15, 0.1, 0.1], fr, [0, 2.1, hz - 0.04], [0, 0, 0], [1, 1], house);
  k.box([0.1, 2.1, 0.1], fr, [-0.52, 1.05, hz - 0.04], [0, 0, 0], [1, 1], house); k.box([0.1, 2.1, 0.1], fr, [0.52, 1.05, hz - 0.04], [0, 0, 0], [1, 1], house);
  k.box([1.8, 0.1, 0.9], k.mat('#8c8c84', 'concrete'), [0, 0.05, hz - 0.45], [0, 0, 0], [1, 1], house);
  // lit door spill on the ground
  k.add(new T.PlaneGeometry(1.6, 3.0), k.mat('#ffb060', null, { emissive: 1, opacity: 0.22, transparent: true, depthWrite: false, fogged: 0.4 }), [0, 0.08, hz - 1.6], [-Math.PI / 2, 0, 0]).renderOrder = 2;
  return house;
}

/** Posts (instanced) and two rails on each side of the rectangle. `rand` tilts the posts. */
export function buildCerca(r, k, x0, x1, z0, z1, rand) {
  const T = r.THREE;
  const dummy = new T.Object3D();
  const postGeo = new T.BoxGeometry(0.14, 1.3, 0.14);
  const posts = [];
  for (let x = x0; x <= x1; x += 2.75) { posts.push([x, z0], [x, z1 - 1.0]); }
  for (let z = z0 + 2.75; z < z1 - 1; z += 2.75) { posts.push([x0, z], [x1, z]); }
  const pm = new T.InstancedMesh(postGeo, k.mat('#b8a088', 'fence'), posts.length); pm.frustumCulled = false; k.group.add(pm);
  posts.forEach(([x, z], i) => { dummy.position.set(x, 0.65, z); dummy.rotation.set(0, 0, (rand() - 0.5) * 0.06); dummy.scale.setScalar(1); dummy.updateMatrix(); pm.setMatrixAt(i, dummy.matrix); });
  const rail = k.mat('#a89078', 'fence');
  for (const y of [0.55, 1.0]) {
    k.box([x1 - x0, 0.09, 0.05], rail, [0, y, z0], [0, 0, 0], [2, 0.3]);
    k.box([x1 - x0, 0.09, 0.05], rail, [0, y, z1 - 1.0], [0, 0, 0], [2, 0.3]);
    k.box([0.05, 0.09, z1 - z0 - 1], rail, [x0, y, (z0 + z1 - 1) / 2], [0, 0, 0], [2, 0.3]);
    k.box([0.05, 0.09, z1 - z0 - 1], rail, [x1, y, (z0 + z1 - 1) / 2], [0, 0, 0], [2, 0.3]);
  }
  return pm;
}

/** The ladder leaning at a tree (`target` = { x, z }). Returns its group. */
export function buildEscada(r, k, target) {
  const T = r.THREE;
  const lad = new T.Group(); lad.position.set(target.x + 1.0, 0, target.z + 0.9); lad.rotation.set(-0.22, 0.5, 0.18); k.group.add(lad);
  const lw = k.mat('#8a6a46', 'wood');
  k.box([0.06, 3.0, 0.05], lw, [-0.2, 1.5, 0], [0, 0, 0], [1, 1], lad); k.box([0.06, 3.0, 0.05], lw, [0.2, 1.5, 0], [0, 0, 0], [1, 1], lad);
  for (let i = 0; i < 7; i++) k.box([0.4, 0.04, 0.05], lw, [0, 0.4 + i * 0.4, 0], [0, 0, 0], [1, 1], lad);
  return lad;
}

/** The basket at `basket` ([x, 0, z]) with six apples in it (`appleM`: the apple material). */
export function buildCesto(r, k, basket, appleM) {
  k.cyl(0.3, 0.22, 0.32, 8, k.mat('#a88458', 'burlap'), [basket[0], 0.16, basket[2]]);
  for (let i = 0; i < 6; i++) k.sphere(0.085, appleM, [basket[0] + Math.cos(i * 1.05) * 0.14, 0.36, basket[2] + Math.sin(i * 1.05) * 0.14], [1, 1, 1], 5, 3);
}

// ============================================================================================
// treino

export function buildTatame(r, k, tx, tz) {
  k.box([tx * 2, 0.07, tz * 2], k.mat('#b0c0d8', 'mat'), [0, 0.035, 0], [0, 0, 0], [1.2, 1.2]);
  const edge = k.mat('#4a5468', 'rubber');
  k.box([tx * 2 + 0.3, 0.09, 0.15], edge, [0, 0.045, -tz - 0.07]); k.box([tx * 2 + 0.3, 0.09, 0.15], edge, [0, 0.045, tz + 0.07]);
  k.box([0.15, 0.09, tz * 2], edge, [-tx - 0.07, 0.045, 0]); k.box([0.15, 0.09, tz * 2], edge, [tx + 0.07, 0.045, 0]);
}

/** Taped marks on the floor: stance, a line, arrows for the steps, dodge rings and distance ticks. */
export function buildMarcasFita(r, k) {
  const T = r.THREE;
  const tape = k.decal(k.mat('#f0d048', 'tape', { emissive: 0.15 }), -6);
  const tapeR = (cx, cz, w, d, ry = 0) => { const m = k.add(new T.PlaneGeometry(w, d), tape, [cx, 0.085, cz], [-Math.PI / 2, 0, ry]); m.rotation.order = 'YXZ'; m.rotation.set(-Math.PI / 2, 0, 0); m.rotation.z = ry; return m; };
  // stance: two feet in guard, with a line to the dummy
  tapeR(-0.22, 2.2, 0.2, 0.5, 0.2); tapeR(0.22, 2.0, 0.2, 0.5, -0.15);
  tapeR(0, 0.2, 0.12, 4.0); // a line toward the dummies
  // step marks: a cross of arrows (forward, back, left, right)
  const arrow = (cx, cz, yaw) => {
    const g = new T.Group(); g.position.set(cx, 0.086, cz); g.rotation.y = yaw; k.group.add(g);
    const shaft = new T.Mesh(new T.PlaneGeometry(0.16, 0.7), tape); shaft.rotation.x = -Math.PI / 2; shaft.position.z = -0.05; g.add(shaft);
    const head = new T.Mesh(new T.CircleGeometry(0.25, 3), tape); head.rotation.x = -Math.PI / 2; head.rotation.z = Math.PI / 2 + 0.0; head.position.z = -0.46; g.add(head);
  };
  for (const [dx, dz, yaw] of [[0, -0.9, 0], [0, 0.9, Math.PI], [-0.9, 0, Math.PI / 2], [0.9, 0, -Math.PI / 2]]) arrow(3.8 + dx, 2.2 + dz, yaw);
  // dodge marks: two rings left and right of the stance
  for (const sx of [-1.6, 1.6]) { const g = new T.RingGeometry(0.3, 0.38, 10); g.rotateX(-Math.PI / 2); k.add(g, tape, [sx, 0.086, 1.1]); }
  // distance marks to the dummy
  for (let i = 0; i < 3; i++) tapeR(-2.0, 0.6 - i * 0.6, 0.7, 0.1);
}

/** A padded dummy at (x, z) turned by yaw. Returns its group and the body group (rotate it on a hit). */
export function buildBoneco(r, k, x, z, yaw) {
  const T = r.THREE;
  const dark = k.mat('#3a3e48', 'metal'), steel = k.mat('#8a909c', 'metal');
  const padM = k.mat('#e0c898', 'pad'), headM = k.mat('#f0e0c0', 'dummyHead');
  const g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = yaw; k.group.add(g);
  k.cyl(0.4, 0.45, 0.1, 8, dark, [0, 0.1, 0], [0, 0, 0], g);
  k.cyl(0.07, 0.07, 1.0, 5, steel, [0, 0.55, 0], [0, 0, 0], g);
  const body = new T.Group(); body.position.y = 0.0; g.add(body);
  k.cyl(0.23, 0.26, 0.62, 8, padM, [0, 1.12, 0], [0, 0, 0], body, 1.5);
  k.cyl(0.26, 0.26, 0.28, 8, padM, [0, 0.72, 0], [0, 0, 0], body, 1.5);
  k.sphere(0.14, headM, [0, 1.62, 0], [1, 1.15, 1], 8, 5, body);
  k.cyl(0.05, 0.06, 0.1, 5, steel, [0, 1.46, 0], [0, 0, 0], body);
  for (const sx of [-1, 1]) k.cyl(0.07, 0.07, 0.56, 5, padM, [sx * 0.31, 1.02, 0.02], [0, 0, sx * 0.1], body); // arms hang at the sides
  return { g, body };
}

/** The ceiling beam and the heavy bag hanging from it. Returns the bag group (it swings). */
export function buildSacoDePancada(r, k, h) {
  const T = r.THREE;
  const dark = k.mat('#3a3e48', 'metal');
  k.box([0.14, 0.14, 7], dark, [4.8, h - 1.2, -2.5], [0, 0, 0], [1, 1]);
  const bag = new T.Group(); bag.position.set(4.8, h - 1.25, -1.5); k.group.add(bag);
  k.cyl(0.015, 0.015, 1.6, 3, k.mat('#6a6e78', 'metal'), [0, -0.8, 0], [0, 0, 0], bag);
  k.cyl(0.28, 0.28, 1.25, 8, k.mat('#a05a3c', 'burlap'), [0, -2.4, 0], [0, 0, 0], bag, 1.5);
  k.cyl(0.28, 0.2, 0.1, 8, dark, [0, -3.05, 0], [0, 0, 0], bag);
  return bag;
}

export function buildArmarios(r, k, x0) {
  k.box([0.3, 1.8, 0.5], k.mat('#6a7a8a', 'metal'), [x0 + 0.2, 0.9, 5.4]); k.box([0.3, 1.8, 0.5], k.mat('#6a7a8a', 'metal'), [x0 + 0.2, 0.9, 5.95]); k.box([0.3, 1.8, 0.5], k.mat('#6a7a8a', 'metal'), [x0 + 0.2, 0.9, 6.5]);
}

export function buildRelogio(r, k, z0) {
  const dark = k.mat('#3a3e48', 'metal');
  k.cyl(1.0, 1.0, 0.08, 10, k.mat('#e0dcd0', 'concrete'), [0, 4.2, z0 + 0.06], [Math.PI / 2, 0, 0]);
  k.box([0.04, 0.4, 0.04], dark, [0, 4.35, z0 + 0.12]); k.box([0.3, 0.04, 0.04], dark, [0.1, 4.2, z0 + 0.12], [0, 0, 0.4]);
}

/** The two planks of the shelf at `shelf` ([x, 1.1, z]). */
export function buildPrateleira(r, k, shelf) {
  k.box([0.5, 0.06, 2.0], k.mat('#6a4e34', 'wood'), [shelf[0], 1.1, shelf[2]], [0, 0, 0], [1, 1]);
  k.box([0.5, 0.06, 2.0], k.mat('#6a4e34', 'wood'), [shelf[0], 1.8, shelf[2]], [0, 0, 0], [1, 1]);
}

/** The three items of the shop, large enough to tell apart by shape: a taser, a pepper spray can, a roll of bandage. */
export function buildItensLoja(r, k, shelf) {
  const T = r.THREE;
  const ig = new T.Group(); ig.position.set(shelf[0] - 0.05, 1.13, shelf[2]); ig.scale.setScalar(1.8); k.group.add(ig);
  const grey = k.mat('#4a4e5c', 'metal', { emissive: 0.3 }), red = k.mat('#d0402e', 'metal', { emissive: 0.45 }), white = k.mat('#f6f2e6', 'sheet', { emissive: 0.6 });
  const B = (size, m, pos, rot = [0, 0, 0]) => k.box(size, m, pos, rot, undefined, ig), C = (rt, rb, h, seg, m, pos, rot = [0, 0, 0]) => k.cyl(rt, rb, h, seg, m, pos, rot, ig);
  // taser: a grey body with a yellow stripe, a grip and two prongs with blue tips (z -0.55)
  const blk = k.mat('#15161a', 'metal', { emissive: 0.2 }), yel2 = k.mat('#ffd830', 'metal', { emissive: 0.85 });
  B([0.2, 0.12, 0.44], yel2, [0, 0.06, -0.55]); for (const dz of [-0.13, 0, 0.13]) B([0.205, 0.125, 0.045], blk, [0, 0.06, -0.55 + dz]); B([0.14, 0.2, 0.1], blk, [0.02, 0.1, -0.4], [0, 0, 0.25]);
  for (const dx of [-0.05, 0.05]) { C(0.014, 0.014, 0.18, 5, k.mat('#e8ecf4', 'metal', { emissive: 0.9 }), [dx, 0.07, -0.86], [Math.PI / 2, 0, 0]); k.sphere(0.028, k.glow('#4ab8ff'), [dx, 0.07, -0.97], [1, 1, 1], 5, 4, ig); }
  // spray: a red can with a white label band and a black nozzle (z 0)
  C(0.07, 0.07, 0.36, 8, red, [0, 0.18, 0]); C(0.073, 0.073, 0.1, 8, white, [0, 0.17, 0]); C(0.04, 0.05, 0.05, 6, grey, [0, 0.385, 0]); B([0.05, 0.03, 0.04], grey, [-0.06, 0.4, 0]);
  // bandage: a fat cream roll with a loose end (z 0.55)
  C(0.13, 0.13, 0.2, 10, white, [0, 0.1, 0.55]); C(0.05, 0.05, 0.21, 6, k.mat('#8a7a60', 'cloth'), [0, 0.1, 0.55]); B([0.015, 0.003, 0.2], white, [-0.14, 0.012, 0.55]);
  return ig;
}

/** Four folded cloths on the upper plank. */
export function buildPanosPrateleira(r, k, shelf) {
  for (let i = 0; i < 4; i++) k.box([0.3, 0.18, 0.22], k.mat(i % 2 ? '#b0503c' : '#4a6a8a', 'cloth'), [shelf[0] + 0.02, 1.9, shelf[2] - 0.6 + i * 0.4], [0, 0, 0], [0.4, 0.4]);
}

export function buildBancoTreino(r, k, bench) {
  const dark = k.mat('#3a3e48', 'metal');
  k.box([0.5, 0.08, 2.2], k.mat('#7a5a3e', 'wood'), [bench[0], 0.45, bench[2]], [0, 0, 0], [1, 1]);
  for (const dz of [-0.9, 0.9]) k.box([0.5, 0.45, 0.08], dark, [bench[0], 0.22, bench[2] + dz]);
  for (const [dz, c] of [[-0.5, '#b0503c'], [0.2, '#b0503c']]) { k.sphere(0.16, k.mat(c, 'cloth'), [bench[0], 0.62, bench[2] + dz], [1.1, 0.8, 1.3]); }
}

export function buildSuporteVaras(r, k, rackX, rackZ) {
  k.box([2.2, 0.08, 0.3], k.mat('#5a4430', 'wood'), [rackX, 1.0, rackZ]); k.box([2.2, 0.08, 0.3], k.mat('#5a4430', 'wood'), [rackX, 1.8, rackZ]);
  for (let i = 0; i < 5; i++) k.cyl(0.03, 0.03, 1.9, 5, k.mat('#a07848', 'wood'), [rackX - 0.9 + i * 0.45, 1.0, rackZ + 0.02], [0, 0, 0.08]);
}

/** The save terminal: a console with a lit screen and a memory-card slot. */
export function buildTerminalSalvar(r, k, term) {
  const T = r.THREE;
  k.box([0.7, 1.2, 1.3], k.mat('#5b6374', 'metal'), [term[0], 0.6, term[2]]);
  const scr = k.add(new T.PlaneGeometry(0.9, 0.55), r.mat('#6affc8', { emissive: 1, fogged: 0.5 }), [term[0] + 0.36, 1.2, term[2]], [0, Math.PI / 2, 0]);
  k.box([0.08, 0.04, 0.24], k.glow('#ffd23a'), [term[0] + 0.36, 0.9, term[2]]); // card slot
  return scr;
}

/** A heavy cargo net of ropes in the corner (cheap: thin boxes). */
export function buildRedeDeCarga(r, k, x0) {
  for (let i = 0; i < 5; i++) k.box([0.03, 2.0, 0.03], k.mat('#b09870', 'burlap'), [x0 + 0.1, 3.4, -6.2 + i * 0.25], [0, 0, 0]);
}

/** A dais where the instructor stands. */
export function buildTablado(r, k) {
  k.box([3.0, 0.16, 1.8], k.mat('#6a6e7a', 'metal'), [2.2, 0.08, -4.9], [0, 0, 0], [1, 1]);
}

// ============================================================================================
// the library

// Where each prop sits in its scene (so the library can bring it to the origin), which way its
// front faces in the scene (so it can turn it toward +z), and how to build it.
const DISPLAY = {
  cama: { at: [-3.3, 1.25], face: Math.PI, build: (r, k) => buildCama(r, k, [-3.3, 0, 1.25]) },
  'criado-mudo': { at: [-2.5, 1.9], build: (r, k) => buildCriadoMudo(r, k, [-2.5, 0, 1.9]) },
  'guarda-roupa': { at: [-3.7, -1.5], face: -Math.PI / 2, build: (r, k) => buildGuardaRoupa(r, k, -4) },
  tapete: { at: [-2.2, -0.5], build: (r, k) => buildTapete(r, k) },
  'roupas-no-chao': { at: [-2.8, -0.9], build: (r, k) => buildRoupasNoChao(r, k) },
  quadros: { at: [-1.9, 0], build: (r, k, root) => { const wall = new r.THREE.Group(); root.add(wall); buildQuadros(r, k, wall); } },
  fogao: { at: [0.75, -1.98], build: (r, k) => buildFogao(r, k, -2.3) },
  'bancada-pia': { at: [1.75, -1.98], build: (r, k) => buildBancadaPia(r, k, -2.3) },
  'prateleira-latas': { at: [1.45, -2.15], build: (r, k) => buildPrateleiraLatas(r, k, -2.3) },
  'mesa-tigela': { at: [2.2, 0.55], build: (r, k) => buildMesaTigela(r, k, [2.2, 0, 0.55]) },
  cadeira: { at: [2.1, 1.17], face: Math.PI, build: (r, k) => buildCadeira(r, k, [2.1, 0, 1.17]) },
  geladeira: { at: [3.65, 0.5], face: Math.PI / 2, build: (r, k) => buildGeladeira(r, k, { x: 3.65, z: 0.5, w: 0.72, d: 0.7, hgt: 1.75 }) },
  lampada: { at: [2.0, -0.1], build: (r, k) => buildLampada(r, k) },

  'cama-cela': { at: [-2.05, 1.6], face: Math.PI, build: (r, k) => buildCamaCela(r, k, [-2.05, 0, 1.6]) },
  'vaso-cela': { at: [2.1, -2.5], build: (r, k) => buildVasoCela(r, k, -2.8) },
  compartimento: { at: [0, -2.77], build: (r, k) => buildCompartimento(r, k, -2.8) },
  'porta-cela': { at: [2.7, 1.0], face: Math.PI / 2, build: (r, k) => buildPortaCela(r, k, { l0: 0.35, l1: 1.65, h: 2.3 }, 2.6, 1.3, 1.0) },
  'painel-cela': { at: [2.51, -0.55], face: Math.PI / 2, build: (r, k) => buildPainelCela(r, k, 2.6 - 0.09, -0.55) },
  moeda: { at: [0.7, -0.9], build: (r, k) => buildMoeda(r, k, [0.7, 0.02, -0.9]) },
  'banco-cela': { at: [1.5, 1.9], build: (r, k) => buildBancoCela(r, k) },

  jaula: { at: [0, 0], build: (r, k) => buildJaula(r, k, 0, 0, 0, 0) },
  'mesa-negociacao': { at: [0, 0], build: (r, k) => buildMesaNegociacao(r, k, [0, 0, 0]) },
  banqueta: { at: [0, 0], build: (r, k) => buildBanqueta(r, k, 0, 0) },
  'lampada-galpao': { at: [0, 0], build: (r, k) => buildLampadaGalpao(r, k, 8, 0, 6.2, 0) },
  caixote: { at: [0, 0], build: (r, k) => buildCaixote(r, k, 0, 0, 0.2, 1.2) },
  barril: { at: [0, 0], build: (r, k) => buildBarril(r, k, 0, 0) },
  corrente: { at: [0, 0], build: (r, k) => buildCorrente(r, k, 8, 0, 0, 3.8) },

  'casa-fundos': { at: [0, 11.9], face: Math.PI, build: (r, k) => buildCasaFundos(r, k, 9.4) },
  cerca: { at: [0, 0], build: (r, k) => buildCerca(r, k, -3, 3, -3, 4, mulberry32(1)) },
  escada: { at: [1.0, 0.9], build: (r, k) => buildEscada(r, k, { x: 0, z: 0 }) },
  cesto: { at: [1.4, -0.4], build: (r, k) => buildCesto(r, k, [1.4, 0, -0.4], appleMaterial(r)) },
  macieira: { at: [0, 0], build: (r, k, root, opts) => buildMacieiraSozinha(r, k, opts.seed ?? 1) },

  tatame: { at: [0, 0], build: (r, k) => buildTatame(r, k, 5.6, 4.3) },
  'marcas-de-fita': { at: [1, 1], build: (r, k) => buildMarcasFita(r, k) },
  boneco: { at: [0, 0], build: (r, k) => buildBoneco(r, k, 0, 0, 0) },
  'saco-de-pancada': { at: [4.8, -1.5], build: (r, k) => buildSacoDePancada(r, k, 6.5) },
  armarios: { at: [-7.8, 5.95], build: (r, k) => buildArmarios(r, k, -8) },
  relogio: { at: [0, -6.94], build: (r, k) => buildRelogio(r, k, -7) },
  prateleira: { at: [7.7, -1.5], face: Math.PI / 2, build: (r, k) => { const s = [7.7, 1.1, -1.5]; buildPrateleira(r, k, s); buildItensLoja(r, k, s); buildPanosPrateleira(r, k, s); } },
  'itens-loja': { at: [7.65, -1.5], dy: -1.13, face: Math.PI / 2, build: (r, k) => buildItensLoja(r, k, [7.7, 1.1, -1.5]) },
  'banco-treino': { at: [6.7, 2.6], build: (r, k) => buildBancoTreino(r, k, [6.7, 0, 2.6]) },
  'suporte-varas': { at: [3.0, -6.7], build: (r, k) => buildSuporteVaras(r, k, 3.0, -6.7) },
  'terminal-salvar': { at: [-7.5, -4.8], face: -Math.PI / 2, build: (r, k) => buildTerminalSalvar(r, k, [-7.5, 0, -4.8]) },
  'rede-de-carga': { at: [-7.9, -5.6], build: (r, k) => buildRedeDeCarga(r, k, -8) },
  tablado: { at: [2.2, -4.9], build: (r, k) => buildTablado(r, k) },
};

function appleMaterial(r) { return r.mat('#ffffff', { map: tex(r, 'apple'), emissive: 0.25 }); }

// One tree alone, for the library: the same merged geometry the orchard instances.
function buildMacieiraSozinha(r, k, seed) {
  const T = r.THREE;
  const v = macieiraVariant(T, mulberry32(seed * 1301 + 11), mulberry32(seed * 7 + 3));
  const barkM = r.mat('#a08870', { map: tex(r, 'bark') }), leafM = r.mat('#b8d890', { map: tex(r, 'leaves'), emissive: 0.12 });
  const appleM = appleMaterial(r);
  k.group.add(new T.Mesh(v.trunk, barkM), new T.Mesh(v.leaves, leafM));
  const appleGeo = new T.SphereGeometry(0.085, 6, 4);
  v.apples.forEach(([x, y, z]) => { const m = new T.Mesh(appleGeo, appleM); m.position.set(x, y, z); m.scale.setScalar(2.0); k.group.add(m); });
}

/** One prop alone, for the library: a THREE.Group with the object on the floor (y = 0), near the origin, facing +z. */
export function buildProp(r, name, opts = {}) {
  const spec = DISPLAY[name];
  if (!spec) throw new Error(`unknown prop: ${name}`);
  const T = r.THREE;
  const root = new T.Group(); root.name = name;
  const inner = new T.Group(); root.add(inner);
  const k = kit(r, inner);
  spec.build(r, k, inner, opts);
  inner.position.set(-spec.at[0], spec.dy ?? 0, -spec.at[1]);
  root.rotation.y = spec.face ?? 0;
  return { root };
}
