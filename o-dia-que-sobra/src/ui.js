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
      <div id="top">
        <div id="calhud" hidden><b></b><span></span><i></i></div>
        <div id="goalhud" hidden></div>
        <div id="objective" hidden></div>
        <div id="total" hidden></div>
        <div id="coach" hidden></div>
        <div id="toast" hidden></div>
      </div>
      <div id="arrow" hidden><i></i></div>
      <div id="carryhint" hidden></div>
      <div id="prompt" hidden><b></b><span></span><em><i></i></em></div>
      <div id="choice" hidden></div>
      <div id="say" hidden><b></b><p></p></div>
      <div id="invstrip" hidden></div>
      <div id="sheet" class="panelbox" hidden></div>
    </div>
    <div id="dlg" hidden><div class="box"><b></b><p></p><small></small></div></div>
    <div id="modal" hidden></div>`);
  const $ = (s) => root.querySelector(s);
  const el = { lid: $('#lid'), black: $('#black'), vig: $('#vig'), hud: $('#hud'), dot: $('#dot'), obj: $('#objective'), total: $('#total'), cal: $('#calhud'), goal: $('#goalhud'), arrow: $('#arrow'), carryhint: $('#carryhint'), prompt: $('#prompt'), choice: $('#choice'), toast: $('#toast'), coach: $('#coach'), say: $('#say'), inv: $('#invstrip'), sheet: $('#sheet'), dlg: $('#dlg'), modal: $('#modal') };
  const pk = { b: el.prompt.querySelector('b'), span: el.prompt.querySelector('span'), bar: el.prompt.querySelector('i'), em: el.prompt.querySelector('em') };
  let sheetOpen = false, trayOpen = false;

  const G = () => ({ // glyphs by device
    tap: { keyboard: 'E', gamepad: 'A', touch: 'TOQUE' }[api.device()] || 'E',
    hold: { keyboard: 'SEGURE E', gamepad: 'SEGURE A', touch: 'SEGURE' }[api.device()] || 'SEGURE E',
  });

  // ------------------------------------------------------------------ HUD pieces
  let lastPrompt = '';
  /**
   * The prompt of the central point. With `p.list` (two or more actions fit the aim) it is a list instead, one short line per action, with the key, the button or
   * the touch area of each: the selected one is what E / A does; the keyboard also has a number for each, and R (RB on the pad) changes the selected one;
   * on the touch screen every line is a button.
   */
  function setPrompt(p) {
    api.onPrompt?.(p);   // the phone's layer shows the same, as buttons by the thumb
    if (!p || !p.text) { if (lastPrompt !== '') { lastPrompt = ''; el.prompt.hidden = true; el.choice.hidden = true; } return; }
    const g = G(), dev = api.device();
    const key = `${p.text}|${p.hold}|${p.active}|${dev}|${p.list ? p.list.map((x) => x.text + x.hold).join('/') + '#' + p.sel : ''}`;
    if (key !== lastPrompt) {
      lastPrompt = key;
      if (p.list) {
        el.prompt.hidden = true; el.choice.hidden = false;
        const glyph = (i, row) => (dev === 'touch' ? '' : i === p.sel ? (row.hold ? g.hold : g.tap) : dev === 'keyboard' ? String(i + 1) : '');
        el.choice.dataset.dev = dev;
        el.choice.innerHTML = p.list.map((row, i) => `<div class="crow${i === p.sel ? ' sel' : ''}" data-i="${i}">${glyph(i, row) ? `<b>${esc(glyph(i, row))}</b>` : ''}<span>${esc(row.text)}${row.hold && dev === 'touch' ? ' (segure)' : ''}</span><em><i></i></em></div>`).join('')
          + (dev === 'touch' ? '' : `<small>${dev === 'gamepad' ? 'RB troca a ação' : 'R troca a ação · 1 a ' + p.list.length + ' escolhem'}</small>`);
      } else {
        el.choice.hidden = true; el.prompt.hidden = false;
        pk.b.textContent = p.hold ? g.hold : g.tap; pk.span.textContent = p.text;
      }
    }
    const show = p.progress !== null && p.progress !== undefined;
    if (p.list) {
      const row = el.choice.querySelector(p.sel >= 0 ? `.crow[data-i="${p.sel}"] em` : '.crow em'), others = el.choice.querySelectorAll('.crow em');
      for (const e of others) e.style.display = 'none';
      if (show && row) { row.style.display = 'block'; row.firstChild.style.width = Math.round(Math.min(1, p.progress) * 100) + '%'; }
    } else {
      pk.em.style.display = show ? 'block' : 'none';
      if (show) pk.bar.style.width = Math.round(Math.min(1, p.progress) * 100) + '%';
    }
  }
  /** Which row of the list of actions is under the screen point (a finger), or null. */
  function choiceRowAt(x, y) {
    if (el.choice.hidden) return null;
    for (const row of el.choice.querySelectorAll('.crow')) { const r = row.getBoundingClientRect(); if (x >= r.left - 4 && x <= r.right + 4 && y >= r.top - 3 && y <= r.bottom + 3) return Number(row.dataset.i); }
    return null;
  }
  function setObjective(t) { if (!t) { el.obj.hidden = true; return; } el.obj.hidden = false; if (el.obj.textContent !== t) el.obj.textContent = t; }
  function setTotal(t) { if (!t) { el.total.hidden = true; return; } el.total.hidden = false; el.total.textContent = 'LEITOR  ' + t; }
  // the top-left of the HUD: the clock (always there, big) and the calendar line under it; the marked goal under both
  const calB = el.cal.querySelector('b'), calS = el.cal.querySelector('span');
  let calT = null, clkT = null;
  const showCal = () => { el.cal.hidden = !calT && !clkT; };
  function setCalendar(t) { calT = t || null; if (calS.textContent !== (t || '')) calS.textContent = t || ''; showCal(); }
  function setClock(t) { clkT = t || null; if (calB.textContent !== (t || '')) calB.textContent = t || ''; showCal(); }
  const calP = el.cal.querySelector('i');
  /** The preparation line under the clock: "PREPARAÇÃO 2:31" (null when the shift is on). */
  function setPrep(t) { const x = t || ''; if (calP.textContent !== x) calP.textContent = x; calP.hidden = !t; }
  function setGoal(t) { if (!t) { el.goal.hidden = true; return; } el.goal.hidden = false; const x = '\u25B6 ' + t; if (el.goal.textContent !== x) el.goal.textContent = x; }
  function setCarryHint(t) { if (!t) { el.carryhint.hidden = true; return; } el.carryhint.hidden = false; if (el.carryhint.textContent !== t) el.carryhint.textContent = t; }
  /** The arrow on the edge of the screen toward a goal that is out of sight: { x, y } in pixels of the root and angle (rad, 0 = up), or null. */
  function setArrow(a) {
    if (!a) { el.arrow.hidden = true; return; }
    el.arrow.hidden = false; el.arrow.style.transform = `translate(${Math.round(a.x)}px, ${Math.round(a.y)}px) rotate(${a.rot.toFixed(3)}rad)`;
  }
  let toastT = 0, coachT = 0;
  function toast(t) { el.toast.textContent = t; el.toast.hidden = false; toastT = 2.6; }
  /** A line of teaching at the bottom of the picture (the first minutes of a new game); lines: [text]. Goes away by itself, or with coach(null). */
  function coach(lines, secs = 14) {
    if (!lines) { coachT = 0; el.coach.hidden = true; return; }
    el.coach.innerHTML = (Array.isArray(lines) ? lines : [lines]).map((l) => `<p>${esc(l)}</p>`).join(''); el.coach.hidden = false; coachT = secs;
  }
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
      if (cell && modal && modal.click) { modal.click(cell, e); e.preventDefault(); }
    };
  }
  function closeModal() {
    if (!modal) return;
    modal.dispose?.();
    modal = null; el.modal.hidden = true; el.modal.innerHTML = ''; api.setModal(false, 'menu');
  }
  function setSel(cells, r, c) {
    for (const row of cells) for (const x of row) x.classList.remove('sel');
    if (cells[r] && cells[r][c]) cells[r][c].classList.add('sel');
  }

  /**
   * A vertical menu. items: [{ label(), act(), adj?(dx), cls? }]. `adj` is what left/right do on that item (a setting); a click or a confirm runs `act`.
   * stats: [[name, value]] shown as a two-column table between the lines and the items (the summary of a night).
   */
  function menu({ title, subtitle, foot, items, onBack, lines, stats, cls = '' }) {
    let sel = 0;
    const html = () => `<div class="screen"><div class="box menu ${cls}">
      <h1>${esc(title)}</h1>${subtitle ? `<h2>${esc(subtitle)}</h2>` : ''}
      ${lines ? `<div class="lines">${(typeof lines === 'function' ? lines() : lines).map((l) => `<p${l === '' ? ' class="gap"' : ''}>${esc(l)}</p>`).join('')}</div>` : ''}
      ${stats ? `<div class="stats">${(typeof stats === 'function' ? stats() : stats).map(([a, b]) => `<span>${esc(a)}</span><b>${esc(b)}</b>`).join('')}</div>` : ''}
      <ul>${items.map((it, i) => `<li data-cell data-i="${i}" class="${i === sel ? 'sel' : ''} ${it.cls || ''}">${esc(it.label())}</li>`).join('')}</ul>
      ${foot ? `<small>${esc(foot())}</small>` : ''}</div></div>`;
    const redraw = () => { el.modal.innerHTML = html(); };
    const h = {
      handle(p) {
        if (p.k === 'nav') {
          if (p.dy) { sel = (sel + p.dy + items.length) % items.length; api.sfx('ui_mover'); redraw(); }
          else if (p.dx && items[sel].adj) { items[sel].adj(p.dx); api.sfx('ui_mover'); redraw(); }
        }
        else if (p.k === 'confirm') { api.sfx('ui_ok'); items[sel].act(); if (modal === h) redraw(); }
        else if ((p.k === 'back' || p.k === 'esc') && onBack) { api.sfx('ui_voltar'); onBack(); }
      },
      // a setting (`adj`): the left third of the line lowers it, the rest raises it; any other line just runs its action
      click(cell, e) {
        sel = Number(cell.dataset.i); api.sfx('ui_ok'); const it = items[sel];
        if (it.adj && e && typeof e.clientX === 'number') { const r = cell.getBoundingClientRect(); it.adj(e.clientX < r.left + r.width / 3 ? -1 : 1); } else it.act();
        if (modal === h) redraw();
      },
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
  // ------------------------------------------------------------------ the desk calculator (1998): seven-segment display, big keys
  const SEG = { a: [3, 2, 9, 2], b: [10, 3, 10, 9], c: [10, 11, 10, 17], d: [3, 18, 9, 18], e: [2, 11, 2, 17], f: [2, 3, 2, 9], g: [3, 10, 9, 10] };
  const LIT = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g', E: 'adefg', ' ': '' };
  /** The LCD of the calculator: `text` is digits, '-', 'E' and '.'; ten cells, the text right-aligned; unlit segments stay faintly visible, like the real glass. */
  function seg7(text, cells = 10) {
    const chars = []; for (const ch of text) { if ((ch === '.' || ch === ',') && chars.length) chars[chars.length - 1].dot = true; else chars.push({ ch: ch === ',' ? '.' : ch, dot: false }); }
    while (chars.length < cells) chars.unshift({ ch: ' ', dot: false });
    return chars.slice(-cells).map(({ ch, dot }) => `<svg viewBox="0 0 14 20" aria-hidden="true">${Object.entries(SEG).map(([k, [x1, y1, x2, y2]]) => `<line class="${(LIT[ch] || '').includes(k) ? 'on' : 'off'}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`).join('')}<circle class="${dot ? 'on' : 'off'}" cx="12.5" cy="18" r="1.2"/></svg>`).join('');
  }
  /** The arithmetic of the calculator, kept apart from the drawing: feed it keys, read `text`. */
  function createCalc() {
    const st = { entry: '0', acc: null, op: null, fresh: true, err: false, shown: '0' };
    const fmt = (v) => { let t = String(Math.round(v * 1e6) / 1e6); if (t.length > 10) t = 'E'; return t; };
    const apply = (a, o, b) => (o === '+' ? a + b : o === '-' ? a - b : o === '*' ? a * b : b === 0 ? NaN : a / b);
    const num = () => Number(st.entry.replace(',', '.')) || 0;
    function key(k) {
      if (st.err && k !== 'C') { if (/[0-9,]/.test(k)) { st.err = false; st.entry = '0'; st.acc = null; st.op = null; st.fresh = true; } else if (k !== '<') return; else return; }
      if (k === 'C') { Object.assign(st, { entry: '0', acc: null, op: null, fresh: true, err: false }); }
      else if (/^[0-9]$/.test(k)) { if (st.fresh) { st.entry = k; st.fresh = false; } else if (st.entry.replace(/[-.]/g, '').length < 9) st.entry = st.entry === '0' ? k : st.entry + k; }
      else if (k === ',' || k === '.') { if (st.fresh) { st.entry = '0.'; st.fresh = false; } else if (!st.entry.includes('.')) st.entry += '.'; }
      else if (k === '<') { if (!st.fresh) { st.entry = st.entry.length > 1 ? st.entry.slice(0, -1) : '0'; if (st.entry === '-' || st.entry === '') st.entry = '0'; } }
      else if (['+', '-', '*', '/'].includes(k)) {
        if (st.op && !st.fresh) { const r = apply(st.acc, st.op, num()); if (!Number.isFinite(r)) { st.err = true; st.entry = 'E'; st.shown = 'E'; return; } st.acc = r; st.entry = fmt(r); } else st.acc = num();
        st.op = k; st.fresh = true;
      } else if (k === '=') {
        if (st.op) { const r = apply(st.acc, st.op, num()); if (!Number.isFinite(r)) { st.err = true; st.entry = 'E'; return; } st.entry = fmt(r); if (st.entry === 'E') st.err = true; st.acc = null; st.op = null; st.fresh = true; }
      }
    }
    return { st, key, get text() { return st.err ? 'E' : st.entry; }, get value() { return st.err ? null : num(); }, get op() { return st.op; } };
  }

  /**
   * A numeric keypad (cents typed in from the right) and, when `calc` is on, a desk calculator beside or under it (opened and closed with its own key, without
   * leaving the keypad). The calculator only helps with the sums: what it shows never goes into the value, which the player types.
   * Focus: with the calculator open, Tab (or LB/RB on a pad) moves the keyboard and the pad between the two; a tap goes where it lands.
   * On the calculator's keys: digits, `,` `.`, + - * / (x too), = or Enter, Backspace, C or Delete, Esc (closes it).
   */
  function keypad({ title, lines = [], pile = [], okLabel = 'CONFIRMAR', backLabel = 'VOLTAR', max = 9999999, onChange = null, calc: withCalc = false }) {
    return new Promise((resolve) => {
      let cents = 0, r = 3, c = 1;
      const grid = [['7', '8', '9'], ['4', '5', '6'], ['1', '2', '3'], ['<', '0', '00']];
      const bottom = withCalc ? ['back', 'calc', 'ok'] : ['back', 'ok'];
      const calc = withCalc ? createCalc() : null;
      const CK = [['C', '<', '/', '*'], ['7', '8', '9', '-'], ['4', '5', '6', '+'], ['1', '2', '3', '='], ['0', ',', '', 'close']];
      const CL = { '/': '÷', '*': '×', '-': '−', '+': '+', '<': '⌫', close: 'FECHAR' };
      let calcOpen = false, focus = 'pad', cr = 1, cc = 0, keyH = null;
      const calcBox = () => `<div class="box calc ${focus === 'calc' ? 'focus' : ''}">
          <div class="lcd" data-v="${esc(calc.text)}" aria-label="calculadora">${seg7(calc.text)}<em>${calc.op ? esc(CL[calc.op]) : ''}</em></div>
          ${CK.map((row, ri) => `<div class="row">${row.map((k, ci) => (k === '' ? '<span></span>' : `<button data-cell data-calc="${k}" class="${focus === 'calc' && cr === ri && cc === ci ? 'sel' : ''} ${/[0-9,]/.test(k) ? 'dg' : k === '=' ? 'eq' : k === 'close' ? 'cl' : 'op'}">${CL[k] || k}</button>`)).join('')}</div>`).join('')}
          <small>Só ajuda nas contas: digite o valor contado ao lado.</small>
        </div>`;
      const draw = () => {
        const label = (k) => (k === 'back' ? esc(backLabel) : k === 'ok' ? esc(okLabel) : calcOpen ? 'FECHAR CALCULADORA' : 'CALCULADORA');
        el.modal.innerHTML = `<div class="screen"><div class="cwrap${calcOpen ? ' calcopen' : ''}"><div class="box keypad ${focus === 'pad' || !calcOpen ? '' : 'dim'}"${shaky()}>
          <h1>${esc(title)}</h1>
          ${lines.map((l) => `<p class="kl">${esc(l)}</p>`).join('')}
          ${pile.length ? `<div class="kpile">${pile.map(([a, b]) => `<span>${esc(a)} <b>${esc(b)}</b></span>`).join('')}</div>` : ''}
          <div class="kdisp">R$ <b class="tr">${S((cents / 100).toFixed(2).replace('.', ','))}</b></div>
          ${grid.map((row, ri) => `<div class="row">${row.map((k, ci) => `<button data-cell data-k="${k}" class="${focus === 'pad' && r === ri && c === ci ? 'sel' : ''}">${k === '<' ? '&lt;' : k}</button>`).join('')}</div>`).join('')}
          <div class="row bottom">${bottom.map((k, i) => `<button data-cell data-k="${k}" class="${k === 'ok' ? 'go' : ''} ${focus === 'pad' && r === 4 && c === i ? 'sel' : ''}">${label(k)}</button>`).join('')}</div>
        </div>${calcOpen ? calcBox() : ''}</div></div>`;
      };
      const closeKeys = () => { if (keyH) document.removeEventListener('keydown', keyH, true); keyH = null; };
      const finish = (v) => { closeKeys(); closeModal(); resolve(v); };
      const press = (k) => {
        if (k === 'ok') { api.sfx('ui_ok'); finish(cents); return; }
        if (k === 'back') { finish(null); return; }
        if (k === 'calc') { calcOpen = !calcOpen; focus = calcOpen ? 'calc' : 'pad'; api.sfx('ui_ok'); draw(); return; }
        if (api.keyFails()) { api.sfx('erro'); draw(); return; }   // the key did not take
        if (k === '<') cents = Math.floor(cents / 10);
        else { const nx = k === '00' ? cents * 100 : cents * 10 + Number(k); if (nx <= max) cents = nx; }
        api.sfx('tecla'); onChange?.(cents); draw();
      };
      const calcPress = (k) => {
        if (k === 'close') { calcOpen = false; focus = 'pad'; api.sfx('ui_voltar'); draw(); return; }
        calc.key(k); api.sfx('tecla'); draw();
      };
      const len = (row) => (row === 4 ? bottom.length : 3);
      // a real keyboard on the calculator: the keys it needs that input.js does not know (+ - * / = , C), and Tab / Esc for the focus; they never reach the game
      if (withCalc) {
        keyH = (e) => {
          if (e.ctrlKey || e.metaKey || e.altKey) return;
          const kk = e.key;
          if (!calcOpen) { if (kk === 'c' || kk === 'C') { press('calc'); e.stopPropagation(); e.preventDefault(); } return; }
          if (kk === 'Tab') { focus = focus === 'calc' ? 'pad' : 'calc'; api.sfx('ui_mover'); draw(); }
          else if (focus !== 'calc') return;
          else if (/^[0-9]$/.test(kk)) calcPress(kk);
          else if (kk === ',' || kk === '.') calcPress(',');
          else if (kk === '+' || kk === '-' || kk === '*' || kk === '/') calcPress(kk);
          else if (kk === 'x' || kk === 'X') calcPress('*');
          else if (kk === '=' || kk === 'Enter') calcPress('=');
          else if (kk === 'Backspace') calcPress('<');
          else if (kk === 'c' || kk === 'C' || kk === 'Delete') calcPress('C');
          else if (kk === 'Escape') { calcOpen = false; focus = 'pad'; api.sfx('ui_voltar'); draw(); }
          else return;
          e.stopPropagation(); e.preventDefault();
        };
        document.addEventListener('keydown', keyH, true);
      }
      const h = {
        handle(p) {
          if (calcOpen && focus === 'calc') {
            // (the pad and the keys that input.js reports; the keyboard's own are in keyH)
            if (p.k === 'nav') { if (p.dy) cr = (cr + p.dy + CK.length) % CK.length; if (p.dx) cc = (cc + p.dx + 4) % 4; if (CK[cr][cc] === '') cc = Math.max(0, cc - 1); api.sfx('ui_mover'); draw(); }
            else if (p.k === 'confirm') calcPress(CK[cr][cc] || '=');
            else if (p.k === 'tab') { focus = 'pad'; draw(); }
            else if (p.k === 'back') calcPress('<');
            else if (p.k === 'esc') { calcOpen = false; focus = 'pad'; api.sfx('ui_voltar'); draw(); }
            return;
          }
          if (p.k === 'nav') {
            if (p.dy) { r = (r + p.dy + 5) % 5; c = Math.min(c, len(r) - 1); }
            if (p.dx) c = (c + p.dx + len(r)) % len(r);
            api.sfx('ui_mover'); draw();
          } else if (p.k === 'confirm') press(r === 4 ? bottom[c] : grid[r][c]);
          else if (p.k === 'digit') press(String(p.d));
          else if (p.k === 'back') press('<');
          else if (p.k === 'tab') { if (calcOpen) { focus = 'calc'; draw(); } }
          else if (p.k === 'esc') press('back');
        },
        click(cell) {
          if (cell.dataset.calc !== undefined) { focus = 'calc'; const k = cell.dataset.calc; const ri = CK.findIndex((row) => row.includes(k)); if (ri >= 0) { cr = ri; cc = CK[ri].indexOf(k); } calcPress(k); return; }
          const k = cell.dataset.k; focus = 'pad';
          if (k === 'ok' || k === 'back' || k === 'calc') { r = 4; c = bottom.indexOf(k); }
          press(k);
        },
        /** For the tests: the calculator's state. */
        calc: calc && { get open() { return calcOpen; }, get focus() { return focus; }, get text() { return calc.text; }, key: calcPress, get cents() { return cents; } },
      };
      h.redraw = draw; h.dispose = closeKeys;
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
    const mark = (key) => (d.goalKey === key ? '\u25B6' : ' ');
    const line = (t, i) => `<li data-g="t:${esc(t.id)}" class="${t.failed ? 'bad' : ''} ${d.goalKey === 't:' + t.id ? 'goal' : ''}">[${mark('t:' + t.id)}] ${esc(slip(t.text, i))}${t.failed ? ' (perdido)' : ''}</li>`;
    const prepRows = pend.filter((t) => t.prep), restRows = pend.filter((t) => !t.prep);
    const tasks = d.blank ? '<li class="dim">…</li>' : restRows.length ? restRows.map(line).join('') : prepRows.length ? '' : '<li class="dim">Nada pendente agora.</li>';
    const doneRows = d.blank ? '' : fin.slice(-3).map((t) => `<li class="ok">[x] ${esc(t.text)}</li>`).join('');
    const orders = d.orders.map((o) => `<li data-g="${esc(o.key)}" class="${d.goalKey === o.key ? 'goal' : ''}">${d.goalKey === o.key ? '\u25B6 ' : ''}${esc(o.text)}</li>`).join('');
    const fuels = d.fuels.map((f) => `<span><i style="background:${f.cor}"></i>${esc(f.nome)}</span>`).join('');
    const p = d.perf;
    // on the phone the clipboard is a sheet from the bottom with three tabs (the night, the week, the nozzles); elsewhere all of it at once
    const tab = (k, t) => `<span data-g="tab:${k}" class="${sheetTab === k ? 'on' : ''}">${t}</span>`;
    el.sheet.dataset.tab = sheetTab;
    el.sheet.innerHTML = `<h3>PRANCHETA</h3><nav class="stabs">${tab('noite', 'NOITE')}${tab('semana', 'SEMANA')}${tab('bicos', 'BICOS')}</nav>
      <section class="s-semana s-noite"><div class="top"><b>${d.time}</b><span>Semana ${d.week} · ${esc(d.cal.dia)} · dia ${d.cal.calDay} de 28</span><span>Carteira <b>${money(d.wallet * 100)}</b></span></div>
      </section><section class="s-semana"><div class="week"><span>${esc(d.cal.weekName)}</span><span>Meta da semana <b>${d.weekNow} / ${d.meta}</b></span><i><u style="width:${Math.round(Math.min(1, d.weekNow / d.meta) * 100)}%"></u></i></div></section>
      <section class="s-noite">${prepRows.length && !d.blank ? `<h4>Preparação <small class="pick">${esc(d.prep ? d.prep.replace('PREPARAÇÃO ', 'faltam ') : 'atrasada')}</small></h4><ul>${prepRows.map(line).join('')}</ul>` : ''}
      <h4>Tarefas <small class="pick">${esc(d.pickHint || '')}</small></h4><ul>${tasks}${doneRows}</ul>${fin.length > 3 ? `<div class="dim">+ ${fin.length - 3} feitas antes</div>` : ''}
      ${orders ? `<h4>Pedidos</h4><ul>${orders}</ul>` : ''}</section>
      <section class="s-bicos"><h4>Bicos</h4><div class="fuels">${fuels}</div></section>
      <section class="s-semana"><h4>Desempenho da noite</h4><div class="perf"><span>Atendimentos ${p.atendimentos}</span><span>Vendas ${p.vendas}</span><span>Abastec. ${p.abastecimentos}</span><span>Tarefas ${p.tarefas}</span><span>Pendentes ${d.undone ?? 0}</span><span>Erros ${p.erros}</span><span>Reclam. ${p.reclamacoes}</span><span>Divergência ${money(p.divergencia)}</span><span>Ocorrências ${p.ocorrencias}</span><b>Pontos ${p.pontos}</b></div></section>`;
  }
  let sheetTab = 'noite';
  /** The clipboard's tab on the phone ('noite' | 'semana' | 'bicos'). */
  function setSheetTab(t) { if (!['noite', 'semana', 'bicos'].includes(t)) return; sheetTab = t; api.sfx?.('papel_folha'); if (sheetOpen) renderSheet(); }
  /** Is the screen point (x, y) on the clipboard, and which goal row is under it ('' when on the sheet but not on a row; null when outside it)? */
  /** Is the screen point (x, y) on the marked goal's strip of the HUD (the phone: a tap there walks to the goal)? */
  function goalAt(x, y) {
    if (el.goal.hidden) return false;
    const b = el.goal.getBoundingClientRect();
    return b.width > 0 && x >= b.left && x <= b.right && y >= b.top - 4 && y <= b.bottom + 4;
  }
  function sheetKeyAt(x, y) {
    if (!sheetOpen) return null;
    const b = el.sheet.getBoundingClientRect(); if (x < b.left || x > b.right || y < b.top || y > b.bottom) return null;
    for (const row of el.sheet.querySelectorAll('[data-g]')) { const r = row.getBoundingClientRect(); if (x >= r.left && x <= r.right && y >= r.top - 3 && y <= r.bottom + 3) return row.dataset.g; }   // (the touch layer is above the sheet: no elementFromPoint)
    return '';
  }
  // a finger on the open clipboard (the phone): its tabs and its goal rows answer directly
  el.sheet.addEventListener('pointerdown', (e) => { const r = e.target.closest('[data-g]'); if (!r) return; e.preventDefault(); api.sheetPick?.(r.dataset.g); });
  function toggleSheet(on) {
    sheetOpen = on ?? !sheetOpen;
    el.sheet.hidden = !sheetOpen;
    if (sheetOpen) { renderSheet(); api.sfx('papel_folha'); }
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
    if (coachT > 0) { coachT -= dt; if (coachT <= 0) el.coach.hidden = true; }
    if (invT > 0) { invT -= dt; if (invT <= 0) el.inv.hidden = true; }
    if (sheetOpen && ((api.tick() % 30) === 0)) renderSheet();
    // the pills mix two digits now and then: redraw the open panel when the window changes
    if (modal?.redraw && api.valuesKey && api.valuesKey() !== lastKey) { lastKey = api.valuesKey(); if (modal.redraw !== undefined && el.modal.querySelector('.tr')) modal.redraw(); }
  }

  // ------------------------------------------------------------------ screens built from the pieces
  // what each control is, by device (the same table the design has in "Comandos")
  const CONTROLS = {
    keyboard: { name: 'TECLADO', rows: [['Andar', 'W A S D'], ['Olhar', 'mouse ou setas'], ['Correr', 'Shift (segurar)'], ['Agachar', 'C'], ['Usar', 'E'], ['Manipular', 'segurar E ou botão esquerdo'], ['Lanterna', 'F'], ['Prancheta', 'Q'], ['Bolso', 'Tab ou 1 a 4'], ['Esconder-se', 'E no esconderijo'], ['Prender o ar', 'Espaço (segurar)'], ['Pausa', 'Esc']] },
    gamepad: { name: 'CONTROLE', rows: [['Andar', 'analógico esquerdo'], ['Olhar', 'analógico direito'], ['Correr', 'LB ou L3 (segurar)'], ['Agachar', 'B'], ['Usar', 'A'], ['Manipular', 'segurar A ou RT'], ['Lanterna', 'Y'], ['Prancheta', 'Select'], ['Bolso', 'direcional'], ['Esconder-se', 'A no esconderijo'], ['Prender o ar', 'X (segurar)'], ['Pausa', 'Start']] },
    touch: { name: 'TOQUE', rows: [['Andar', 'direcional à esquerda'], ['Olhar', 'arrastar a tela'], ['Usar', 'tocar no objeto'], ['Manipular', 'tocar e segurar'], ['Correr', 'botão CORRER'], ['Agachar', 'botão AGACHAR'], ['Lanterna', 'botão LANT.'], ['Prancheta', 'botão PRANCH.'], ['Bolso', 'botão BOLSO'], ['Esconder-se', 'tocar no esconderijo'], ['Pausa', 'botão no canto']] },
  };
  const DEVICES = ['keyboard', 'gamepad', 'touch'];
  function controlsScreen(back) {
    let dev = CONTROLS[api.device()] ? api.device() : 'keyboard';
    const cycle = (d = 1) => { dev = DEVICES[(DEVICES.indexOf(dev) + d + DEVICES.length) % DEVICES.length]; };
    return menu({
      title: 'CONTROLES', cls: 'wide',
      stats: () => CONTROLS[dev].rows,
      lines: ['Segure o botão de usar para o rodo, a reposição e a limpeza. A bomba liga digitando o valor no painel.'],
      items: [{ label: () => `MOSTRAR: ${CONTROLS[dev].name}`, act: () => cycle(1), adj: cycle }, { label: () => 'VOLTAR', act: back }], onBack: back,
    });
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
        stats: rows, cls: 'wide',
        lines: [...extra, week, next, s.saved ? `Salvo no cartão. Semente da noite: ${s.seed}.` : 'Não foi possível salvar no cartão.'],
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
    el, setPrompt, setObjective, setTotal, setCalendar, toast, setFx, say, dialogue, openChange, keypad, menu, coach, setPrep, setClock, setGoal, setCarryHint, setArrow, sheetKeyAt, goalAt, choiceRowAt, controlsScreen, cardScreen, showSummary, showBalance, endingScreen, textPrompt, hookScreen, closeModal,
    toggleSheet, setSheetTab, get sheetOpen() { return sheetOpen; }, get trayOpen() { return trayOpen; }, showInventory, update, handle, dlgAdvance,
    get modalOpen() { return Boolean(modal) || dlg.open; }, get dialogueOpen() { return dlg.open; }, redrawModal: () => modal?.redraw?.(),
    hideHud(h) { el.hud.style.visibility = h ? 'hidden' : ''; el.vig.style.visibility = h ? 'hidden' : ''; },
  };
}
