// The entity types of the game and how each one is built from its layout line (data/scenes/<scene>.json), for
// the engine's createEntities (vendor/engine/entities.js). Every object a person may want to move in the scene
// editor is a type here; the builders are in models/objects.js (in metres, no text: pictograms only).
import { defineTypes } from '../vendor/engine/layout.js';
import { kitOf } from './models/kit.js';
import { BUILDERS, PICTO_NAMES } from './models/objects.js';

const num = (min, max, step, d) => ({ type: 'number', min, max, step, default: d });
const col = (d) => ({ type: 'color', default: d });
const bool = (d) => ({ type: 'bool', default: d });
const pic = (d = 'nenhum', none = true) => ({ type: 'enum', options: none ? ['nenhum', ...PICTO_NAMES] : PICTO_NAMES, default: d });
const seed = (d = 1) => num(0, 9999, 1, d);

export const ENTITY_TYPES = defineTypes({
  caixa: { label: 'Caixa', group: 'básico', desc: 'Uma caixa com textura, de lado e cor ajustáveis.', params: { lado: num(0.2, 4, 0.05, 1), altura: num(0.2, 4, 0.05, 1), cor: col('#a08060'), textura: { type: 'enum', options: ['metal', 'wall', 'floor', 'seat', 'cloth'], default: 'metal' } } },
  luz: { label: 'Luz', group: 'básico', desc: 'Uma lâmpada que acende uma luz pontual em volta.', params: { cor: col('#ffd890'), alcance: num(1, 20, 0.5, 6), acesa: bool(true) } },
  // the gallery
  parede: { label: 'Parede', group: 'galeria', desc: 'Parede ou divisória de concreto, com um pictograma nos dois lados.', params: { comprimento: num(0.5, 30, 0.25, 4), altura: num(0.3, 4, 0.1, 2.4), espessura: num(0.1, 1, 0.05, 0.25), textura: { type: 'enum', options: ['concreto', 'umido', 'tijolo', 'azulejo', 'metal', 'madeira', 'chapa', 'palete', 'lona', 'grade'], default: 'concreto' }, cor: col('#8c8c88'), picto: pic() } },
  degrau: { label: 'Degrau', group: 'galeria', desc: 'Plataforma baixa (o alto do degrau dos colchões), com a borda listrada.', params: { largura: num(1, 20, 0.25, 8), profundidade: num(1, 10, 0.25, 3), altura: num(0.1, 1.2, 0.05, 0.45) } },
  colchao: { label: 'Colchão', group: 'galeria', desc: 'Colchão com cobertor e travesseiro, num estrado.', params: { cor: col('#6a7a8a') } },
  bomba: { label: 'Bomba d\'água', group: 'galeria', desc: 'A bomba da sala de máquinas, com o motor e o tubo: quebrada (ferrugem), parada (inteira, desligada) ou funcionando (vibra).', params: { estado: { type: 'enum', options: ['quebrada', 'parada', 'funcionando'], default: 'parada' } } },
  quadro: { label: 'Quadro de força', group: 'galeria', desc: 'O quadro elétrico, com o pictograma do raio.', params: { ligado: bool(false) } },
  bateria: { label: 'Bateria', group: 'galeria', desc: 'O banco de baterias, com as luzes de carga.', params: { celulas: num(1, 4, 1, 4), carga: num(0, 1, 0.25, 1) } },
  filtro: { label: 'Filtro', group: 'galeria', desc: 'A coluna do filtro d\'água: entupido (escuro, com lama), limpo ou ausente (sem o elemento).', params: { estado: { type: 'enum', options: ['entupido', 'limpo', 'ausente'], default: 'entupido' } } },
  tubo: { label: 'Tubo', group: 'galeria', desc: 'Um tubo reto com flanges (gire para os lados).', params: { comprimento: num(0.5, 20, 0.25, 4), raio: num(0.03, 0.4, 0.01, 0.09), cor: col('#6a7a88') } },
  bancada: { label: 'Bancada', group: 'galeria', desc: 'A bancada da oficina, com ferramentas e a morsa.', params: { comprimento: num(1.5, 5, 0.25, 3) } },
  prateleira: { label: 'Prateleira', group: 'galeria', desc: 'Estante de quatro andares com o que se guarda nela.', params: { comprimento: num(0.8, 5, 0.2, 2), itens: { type: 'enum', options: ['latas', 'pecas', 'caixas', 'tecido'], default: 'latas' }, semente: seed() } },
  radio: { label: 'Rádio quebrado', group: 'galeria', desc: 'O rádio da base, com a antena torta (ponha em cima de uma prateleira).', params: { ligado: bool(false) } },
  mesa: { label: 'Mesa', group: 'galeria', desc: 'Mesa do refeitório.', params: { comprimento: num(0.8, 4, 0.1, 2) } },
  banco: { label: 'Banco', group: 'galeria', desc: 'Banco comprido.', params: { comprimento: num(0.5, 4, 0.1, 1.8) } },
  cozinha: { label: 'Cozinha', group: 'galeria', desc: 'Balcão com fogareiro, pia e armários.', params: { comprimento: num(1.5, 6, 0.25, 3) } },
  caixaDagua: { label: 'Caixa d\'água', group: 'galeria', desc: 'A caixa d\'água do armazém.', params: {} },
  caixote: { label: 'Caixote', group: 'galeria', desc: 'Caixotes de madeira, em pilha.', params: { lado: num(0.3, 1.5, 0.05, 0.7), pilha: num(1, 4, 1, 2), semente: seed(), esconde: bool(false) } },
  armario: { label: 'Armário', group: 'galeria', desc: 'Armário de metal; dá para se esconder.', params: {} },
  lampada: { label: 'Lâmpada', group: 'galeria', desc: 'Lâmpada pendurada num fio, com luz pontual.', params: { cor: col('#ffd48a'), alcance: num(2, 20, 0.5, 8), acesa: bool(true), queda: num(0.1, 1.5, 0.05, 0.4) } },
  goteira: { label: 'Goteira', group: 'galeria', desc: 'Cano que pinga numa poça.', params: { altura: num(0.5, 3.5, 0.1, 2.6) } },
  cartaz: { label: 'Cartaz', group: 'galeria', desc: 'Placa com um pictograma (sem texto).', params: { picto: pic('perigo', false), lado: num(0.2, 2, 0.05, 0.5) } },
  balde: { label: 'Balde', group: 'galeria', desc: 'Um balde.', params: {} },
  cabo: { label: 'Cabo', group: 'galeria', desc: 'Cabo grosso no chão, com braçadeiras; com `corte` (0 a 1, a posição) está cortado, e com `emendado` leva a emenda.', params: { comprimento: num(1, 30, 0.5, 6), raio: num(0.02, 0.2, 0.01, 0.06), cor: col('#26262a'), corte: num(-1, 1, 0.01, -1), emendado: bool(false) } },
  bocaDeInspecao: { label: 'Boca de inspeção (por dentro)', group: 'galeria', desc: 'O poço que sobe à rua: escada, a corda e o cabo grosso; a luz do dia desce por ele.', params: { altura: num(2.4, 6, 0.1, 3.6) } },
  pilarForma: { label: 'Pilar de obra', group: 'galeria', desc: 'Pilar de concreto com a fôrma de compensado ainda em parte e a ferragem à mostra no topo.', params: { altura: num(2.4, 4.5, 0.1, 3.4), variante: num(0, 5, 1, 0) } },
  andaime: { label: 'Andaime', group: 'galeria', desc: 'Um módulo de andaime tubular com o estrado de tábuas.', params: {} },
  betoneira: { label: 'Betoneira parada', group: 'galeria', desc: 'A betoneira da obra, parada, com o cimento seco no tambor.', params: {} },
  formas: { label: 'Fôrmas de madeira', group: 'galeria', desc: 'Chapas de compensado encostadas na parede, com um escoramento.', params: {} },
  tambor: { label: 'Tambor', group: 'galeria', desc: 'Tambor de aço.', params: { cor: col('#ffffff') } },
  galao: { label: 'Galão', group: 'galeria', desc: 'Galão de metal.', params: {} },
  gerador: { label: 'Gerador', group: 'galeria', desc: 'Gerador portátil.', params: {} },
  fogareiro: { label: 'Fogareiro de tambor', group: 'galeria', desc: 'Tambor-fogareiro, aceso ou apagado.', params: { aceso: bool(false) } },
  carrinho: { label: 'Carrinho de ferramentas', group: 'galeria', desc: 'Carrinho de ferramentas com rodas.', params: {} },
  pneu: { label: 'Pneu', group: 'galeria', desc: 'Pneu velho.', params: {} },
  caixaFerramentas: { label: 'Caixa de ferramentas', group: 'galeria', desc: 'Caixa de ferramentas de metal.', params: {} },
  palete: { label: 'Paletes', group: 'galeria', desc: 'Pilha de paletes.', params: { pilha: num(1, 5, 1, 2) } },
  sacos: { label: 'Sacos de cimento', group: 'galeria', desc: 'Pilha de sacos de cimento endurecidos.', params: { pilha: num(1, 5, 1, 3), semente: seed() } },
  trilho: { label: 'Trilho pela metade', group: 'galeria', desc: 'Um trecho de trilho com dormentes soltos (gire para deitar ao longo do túnel).', params: { comprimento: num(3.2, 12.8, 3.2, 3.2) } },
  ralo: { label: 'Ralo', group: 'galeria', desc: 'Ralo de piso com grelha.', params: {} },
  // the street
  predio: { label: 'Prédio', group: 'rua', desc: 'Prédio de fachada em módulos de 3 m, com loja no térreo e janelas acesas pela semente. De frente para +Z.', params: { largura: num(6, 30, 3, 15), profundidade: num(6, 30, 1, 14), andares: num(2, 16, 1, 6), semente: seed(), fachada: { type: 'enum', options: ['concreto', 'tijolo', 'vidro'], default: 'concreto' }, cor: col('#9a9894'), letreiro: pic('nenhum'), marquise: bool(false), luzes: num(0, 1, 0.01, 0.06) } },
  poste: { label: 'Poste', group: 'rua', desc: 'Poste de luz de rua, com o braço para o lado +Z.', params: { altura: num(4, 12, 0.5, 8), acesa: bool(true), cor: col('#ffc880'), alcance: num(6, 24, 0.5, 14) } },
  carro: { label: 'Carro parado', group: 'rua', desc: 'Carro de passeio, van ou furgão, sem marca.', params: { tipo: { type: 'enum', options: ['sedan', 'van', 'furgao'], default: 'sedan' }, cor: col('#6a7a8a'), luzes: bool(false), porta: bool(false) } },
  cacamba: { label: 'Caçamba', group: 'rua', desc: 'Caçamba de entulho.', params: { cor: col('#6a5a3a'), semente: seed() } },
  marquise: { label: 'Marquise', group: 'rua', desc: 'Cobertura sobre a calçada, com quatro colunas e luz.', params: { largura: num(3, 30, 0.5, 12), profundidade: num(2, 8, 0.5, 3.4), altura: num(2.5, 6, 0.1, 3.6) } },
  viaduto: { label: 'Viaduto', group: 'rua', desc: 'O tabuleiro do viaduto, com muretas e faixa central (ao longo de Z).', params: { comprimento: num(10, 120, 2, 70), largura: num(6, 20, 0.5, 10), altura: num(4, 12, 0.5, 7) } },
  pilar: { label: 'Pilar', group: 'rua', desc: 'Pilar do viaduto, com a base listrada.', params: { raio: num(0.3, 1.5, 0.05, 0.6), altura: num(3, 12, 0.5, 7.2) } },
  painelSolar: { label: 'Painéis solares', group: 'rua', desc: 'Fileiras de painéis inclinados no chão (sujos ou limpos).', params: { colunas: num(1, 6, 1, 3), fileiras: num(1, 4, 1, 2), sujo: bool(false) } },
  loja: { label: 'Loja ou prédio (de entrar)', group: 'rua', desc: 'Prédio com o térreo oco: porta na rua (+Z), o que há dentro pelo tipo e pela semente, e os andares de cima. Dá para entrar.', params: { largura: num(6, 30, 3, 12), profundidade: num(9, 30, 1, 14), andares: num(2, 16, 1, 4), semente: seed(), fachada: { type: 'enum', options: ['concreto', 'tijolo', 'vidro'], default: 'concreto' }, cor: col('#9a9894'), letreiro: pic('nenhum'), interior: { type: 'enum', options: ['farmacia', 'mercado', 'comida', 'oficina', 'deposito', 'saguao'], default: 'mercado' }, luzes: num(0, 1, 0.01, 0.06) } },
  lixo: { label: 'Lixo e manchas', group: 'rua', desc: 'Restos no chão (papéis, latas, caixas), manchas de óleo, rachaduras e terra; nunca bloqueia o caminho.', params: { quantidade: num(1, 60, 1, 18), raio: num(0.5, 8, 0.25, 2.5), semente: seed() } },
  isca: { label: 'Isca sonora', group: 'máquinas', desc: 'O aparelho de estalos sem voz que se joga; a luz pisca devagar quando está ativa.', params: { ativa: bool(false), semente: seed() } },
  cao: { label: 'Cão-robô', group: 'máquinas', desc: 'O cão de frota, parado numa pose (para ver o modelo).', params: { estado: { type: 'enum', options: ['calma', 'desconfiada', 'busca', 'caca', 'desligado'], default: 'calma' }, velocidade: num(0, 4, 0.5, 0), semente: seed() } },
  caixaDaguaAlta: { label: 'Caixa d\'água alta', group: 'rua', desc: 'A torre da caixa d\'água, com escada de gato e o pictograma da água.', params: { raio: num(1.5, 4, 0.1, 2.2), altura: num(8, 30, 1, 16) } },
  pontoDeEmbarque: { label: 'Ponto de embarque', group: 'rua', desc: 'Abrigo, o poste com a seta e o boneco, e a baia pintada.', params: {} },
  pontoDeEntrega: { label: 'Ponto de entrega', group: 'rua', desc: 'Chão pintado com a caixa e o poste do pictograma.', params: {} },
  bueiro: { label: 'Bueiro (grade)', group: 'rua', desc: 'Grade de bueiro no asfalto.', params: {} },
  bocaRua: { label: 'Grade do poço (na rua)', group: 'rua', desc: 'A grade do poço de ventilação da estação, rente à calçada: a folha de acesso, a corda por dentro e o cabo entrando.', params: {} },
  semaforo: { label: 'Semáforo', group: 'rua', desc: 'Semáforo com braço (0 vermelho, 1 amarelo, 2 verde).', params: { cor: num(0, 2, 1, 2) } },
  barreira: { label: 'Barreira', group: 'rua', desc: 'Barreira listrada de obra.', params: { comprimento: num(1, 6, 0.25, 2.5) } },
  cone: { label: 'Cone', group: 'rua', desc: 'Cone de trânsito.', params: {} },
  hidrante: { label: 'Hidrante', group: 'rua', desc: 'Hidrante vermelho.', params: {} },
  placa: { label: 'Placa', group: 'rua', desc: 'Placa de rua com pictograma.', params: { altura: num(1.5, 4, 0.1, 2.4), picto: pic('seta', false) } },
  entulho: { label: 'Entulho', group: 'rua', desc: 'Pilha de entulho; dá para se esconder.', params: { semente: seed() } },
  // people
  pessoa: { label: 'Pessoa', group: 'pessoas', desc: 'Uma pessoa (adulta) parada numa pose; Jonas, Dona Neide ou Tânia.', params: { papel: { type: 'enum', options: ['jonas', 'neide', 'tania'], default: 'jonas' }, semente: seed(), pose: { type: 'enum', options: ['parado', 'andando', 'correndo', 'agachado'], default: 'parado' }, fase: num(0, 6.3, 0.1, 0.8), mochila: bool(false) } },
});

/**
 * One entity: { root, ...what the rules need } (collider, hide, light, exit, ground, dynamic: see models/objects.js).
 * `r` is the render. The root carries the entity's place, turn and size.
 */
export function buildEntity(r, e, p) {
  const fn = BUILDERS[e.type];
  if (!fn) throw new Error(`unknown entity type ${e.type}`);
  const m = fn(kitOf(r), p, e);
  m.root.position.set(...e.pos); m.root.rotation.set(...e.rot); m.root.scale.set(...e.scale);
  return m;
}
