// The screens that are not the radio: the title, the pause, the options, the commands, the memory card and the end of a night.
// They are the system of the game (not the world): drawn like a game of the early 2000s (condensed type in a column on the left, no boxes, a marker on the
// chosen line, faders and switches like the ones on the radio, a block manager like a console's) and made of DOM only to stay sharp on any screen.
// One list of focusable things (`.f`) serves the arrows, Enter, Esc, Tab, the pad and the touch (`nav`); the arrows move to the nearest thing in that direction.
// The look is in menus.css; the pieces drawn in code (logotype, icons, button glyphs) are in ui-art.js.
import { esc } from './ui.js';
import { LOGO, icon, legend } from './ui-art.js';

const COMMANDS = [
  ['Andar', 'WASD', 'analógico esquerdo', 'direcional virtual'],
  ['Olhar ao redor (na rua, por cima do ombro, o olhar é limitado)', 'mouse (um clique prende o ponteiro) ou setas', 'analógico direito', 'arrastar à direita'],
  ['Correr', 'Shift (segurar)', 'L3 (alterna)', 'botão Correr'],
  ['Agachar', 'C', 'B', 'botão Agachar'],
  ['Examinar, pegar, usar, esconder-se, abrir o rádio', 'E', 'A', 'toque no objeto'],
  ['Segurar para manipular', 'E (segurar)', 'A (segurar)', 'tocar e segurar no objeto'],
  ['Sair do exame (de perto)', 'Esc ou E', 'A ou B', 'botão ✗ Voltar'],
  ['Reagir', 'Espaço', 'X', 'botão Reagir (canto inferior direito)'],
  ['Emenda, segurar (a sequência da saída 1)', 'E (segurar)', 'A (segurar)', 'Usar (segurar)'],
  ['Emenda, esquivar quando o cão salta (o tempo fica lento)', '← ou → (também A, D)', 'direcional ← →', 'botões ◀ ▶ ao lado de Usar'],
  ['Emenda, escolher com o cão atordoado: ◀ desorientar (em silêncio) ou ▶ desativar (com barulho)', '← ou →', 'direcional ← →', 'botões ◀ ▶'],
  ['Emenda, a ação da escolha (encostar a isca: segurar; enfiar o cabo: apertar)', 'E (segurar ou apertar)', 'A', 'Usar'],
  ['Emenda, puxar o cabo preso', 'E (martelar) ou alternar ← →', 'A (martelar)', 'Usar (martelar)'],
  ['Emenda, fechar', 'E ou Espaço', 'A ou X', 'Usar ou Reagir'],
  ['Mirar a isca', 'botão direito (segurar)', 'LT (segurar)', 'arrastar o botão Item'],
  ['Lançar', 'botão esquerdo', 'RT', 'soltar o botão Item'],
  ['Lanterna', 'F', 'Y', 'botão Lanterna'],
  ['Rádio de mão', 'R', 'direcional ↑', 'botão Rádio'],
  ['Bolso', 'I', 'direcional ↓', 'botão Bolso'],
  ['Menu', 'Esc', 'Start', 'botão ☰'],
];
const RADIO_COMMANDS = [
  ['Trocar de canal (Jonas gira o seletor)', '← → ou roda do mouse; clique no seletor', 'LB / RB', 'toque no seletor, à esquerda ou à direita do centro'],
  ['Escolher uma resposta', '↑ ↓, 1 a 3, ou clique', 'direcional ↑ ↓', 'toque na linha'],
  ['Falar (só fala enquanto segura)', 'T (segurar)', 'RT (segurar)', 'segurar o botão Falar'],
  ['Calar', 'não falar até o chiado sumir', 'idem', 'idem'],
  ['Senha: abrir o teclado e digitar', 'Enter; as letras entram direto; Enter envia, Esc fecha', 'Y; direcional move, A aperta, X apaga, Start envia', 'tocar as teclas do rádio (várias vezes troca a letra); # envia'],
  ['Teclado de cores (canal 88): escolher, pôr, apagar', '← →, E, Backspace', 'direcional ← →, A, X', 'tocar o botão de cor; * apaga'],
  ['Teclado de cores: enviar (2 s)', 'T (segurar)', 'RT (segurar)', 'segurar Enviar'],
  ['Trocar de canal no teclado de cores', '↑ ↓ ou roda do mouse', 'LB / RB', 'toque no seletor'],
  ['Avançar uma fala sem escolha', 'E ou clique na fala', 'A', 'toque na fala'],
  ['Sair do rádio (Jonas pendura o microfone)', 'Esc', 'B', 'botão ✗ Voltar'],
  ['Caderno e bolso: folhear, trocar de item', '← →', 'LB RB ou direcional', 'tocar a metade esquerda ou a direita'],
  ['Caderno e bolso: guardar', 'E ou Esc', 'A ou B', 'botão ✗ Voltar'],
  ['Pular uma cena filmada', 'segurar Esc 1 s', 'segurar Start 1 s', 'botão Pular / segurar a tela'],
];
/** The seed of the run is for whoever repeats a game: it is on the memory card's block, and on the pause only with ?debug in the address. */
const DEBUG = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');
const DEVICE_COL = { keyboard: 1, gamepad: 2, touch: 3 };

// The controls of the options. fader: 0 to 10 notches; switch: on or off; choice: one of a list. `idx` reads the value from the options (G.options).
const CTL = {
  bright: { t: 'fader', short: 'bright', label: 'Brilho', idx: (o) => o.bright ?? 5, text: (o) => `${o.bright ?? 5} de 10`, help: 'Clareia ou escurece a imagem do jogo. A noite é escura de propósito: aumente se não enxergar bem.' },
  grain: { t: 'switch', label: 'Granulação', get: (o) => o.grain !== false, help: 'Ruído e linhas finas sobre os menus e o título, como numa tela antiga. Desligado, a interface fica limpa.' },
  volume: { t: 'fader', short: 'vol', label: 'Volume', idx: (o) => o.volume, text: (o) => `${o.volume} de 10`, help: 'O volume geral do jogo, de 0 a 10.' },
  captions: { t: 'switch', label: 'Legendas', get: (o) => Boolean(o.captions), help: 'As falas aparecem escritas, embaixo da imagem.' },
  sens: { t: 'fader', short: 'sens', label: 'Sensibilidade do olhar', idx: (o) => Math.round((o.sens - 0.4) / 0.2), text: (o) => o.sens.toFixed(1), help: 'Quão rápido o olhar acompanha o mouse, o analógico ou o dedo.' },
  invert: { t: 'switch', label: 'Inverter o olhar vertical', get: (o) => Boolean(o.invert), help: 'Para cima vira para baixo, e para baixo vira para cima.' },
  textSize: { t: 'choice', label: 'Tamanho do texto', values: ['Normal', 'Grande', 'Maior'], idx: (o) => o.textSize ?? 0, help: 'Aumenta o texto das falas, das dicas e dos menus.' },
  contrast: { t: 'switch', label: 'Alto contraste', get: (o) => Boolean(o.contrast), help: 'Fundos mais fechados e letras mais claras nos textos sobre a imagem e nos menus.' },
  flashes: { t: 'switch', label: 'Reduzir clarões', get: (o) => Boolean(o.flashes), help: 'Sem piscadas fortes: o ícone de "foi ouvido", o anel de Reagir, as luzes do cão, o título e as transições ficam estáveis.' },
  quick: { t: 'choice', label: 'Reação rápida', values: ['Normal (1,2 s)', 'Mais tempo (2,4 s)', 'Desligada (sempre acerta)'], idx: (o) => ['normal', 'long', 'off'].indexOf(o.quick), help: 'O botão Reagir tem um anel que fecha. "Desligada" acerta sempre.' },
  patience: { t: 'choice', label: 'Paciência das vozes', values: ['Normal', 'Maior (o dobro)'], idx: (o) => (o.patience ? 1 : 0), help: 'Paciência maior: o chiado das vozes demora o dobro para sumir.' },
  gore: { t: 'switch', label: 'Sangue e violência gráfica', get: (o) => o.gore !== false, help: 'Desligado, o ataque do cão corta para o preto antes do impacto, com o som abafado; a morte e o fim de jogo continuam. Isto é só para adultos.' },
};
const TABS = [
  ['imagem', 'Imagem', ['bright', 'grain']],
  ['som', 'Som', ['volume', 'captions']],
  ['controles', 'Controles', ['sens', 'invert', '@commands']],
  ['acess', 'Acessibilidade', ['textSize', 'contrast', 'flashes', 'quick', 'patience']],
  ['conteudo', 'Conteúdo', ['gore']],
];
const CMD_TABS = [['andar', 'Andar e examinar', COMMANDS], ['radio', 'No rádio da estação', RADIO_COMMANDS]];
const yes = (v) => (v ? 'sim' : 'não');
const BLOCK_LABEL = { run: 'Partida', night: (x) => `Noite ${x.id.slice(-1)}`, other: (x) => x.game, corrupt: 'Quebrado', channel: 'O canal', secrets: 'Segredos', empty: 'Vazio' };
const blockLabel = (x) => { const l = BLOCK_LABEL[x.kind] ?? 'Vazio'; return typeof l === 'function' ? l(x) : l; };

export function createScreens(root, G) {
  const el = document.createElement('div'); el.id = 'screens'; el.hidden = true;
  el.innerHTML = '<div class="bg"></div><div class="grain"></div><div class="panel"></div><div class="legend"></div><div class="tune"></div>';
  root.appendChild(el);
  const panel = el.querySelector('.panel'), legendEl = el.querySelector('.legend');
  const st = { name: null, args: {}, sel: 0, stack: [], dev: null };
  const A = () => G.actions;
  const dev = () => G.device?.() ?? 'keyboard';
  const sound = (n, gain) => { try { G.audio.play(n, { gain }); } catch { /* the sound is never needed to move on */ } };
  /** The list the arrows walk: the main things first, so the first thing selected is the first choice. */
  const buttons = () => { const all = [...panel.querySelectorAll('.f')], main = all.filter((b) => !b.classList.contains('x')); return [...main, ...all.filter((b) => b.classList.contains('x'))]; };
  const cur = () => buttons()[st.sel] ?? null;

  // ---- the controls: drawn like the radio's faders and switches --------------------------------------------------------------------------------------
  const lbl = (c) => `<span class="lab">${esc(c.label)}</span>`;
  const control = (name) => {
    const c = CTL[name], o = G.options;
    if (c.t === 'fader') {
      const i = c.idx(o);
      return `<div class="f row fader" data-o="${name}" data-adjust="1" data-act="slide">${lbl(c)}<span class="ctl"><button type="button" class="st minus" data-act="${c.short}-" aria-label="Baixar: ${esc(c.label)}" tabindex="-1"><i></i></button>
        <span class="track" data-o="${name}" role="slider" aria-label="${esc(c.label)}" aria-valuemin="0" aria-valuemax="10" aria-valuenow="${i}"><b class="notches"></b><b class="cap" style="--v:${i / 10}"></b></span>
        <button type="button" class="st plus" data-act="${c.short}+" aria-label="Subir: ${esc(c.label)}" tabindex="-1"><i></i></button></span><span class="val">${esc(c.text(o))}</span></div>`;
    }
    if (c.t === 'switch') {
      const on = c.get(o);
      return `<div class="f row sw${on ? ' on' : ''}" data-o="${name}" data-adjust="1" data-act="opt" role="switch" aria-checked="${on}" aria-label="${esc(c.label)}">${lbl(c)}<span class="ctl"><span class="swt"><b class="lamp"></b><b class="lever"></b></span></span><span class="val state">${yes(on)}</span></div>`;
    }
    const i = c.idx(o);
    return `<div class="f row choice" data-o="${name}" data-adjust="1" data-act="choose">${lbl(c)}<span class="ctl"><span class="ar l"></span><span class="ar r"></span></span><span class="val">${esc(c.values[i])}</span></div>`;
  };
  /** Brings the drawn controls in line with the options, without building them again (so the fader cap slides and the lever throws). */
  function sync() {
    const o = G.options;
    for (const row of panel.querySelectorAll('.row[data-o], .item[data-o]')) {
      const c = CTL[row.dataset.o]; if (!c) continue;
      if (c.t === 'fader') { const i = c.idx(o); row.querySelector('.cap').style.setProperty('--v', String(i / 10)); row.querySelector('.val').textContent = c.text(o); row.querySelector('.track').setAttribute('aria-valuenow', String(i)); }
      else if (c.t === 'switch') { const on = c.get(o); row.classList.toggle('on', on); row.setAttribute('aria-checked', String(on)); const v = row.querySelector('.state'); if (v) v.textContent = yes(on); }
      else row.querySelector('.val').textContent = c.values[c.idx(o)];
    }
  }
  const FADE = { volume: (d) => A().volume(d), sens: (d) => A().sens(d), bright: (d) => A().bright(d) };
  const step = (name, d) => { const c = CTL[name]; if (c.t === 'fader') FADE[name](d); else if (c.t === 'choice') A().choose(name, d); else A().toggleOption(name); };
  function adjust(row, d) {
    const name = row.dataset.o, c = CTL[name]; if (!c) return;
    if (c.t === 'fader') { const was = c.idx(G.options); FADE[name](d); if (c.idx(G.options) === was) sound('ui-no', 0.3); else sound('ui-fader', 0.45); }
    else if (c.t === 'choice') { A().choose(name, d); sound('ui-move', 0.45); }
    else { const on = c.get(G.options); if ((d > 0) !== on) { A().toggleOption(name); sound('ui-ok', 0.45); } else sound('ui-no', 0.3); }
    sync(); if (name === 'textSize' || name === 'contrast') help();
  }
  const slideTo = (name, n) => { const c = CTL[name]; let d = n - c.idx(G.options); const s = Math.sign(d); for (; d !== 0; d -= s) step(name, s); sync(); };

  // ---- the screens ----------------------------------------------------------------------------------------------------------------------------
  const item = (act, label, { go = false, sub = '', extra = '' } = {}) => `<button type="button" class="f item${go ? ' go' : ''}" data-act="${act}"${extra}><i class="mk"></i><span class="t">${esc(label)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</button>`;
  const tabs = (list, on) => `<div class="tabs" role="tablist">${list.map(([id, name]) => `<button type="button" class="f tab${id === on ? ' on' : ''}" data-act="tab" data-tab="${id}" role="tab" aria-selected="${id === on}">${esc(name)}</button>`).join('')}</div>`;
  const blk = (x, sel) => `<button type="button" class="f blk ${x.kind}${x.n === sel ? ' on' : ''}" data-act="block" data-n="${x.n}" aria-label="Bloco ${x.n}: ${esc(blockLabel(x))}"><span class="n">${x.n}</span>${icon(x.kind)}<span class="lb">${esc(blockLabel(x))}</span></button>`;
  const manager = (blocks, sel, head) => `<div class="mgr"><div class="mgr-hd"><span>${head}</span><span class="free">Blocos livres: <b>${blocks.filter((b) => b.kind === 'empty').length}</b> de ${blocks.length}</span></div>
    <div class="cardgrid">${blocks.map((b) => blk(b, sel)).join('')}</div></div>`;

  function blockInfo(b) {
    let name = blockLabel(b), body = '<span class="dim">Bloco vazio.</span>', go = '';
    if (b.kind === 'run') { name = G.titleOf(b.night, b.scene); body = `Escuta ${Math.round(b.escuta?.value ?? 0)} de 100 · semente ${b.seed}<br><span class="dim">${esc((b.choices ?? []).map((c) => c.label).join(' · ') || 'Nenhuma decisão ainda.')}</span>`; go = item('load', 'Carregar este bloco', { go: true }); }
    else if (b.kind === 'night') { name = `Noite ${b.id.slice(-1)}${b.done ? ' (terminada)' : ' (começada)'}`; body = b.summary ? `Escuta ao fim: ${b.summary.escuta}<br><span class="dim">${esc((b.summary.choices ?? []).join(' · ') || 'Sem decisões registradas.')}</span>` : ''; go = b.start ? item('loadnight', 'Recomeçar desta noite', { go: true, extra: ` data-id="${b.id}"` }) : ''; }
    else if (b.kind === 'other') body = `Lido do mesmo navegador, sem escrever nele.<br><span class="dim">${b.fights !== undefined ? `${b.fights} lutas` : `${b.nights} noites`} · ${b.secrets} segredos</span>`;
    else if (b.kind === 'corrupt') { name = 'Bloco 13'; body = '<span class="warn">Arquivo quebrado. Nem todo arquivo foi salvo.</span>'; }
    else if (b.kind === 'secrets') { name = 'Segredos e finais'; body = `${b.secrets.length} segredos · ${b.endings.length} finais`; }
    else if (b.kind === 'channel') body = '<span class="dim">O bloco do canal.</span>';
    return `<div class="bi ${b.kind}"><div class="big">${icon(b.kind)}</div><div class="tx"><small>Bloco ${b.n}</small><h3>${esc(name)}</h3><p>${body}</p></div></div>${go ? `<div class="acts">${go}</div>` : ''}`;
  }

  const S = {
    title: {
      legend: ['move', 'ok'], closable: false,
      render() {
        const has = G.card.hasRun();
        return `<div class="brand">${LOGO}<p class="sub">Um jogo do canal Arquivo de Salvamento</p></div>
          <nav class="menu">${has ? item('continue', 'Continuar', { go: true, sub: 'bloco 1' }) : ''}${item('new', 'Nova partida', { go: !has })}${item('card', 'Cartão de memória')}${item('options', 'Opções')}${item('commands', 'Comandos')}</nav>
          <p class="lore">Falar no rádio é ser ouvido. Escolha o que dizer, e quanto dizer: às vezes calar é a resposta.</p>`;
      },
      act(a) { if (a === 'continue') A().continueGame(); else if (a === 'new') A().newGame(); else if (a === 'card') open('card', { from: 'title' }); else if (a === 'options') open('options', { from: 'title' }); else if (a === 'commands') open('commands', { from: 'title' }); },
    },
    menu: {
      legend: ['move', 'ok', 'back'], backAct: 'resume', backWord: 'Voltar ao jogo',
      render() {
        const run = G.run(), goal = G.goal?.() ?? '', esc100 = Math.round(G.escuta?.() ?? 0);
        const note = run ? `<aside class="note"><div class="page"><i class="tape"></i>
            <small class="when">${esc(G.sceneTitle())}</small>
            <h4>Objetivo</h4><p class="goal">${goal ? esc(goal) : '<span class="dim">Nada marcado nesta cena. Olhe em volta.</span>'}</p>
            <h4>Escuta</h4><div class="gauge" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${esc100}"><i style="width:${Math.max(0, Math.min(100, esc100))}%"></i></div><p class="gnum">${esc100} de 100</p>
            ${st.args.tip ? '<p class="tip">Este é o menu de pausa. Em <b>Opções</b> ficam o tempo da reação rápida, a paciência das vozes, os clarões, o volume e as legendas. Em <b>Cartão de memória</b>, a partida salva e as noites.</p>' : ''}
            ${DEBUG ? `<p id="menu-seed">Semente da partida: <b>${run.seed}</b> (com ?semente=${run.seed} repete a partida)</p>` : ''}</div></aside>` : '';
        return `<div class="side"><small class="kick">Pausa</small>
          <nav class="menu">${item('resume', 'Continuar', { go: true })}${item('restart', 'Recomeçar a cena', { sub: 'volta ao último salvamento' })}${item('options', 'Opções')}
          <button type="button" class="f item sw${G.options.gore !== false ? ' on' : ''}" data-act="opt" data-o="gore" data-adjust="1" role="switch" aria-checked="${G.options.gore !== false}"><i class="mk"></i><span class="t">Sangue e violência gráfica</span><span class="swt"><b class="lamp"></b><b class="lever"></b></span><span class="state">${yes(G.options.gore !== false)}</span></button>
          ${item('commands', 'Comandos')}${item('card', 'Cartão de memória')}${item('title', 'Voltar ao título')}${item('archive', 'Voltar ao arquivo', { sub: 'menu dos jogos' })}</nav></div>${note}`;
      },
      act(a, b) { if (a === 'resume') close(true); else if (a === 'restart') { close(true); A().restartScene(); } else if (a === 'options') open('options', { from: 'menu' }); else if (a === 'opt') A().toggleOption(b.dataset.o); else if (a === 'commands') open('commands', { from: 'menu' }); else if (a === 'card') open('card', { from: 'menu' }); else if (a === 'title') { close(); A().toTitle(); } else if (a === 'archive') { location.href = '../'; } },
    },
    options: {
      legend: ['move', 'adjust', 'tab', 'ok', 'back'], initial: () => TABS.length,
      render() {
        const tab = st.args.tab ?? TABS[0][0], t = TABS.find((x) => x[0] === tab) ?? TABS[0];
        const rows = t[2].map((n) => (n === '@commands' ? `<button type="button" class="f row btn" data-act="commands"><span class="lab">Ver os comandos</span><span class="ctl"><span class="ar r"></span></span><span class="val">teclado, controle e toque</span></button>` : control(n))).join('');
        return `<header class="hd"><h2>Opções</h2>${tabs(TABS, tab)}</header><div class="list">${rows}</div><p class="help" aria-live="polite"></p>`;
      },
      act(a, b) { if (a === 'opt') adjust(b, b.getAttribute('aria-checked') === 'true' ? -1 : 1); else if (a === 'choose') adjust(b, 1); else if (a === 'commands') open('commands', { from: 'options' }); else if (/^(vol|sens|bright)[+-]$/.test(a)) adjust(b.closest('.row'), a.endsWith('+') ? 1 : -1); },
      pick(e) { help(e); },
    },
    gore: {
      legend: ['move', 'ok'], closable: false,
      render() {
        return `<div class="notice"><div class="warnmark" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M24 4 46 43H2z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M24 17v13M24 34v4" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg></div>
          <div class="body"><h2>Aviso de conteúdo</h2>
          <p>Este jogo é sério e tem cenas de ataque realista, com sangue e violência gráfica: um cão-robô ataca um adulto. É só para adultos.</p>
          <p class="tip">Dá para mudar a qualquer hora, nas <b>Opções</b> ou na <b>Pausa</b>. Desligado, nada de sangue aparece: o ataque corta para o preto antes do impacto, com o som abafado. A morte e o fim de jogo continuam iguais.</p>
          <nav class="menu">${item('gore-on', 'Sangue e violência gráfica: manter ligado', { go: true })}${item('gore-off', 'Desligar sangue e violência gráfica')}</nav></div></div>`;
      },
      act(a) { if (a === 'gore-on') A().goreAnswer(true, st.args.then); else if (a === 'gore-off') A().goreAnswer(false, st.args.then); },
    },
    commands: {
      legend: ['scroll', 'tab', 'back'], scroll: true,
      render() {
        const tab = st.args.tab ?? CMD_TABS[0][0], list = CMD_TABS.find((x) => x[0] === tab) ?? CMD_TABS[0], d = dev(), cur = DEVICE_COL[d] ?? 1;
        const row = (r) => `<div class="cmd"><span class="a">${esc(r[0])}</span>${[1, 2, 3].map((i) => `<span class="c c${i}${i === cur ? ' cur' : ''}">${esc(r[i])}</span>`).join('')}</div>`;
        return `<header class="hd"><h2>Comandos</h2>${tabs(CMD_TABS, tab)}</header>
          <div class="cmd head"><span class="a"></span><span class="c c1${cur === 1 ? ' cur' : ''}">Teclado e mouse</span><span class="c c2${cur === 2 ? ' cur' : ''}">Controle</span><span class="c c3${cur === 3 ? ' cur' : ''}">Toque</span></div>
          <div class="list scroll">${list[2].map(row).join('')}</div>`;
      },
      act() {},
    },
    card: {
      legend: ['move', 'ok', 'back'], wide: true,
      render() {
        const blocks = G.card.blocks(), sel = st.args.block ?? 1;
        return `<header class="hd"><h2>Cartão de memória</h2></header>${manager(blocks, sel, 'Cartão 1')}<section class="cardinfo">${blockInfo(blocks[sel - 1])}</section>
          <p class="foot">O jogo salva no começo de cada cena: é para lá que a morte volta.</p>`;
      },
      act(a, b) { if (a === 'load') { close(true); A().continueGame(); } else if (a === 'loadnight') { close(true); A().loadNight(b.dataset.id); } },
      pick(e) { if (e?.dataset.n) { st.args.block = Number(e.dataset.n); fillInfo(); } },
    },
    cardend: {
      legend: ['move', 'ok'], closable: false, wide: true, initial: () => 12,
      render() {
        const e = st.args, blocks = G.card.blocks(), sel = st.args.sel ?? e.block ?? 13;
        return `<header class="hd"><h2>Noite ${e.night} salva no cartão</h2></header>${manager(blocks, sel, 'Cartão 1')}<section class="cardinfo">${blockInfo(blocks[sel - 1])}</section>
          <p class="cont">Continua.</p><nav class="menu row2">${item('title', 'Voltar ao título', { go: true })}${item('again', 'Jogar a noite 1 de novo')}</nav>`;
      },
      act(a) { if (a === 'again') { close(true); A().newGame(); } else if (a === 'title') { close(true); A().toTitle(); } },
      pick(e) { if (e?.dataset.n) { st.args.sel = Number(e.dataset.n); fillInfo(); } },
    },
    end: {
      legend: ['move', 'ok'], closable: false,
      render() {
        const e = st.args;
        return `<div class="finale"><small class="kick">Sinal de Vida</small><h2>${esc(e.title)}</h2><p>${esc(e.text)}</p><div class="chips">${(e.lines ?? []).map((l) => `<span class="chip">${esc(l)}</span>`).join('')}</div>
          <nav class="menu">${item('again', e.again ?? 'Jogar de novo', { go: true })}${item('title', 'Voltar ao título')}</nav></div>`;
      },
      act(a) { if (a === 'again') { close(true); A().again(st.args); } else if (a === 'title') { close(true); A().toTitle(); } },
    },
  };

  /** The card's block info follows the block the arrows are on (the buttons of the info come after the blocks in the list). */
  function fillInfo() {
    const holder = panel.querySelector('.cardinfo'); if (!holder) return;
    const blocks = G.card.blocks(), n = st.name === 'cardend' ? (st.args.sel ?? st.args.block ?? 13) : (st.args.block ?? 1);
    holder.innerHTML = blockInfo(blocks[n - 1]);
    panel.querySelectorAll('.blk').forEach((b) => b.classList.toggle('on', Number(b.dataset.n) === n));
  }
  function help(e = cur()) { const h = panel.querySelector('.help'); if (!h) return; const c = CTL[e?.dataset?.o]; h.textContent = c ? c.help : e?.dataset.act === 'commands' ? 'Todos os comandos do jogo, para teclado, controle e toque.' : ''; }

  function select(i, { quiet = false } = {}) {
    const b = buttons(); if (!b.length) return;
    i = Math.max(0, Math.min(i, b.length - 1));
    if (i !== st.sel || !b[i].classList.contains('sel')) {
      b[st.sel]?.classList.remove('sel'); st.sel = i; b[i].classList.add('sel');
      if (!quiet) sound('ui-move', 0.4);
    }
    b[i].scrollIntoView?.({ block: 'nearest' });
    S[st.name]?.pick?.(b[i]);
  }
  function renderLegend() {
    const s = S[st.name]; st.dev = dev();
    legendEl.innerHTML = s ? legend(s.legend ?? [], st.dev, { backAct: s.backAct, backWord: s.backWord }) : '';
    el.dataset.dev = st.dev;
  }
  function render() {
    const s = S[st.name]; if (!s) return;
    const top = panel.querySelector('.list')?.scrollTop ?? 0;
    panel.innerHTML = s.render(); panel.classList.toggle('wide', Boolean(s.wide)); panel.dataset.s = st.name; el.dataset.screen = st.name;
    const l = panel.querySelector('.list'); if (l && top) l.scrollTop = top;
    const b = buttons(); st.sel = Math.max(0, Math.min(st.sel, b.length - 1)); b[st.sel]?.classList.add('sel');
    renderLegend(); sync(); S[st.name]?.pick?.(b[st.sel]);
    const tb = panel.querySelector('.tabs'), on = tb?.querySelector('.tab.on'); if (tb && on) tb.scrollLeft = on.offsetLeft - (tb.clientWidth - on.offsetWidth) / 2;       // (on a phone the strip of tabs scrolls: the one that is on is in view)
  }
  /** A screen comes in: the panel slides in a few pixels (from the side it came from) and a streak of static crosses it. */
  function enter(dir) {
    el.dataset.dir = dir;
    for (const n of [panel, legendEl]) { n.classList.remove('in'); void n.offsetWidth; n.classList.add('in'); }
    el.classList.remove('tuning'); void el.offsetWidth; el.classList.add('tuning');
  }
  function open(name, args = {}) {
    if (name === 'menu' && args.tip === undefined) args = { ...args, tip: Boolean(A().menuTip?.()) };
    const fresh = el.hidden || !st.name;
    if (st.name && !el.hidden && name !== st.name) st.stack.push({ name: st.name, args: st.args, sel: st.sel });
    st.name = name; st.args = args; st.sel = 0; el.hidden = false; render();
    const ini = S[name].initial?.(); if (ini !== undefined) select(ini, { quiet: true });
    enter(fresh ? (name === 'title' ? 'fresh' : 'open') : 'fwd'); G.onScreen?.(name, true);
  }
  function close(all = false) {
    const was = st.name;
    if (!all && st.stack.length) { const p = st.stack.pop(); st.name = p.name; st.args = p.args; st.sel = p.sel; render(); enter('back'); return; }
    st.stack = []; el.hidden = true; st.name = null; G.onScreen?.(was, false);
  }
  const back = () => close();
  const tabList = () => (st.name === 'options' ? TABS : st.name === 'commands' ? CMD_TABS : null);
  function activateTab(tab, onTab) {
    st.args.tab = tab; render();
    const b = buttons(), ti = b.findIndex((x) => x.dataset.tab === tab), rows = b.findIndex((x) => !x.classList.contains('tab'));
    select(onTab || rows < 0 ? ti : rows, { quiet: true });
  }

  // ---- the arrows: the nearest thing in that direction ------------------------------------------------------------------------------------------
  function move(dx, dy) {
    const b = buttons(), me = b[st.sel]; if (!me) return;
    const r0 = me.getBoundingClientRect(), cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
    const rest = b.map((o, i) => { const r = o.getBoundingClientRect(); return { i, o, w: r.width, vx: r.left + r.width / 2 - cx, vy: r.top + r.height / 2 - cy }; }).filter((x) => x.o !== me && x.w > 0);
    let best = -1, bs = Infinity;
    for (const x of rest) {
      const along = dy ? x.vy * dy : x.vx * dx, across = dy ? Math.abs(x.vx) : Math.abs(x.vy);
      if (along > 3 && across <= along * 3 + r0.width) { const sc = along + across * 2.2; if (sc < bs) { bs = sc; best = x.i; } }
    }
    // nothing further that way: a list comes round to its other end (the row of the same column that is farthest back)
    if (best < 0 && dy) { const back = rest.filter((x) => x.vy * dy < -3).sort((p, q) => Math.abs(q.vy) - Math.abs(p.vy) || Math.abs(p.vx) - Math.abs(q.vx)); best = back[0]?.i ?? -1; }
    if (best >= 0) select(best);
  }

  // ---- what the person does ---------------------------------------------------------------------------------------------------------------------------
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b || !el.contains(b)) return;
    const a = b.dataset.act; if (a === 'slide') return;
    const s = S[st.name]; if (!s) return;
    const f = b.closest('.f'); if (f && !f.classList.contains('sel')) select(buttons().indexOf(f), { quiet: true });
    if (a === 'resume') { sound('ui-ok', 0.5); close(true); return; }
    if (a === 'back') { sound('ui-voltar', 0.4); back(); return; }
    if (a === 'tab') { sound('ui-aba', 0.5); activateTab(b.dataset.tab, true); return; }
    if (a === 'block') { sound('ui-move', 0.5); if (st.name === 'cardend') st.args.sel = Number(b.dataset.n); else st.args.block = Number(b.dataset.n); fillInfo(); return; }
    if (b.closest('.row') && /^(opt|choose|(vol|sens|bright)[+-])$/.test(a)) { s.act(a, b); return; }
    sound('ui-ok', 0.5);
    s.act(a, b); if (!el.hidden && st.name) { if (a === 'opt') sync(); else render(); }
  });
  el.addEventListener('pointermove', (e) => { const b = e.target.closest('.f'); if (!b || !panel.contains(b) || e.pointerType === 'touch') return; const i = buttons().indexOf(b); if (i >= 0 && i !== st.sel) select(i); });
  // the faders: a finger or the mouse on the track sets the notch
  let drag = null;
  const fromPointer = (tr, e) => { const r = tr.getBoundingClientRect(), n = Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * 10); slideTo(tr.dataset.o, n); };
  el.addEventListener('pointerdown', (e) => { const tr = e.target.closest('.track'); if (!tr) return; const f = tr.closest('.f'); if (f) select(buttons().indexOf(f), { quiet: true }); drag = tr; tr.setPointerCapture?.(e.pointerId); fromPointer(tr, e); sound('ui-move', 0.4); });
  el.addEventListener('pointermove', (e) => { if (drag) fromPointer(drag, e); });
  const endDrag = () => { drag = null; };
  el.addEventListener('pointerup', endDrag); el.addEventListener('pointercancel', endDrag);
  el.addEventListener('wheel', (e) => { const l = e.target.closest('.list.scroll'); if (l) { l.scrollTop += e.deltaY; e.preventDefault(); } }, { passive: false });

  return {
    open, close, refresh: render,
    get isOpen() { return !el.hidden; },
    get current() { return st.name; },
    /** The legend follows the device the person is using (called every step by the game). */
    nav(n) {
      if (el.hidden) return;
      if (st.dev !== dev()) { renderLegend(); if (st.name === 'commands') render(); }
      if (!n) return;
      const s = S[st.name], e = cur();
      if (n.tabL || n.tabR) {
        const list = tabList();
        if (list) { const i = list.findIndex((x) => x[0] === (st.args.tab ?? list[0][0])); const j = (i + (n.tabR ? 1 : -1) + list.length) % list.length; sound('ui-aba', 0.45); activateTab(list[j][0], Boolean(e?.classList.contains('tab'))); return; }
      }
      if (n.dx && e?.dataset.adjust) { adjust(e, n.dx); return; }
      if (s?.scroll && n.dy) { const l = panel.querySelector('.list'); if (l) l.scrollBy?.({ top: n.dy * 64, behavior: 'smooth' }); return; }
      if (n.dx || n.dy) {
        const was = cur(); move(n.dx, n.dy);
        // up from the rows lands on the tab that is on, not on the one nearest to the row
        if (n.dy < 0 && cur()?.classList.contains('tab') && !was?.classList.contains('tab')) { const on = buttons().findIndex((x) => x.classList.contains('tab') && x.classList.contains('on')); if (on >= 0) select(on, { quiet: true }); }
        const now = cur();
        if (n.dx && now?.dataset.tab && tabList() && now.dataset.tab !== (st.args.tab ?? tabList()[0][0])) activateTab(now.dataset.tab, true);
      }
      if (n.ok) { const f = cur(); if (f) f.click(); }
      if (n.back && s?.closable !== false) { sound('ui-voltar', 0.4); if (st.name === 'menu') close(true); else back(); }
    },
  };
}
