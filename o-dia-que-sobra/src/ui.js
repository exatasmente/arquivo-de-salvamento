// UIManager: everything the player reads and presses outside the 3D picture, as DOM over the canvas:
// the central point and its prompt, the objective line, dialogue boxes, the clipboard, the change
// tray, the menus (title, pause, controls, memory card) and the end-of-night summary.
//
// Menus and trays are modals: while one is open the game is in 'ui' input mode and the input layer
// sends discrete presses (nav, confirm, back, tab) to `handle`.
import { money } from './util.js';
import { BLOCKS } from './save.js';

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export function createUI(root, api) {
  root.insertAdjacentHTML('beforeend', `
    <div id="vig"></div>
    <div id="lid"><i></i><i></i></div>
    <div id="black"></div>
    <div id="hud">
      <div id="dot"></div>
      <div id="objective" hidden></div>
      <div id="total" hidden></div>
      <div id="calhud" hidden></div>
      <div id="prompt" hidden><b></b><span></span><em><i></i></em></div>
      <div id="toast" hidden></div>
      <div id="say" hidden><b></b><p></p></div>
      <div id="invstrip" hidden></div>
      <div id="sheet" class="panelbox" hidden></div>
    </div>
    <div id="dlg" hidden><div class="box"><b></b><p></p><small></small></div></div>
    <div id="modal" hidden></div>`);
  const $ = (s) => root.querySelector(s);
  const el = { lid: $('#lid'), black: $('#black'), vig: $('#vig'), hud: $('#hud'), dot: $('#dot'), obj: $('#objective'), total: $('#total'), cal: $('#calhud'), prompt: $('#prompt'), toast: $('#toast'), say: $('#say'), inv: $('#invstrip'), sheet: $('#sheet'), dlg: $('#dlg'), modal: $('#modal') };
  const pk = { b: el.prompt.querySelector('b'), span: el.prompt.querySelector('span'), bar: el.prompt.querySelector('i'), em: el.prompt.querySelector('em') };
  let sheetOpen = false, trayOpen = false;

  const G = () => ({ // glyphs by device
    tap: { keyboard: 'E', gamepad: 'A', touch: 'TOQUE' }[api.device()] || 'E',
    hold: { keyboard: 'SEGURE E', gamepad: 'SEGURE A', touch: 'SEGURE' }[api.device()] || 'SEGURE E',
  });

  // ------------------------------------------------------------------ HUD pieces
  let lastPrompt = '';
  function setPrompt(p) {
    if (!p || !p.text) { if (lastPrompt !== '') { lastPrompt = ''; el.prompt.hidden = true; } return; }
    const g = G(), key = `${p.text}|${p.hold}|${p.active}|${api.device()}`;
    if (key !== lastPrompt) {
      lastPrompt = key; el.prompt.hidden = false;
      pk.b.textContent = p.hold ? g.hold : g.tap; pk.span.textContent = p.text;
    }
    const show = p.progress !== null && p.progress !== undefined;
    pk.em.style.display = show ? 'block' : 'none';
    if (show) pk.bar.style.width = Math.round(Math.min(1, p.progress) * 100) + '%';
  }
  function setObjective(t) { if (!t) { el.obj.hidden = true; return; } el.obj.hidden = false; if (el.obj.textContent !== t) el.obj.textContent = t; }
  function setTotal(t) { if (!t) { el.total.hidden = true; return; } el.total.hidden = false; el.total.textContent = 'LEITOR  ' + t; }
  function setCalendar(t) { if (!t) { el.cal.hidden = true; return; } el.cal.hidden = false; if (el.cal.textContent !== t) el.cal.textContent = t; }
  let toastT = 0;
  function toast(t) { el.toast.textContent = t; el.toast.hidden = false; toastT = 2.6; }
  let lastFilter = null, lastLid = -1, lastBlack = -1;
  function setFx({ vignette, aimX, aimY, filter = '', lid = 0, black = 0 }) {
    el.vig.style.opacity = String(Math.round(vignette * 100) / 100);
    el.dot.style.transform = `translate(${Math.round(aimX * 900)}px, ${Math.round(-aimY * 900)}px)`;
    if (filter !== lastFilter) { lastFilter = filter; api.canvas.style.filter = filter; }
    const L = Math.round(lid * 50) / 50;       // eyelids: the share of the height each bar covers, in steps
    if (L !== lastLid) { lastLid = L; el.lid.style.setProperty('--lid', (L * 100) + '%'); el.lid.hidden = L <= 0; }
    const B = Math.round(black * 50) / 50;
    if (B !== lastBlack) { lastBlack = B; el.black.style.opacity = String(B); el.black.hidden = B <= 0; }
  }
  const shaky = () => { const k = api.fx().shake; return k > 0 ? ` style="--sh:${k}px"` : ''; };

  // ------------------------------------------------------------------ non-blocking speech
  const sayBox = { b: el.say.querySelector('b'), p: el.say.querySelector('p'), full: '', n: 0, rate: 30, hold: 0, active: false };
  function say(speaker, text, { seed = 1, ms, self = false } = {}) {
    const dur = api.babble(seed, text, { self });
    sayBox.full = text; sayBox.n = 0; sayBox.rate = Math.max(14, text.length / Math.max(0.6, dur)); sayBox.hold = (ms ?? 2600) / 1000 + dur; sayBox.active = true;
    sayBox.b.textContent = speaker; sayBox.p.textContent = ''; el.say.hidden = false;
  }

  // ------------------------------------------------------------------ blocking dialogue
  const dlg = { b: el.dlg.querySelector('b'), p: el.dlg.querySelector('p'), s: el.dlg.querySelector('small'), lines: [], i: 0, n: 0, rate: 30, done: false, resolve: null, speaker: '', seed: 1, open: false };
  function dialogue(speaker, lines, seed = 1, { self = false } = {}) {
    return new Promise((resolve) => {
      Object.assign(dlg, { lines, i: 0, resolve, speaker, seed, self, open: true });
      el.dlg.hidden = false; api.setModal(true, 'dialogue');
      startLine();
    });
  }
  function startLine() {
    const text = dlg.lines[dlg.i], dur = api.babble(dlg.seed + dlg.i, text, { self: dlg.self });
    dlg.n = 0; dlg.rate = Math.max(14, text.length / Math.max(0.6, dur)); dlg.done = false;
    dlg.b.textContent = dlg.speaker; dlg.p.textContent = ''; dlg.s.textContent = '';
  }
  function dlgAdvance() {
    const text = dlg.lines[dlg.i];
    if (!dlg.done) { dlg.n = text.length; dlg.p.textContent = text; dlg.done = true; dlg.s.textContent = `${api.glyph('tap')} continuar`; return; }
    if (dlg.i + 1 < dlg.lines.length) { dlg.i++; startLine(); return; }
    dlg.open = false; el.dlg.hidden = true; api.setModal(false, 'dialogue');
    const r = dlg.resolve; dlg.resolve = null; r && r();
  }
  el.dlg.addEventListener('pointerdown', (e) => { if (dlg.open) { dlgAdvance(); e.preventDefault(); } });

  // ------------------------------------------------------------------ modals
  let modal = null; // { handle(press), close(), el }
  function showModal(html, handlers) {
    const was = Boolean(modal);
    el.modal.innerHTML = html; el.modal.hidden = false;
    modal = handlers; if (!was) api.setModal(true, 'menu');
    el.modal.onpointerdown = (e) => {
      const cell = e.target.closest('[data-cell]');
      if (cell && modal && modal.click) { modal.click(cell); e.preventDefault(); }
    };
  }
  function closeModal() {
    if (!modal) return;
    modal = null; el.modal.hidden = true; el.modal.innerHTML = ''; api.setModal(false, 'menu');
  }
  function setSel(cells, r, c) {
    for (const row of cells) for (const x of row) x.classList.remove('sel');
    if (cells[r] && cells[r][c]) cells[r][c].classList.add('sel');
  }

  /** A vertical menu. items: [{ label(), act() }]. */
  function menu({ title, subtitle, foot, items, onBack, lines }) {
    let sel = 0;
    const html = () => `<div class="screen"><div class="box menu">
      <h1>${esc(title)}</h1>${subtitle ? `<h2>${esc(subtitle)}</h2>` : ''}
      ${lines ? `<div class="lines">${(typeof lines === 'function' ? lines() : lines).map((l) => `<p>${esc(l)}</p>`).join('')}</div>` : ''}
      <ul>${items.map((it, i) => `<li data-cell data-i="${i}" class="${i === sel ? 'sel' : ''}">${esc(it.label())}</li>`).join('')}</ul>
      ${foot ? `<small>${esc(foot())}</small>` : ''}</div></div>`;
    const redraw = () => { el.modal.innerHTML = html(); };
    const h = {
      handle(p) {
        if (p.k === 'nav') { if (p.dy) { sel = (sel + p.dy + items.length) % items.length; api.sfx('ui_mover'); redraw(); } }
        else if (p.k === 'confirm') { api.sfx('ui_ok'); items[sel].act(); if (modal === h) redraw(); }
        else if ((p.k === 'back' || p.k === 'esc') && onBack) { api.sfx('ui_voltar'); onBack(); }
      },
      click(cell) { sel = Number(cell.dataset.i); api.sfx('ui_ok'); items[sel].act(); if (modal === h) redraw(); },
      redraw,
    };
    showModal(html(), h);
    return h;
  }

  // ------------------------------------------------------------------ change tray
  // stock: what the drawer really has, by value (cents). A value the drawer ran out of cannot be handed back.
  const S = (t) => esc(api.scramble(t));
  function openChange({ total, paid, hint, who, stock }) {
    return new Promise((resolve) => {
      const notes = [200, 500, 1000, 2000, 5000, 10000], coins = [1, 5, 10, 25, 50, 100];
      let given = [], r = 0, c = 0;
      const correct = paid - Math.round(total);
      const sum = () => given.reduce((a, b) => a + b, 0);
      const lab = (v) => (v >= 200 ? `R$ ${v / 100}` : v === 100 ? 'R$ 1' : `0,${String(v).padStart(2, '0')}`);
      const left = (v) => (stock ? (stock[v] || 0) - given.filter((x) => x === v).length : 99);
      const btn = (v, i, row, cls) => `<button data-cell data-v="${v}" class="${cls} ${r === row && c === i ? 'sel' : ''} ${left(v) <= 0 ? 'out' : ''}">${lab(v)}${stock ? `<small>×${left(v)}</small>` : ''}</button>`;
      const draw = () => {
        el.modal.innerHTML = `<div class="screen"><div class="box tray"${shaky()}>
          <h1>TROCO</h1>
          <p class="who">${esc(who || 'Cliente')}</p>
          <div class="sums"><span>Total <b class="tr">${S(money(total))}</b></span><span>Recebido <b class="tr">${S(money(paid))}</b></span>${hint ? `<span class="hint">Troco a dar <b class="tr">${S(money(correct))}</b></span>` : ''}</div>
          <div class="tray">Entregue <b class="tr">${S(money(sum()))}</b><div class="pile">${given.map((v) => `<i class="${v >= 200 ? 'n' : 'm'}">${lab(v)}</i>`).join('')}</div></div>
          <div class="row" data-r="0">${notes.map((v, i) => btn(v, i, 0, 'n')).join('')}</div>
          <div class="row" data-r="1">${coins.map((v, i) => btn(v, i, 1, 'm')).join('')}</div>
          <div class="row" data-r="2"><button data-cell data-a="undo" class="${r === 2 && c === 0 ? 'sel' : ''}">DESFAZER</button><button data-cell data-a="ok" class="go ${r === 2 && c === 1 ? 'sel' : ''}">ENTREGAR</button><button data-cell data-a="close" class="${r === 2 && c === 2 ? 'sel' : ''}">VOLTAR</button></div>
        </div></div>`;
      };
      const lens = [notes.length, coins.length, 3];
      const finish = (v) => { trayOpen = false; closeModal(); resolve(v); };
      const act = (kind, v) => {
        if (kind === 'amt') { if (left(v) <= 0) { api.sfx('erro'); return draw(); } if (api.keyFails()) { api.sfx('erro'); return draw(); } given.push(v); api.sfx(v >= 200 ? 'nota' : 'moeda'); }
        else if (kind === 'undo') { given.pop(); api.sfx('ui_voltar'); }
        else if (kind === 'ok') { api.sfx('gaveta_abre'); finish({ sum: sum(), pieces: [...given] }); return; }
        else if (kind === 'close') { finish(null); return; }
        draw();
      };
      const activate = () => {
        if (r === 0) act('amt', notes[c]); else if (r === 1) act('amt', coins[c]);
        else act(['undo', 'ok', 'close'][c]);
      };
      const h = {
        handle(p) {
          if (p.k === 'nav') { if (p.dy) { r = (r + p.dy + 3) % 3; c = Math.min(c, lens[r] - 1); } if (p.dx) c = (c + p.dx + lens[r]) % lens[r]; api.sfx('ui_mover'); draw(); }
          else if (p.k === 'confirm') activate();
          else if (p.k === 'back' || p.k === 'esc') finish(null);
        },
        click(cell) {
          if (cell.dataset.v) { const v = Number(cell.dataset.v); r = v >= 200 ? 0 : 1; c = (r === 0 ? notes : coins).indexOf(v); act('amt', v); }
          else { c = ['undo', 'ok', 'close'].indexOf(cell.dataset.a); r = 2; act(cell.dataset.a); }
        },
      };
      h.redraw = draw;
      trayOpen = true; showModal('', h); draw();
    });
  }

  // ------------------------------------------------------------------ keypad (counting the drawer)
  // Digits shift in as cents (typing 4 0 0 0 0 gives R$ 400,00). pile: [[label, text]] shown as the drawer's contents.
  function keypad({ title, lines = [], pile = [], okLabel = 'CONFIRMAR', backLabel = 'VOLTAR', max = 9999999, onChange = null }) {
    return new Promise((resolve) => {
      let cents = 0, r = 3, c = 1;
      const grid = [['7', '8', '9'], ['4', '5', '6'], ['1', '2', '3'], ['<', '0', '00']];
      const bottom = ['back', 'ok'];
      const draw = () => {
        el.modal.innerHTML = `<div class="screen"><div class="box keypad"${shaky()}>
          <h1>${esc(title)}</h1>
          ${lines.map((l) => `<p class="kl">${esc(l)}</p>`).join('')}
          ${pile.length ? `<div class="kpile">${pile.map(([a, b]) => `<span>${esc(a)} <b>${esc(b)}</b></span>`).join('')}</div>` : ''}
          <div class="kdisp">R$ <b class="tr">${S((cents / 100).toFixed(2).replace('.', ','))}</b></div>
          ${grid.map((row, ri) => `<div class="row">${row.map((k, ci) => `<button data-cell data-k="${k}" class="${r === ri && c === ci ? 'sel' : ''}">${k === '<' ? '&lt;' : k}</button>`).join('')}</div>`).join('')}
          <div class="row"><button data-cell data-k="back" class="${r === 4 && c === 0 ? 'sel' : ''}">${esc(backLabel)}</button><button data-cell data-k="ok" class="go ${r === 4 && c === 1 ? 'sel' : ''}">${esc(okLabel)}</button></div>
        </div></div>`;
      };
      const press = (k) => {
        if (k === 'ok') { api.sfx('ui_ok'); closeModal(); resolve(cents); return; }
        if (k === 'back') { closeModal(); resolve(null); return; }
        if (api.keyFails()) { api.sfx('erro'); draw(); return; }   // the key did not take
        if (k === '<') cents = Math.floor(cents / 10);
        else { const nx = k === '00' ? cents * 100 : cents * 10 + Number(k); if (nx <= max) cents = nx; }
        api.sfx('tecla'); onChange?.(cents); draw();
      };
      const len = (row) => (row === 4 ? 2 : 3);
      const h = {
        handle(p) {
          if (p.k === 'nav') {
            if (p.dy) { r = (r + p.dy + 5) % 5; c = Math.min(c, len(r) - 1); }
            if (p.dx) c = (c + p.dx + len(r)) % len(r);
            api.sfx('ui_mover'); draw();
          } else if (p.k === 'confirm') press(r === 4 ? bottom[c] : grid[r][c]);
          else if (p.k === 'digit') press(String(p.d));
          else if (p.k === 'back') press('<');
          else if (p.k === 'esc') press('back');
        },
        click(cell) { const k = cell.dataset.k; if (k === 'ok' || k === 'back') { r = 4; c = bottom.indexOf(k); } press(k); },
      };
      h.redraw = draw;
      showModal('', h); draw();
    });
  }

  // ------------------------------------------------------------------ clipboard
  function renderSheet() {
    const d = api.sheetData();
    const pend = d.tasks.filter((t) => !t.done), fin = d.tasks.filter((t) => t.done);
    // hard to concentrate: lines slip away for a moment (the sanity), or the whole list goes and comes back (the pills)
    const hash = (n) => { let x = (n * 2654435761) >>> 0; x ^= x >>> 15; return x >>> 0; };
    const slip = (txt, salt) => {
      if (!d.mind) return txt;
      const slot = Math.floor(api.tick() / 100) + salt * 7;
      return hash(slot) % 100 < d.mind * 55 ? txt.replace(/[A-Za-zÀ-ú]/g, (c, i) => ((i + slot) % 3 === 0 ? '▒' : c)) : txt;
    };
    const line = (t, i) => `<li class="${t.failed ? 'bad' : ''}">[ ] ${esc(slip(t.text, i))}${t.failed ? ' (perdido)' : ''}</li>`;
    const tasks = d.blank ? '<li class="dim">…</li>' : pend.length ? pend.map(line).join('') : '<li class="dim">Nada pendente agora.</li>';
    const doneRows = d.blank ? '' : fin.slice(-3).map((t) => `<li class="ok">[x] ${esc(t.text)}</li>`).join('');
    const orders = d.orders.map((o) => `<li>${esc(o)}</li>`).join('');
    const fuels = d.fuels.map((f) => `<span><i style="background:${f.cor}"></i>${esc(f.nome)}</span>`).join('');
    const p = d.perf;
    el.sheet.innerHTML = `<h3>PRANCHETA</h3>
      <div class="top"><b>${d.time}</b><span>Semana ${d.week} · ${esc(d.cal.dia)} · dia ${d.cal.calDay} de 28</span><span>Carteira <b>${money(d.wallet * 100)}</b></span></div>
      <div class="week"><span>${esc(d.cal.weekName)}</span><span>Meta da semana <b>${d.weekNow} / ${d.meta}</b></span><i><u style="width:${Math.round(Math.min(1, d.weekNow / d.meta) * 100)}%"></u></i></div>
      <h4>Tarefas</h4><ul>${tasks}${doneRows}</ul>${fin.length > 3 ? `<div class="dim">+ ${fin.length - 3} feitas antes</div>` : ''}
      ${orders ? `<h4>Pedidos</h4><ul>${orders}</ul>` : ''}
      <h4>Bicos</h4><div class="fuels">${fuels}</div>
      <h4>Desempenho da noite</h4><div class="perf"><span>Atendimentos ${p.atendimentos}</span><span>Vendas ${p.vendas}</span><span>Abastec. ${p.abastecimentos}</span><span>Tarefas ${p.tarefas}</span><span>Pendentes ${d.undone ?? 0}</span><span>Erros ${p.erros}</span><span>Reclam. ${p.reclamacoes}</span><span>Divergência ${money(p.divergencia)}</span><span>Ocorrências ${p.ocorrencias}</span><b>Pontos ${p.pontos}</b></div>`;
  }
  function toggleSheet(on) {
    sheetOpen = on ?? !sheetOpen;
    el.sheet.hidden = !sheetOpen;
    if (sheetOpen) { renderSheet(); api.sfx('ui_mover'); }
  }

  // ------------------------------------------------------------------ inventory strip
  let invT = 0, lastKey = '';
  function showInventory() {
    const inv = api.inventory();
    el.inv.innerHTML = inv.slots.map((s, i) => `<div class="slot ${i === inv.sel ? 'sel' : ''}"><small>${i + 1}</small><b>${s ? (s === 'lanterna' ? `Lanterna ${inv.flash.on ? 'ligada' : 'apagada'}` : s === 'frasco' ? 'Frasco branco' : s === 'cracha' ? 'Crachá' : 'Pilha') : ''}</b>${s === 'lanterna' ? `<em><i style="width:${Math.round(inv.flash.charge / inv.flash.max * 100)}%"></i></em>` : ''}</div>`).join('') +
      (inv.slots[inv.sel] === 'pilha' ? `<div class="use">${api.glyph('tap')} no vazio: trocar a pilha</div>` : inv.slots[inv.sel] === 'frasco' ? `<div class="use">${api.glyph('tap')} no vazio, duas vezes: tomar um comprimido</div>` : '');
    el.inv.hidden = false; invT = 3.2;
  }

  // ------------------------------------------------------------------ per step
  function update(dt) {
    if (sayBox.active) {
      sayBox.n += sayBox.rate * dt;
      const n = Math.min(sayBox.full.length, Math.floor(sayBox.n));
      const txt = sayBox.full.slice(0, n);
      if (sayBox.p.textContent !== txt) sayBox.p.textContent = txt;
      sayBox.hold -= dt;
      if (sayBox.hold <= 0) { sayBox.active = false; el.say.hidden = true; }
    }
    if (dlg.open && !dlg.done) {
      dlg.n += dlg.rate * dt;
      const text = dlg.lines[dlg.i], n = Math.min(text.length, Math.floor(dlg.n));
      dlg.p.textContent = text.slice(0, n);
      if (n >= text.length) { dlg.done = true; dlg.s.textContent = `${api.glyph('tap')} continuar`; }
    }
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) el.toast.hidden = true; }
    if (invT > 0) { invT -= dt; if (invT <= 0) el.inv.hidden = true; }
    if (sheetOpen && ((api.tick() % 30) === 0)) renderSheet();
    // the pills mix two digits now and then: redraw the open panel when the window changes
    if (modal?.redraw && api.valuesKey && api.valuesKey() !== lastKey) { lastKey = api.valuesKey(); if (modal.redraw !== undefined && el.modal.querySelector('.tr')) modal.redraw(); }
  }

  // ------------------------------------------------------------------ screens built from the pieces
  function controlsLines() {
    const d = api.device();
    if (d === 'gamepad') return ['Andar: analógico esquerdo · Olhar: analógico direito', 'Correr: LB ou L3 (segurar) · Agachar: B', 'Usar: A (toque) · Manipular: segurar A ou RT', 'Lanterna: Y · Prancheta: Select · Bolso: direcional', 'Pausa: Start'];
    if (d === 'touch') return ['Andar: direcional à esquerda · Olhar: arrastar a tela', 'Usar: toque no objeto · Manipular: tocar e segurar', 'Botões: Correr, Agachar, Lanterna, Prancheta, Bolso, pausa'];
    return ['Andar: WASD · Olhar: mouse ou setas · Correr: Shift · Agachar: C', 'Usar: E (toque) · Manipular: segurar E ou botão esquerdo', 'Lanterna: F · Prancheta: Q · Bolso: Tab · Pausa: Esc'];
  }
  function controlsScreen(back) {
    const lines = [...controlsLines(), 'Segure o botão de usar para o rodo, a reposição e a limpeza. A bomba se liga digitando o valor no painel.'];
    return menu({ title: 'CONTROLES', items: [{ label: () => 'VOLTAR', act: back }], onBack: back, lines });
  }
  function cardScreen(card, back) {
    const blocks = card.blocks();
    let r = 0, c = 0;
    const cols = 5;
    const detail = (b) => {
      if (b.kind === 'run') return `BLOCO ${b.n}: ${b.fase === 'folga' ? 'FOLGA DA SEMANA ' + (b.week - 1) : b.fase === 'fim' ? 'FIM DA CAMPANHA' : 'NOITE ' + b.day}. Semana ${b.fase === 'folga' ? b.week - 1 : b.week}. Carteira ${money(b.wallet * 100)}. Sanidade ${b.sanidade ?? '-'}. Metas perdidas ${b.misses ?? 0}. Quedas de sanidade ${b.collapse?.total ?? 0}. Eventos vistos ${(b.eventsSeen || []).length}. Semente ${b.seed}.`;
      if (b.kind === 'night') return `BLOCO ${b.n}: NOITE ${b.day}. ${b.points} pontos, ${b.erros} erros, ${b.abastecimentos} abastecimentos, ${b.vendas} vendas, ${b.tarefas ?? 0} tarefas feitas e ${b.naoFeitas ?? 0} não, ${b.ocorrencias ?? 0} ocorrências, caixa ${b.divergencia ? 'com divergência de ' + money(b.divergencia) : 'batendo'}${b.recorrentes?.length ? ', viu ' + b.recorrentes.join(', ') : ''}. Semente ${b.seed}.`;
      if (b.kind === 'record') return `BLOCO ${b.n}: RECORDE. Melhor noite ${b.best} pontos, ${b.nights} noites feitas, ${b.endings ?? 0} de 5 finais, ${b.secrets} segredos achados.`;
      if (b.kind === 'rinha') return `BLOCO ${b.n}: OUTRO JOGO DO CANAL (Rinha). ${b.fights} lutas guardadas, recorde ${b.best}, ${b.secrets} segredos achados.`;
      if (b.kind === 'corrupt') return `BLOCO ${b.n}: ARQUIVO DANIFICADO. Não dá para ler.`;
      return `BLOCO ${b.n}: vazio.`;
    };
    const icon = (b) => ({ run: 'NOITE', night: 'N' + (b.day ?? ''), record: 'REC', rinha: 'RINHA', corrupt: 'X', empty: '' }[b.kind]);
    const draw = () => {
      el.modal.innerHTML = `<div class="screen"><div class="box card"><h1>CARTÃO DE MEMÓRIA</h1>
        <div class="grid">${blocks.map((b, i) => `<div data-cell data-i="${i}" class="blk ${b.kind} ${i === r * cols + c ? 'sel' : ''}"><small>${b.n}</small><b>${icon(b)}</b></div>`).join('')}</div>
        <p class="detail">${esc(r < BLOCKS / cols ? detail(blocks[r * cols + c]) : 'Voltar.')}</p>
        <ul><li data-cell data-i="back" class="${r === BLOCKS / cols ? 'sel' : ''}">VOLTAR</li></ul></div></div>`;
    };
    const rows = BLOCKS / cols;
    // block 13: broken, until the first ending has been seen; then it opens on a short scene (the hook of the next game)
    const openBlock = (b) => {
      if (b.kind !== 'corrupt') return;
      if (!card.hasEnding?.(1)) { api.sfx('ui_voltar'); return; }
      api.sfx('ui_ok'); hookScreen(() => cardScreen(card, back));
    };
    const h = {
      handle(p) {
        if (p.k === 'nav') { api.sfx('ui_mover'); if (p.dy) r = Math.max(0, Math.min(rows, r + p.dy)); if (p.dx && r < rows) c = (c + p.dx + cols) % cols; draw(); }
        else if (p.k === 'confirm') { if (r === rows) back(); else openBlock(blocks[r * cols + c]); }
        else if (p.k === 'back' || p.k === 'esc') back();
      },
      click(cell) { if (cell.dataset.i === 'back') return back(); const i = Number(cell.dataset.i); const again = r === Math.floor(i / cols) && c === i % cols; r = Math.floor(i / cols); c = i % cols; draw(); if (again) openBlock(blocks[i]); },
    };
    showModal('', h);
    // the "back" row is row 3 (index rows): reuse r === rows
    draw();
    return h;
  }
  function showSummary(s) {
    return new Promise((resolve) => {
      const rows = [
        ['Atendimentos', s.atendimentos], ['Vendas', s.vendas], ['Abastecimentos', s.abastecimentos], ['Tarefas feitas', s.tarefas], ['Tarefas não feitas', s.naoFeitas],
        ['Erros', s.erros], ['Reclamações', s.reclamacoes], ['Divergência de caixa', money(s.divergencia)], ['Ocorrências registradas', s.ocorrencias],
        ['Caixa contado', money(s.caixa)], ['Carteira', money(s.carteira * 100)], ['PONTOS', s.points],
      ];
      const extra = [];
      if (s.recorrentes?.length) extra.push(`Recorrentes vistos: ${s.recorrentes.join(', ')}.`);
      const cal = s.cal;
      const week = s.weekClosed ? `Semana ${cal.week} fechada: ${s.weekPts} de ${s.meta} pontos.` : `Semana ${cal.week}: ${s.weekPts} de ${s.meta} pontos até agora.`;
      const next = s.weekClosed ? (s.last ? 'Depois desta noite, só o dia 28.' : `Amanhã é folga (dia ${cal.calDay + 1}).`) : `Próxima: noite ${s.next} (semana ${Math.floor((s.next - 1) / 6) + 1}).`;
      const done = (v) => () => { closeModal(); resolve(v); };
      const items = s.weekClosed ? [{ label: () => 'CONTINUAR', act: done('next') }, { label: () => 'VOLTAR AO TÍTULO', act: done('title') }]
        : [{ label: () => 'PRÓXIMA NOITE', act: done('next') }, { label: () => 'VOLTAR AO TÍTULO', act: done('title') }];
      menu({
        title: `NOITE ${s.day} FECHADA`, subtitle: `${cal.dia} · dia ${cal.calDay} de 28 · 06:00`,
        lines: [...rows.map(([a, b]) => `${a}: ${b}`), ...extra, week, s.saved ? `Salvo no cartão de memória. Semente da noite: ${s.seed}.` : 'Não foi possível salvar no cartão.', next],
        items, onBack: undefined,
      });
    });
  }
  /** The end of the week: the goal, the salary, what the next step is. Resolves when the player goes on. */
  function showBalance(b) {
    return new Promise((resolve) => {
      menu({
        title: b.title, subtitle: b.sub,
        lines: b.lines,
        items: [{ label: () => b.ok || 'CONTINUAR', act: () => { closeModal(); resolve(); } }],
      });
    });
  }
  /** The screen of an ending: the title of the ending, a line, the count of endings, and the ways on. items: [{ label, act }]. */
  function endingScreen({ title, subtitle, lines, items }) {
    return menu({ title, subtitle, lines, items });
  }
  /** A line of text typed on the on-screen keyboard (or the real one). Resolves to the text, or null when the player goes back. */
  function textPrompt({ title, lines = [], max = 24, okLabel = 'CONFIRMAR', hint = '' }) {
    return new Promise((resolve) => {
      const ROWS = [['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'], ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'], ['K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'], ['U', 'V', 'W', 'X', 'Y', 'Z', '/', ' ', '<']];
      let typed = '', r = 0, c = 0, keyH = null;
      const done = (v) => { if (keyH) document.removeEventListener('keydown', keyH, true); keyH = null; closeModal(); resolve(v); };
      const draw = () => {
        el.modal.innerHTML = `<div class="screen"><div class="box keypad"><h1>${esc(title)}</h1>
          ${lines.map((l) => `<p class="kl">${esc(l)}</p>`).join('')}
          <div class="kdisp"><b>${esc(typed)}</b><span class="cur">_</span></div>
          ${ROWS.map((row, ri) => `<div class="row">${row.map((k, ci) => `<button data-cell data-k="${k}" class="${r === ri && c === ci ? 'sel' : ''}">${k === '<' ? '&lt;' : k === ' ' ? '&#9141;' : k}</button>`).join('')}</div>`).join('')}
          <div class="row"><button data-cell data-k="back" class="${r === 4 && c === 0 ? 'sel' : ''}">VOLTAR</button><button data-cell data-k="ok" class="go ${r === 4 && c === 1 ? 'sel' : ''}">${esc(okLabel)}</button></div>
          ${hint ? `<small>${esc(hint)}</small>` : ''}</div></div>`;
      };
      const press = (k) => {
        if (k === 'ok') { api.sfx('ui_ok'); done(typed); return; }
        if (k === 'back') { api.sfx('ui_voltar'); done(null); return; }
        if (k === '<') typed = typed.slice(0, -1); else if (typed.length < max) typed += k;
        api.sfx('tecla'); draw();
      };
      const len = (row) => (row === 4 ? 2 : ROWS[row].length);
      const h = {
        handle(p) {
          if (p.k === 'nav') { if (p.dy) { r = (r + p.dy + 5) % 5; c = Math.min(c, len(r) - 1); } if (p.dx) c = (c + p.dx + len(r)) % len(r); api.sfx('ui_mover'); draw(); }
          else if (p.k === 'confirm') press(r === 4 ? ['back', 'ok'][c] : ROWS[r][c]);
          else if (p.k === 'back' || p.k === 'esc') press('back');
        },
        click(cell) { const k = cell.dataset.k; if (k === 'ok' || k === 'back') { r = 4; c = ['back', 'ok'].indexOf(k); } press(k); },
        redraw: draw,
      };
      // a real keyboard types straight into the field and never reaches the game's keys
      keyH = (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key === 'Backspace') press('<');
        else if (e.key === 'Enter') press('ok');
        else if (e.key.length === 1 && /[A-Za-zÀ-ÿ 0-9/]/.test(e.key)) press(e.key.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase());
        else return;
        e.stopPropagation(); e.preventDefault();
      };
      document.addEventListener('keydown', keyH, true);
      showModal('', h); draw();
    });
  }
  /** The hook of the next game (block 13 of the card, after the first ending): a short scene, an image and almost no text. */
  function hookScreen(back) {
    const cv = document.createElement('canvas'); cv.width = 160; cv.height = 90; cv.className = 'hook';
    const g = cv.getContext('2d');
    // a lake before dawn, in a few flat bands, and a rod's line that goes in and does not come back
    const sky = ['#10141f', '#1a2030', '#2a2c3c', '#4a3a40', '#7a5a48'];
    sky.forEach((c, i) => { g.fillStyle = c; g.fillRect(0, i * 11, 160, 12); });
    g.fillStyle = '#e0b86a'; g.fillRect(104, 46, 10, 8); g.fillStyle = '#ffd88a'; g.fillRect(106, 48, 6, 4);
    g.fillStyle = '#0c1018'; g.fillRect(0, 56, 160, 34);
    for (let i = 0; i < 9; i++) { g.fillStyle = i % 2 ? '#1a2234' : '#222c40'; g.fillRect(8 + i * 17, 60 + (i * 7) % 24, 12 + (i * 5) % 14, 1); }
    g.fillStyle = '#05070b'; g.fillRect(0, 50, 160, 6); g.fillRect(20, 40, 3, 12); g.fillRect(14, 36, 14, 2);
    g.strokeStyle = '#c9c0a0'; g.lineWidth = 1; g.beginPath(); g.moveTo(112, 18); g.lineTo(112, 64); g.stroke();
    g.fillStyle = '#c9c0a0'; g.fillRect(111, 64, 3, 1);
    g.strokeStyle = '#3a2c20'; g.lineWidth = 2; g.beginPath(); g.moveTo(112, 18); g.lineTo(150, 6); g.stroke();
    const h = { handle(p) { if (p.k === 'confirm' || p.k === 'back' || p.k === 'esc') back(); }, click() { back(); }, redraw() {} };
    showModal('', h);
    el.modal.innerHTML = '<div class="screen"><div class="box menu hookbox"><h1>ARQUIVO 13</h1><div class="hookimg"></div><div class="lines"><p>A água não se mexe.</p><p>A linha desceu e não voltou.</p></div><ul><li data-cell data-i="0" class="sel">VOLTAR</li></ul></div></div>';
    el.modal.querySelector('.hookimg').appendChild(cv);
  }

  function handle(p) {
    if (dlg.open) { if (p.k === 'confirm') dlgAdvance(); return true; }
    if (modal) { modal.handle(p); return true; }
    return false;
  }
  return {
    el, setPrompt, setObjective, setTotal, setCalendar, toast, setFx, say, dialogue, openChange, keypad, menu, controlsScreen, cardScreen, showSummary, showBalance, endingScreen, textPrompt, hookScreen, closeModal,
    toggleSheet, get sheetOpen() { return sheetOpen; }, get trayOpen() { return trayOpen; }, showInventory, update, handle, dlgAdvance,
    get modalOpen() { return Boolean(modal) || dlg.open; }, get dialogueOpen() { return dlg.open; }, redrawModal: () => modal?.redraw?.(),
    hideHud(h) { el.hud.style.visibility = h ? 'hidden' : ''; el.vig.style.visibility = h ? 'hidden' : ''; },
  };
}
