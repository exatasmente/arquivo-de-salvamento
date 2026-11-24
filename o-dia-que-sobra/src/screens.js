// The screens that are not the world: the title, the pause, the options, the controls, the memory card, the end of a night (the register tape), the week's
// balance and the endings. They are made of DOM over the picture and drawn as the material of the Posto Bom Dia chain, 1998: the brand manual's type, the
// punch card on its clipboard, the breaker panel of the options, the tape of the register.
// One list of focusable things (`[data-cell]`) serves the arrows, Enter, Esc, Tab, the pad and the touch; the mark of the chosen one is `.sel`, set by the
// keyboard, the pad and the pointer alike (never the browser's focus). The look is in menus.css; the pieces drawn in code are in ui-art.js.
// `createScreens(X)`: X is what ui.js lends (the modal layer, the api of the game, `esc`, `seg7`, `money`).
import { solSvg, MARK, logo, icon, legend, keycaps } from './ui-art.js';

const SLOGAN = 'Um novo dia sempre começa com um sorriso!';

export function createScreens(X) {
  const { api, esc, seg7, money, BLOCKS } = X;
  const M = () => X.el.modal;
  const dev = () => api.device();
  const week = () => (api.week ? api.week() : 1);
  const val = (v) => (typeof v === 'function' ? v() : v);

  /** Keeps the chosen thing in view inside the scroller it lives in (never scrolls the page: the screens clip). */
  function reveal(elm) {
    const sc = elm?.closest('[data-scroll], .box'); if (!sc) return;
    const r = elm.getBoundingClientRect(), b = sc.getBoundingClientRect();
    if (r.top < b.top + 8) sc.scrollTop -= b.top + 8 - r.top; else if (r.bottom > b.bottom - 8) sc.scrollTop += r.bottom - b.bottom + 8;
  }
  /** The nearest cell in a direction (the arrows over a grid, tabs and rows). */
  function nearest(cells, me, dx, dy) {
    const r0 = me.getBoundingClientRect(), cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
    const rest = cells.map((o, i) => { const r = o.getBoundingClientRect(); return { i, o, w: r.width, vx: r.left + r.width / 2 - cx, vy: r.top + r.height / 2 - cy }; }).filter((x) => x.o !== me && x.w > 0);
    let best = -1, bs = Infinity;
    for (const x of rest) {
      const along = dy ? x.vy * dy : x.vx * dx, across = dy ? Math.abs(x.vx) : Math.abs(x.vy);
      if (along > 3 && across <= along * 3 + r0.width) { const sc = along + across * 2.2; if (sc < bs) { bs = sc; best = x.i; } }
    }
    if (best < 0 && dy) { const back = rest.filter((x) => x.vy * dy < -3).sort((p, q) => Math.abs(q.vy) - Math.abs(p.vy) || Math.abs(p.vx) - Math.abs(q.vx)); best = back[0]?.i ?? -1; }
    return best;
  }

  /** The frame every screen shares: the dimmed ground, the grain, the column (`.box`), what stands beside it, and the legend of the device in use. */
  function shell({ kind, cls = '', body, side = '', lg, backWord, fresh, data = '' }) {
    return `<div class="screen scr scr-${kind}${fresh ? ' enter' : ''}" data-kind="${kind}" ${data}><div class="bg"></div><div class="grain"></div>
      <div class="box ${cls}">${body}</div>${side}<div class="legend" data-dev="${dev()}">${legend(lg, dev(), { backWord })}</div></div>`;
  }

  // ------------------------------------------------------------------------------------------------------------------------------ the list menu
  /**
   * A vertical menu. items: [{ label(), sub?, act(), adj?(dx), cls? }]. `adj` is what left/right do on that item (a setting). `lines`, `stats`, `foot`, `side` may be
   * functions. kind: 'menu' | 'title' (the logotype and the slogan instead of the heading) | 'pause' | 'controls' | 'tape' | 'slip' | 'end'. Returns the handlers
   * of the modal (a module that takes the screen over may replace `handle`, `click` and `redraw`).
   */
  function menu({ title, subtitle, foot, items, onBack, lines, stats, cls = '', kind = 'menu', side, extra = '', backWord }) {
    let sel = Math.max(0, items.findIndex((i) => !i.off)), fresh = true;
    const li = (it, i) => `<li data-cell data-i="${i}" class="${i === sel ? 'sel ' : ''}${it.cls || ''}">${MARK}<span class="t">${esc(it.label())}</span>${it.sub ? `<small>${esc(val(it.sub))}</small>` : ''}</li>`;
    const body = () => {
      const ls = val(lines), st = val(stats);
      const top = kind === 'title'
        ? `<h1 class="brand">${logo({ week: week() })}<span class="sr">${esc(title)}</span></h1><h2 class="slogan">${esc(subtitle || SLOGAN)}</h2>`
        : `<h1>${esc(title)}</h1>${subtitle ? `<h2>${esc(subtitle)}</h2>` : ''}`;
      return `${top}${ls ? `<div class="lines">${ls.map((l) => `<p${l === '' ? ' class="gap"' : ''}>${esc(l)}</p>`).join('')}</div>` : ''}
        ${st ? `<div class="stats">${st.map(([a, b]) => `<span>${esc(a)}</span><b>${kind === 'controls' ? keycaps(b, esc) : esc(b)}</b>`).join('')}</div>` : ''}
        ${extra}<ul>${items.map(li).join('')}</ul>${foot ? `<small class="foot">${esc(val(foot))}</small>` : ''}`;
    };
    const html = () => shell({ kind, cls: `menu ${cls}`, body: body(), side: val(side) || '', lg: onBack ? ['move', 'ok', 'back'] : ['move', 'ok'], backWord, fresh });
    const redraw = () => { M().innerHTML = html(); fresh = false; reveal(M().querySelector('li.sel')); };
    const mark = (i) => { const lis = M().querySelectorAll('li[data-cell]'); lis[sel]?.classList.remove('sel'); sel = i; lis[i]?.classList.add('sel'); reveal(lis[i]); };
    const doBack = () => { if (onBack) { api.sfx('ui_voltar'); onBack(); } };
    const h = {
      handle(p) {
        if (p.k === 'nav') {
          if (p.dy) { mark((sel + p.dy + items.length) % items.length); api.sfx('ui_mover'); }
          else if (p.dx && items[sel].adj) { items[sel].adj(p.dx); api.sfx('ui_mover'); redraw(); }
        } else if (p.k === 'confirm') { api.sfx('ui_ok'); items[sel].act(); if (X.current() === h) redraw(); }
        else if (p.k === 'back' || p.k === 'esc') doBack();
      },
      // a setting (`adj`): the left third of the line lowers it, the rest raises it; any other line just runs its action
      click(cell, e) {
        mark(Number(cell.dataset.i)); api.sfx('ui_ok'); const it = items[sel];
        if (it.adj && e && typeof e.clientX === 'number') { const r = cell.getBoundingClientRect(); it.adj(e.clientX < r.left + r.width / 3 ? -1 : 1); } else it.act();
        if (X.current() === h) redraw();
      },
      hover(cell) { const i = Number(cell.dataset.i); if (cell.tagName === 'LI' && i !== sel) { mark(i); api.sfx('ui_mover'); } },
      back: doBack,
      redraw,
    };
    X.showModal(html(), h); fresh = false; reveal(M().querySelector('li.sel'));
    return h;
  }

  // ------------------------------------------------------------------------------------------------------------------------------ the punch card (the pause)
  const DOW = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'FOLGA'];
  /** The punch card of the attendant on its clipboard: the 28 days (stamped when worked), tonight and its entry time, the week's goal and the marked objective. */
  function punchCard(info) {
    const worked = new Set(info.worked || []);
    const cells = Array.from({ length: 28 }, (_, i) => {
      const d = i + 1, off = i % 7 === 6, today = d === info.calDay, done = worked.has(d);
      const rot = ((d * 37) % 13) - 6;
      return `<span class="d${off ? ' off' : ''}${today ? ' today' : ''}${done ? ' done' : ''}"><em>${d}</em>${done ? `<i class="stamp" style="--r:${rot}deg">BD</i>` : ''}</span>`;
    }).join('');
    const pct = info.meta ? Math.round(Math.min(1, info.weekNow / info.meta) * 100) : 0;
    return `<aside class="side clip"><div class="clipboard"><i class="clipper"></i><div class="paper punch">
      <header><b>CARTÃO DE PONTO</b><span>Posto Bom Dia · frentista da madrugada</span></header>
      <div class="dow">${DOW.map((x) => `<span>${x}</span>`).join('')}</div><div class="days">${cells}</div>
      <p class="tonight">${info.folga ? `Folga · semana ${info.week}` : `Hoje: <b>noite ${info.night}</b> · entrada <b>${esc(info.entry)}</b>${info.punched ? '' : ' <small>(ponto por bater)</small>'} · agora <b>${esc(info.time)}</b>`}</p>
      <div class="goal"><span>Meta da semana ${info.week}${info.weekName ? ` · ${esc(info.weekName)}` : ''}</span><b>${info.weekNow} / ${info.meta}</b><i><u style="width:${pct}%"></u></i></div>
      <p class="obj"><small>Objetivo marcado</small>${info.goal ? esc(info.goal) : '<span class="dim">Nada marcado. Olhe em volta.</span>'}</p>
      ${info.note ? `<p class="note">${esc(info.note)}</p>` : ''}
    </div></div></aside>`;
  }

  // ------------------------------------------------------------------------------------------------------------------------------ the options (the breaker panel)
  /**
   * The options: tabs of rows. tabs: [{ id, name, rows: [{ id, kind, label, help, ... }] }], with the kinds
   *   fader   { n, i(), set(d), seg() }          notches and a handle, the number in seven segments like the pump's
   *   switch  { get(), toggle(), on?, off? }     a breaker of the power board
   *   choice  { text(), set(d) }                 a selector with arrows
   *   button  { act(), hint? }                   a line that opens something
   *   note    { text }                           a paragraph (not a thing to choose)
   * `hide()` hides a row; `rebuild: true` draws the whole screen again after it changes (a row appeared or went).
   */
  function options({ tabs, back, tab: startTab, title = 'OPÇÕES', foot = '' }) {
    let tabId = startTab ?? tabs[0].id, selKey = `tab:${tabId}`, fresh = true, drag = null;
    const rowsOf = () => tabs.find((t) => t.id === tabId).rows.filter((r) => !(r.hide && r.hide()));
    const allRows = () => tabs.flatMap((t) => t.rows);
    const rowOf = (k) => allRows().find((r) => `row:${r.id}` === k);
    const txt = (r) => (r.kind === 'fader' ? r.seg() : r.kind === 'switch' ? (r.get() ? r.on ?? 'LIGADO' : r.off ?? 'DESLIGADO') : r.kind === 'choice' ? r.text() : r.hint ?? '');
    const rowHtml = (r) => {
      if (r.kind === 'note') return `<p class="note">${esc(r.text)}</p>`;
      const k = `row:${r.id}`, base = `data-cell data-key="${k}" data-v="${esc(txt(r))}"`;
      const lab = `<span class="lab">${esc(r.label)}</span>`;
      if (r.kind === 'fader') {
        const i = r.i();
        return `<div class="row fader" ${base}>${lab}<span class="ctl"><b class="st minus" data-st="-1" aria-label="Baixar"><i></i></b><span class="track" data-n="${r.n}" role="slider" aria-valuemin="0" aria-valuemax="${r.n - 1}" aria-valuenow="${i}"><b class="notches">${'<i></i>'.repeat(r.n)}</b><b class="cap" style="--v:${r.n > 1 ? i / (r.n - 1) : 0}"></b></span><b class="st plus" data-st="1" aria-label="Subir"><i></i></b></span><span class="val seg" aria-label="${esc(txt(r))}">${seg7(r.seg(), r.cells ?? 3)}</span></div>`;
      }
      if (r.kind === 'switch') {
        const on = r.get();
        return `<div class="row sw${on ? ' on' : ''}" ${base} role="switch" aria-checked="${on}">${lab}<span class="ctl"><span class="brk"><b class="lamp"></b><b class="lever"></b><em class="i">I</em><em class="o">O</em></span></span><span class="val">${esc(txt(r))}</span></div>`;
      }
      if (r.kind === 'choice') return `<div class="row choice" ${base}>${lab}<span class="ctl"><span class="ar l"></span><span class="ar r"></span></span><span class="val mono">${esc(txt(r))}</span></div>`;
      return `<div class="row btn" ${base}>${lab}<span class="ctl"><span class="ar r"></span></span><span class="val">${esc(txt(r))}</span></div>`;
    };
    const body = () => `<h1>${esc(title)}</h1>
      <nav class="tabs" role="tablist">${tabs.map((t) => `<div class="tab${t.id === tabId ? ' on' : ''}" data-cell data-key="tab:${t.id}" data-tab="${t.id}" role="tab" aria-selected="${t.id === tabId}">${esc(t.name)}</div>`).join('')}</nav>
      <div class="rows" data-scroll>${rowsOf().map(rowHtml).join('')}</div><p class="help" aria-live="polite"></p>${foot ? `<small class="foot">${esc(foot)}</small>` : ''}`;
    const html = () => shell({ kind: 'options', cls: 'opt', body: body(), lg: ['move', 'adjust', 'tab', 'ok', 'back'], fresh });
    const cells = () => [...M().querySelectorAll('[data-cell]')];
    const curEl = () => cells().find((c) => c.dataset.key === selKey) ?? cells()[0];
    const help = () => { const p = M().querySelector('.help'), r = rowOf(selKey); if (p) p.textContent = r?.help ?? (selKey.startsWith('tab:') ? '' : ''); };
    const paint = () => { for (const c of cells()) c.classList.toggle('sel', c.dataset.key === selKey); reveal(M().querySelector('.sel')); help(); };
    const redraw = () => {
      if (!cells().some((c) => c.dataset.key === selKey)) selKey = `tab:${tabId}`;
      M().innerHTML = html(); fresh = false; paint();
      const tb = M().querySelector('.tabs'), on = tb?.querySelector('.tab.on'); if (tb && on) tb.scrollLeft = on.offsetLeft - (tb.clientWidth - on.offsetWidth) / 2;
    };
    /** Brings the drawn controls in line with the values without drawing them again (so the handle slides and the lever throws). */
    function sync() {
      for (const c of M().querySelectorAll('.row[data-key]')) {
        const r = rowOf(c.dataset.key); if (!r) continue;
        c.dataset.v = txt(r);
        if (r.kind === 'fader') { const i = r.i(); c.querySelector('.cap').style.setProperty('--v', String(r.n > 1 ? i / (r.n - 1) : 0)); c.querySelector('.track').setAttribute('aria-valuenow', String(i)); c.querySelector('.val').innerHTML = seg7(r.seg(), r.cells ?? 3); }
        else if (r.kind === 'switch') { const on = r.get(); c.classList.toggle('on', on); c.setAttribute('aria-checked', String(on)); c.querySelector('.val').textContent = txt(r); }
        else if (r.kind === 'choice') c.querySelector('.val').textContent = txt(r);
      }
    }
    const select = (k, quiet) => { selKey = k; paint(); if (!quiet) api.sfx('ui_mover'); };
    function setTab(id, sound = true) {
      if (id === tabId) return;
      tabId = id; if (selKey.startsWith('tab:')) selKey = `tab:${id}`; else selKey = `row:${rowsOf().find((r) => r.kind !== 'note')?.id}`;
      if (sound) api.sfx('ui_mover'); redraw();
    }
    const cycleTab = (d) => { const i = tabs.findIndex((t) => t.id === tabId); setTab(tabs[(i + d + tabs.length) % tabs.length].id); };
    function adjust(elm, d) {
      const r = rowOf(elm.dataset.key); if (!r) return false;
      if (r.kind === 'fader') { const was = r.i(); r.set(d); api.sfx(r.i() === was ? 'ui_voltar' : 'ui_mover'); }
      else if (r.kind === 'switch') { if ((d > 0) !== r.get()) { r.toggle(); api.sfx('ui_ok'); } else api.sfx('ui_voltar'); }
      else if (r.kind === 'choice') { r.set(d); api.sfx('ui_mover'); }
      else return false;
      if (r.rebuild) redraw(); else { sync(); help(); }
      return true;
    }
    const slideTo = (r, n) => { let d = n - r.i(); const s = Math.sign(d); for (; d !== 0; d -= s) r.set(s); };
    const fromPointer = (e) => {
      if (!drag) return; const tr = drag.querySelector('.track'), r = rowOf(drag.dataset.key); if (!tr || !r) return;
      const b = tr.getBoundingClientRect(); const was = r.i();
      slideTo(r, Math.round(Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)) * (r.n - 1)));
      if (r.i() !== was) { sync(); help(); }
    };
    const doBack = () => { api.sfx('ui_voltar'); back(); };
    const h = {
      handle(p) {
        if (p.k === 'tab') { cycleTab(p.d || 1); return; }
        if (p.k === 'back' || p.k === 'esc') { doBack(); return; }
        const me = curEl(); if (!me) return;
        if (p.k === 'nav') {
          if (p.dx && me.dataset.key.startsWith('tab:')) { cycleTab(p.dx); selKey = `tab:${tabId}`; paint(); return; }
          if (p.dx && adjust(me, p.dx)) return;
          const cs = cells();
          // down from the tabs lands on the first row (the rows are wide: the nearest-in-a-direction rule would skip it)
          if (p.dy > 0 && me.dataset.key.startsWith('tab:')) { const first = cs.find((c) => c.dataset.key.startsWith('row:')); if (first) select(first.dataset.key); return; }
          const j = nearest(cs, me, p.dx || 0, p.dy || 0);
          if (j >= 0) {
            let to = cs[j];
            // up from the rows lands on the tab that is on, not on the one nearest to the row
            if (p.dy < 0 && to.dataset.key.startsWith('tab:') && !me.dataset.key.startsWith('tab:')) to = cs.find((c) => c.dataset.key === `tab:${tabId}`) ?? to;
            select(to.dataset.key);
          }
        } else if (p.k === 'confirm') {
          const r = rowOf(me.dataset.key);
          if (!r) return;
          if (r.kind === 'switch') adjust(me, r.get() ? -1 : 1); else if (r.kind === 'choice') adjust(me, 1);
          else if (r.kind === 'button') { api.sfx('ui_ok'); r.act(); }
        }
      },
      click(cell, e) {
        const k = cell.dataset.key;
        if (k.startsWith('tab:')) { select(k, true); setTab(k.slice(4)); return; }
        const r = rowOf(k); select(k, true);
        if (!r) return;
        const t = e?.target;
        if (r.kind === 'fader') {
          const st = t?.closest?.('.st');
          if (st) adjust(cell, Number(st.dataset.st));
          else if (t?.closest?.('.track')) { drag = cell; api.sfx('ui_mover'); fromPointer(e); }
        } else if (r.kind === 'switch') adjust(cell, r.get() ? -1 : 1);
        else if (r.kind === 'choice') { const b = cell.getBoundingClientRect(); adjust(cell, typeof e?.clientX === 'number' && e.clientX < b.left + b.width / 3 ? -1 : 1); }
        else if (r.kind === 'button') { api.sfx('ui_ok'); r.act(); }
      },
      hover(cell) { if (cell.dataset.key && cell.dataset.key !== selKey) select(cell.dataset.key); },
      move(e) { if (drag) fromPointer(e); },
      up() { drag = null; },
      back: doBack, redraw,
      get tab() { return tabId; },
    };
    X.showModal(html(), h); fresh = false; paint();
    return h;
  }

  // ------------------------------------------------------------------------------------------------------------------------------ the memory card
  const KINDICON = { run: 'run', night: 'night', record: 'record', rinha: 'rinha', corrupt: 'corrupt', empty: 'empty' };
  /** What a block says: its name and the lines under it (the same facts as ever, set apart). */
  function describe(b) {
    const wk = b.fase === 'folga' ? b.week - 1 : b.week;
    if (b.kind === 'run') return { name: b.fase === 'folga' ? `Folga da semana ${b.week - 1}` : b.fase === 'fim' ? 'Fim da campanha' : `Noite ${b.day}`, tag: 'Partida', body: [`Semana ${wk}. Carteira ${money(b.wallet * 100)}. Sanidade ${b.sanidade ?? '-'}.`, `Metas perdidas ${b.misses ?? 0}. Quedas de sanidade ${b.collapse?.total ?? 0}. Eventos vistos ${(b.eventsSeen || []).length}.`, `Semente ${b.seed}.`] };
    if (b.kind === 'night') return { name: `Noite ${b.day}`, tag: 'Turno fechado', body: [`${b.points} pontos, ${b.erros} erros, ${b.abastecimentos} abastecimentos, ${b.vendas} vendas.`, `${b.tarefas ?? 0} tarefas feitas e ${b.naoFeitas ?? 0} não, ${b.ocorrencias ?? 0} ocorrências, caixa ${b.divergencia ? 'com divergência de ' + money(b.divergencia) : 'batendo'}${b.recorrentes?.length ? ', viu ' + b.recorrentes.join(', ') : ''}.`, `Semente ${b.seed}.`] };
    if (b.kind === 'record') return { name: 'Recorde', tag: 'O Sol', body: [`Melhor noite ${b.best} pontos, ${b.nights} noites feitas.`, `${b.endings ?? 0} de 5 finais, ${b.secrets} segredos achados.`] };
    if (b.kind === 'rinha') return { name: 'Outro jogo do canal', tag: 'Rinha', body: [`${b.fights} lutas guardadas, recorde ${b.best}, ${b.secrets} segredos achados.`] };
    if (b.kind === 'corrupt') return { name: 'Arquivo danificado', tag: 'Bloco 13', body: ['Não dá para ler.'] };
    return { name: 'Vazio', tag: '', body: [] };
  }
  /** The block manager of a console: fifteen blocks with their icons, block 13 broken, what the chosen one holds, and the rows under it (export, import). */
  function card(cardApi, back, extras = [], { onBlock, seed } = {}) {
    const blocks = cardApi.blocks();
    let selKey = 'b:1', fresh = true;
    const rows = [...extras.map((x, k) => ({ key: `x:${k}`, label: x.label, hint: x.hint, act: x.act })), { key: 'back', label: 'VOLTAR', hint: 'Voltar.', act: back }];
    const free = blocks.filter((b) => b.kind === 'empty').length;
    const info = () => {
      if (selKey.startsWith('b:')) {
        const b = blocks[Number(selKey.slice(2)) - 1], d = describe(b);
        return `<div class="bi ${b.kind}"><div class="big">${icon(KINDICON[b.kind])}</div><div class="tx"><small>Bloco ${b.n}${d.tag ? ` · ${esc(d.tag)}` : ''}</small><h3>${esc(d.name)}</h3>${d.body.map((l) => `<p>${esc(l)}</p>`).join('') || '<p class="dim">Bloco vazio.</p>'}</div></div>`;
      }
      const r = rows.find((x) => x.key === selKey);
      return `<p class="hintline">${esc(r?.hint || r?.label || '')}</p>`;
    };
    const body = () => `<h1>CARTÃO DE MEMÓRIA</h1><div class="mgr"><div class="mgr-hd"><span>Cartão 1</span><span class="free">Blocos livres: <b>${free}</b> de ${blocks.length}</span></div>
      <div class="cardgrid">${blocks.map((b) => `<div data-cell data-key="b:${b.n}" data-i="${b.n - 1}" class="blk ${b.kind}" aria-label="Bloco ${b.n}"><span class="n">${b.n}</span>${icon(KINDICON[b.kind])}</div>`).join('')}</div></div>
      <section class="cardinfo">${info()}</section>
      <ul class="xrows">${rows.map((x) => `<li data-cell data-key="${x.key}" data-i="${x.key}">${MARK}<span class="t">${esc(x.label)}</span></li>`).join('')}</ul>
      ${seed ? `<small class="foot">${esc(seed)}</small>` : ''}`;
    const html = () => shell({ kind: 'card', cls: 'cardbox', body: body(), lg: ['move', 'ok', 'back'], fresh });
    const cells = () => [...M().querySelectorAll('[data-cell]')];
    const paint = () => { for (const c of cells()) c.classList.toggle('sel', c.dataset.key === selKey); const i = M().querySelector('.cardinfo'); if (i) i.innerHTML = info(); reveal(M().querySelector('.sel')); };
    const redraw = () => { M().innerHTML = html(); fresh = false; paint(); };
    const select = (k, quiet) => { selKey = k; paint(); if (!quiet) api.sfx('ui_mover'); };
    const open = (key) => {
      if (key.startsWith('b:')) { const b = blocks[Number(key.slice(2)) - 1]; if (b.kind === 'corrupt') onBlock?.(b); return; }
      const r = rows.find((x) => x.key === key); if (!r) return;
      if (key === 'back') { api.sfx('ui_voltar'); back(); } else { api.sfx('ui_ok'); r.act(); }
    };
    const h = {
      handle(p) {
        if (p.k === 'back' || p.k === 'esc') { api.sfx('ui_voltar'); back(); return; }
        const me = cells().find((c) => c.dataset.key === selKey); if (!me) return;
        if (p.k === 'nav') {
          const cs = cells(), j = nearest(cs, me, p.dx || 0, p.dy || 0);
          if (j >= 0) select(cs[j].dataset.key);
        } else if (p.k === 'confirm') open(selKey);
      },
      click(cell) { const k = cell.dataset.key, again = k === selKey; select(k, true); if (k.startsWith('b:')) { if (again) open(k); else api.sfx('ui_mover'); } else open(k); },
      hover(cell) { if (cell.dataset.key !== selKey) select(cell.dataset.key); },
      back() { api.sfx('ui_voltar'); back(); }, redraw,
    };
    X.showModal(html(), h); fresh = false; paint();
    return h;
  }

  /** The hook of the next game (block 13 after the first ending): one picture and almost no text. */
  function hook(cv, back) {
    const h = { handle(p) { if (p.k === 'confirm' || p.k === 'back' || p.k === 'esc') back(); }, click() { back(); }, back, redraw() {} };
    X.showModal('', h);
    M().innerHTML = shell({ kind: 'hook', cls: 'menu hookbox', fresh: true, lg: ['ok', 'back'], body: '<h1>ARQUIVO 13</h1><div class="hookimg"></div><div class="lines"><p>A água não se mexe.</p><p>A linha desceu e não voltou.</p></div><ul><li data-cell data-i="0" class="sel">' + MARK + '<span class="t">VOLTAR</span></li></ul>' });
    M().querySelector('.hookimg').appendChild(cv);
    return h;
  }

  // ------------------------------------------------------------------------------------------------------------------------------ the register tape (the end of a night)
  /** The tape of the register: paper that unrolls, one line per fact, the cash difference among them with nothing said about it. */
  function tape(s, extraLines) {
    const rows = [
      ['Atendimentos', s.atendimentos], ['Vendas', s.vendas], ['Abastecimentos', s.abastecimentos], '-',
      ['Tarefas feitas', s.tarefas], ['Tarefas não feitas', s.naoFeitas], ['Erros', s.erros], ['Reclamações', s.reclamacoes], ['Ocorrências registradas', s.ocorrencias], '-',
      ['Caixa contado', money(s.caixa)], ['Divergência de caixa', money(s.divergencia), s.divergencia ? 'gap' : ''], ['Carteira', money(s.carteira * 100)], '=',
      ['PONTOS', s.points, 'total'],
    ];
    const cal = s.cal;
    const lines = rows.map((r, i) => (r === '-' ? '<div class="rule"></div>' : r === '=' ? '<div class="rule dbl"></div>' : `<div class="tl ${r[2] || ''}" style="--i:${i}"><span>${esc(r[0])}</span><i></i><b>${esc(r[1])}</b></div>`)).join('');
    return `<aside class="side tapewrap"><div class="tape" data-unroll>
      <div class="th"><b>POSTO BOM DIA</b><span>TURNO ENCERRADO</span><span>${esc(cal.dia)} · DIA ${cal.calDay}/28 · 06:00</span></div>${lines}
      <div class="tf">${extraLines.map((l) => `<p>${esc(l)}</p>`).join('')}</div><div class="cut"></div></div></aside>`;
  }

  /** The pay slip of the week's balance: paper, the lines as they were. */
  function slip(b) {
    return `<aside class="side tapewrap slipwrap"><div class="paper slip"><header><b>BALANÇO DA SEMANA</b><span>${esc(b.sub || '')}</span></header>${b.lines.map((l) => (l === '' ? '<p class="gap"></p>' : `<p>${esc(l)}</p>`)).join('')}</div></aside>`;
  }

  /** An ending: a composition, not a box. The first line is the ending's own, the rest are the facts that go under it. */
  function ending({ title, subtitle, lines, items }) {
    const n = (/(\d)/.exec(subtitle || '') || [])[1] || '0';
    const real = lines.filter((l) => l !== '');
    const lede = real[0] || '', rest = real.slice(1);
    return menu({ title, subtitle, kind: 'end', cls: `end e${n}`, items, extra: `<p class="lede">${esc(lede)}</p><ul class="chips">${rest.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`, side: `<div class="endsun" aria-hidden="true">${solSvg({ week: 1, cls: 'huge' })}</div>` });
  }

  return { menu, options, card, hook, tape, slip, ending, punchCard, shell, describe };
}
