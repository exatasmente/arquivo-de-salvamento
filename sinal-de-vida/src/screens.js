// The screens that are not the radio: the title, the pause menu, the options, the card, the commands and the end of a night.
// Plain DOM over the game; the arrows, Enter, Esc, the pad and the touch all move the same list of buttons (`nav`).
import { esc } from './ui.js';

const QUICK_NAMES = { normal: 'Normal (1,2 s)', long: 'Mais tempo (2,4 s)', off: 'Desligada (sempre acerta)' };
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
  ['Emenda, esquivar quando o cão salta', '← ou → (também A, D)', 'direcional ← →', 'botões ◀ ▶ ao lado de Usar'],
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

export function createScreens(root, G) {
  const el = document.createElement('div'); el.id = 'screens'; el.hidden = true;
  el.innerHTML = '<div class="shade"></div><div class="panel"></div>';
  root.appendChild(el);
  const panel = el.querySelector('.panel');
  const st = { name: null, args: {}, sel: 0, stack: [] };
  const A = () => G.actions;
  // the list the arrows walk: the close button (✗) is last, so the first thing selected is the first choice
  const buttons = () => { const all = [...panel.querySelectorAll('.f')], main = all.filter((b) => !b.classList.contains('x')); return [...main, ...all.filter((b) => b.classList.contains('x'))]; };
  const opt = (name, label, value) => `<button type="button" class="f" data-act="opt" data-o="${name}">${esc(label)}: <b>${esc(value)}</b></button>`;
  const yes = (v) => (v ? 'sim' : 'não');

  const S = {
    title: {
      render() {
        const has = G.card.hasRun();
        return `<h1>SINAL DE VIDA</h1><p class="sub">Um jogo do canal Arquivo de Salvamento</p>
          <p class="lore">Falar no rádio é ser ouvido. Escolha o que dizer, e quanto dizer: às vezes calar é a resposta.</p>
          <div class="col">${has ? '<button type="button" class="f go" data-act="continue">Continuar (bloco 1)</button>' : ''}
          <button type="button" class="f${has ? '' : ' go'}" data-act="new">Nova partida</button>
          <button type="button" class="f" data-act="card">Cartão de memória</button>
          <button type="button" class="f" data-act="options">Opções</button>
          <button type="button" class="f" data-act="commands">Comandos</button></div>`;
      },
      act(a) { if (a === 'continue') A().continueGame(); else if (a === 'new') A().newGame(); else if (a === 'card') open('card', { from: 'title' }); else if (a === 'options') open('options', { from: 'title' }); else if (a === 'commands') open('commands', { from: 'title' }); },
      closable: false,
    },
    menu: {
      render() {
        const run = G.run();
        return `<div class="hd"><h2>Pausa</h2><button type="button" class="f x" data-act="resume" aria-label="Voltar">✗</button></div>
          <p class="dim">${run ? `${esc(G.sceneTitle())}` : ''}</p>
          ${st.args.tip ? '<p class="tip">Este é o menu de pausa. Em <b>Opções</b> ficam o tempo da reação rápida, a paciência das vozes, os clarões, o volume e as legendas. Em <b>Cartão de memória</b>, a partida salva e as noites.</p>' : ''}
          <div class="col"><button type="button" class="f go" data-act="resume">Continuar</button>
          <button type="button" class="f" data-act="restart">Recomeçar a cena (volta ao último salvamento)</button>
          <button type="button" class="f" data-act="options">Opções</button>
          <button type="button" class="f" data-act="commands">Comandos</button>
          <button type="button" class="f" data-act="card">Cartão de memória</button>
          <button type="button" class="f" data-act="title">Voltar ao título</button>
          <button type="button" class="f" data-act="archive">Voltar ao arquivo (menu dos jogos)</button></div>
          <p id="menu-seed">${run ? `Semente da partida: <b>${run.seed}</b> (com ?semente=${run.seed} repete a partida)` : ''}</p>`;
      },
      act(a) { if (a === 'resume') close(); else if (a === 'restart') { close(); A().restartScene(); } else if (a === 'options') open('options', { from: 'menu' }); else if (a === 'commands') open('commands', { from: 'menu' }); else if (a === 'card') open('card', { from: 'menu' }); else if (a === 'title') { close(); A().toTitle(); } else if (a === 'archive') { location.href = '../'; } },
    },
    options: {
      render() {
        const o = G.options;
        return `<div class="hd"><h2>Opções</h2><button type="button" class="f x" data-act="back" aria-label="Voltar">✗</button></div>
          <div class="col">${opt('quick', 'Reação rápida', QUICK_NAMES[o.quick])}
          ${opt('patience', 'Paciência das vozes', o.patience ? 'Maior (o dobro)' : 'Normal')}
          ${opt('flashes', 'Reduzir clarões', yes(o.flashes))}
          <div class="row"><span class="nm">Volume: <b>${o.volume}</b> de 10</span><button type="button" class="f x" data-act="vol-" aria-label="Baixar o volume">−</button><button type="button" class="f x" data-act="vol+" aria-label="Subir o volume">+</button></div>
          ${opt('captions', 'Legendas', yes(o.captions))}
          <div class="row"><span class="nm">Sensibilidade do olhar: <b>${o.sens.toFixed(1)}</b></span><button type="button" class="f x" data-act="sens-">−</button><button type="button" class="f x" data-act="sens+">+</button></div>
          ${opt('invert', 'Inverter o olhar vertical', yes(o.invert))}</div>
          <p class="dim">Reação rápida: o botão Reagir tem um anel que fecha; "Desligada" acerta sempre. Paciência maior: o chiado das vozes demora o dobro para sumir.</p>`;
      },
      act(a, b) { if (a === 'back') back(); else if (a === 'opt') A().toggleOption(b.dataset.o); else if (a === 'vol-') A().volume(-1); else if (a === 'vol+') A().volume(1); else if (a === 'sens-') A().sens(-1); else if (a === 'sens+') A().sens(1); },
    },
    commands: {
      render() {
        const rows = (list) => list.map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td><td>${esc(r[3])}</td></tr>`).join('');
        return `<div class="hd"><h2>Comandos</h2><button type="button" class="f x" data-act="back" aria-label="Voltar">✗</button></div>
          <table class="keys"><thead><tr><th>Andar e examinar</th><th>Teclado e mouse</th><th>Controle</th><th>Toque</th></tr></thead><tbody>${rows(COMMANDS)}</tbody>
          <thead><tr><th>No rádio da estação</th><th>Teclado e mouse</th><th>Controle</th><th>Toque</th></tr></thead><tbody>${rows(RADIO_COMMANDS)}</tbody></table>`;
      },
      act(a) { if (a === 'back') back(); },
      wide: true,
    },
    card: {
      render() {
        const blocks = G.card.blocks(), sel = st.args.block ?? 1, b = blocks[sel - 1];
        const cell = (x) => {
          const kind = x.kind, label = kind === 'run' ? 'Partida' : kind === 'night' ? `Noite ${x.id.slice(-1)}` : kind === 'other' ? x.game : kind === 'corrupt' ? 'Quebrado' : kind === 'channel' ? 'O canal' : kind === 'secrets' ? 'Segredos' : 'Vazio';
          return `<button type="button" class="f blk ${kind}${x.n === sel ? ' on' : ''}" data-act="block" data-n="${x.n}"><span class="n">${x.n}</span><span>${esc(label)}</span></button>`;
        };
        let info = '<span class="dim">Bloco vazio.</span>', go = '';
        if (b.kind === 'run') { info = `<b>${esc(G.titleOf(b.night, b.scene))}</b><br>Escuta ${Math.round(b.escuta?.value ?? 0)} de 100 · semente ${b.seed}<br><span class="dim">${esc((b.choices ?? []).map((c) => c.label).join(' · ') || 'Nenhuma decisão ainda.')}</span>`; go = '<button type="button" class="f go" data-act="load">Carregar este bloco</button>'; }
        else if (b.kind === 'night') { info = `<b>Noite ${b.id.slice(-1)}</b>${b.done ? ' (terminada)' : ' (começada)'}<br>${b.summary ? `Escuta ao fim: ${b.summary.escuta}<br><span class="dim">${esc((b.summary.choices ?? []).join(' · ') || 'Sem decisões registradas.')}</span>` : ''}`; go = b.start ? '<button type="button" class="f go" data-act="loadnight" data-id="' + b.id + '">Recomeçar desta noite</button>' : ''; }
        else if (b.kind === 'other') info = `<b>${esc(b.game)}</b><br>Lido do mesmo navegador, sem escrever nele.<br><span class="dim">${b.fights !== undefined ? `${b.fights} lutas` : `${b.nights} noites`} · ${b.secrets} segredos</span>`;
        else if (b.kind === 'corrupt') info = '<b>Bloco 13</b><br><span class="warn">Arquivo quebrado. Nem todo arquivo foi salvo.</span>';
        else if (b.kind === 'secrets') info = `<b>Segredos e finais</b><br>${b.secrets.length} segredos · ${b.endings.length} finais`;
        return `<div class="hd"><h2>Cartão de memória</h2><button type="button" class="f x" data-act="back" aria-label="Voltar">✗</button></div>
          <div class="cardgrid">${blocks.map(cell).join('')}</div><div class="cardinfo">${info}</div><div class="row">${go}</div>
          <p class="dim">O jogo salva no começo de cada cena: é para lá que a morte volta.</p>`;
      },
      act(a, b) { if (a === 'back') back(); else if (a === 'block') { st.args.block = Number(b.dataset.n); render(); } else if (a === 'load') { close(true); A().continueGame(); } else if (a === 'loadnight') { close(true); A().loadNight(b.dataset.id); } },
      wide: true,
    },
    cardend: {
      render() {
        const e = st.args, blocks = G.card.blocks(), sel = st.args.sel ?? e.block ?? 13, b = blocks[sel - 1];
        const cell = (x) => {
          const kind = x.kind, label = kind === 'run' ? 'Partida' : kind === 'night' ? `Noite ${x.id.slice(-1)}` : kind === 'other' ? x.game : kind === 'corrupt' ? 'Quebrado' : kind === 'channel' ? 'O canal' : kind === 'secrets' ? 'Segredos' : 'Vazio';
          return `<button type="button" class="f blk ${kind}${x.n === sel ? ' on' : ''}" data-act="block" data-n="${x.n}"><span class="n">${x.n}</span><span>${esc(label)}</span></button>`;
        };
        const info = b.kind === 'corrupt' ? '<b>Bloco 13</b><br><span class="warn">Arquivo quebrado. Nem todo arquivo foi salvo.</span>' : b.kind === 'night' ? `<b>Noite ${b.id.slice(-1)} salva</b><br>Escuta ao fim: ${b.summary?.escuta ?? e.escuta}` : b.kind === 'run' ? '<b>Partida</b><br>Salva no começo de cada cena.' : '<span class="dim">Bloco vazio.</span>';
        return `<h2>Noite ${e.night} salva no cartão</h2><div class="cardgrid">${blocks.map(cell).join('')}</div><div class="cardinfo">${info}</div>
          <p class="cont">Continua.</p><div class="col"><button type="button" class="f go" data-act="title">Voltar ao título</button><button type="button" class="f" data-act="again">Jogar a noite 1 de novo</button></div>`;
      },
      act(a, b) { if (a === 'block') { st.args.sel = Number(b.dataset.n); render(); } else if (a === 'again') { close(true); A().newGame(); } else if (a === 'title') { close(true); A().toTitle(); } },
      wide: true, closable: false,
    },
    end: {
      render() {
        const e = st.args;
        return `<h2>${esc(e.title)}</h2><p>${esc(e.text)}</p><div class="chips">${(e.lines ?? []).map((l) => `<span class="chip">${esc(l)}</span>`).join('')}</div>
          <div class="col"><button type="button" class="f go" data-act="again">${esc(e.again ?? 'Jogar de novo')}</button><button type="button" class="f" data-act="title">Voltar ao título</button></div>`;
      },
      act(a) { if (a === 'again') { close(true); A().again(st.args); } else if (a === 'title') { close(true); A().toTitle(); } },
      closable: false,
    },
  };

  function render() {
    const s = S[st.name]; if (!s) return;
    panel.innerHTML = s.render(); panel.classList.toggle('wide', Boolean(s.wide));
    const b = buttons(); st.sel = Math.max(0, Math.min(st.sel, b.length - 1)); b[st.sel]?.classList.add('sel');
  }
  function open(name, args = {}) {
    if (name === 'menu' && args.tip === undefined) args = { ...args, tip: Boolean(A().menuTip?.()) };
    if (st.name && !el.hidden && name !== st.name) st.stack.push({ name: st.name, args: st.args, sel: st.sel });
    st.name = name; st.args = args; st.sel = 0; el.hidden = false; render(); G.onScreen?.(name, true);
  }
  function close(all = false) {
    const was = st.name;
    if (!all && st.stack.length) { const p = st.stack.pop(); st.name = p.name; st.args = p.args; st.sel = p.sel; render(); return; }
    st.stack = []; el.hidden = true; st.name = null; G.onScreen?.(was, false);
  }
  const back = () => close();
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('.f'); if (!b) return;
    const a = b.dataset.act; if (!a) return;
    G.audio.play('ui-ok', { gain: 0.5 });
    const s = S[st.name];
    if (a === 'resume') { close(true); return; }
    if (a === 'back') { back(); return; }
    s.act(a, b); if (!el.hidden && st.name) render();
  });
  panel.addEventListener('pointermove', (e) => { const b = e.target.closest('.f'); if (!b) return; const i = buttons().indexOf(b); if (i >= 0 && i !== st.sel) { buttons()[st.sel]?.classList.remove('sel'); st.sel = i; b.classList.add('sel'); } });
  return {
    open, close, refresh: render,
    get isOpen() { return !el.hidden; },
    get current() { return st.name; },
    nav(n) {
      if (!n || el.hidden) return;
      const b = buttons(); if (!b.length) return;
      if (n.dy || n.dx) { b[st.sel]?.classList.remove('sel'); st.sel = (st.sel + (n.dy || n.dx) + b.length) % b.length; b[st.sel].classList.add('sel'); b[st.sel].scrollIntoView?.({ block: 'nearest' }); G.audio.play('ui-move', { gain: 0.4 }); }
      if (n.ok) b[st.sel]?.click();
      if (n.back && S[st.name]?.closable !== false) { if (st.name === 'menu') close(true); else back(); }
    },
  };
}
