// The views of the chase through the building for the film mode, and the film's clock: pure (no three.js), so a script can list them.
// One view per beat (the panels 6 to 20 of the storyboard, with the person's changes of 2026-11-23: the door as action, the choice in the
// flat), the three acts and the whole of it, from a run with every command done right (systems/fuga.js: filmRec). The two other ways of the
// choice have their own runs: behind the cupboard (`atras`, `empurra`) and into it, the trap (`dentro`). The beats that have more than
// one camera to compare (`cams` of the beat) are filmed again with each: `<beat>-seguranca` (a fixed camera in a corner), `<beat>-cao`
// (low, from the dog's side), and `<beat>-ombro` (hand held at his shoulder: the one the game uses). And one view per command missed.
// Where each run is on the film's clock: the run by the sheet from 0; behind the cupboard from 300; the trap from 450; the same three
// again with the fixed camera from 1000 and with the dog's from 2000; the misses from 3000, 30 s apart.
// The film's clock is the game's, except while the world is slow (the dog's leap at the grate): there a second of the game takes
// 1 / SLOW.scale of the film.
import { BEATS, BEAT, filmRec, failOf, chasePose, recAt } from '../systems/fuga.js';
import { SLOW } from '../systems/emenda.js';

const S = SLOW.scale;
const clockOf = (run) => {
  const spans = run.slow, filmOf = (w) => { let t = w; for (const [a, b] of spans) t += (Math.min(Math.max(w, a), b) - a) * (1 / S - 1); return t; };
  const worldOf = (t) => { let w = t; for (const [a, b] of spans) { const fa = filmOf(a), fb = filmOf(b); if (t >= fb) w -= (b - a) * (1 / S - 1); else if (t > fa) w -= (t - fa) * (1 - S); } return w; };
  const e = (u) => { const c = Math.max(0, Math.min(1, u)); return c * c * (3 - 2 * c); };
  return { filmOf, worldOf, slowK: (t) => { const w = worldOf(t); return spans.reduce((m, [a, b]) => Math.max(m, e((w - a) / 0.05) * (1 - e((w - b + 0.04) / 0.08))), 0); } };
};
/** The three runs (one per way of the choice) and where each begins on the film's clock. */
export const RUNS = [['pano', 0], ['atras', 300], ['dentro', 450]].map(([branch, off]) => { const run = filmRec(undefined, { branch }); return { branch, off, run, ...clockOf(run) }; });
export const RUN = RUNS[0].run, filmOf = RUNS[0].filmOf, worldOf = RUNS[0].worldOf;
export const TOTAL = filmOf(RUN.total);
export const CAM_OFF = { seguranca: 1000, cao: 2000 }, MISS_OFF = 3000;
const runOf = (id) => RUNS.find((r) => r.branch === (BEAT[id].branch ?? 'pano'));
/** Where a beat is on the film's clock, with a camera of its own or the game's. */
const T = (id, cam = null) => { const r = runOf(id), b = r.run.beats[id], end = r.run.rec.failAt != null && id === 'dentro' ? r.run.rec.failAt + 3.6 : b.end; return [(CAM_OFF[cam] ?? 0) + r.off + r.filmOf(b.t0), (CAM_OFF[cam] ?? 0) + r.off + r.filmOf(end)]; };

/** The misses: each command of the chase not answered, 30 s apart. */
export const MISSES = BEATS.filter((b) => b.cmd?.fatal).map((b, i) => {
  const m = filmRec(undefined, { miss: b.id, branch: b.branch ?? 'pano' }), f = m.rec.failAt, P0 = chasePose(recAt(m.rec, f), f), d = failOf(BEAT[b.id], P0).delay;
  return { id: b.id, off: MISS_OFF + i * 30, rec: m.rec, t0: Math.max(m.beats[b.id].t0, f - 2.2), t1: f + d + 2.6 };
});
const M = (id) => { const m = MISSES.find((x) => x.id === id); return [m.off, m.off + (m.t1 - m.t0)]; };
const V = (id, cam, desc) => [...T(id, cam), desc];
const SEG = 'câmera fixa de segurança, no canto', CAO = 'câmera baixa, do lado do cão', OMB = 'câmera na mão, por cima do ombro (a do jogo)';

export const views = {
  corrida: V('corrida', null, 'Quadro 6, primeira pessoa: Jonas corre da calçada para a avenida, a câmera balança com a passada; um carro parado atravessado nas pistas fecha o caminho e ele desvia para a direita'),
  semaforo: V('semaforo', null, 'Quadro 7, plano fixo do alto do poste do semáforo: Jonas pequeno no meio da avenida correndo para o prédio, o cão larga a caçamba e ganha terreno'),
  porta: V('porta', null, 'Quadro 8, a câmera acompanha Jonas por cima do ombro: ele se joga na porta de vidro aramado da portaria, que emperra; no vidro, o cão chegando por trás'),
  vidro: V('vidro', null, 'Quadro 9, câmera na mão dentro do hall: Jonas entra e bate a porta, o cão se joga no vidro, que racha em teia; ele recua devagar, ofegante, olhando a porta; na segunda batida entende que o vidro vai ceder e corre'),
  hall: V('hall', null, 'Quadro 10, plano fixo do canto alto do hall: as caixas de correio, o carrinho de bebê virado, a escada ao fundo; Jonas corre para a escada e, atrás, o vidro estoura e o cão entra'),
  vao: V('vao', null, 'Quadro 11, do alto do vão da escada olhando para baixo em espiral: Jonas quase no terceiro andar, o cão subindo os lances de baixo, a luz do sensor nas paredes'),
  corredor: V('corredor', null, 'Quadro 12, primeira pessoa: o corredor do terceiro andar, uma porta de cada lado; a da esquerda entreaberta, a da direita fechada; ele entra pela esquerda'),
  escolha: V('escolha', null, 'Quadro 13, primeira pessoa: dentro do apartamento, os móveis sob lençol; ele olha o armário, o vão atrás dele e o pano dobrado na mesa, com o cão no corredor'),
  pano: V('pano', null, 'Quadro 14, caminho do pano, câmera na mão: Jonas arranca o lençol da mesa e se abaixa atrás dela; o cão entra, acha o calor dele e vem; ele se levanta e joga o pano no sensor; cego, o cão gira e tropeça, e ele corre para a janela'),
  atras: V('atras', null, 'Quadro 13, caminho do armário, câmera na mão: Jonas se espreme no vão atrás do armário e prende a respiração; o cão entra, vira para o calor dele e para na frente da porta do armário'),
  empurra: V('empurra', null, 'Quadro 14, caminho do armário: com o ombro, Jonas tomba o armário em cima do cão, que fica preso debaixo dele com os sensores cobertos; ele corre para a janela'),
  entra: V('entra', null, 'Quadro 13, a armadilha: Jonas atravessa a sala, abre o armário de ripas e se fecha dentro dele'),
  dentro: [T('entra')[0], T('dentro')[1], 'Quadro 13, a armadilha inteira: Jonas se fecha no armário e prende a respiração; pela fresta das ripas, o cão entra pela porta, procura pela sala, para e varre com o sensor, vira para o armário, vem, arranca a porta e o pega'],
  achado: [T('achado')[0], T('dentro')[1], 'Quadro 13, o fim da armadilha: o sensor do cão para no armário, ele vem e arranca a porta'],
  janela: V('janela', null, 'Quadro 16, da rua olhando para a fachada: a janela sobe, Jonas passa para a escada de incêndio e começa a descer; a luz de um sensor aparece na janela atrás dele'),
  degrau: V('degrau', null, 'Quadro 17, primeira pessoa descendo de costas: um degrau enferrujado solta, a câmera despenca meio metro e para no corrimão; depois os dois lances até o primeiro patamar'),
  trava: V('trava', null, 'Quadro 18, da calçada olhando para cima: Jonas na trava da última escada, o cão no patamar de cima descendo; a escada de mão corre até a calçada e ele desce por ela'),
  calcada: V('calcada', null, 'Quadro 19, primeira pessoa: da escada de incêndio, pela avenida, até a grade do poço; ele levanta a folha de acesso e entra; atrás, o cão salta do patamar e atravessa a pista'),
  fecha: V('fecha', null, 'Quadro 19, da boca do poço em câmera lenta: o cão no ar por cima dele, e a folha da grade puxada e fechada'),
  grade: V('grade', null, 'Quadro 20, a câmera da primeira cutscene, de dentro do poço: o cão parado em cima da grade, a luz do sensor desce pelas barras e passa por Jonas; depois os passos indo embora'),
  ato2: [T('corrida')[0], T('vidro')[1], 'Ato 2, a travessia: da corrida pela avenida à porta de vidro que racha, e a fuga dele na segunda batida'],
  ato3: [T('hall')[0], T('pano')[1], 'Ato 3, dentro do prédio (caminho do pano): o hall, o vão da escada, o corredor, a escolha no apartamento e o pano no sensor'],
  'ato3-armario': [T('atras')[0], T('empurra')[1], 'Ato 3, o outro caminho: atrás do armário, a respiração presa, e o armário tombado em cima do cão'],
  ato4: [T('janela')[0], T('grade')[1], 'Ato 4, a escada de incêndio e o poço: da janela até o cão em cima da grade'],
  inteira: [0, TOTAL, 'A fuga inteira, dos atos 2 a 4, pelo caminho do pano, com todos os comandos certos'],
  'porta-ombro': V('porta', null, `A porta emperrada, ${OMB}`), 'porta-seguranca': V('porta', 'seguranca', `A porta emperrada, ${SEG} da marquise, de fora`), 'porta-cao': V('porta', 'cao', `A porta emperrada, ${CAO}, que vem por trás dele`),
  'vidro-ombro': V('vidro', null, `O vidro que racha e o recuo ofegante, ${OMB}`), 'vidro-seguranca': V('vidro', 'seguranca', `O vidro que racha e o recuo ofegante, ${SEG} do hall`), 'vidro-cao': V('vidro', 'cao', `O vidro que racha, ${CAO}, de fora, com Jonas recuando lá dentro`),
  'vao-seguranca': V('vao', 'seguranca', 'O vão da escada de dentro do poço, na altura dele, girando com ele: Jonas sobe correndo com um pé em cada degrau'), 'vao-cao': V('vao', 'cao', 'O vão da escada de baixo, nos degraus atrás dele: os pés de Jonas nos degraus'),
  'escolha-olhos': V('escolha', null, 'A escolha no apartamento, pelos olhos dele (a do jogo)'), 'escolha-seguranca': V('escolha', 'seguranca', `A escolha no apartamento, ${SEG} da sala, com Jonas parado no meio`),
  'pano-ombro': V('pano', null, `O pano no sensor, ${OMB}`), 'pano-seguranca': V('pano', 'seguranca', `O pano no sensor, ${SEG} da sala`), 'pano-cao': V('pano', 'cao', `O pano no sensor, ${CAO}, olhando para Jonas atrás da mesa`),
  'atras-ombro': V('atras', null, `Atrás do armário, ${OMB}`), 'atras-seguranca': V('atras', 'seguranca', `Atrás do armário, ${SEG} da sala`), 'atras-cao': V('atras', 'cao', `Atrás do armário, ${CAO}, olhando para o armário`),
  'empurra-ombro': V('empurra', null, `O armário tombando no cão, ${OMB}`), 'empurra-seguranca': V('empurra', 'seguranca', `O armário tombando no cão, ${SEG} da sala`), 'empurra-cao': V('empurra', 'cao', `O armário tombando no cão, ${CAO}`),
  'dentro-fresta': V('dentro', null, 'A armadilha do armário, pela fresta das ripas (a do jogo)'), 'dentro-seguranca': V('dentro', 'seguranca', `A armadilha do armário, ${SEG} da sala: o cão vai direto ao armário e arranca a porta`), 'dentro-cao': V('dentro', 'cao', `A armadilha do armário, ${CAO}`),
  'erro-dentro': V('dentro', null, 'O erro de entrar no armário (o clipe aprovado), já de dentro, pela fresta das ripas, com a respiração presa: o cão aparece na porta aos 2,7 s, procura pela sala, para e varre com o sensor a partir dos 4,2 s, vira para o armário aos 5,6 s e golpeia aos 7,05 s; no jogo, FIM DE JOGO aos 9,95 s e a volta ao ponto salvo'),
  'erro-corrida': [...M('corrida'), 'O erro do quadro 6: Jonas bate no carro e o cão chega (o jogo faz o sangue e o preto, sem o sangue no vídeo)'],
  'erro-porta': [...M('porta'), 'O erro do quadro 8: a porta não cede a tempo e o cão salta'],
  'erro-corredor': [...M('corredor'), 'O erro do quadro 12: a porta da direita está trancada e o cão sobe o último lance'],
  'erro-escolha': [...M('escolha'), 'O erro do quadro 13: ele não decide a tempo e o cão entra no apartamento'],
  'erro-pano': [...M('pano'), 'O erro do pano: o lençol cai fora do sensor e o cão o alcança atrás da mesa'],
  'erro-atras': [...M('atras'), 'O erro atrás do armário: ele solta a respiração, o cão escuta e dá a volta'],
  'erro-empurra': [...M('empurra'), 'O erro do armário: ele não tomba a tempo e o cão dá a volta'],
  'erro-degrau': [...M('degrau'), 'O erro do quadro 17: ele não agarra o corrimão, cai na calçada e o cão salta da janela'],
  'erro-trava': [...M('trava'), 'O erro do quadro 18: a trava não solta a tempo e o cão salta do patamar de cima'],
  'erro-calcada': [...M('calcada'), 'O erro do quadro 19: a folha da grade não sobe a tempo'],
  'erro-fecha': [...M('fecha'), 'O erro do quadro 19: a grade fecha tarde e o cão o alcança'],
};
/** The pose of the film at its time `t`: one of the runs (with the camera of its stretch of the clock), or one of the misses. */
export function poseAt(t) {
  if (t >= MISS_OFF - 1e-6) { const m = MISSES.find((x) => t >= x.off - 1e-6 && t < x.off + (x.t1 - x.t0) + 1) ?? MISSES.at(-1), w = Math.min(m.t1, m.t0 + Math.max(0, t - m.off)); return chasePose(recAt(m.rec, w), w); }
  const cam = t >= CAM_OFF.cao ? 'cao' : t >= CAM_OFF.seguranca ? 'seguranca' : null, tt = t - (CAM_OFF[cam] ?? 0), r = [...RUNS].reverse().find((x) => tt >= x.off - 1e-6) ?? RUNS[0];
  const end = r.run.rec.failAt != null ? r.run.rec.failAt + 3.6 : r.run.total - 1e-3, w = Math.min(end, Math.max(0, r.worldOf(tt - r.off)));
  return chasePose({ ...recAt(r.run.rec, w), slowK: r.slowK(tt - r.off) }, w, { cam });
}
export const anchors = {
  porta: 'A porta de vidro aramado da portaria, na calçada norte', hall: 'O meio do hall, junto do carrinho de bebê virado', vao: 'O vão da escada, visto do alto', corredor: 'O corredor do terceiro andar, entre as duas portas',
  armario: 'O armário da cozinha do apartamento', mesa: 'A mesa coberta de lençol, com o pano dobrado em cima', janela: 'A janela do apartamento que dá para a escada de incêndio', escada: 'O primeiro patamar da escada de incêndio, junto da trava', grade: 'A grade do poço, na calçada sul, sob o viaduto',
};
