// The cell panel (shop, phrase field, numeric keypad) and the memory card screen, as DOM.
// Navigation comes from the input layer in 'ui' mode (arrows, WASD, d-pad, stick, Tab or
// LB/RB for the tabs, Enter or A to confirm); a mouse or a finger can also click and tap.
import { ITEMS, ITEM_ORDER } from './items.js';

const LETTERS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM', '1234567890'];
const PAD = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['APAGA', '0', 'OK']];

export function createUI(root, api) {
  root.insertAdjacentHTML('beforeend', `
    <div id="shop" class="screen" hidden><div class="box">
      <div class="tabs"><b data-tab="0">LOJA</b><b data-tab="1">FRASE</b><b data-tab="2">C&Oacute;DIGO</b></div>
      <div class="cr">CR <span id="shopcr">0</span></div>
      <div class="pane" data-pane="0"></div>
      <div class="pane" data-pane="1" hidden>
        <div class="fld" data-cell><span>FRASE:</span><input id="phrase" maxlength="40" autocomplete="off" autocapitalize="characters" spellcheck="false"></div>
        <div class="kbd"></div>
      </div>
      <div class="pane" data-pane="2" hidden>
        <div class="code"><span>C&Oacute;DIGO:</span><b id="codeshow">______</b></div>
        <div class="pad"></div>
      </div>
      <div class="msg" id="shopmsg"></div>
      <div class="foot"><button class="close" data-cell>FECHAR</button></div>
    </div></div>
    <div id="card" class="screen" hidden><div class="box">
      <h2>CART&Atilde;O DE MEM&Oacute;RIA</h2>
      <div class="saving" hidden>SALVANDO...</div>
      <div class="grid"></div>
      <div class="detail"></div>
      <div class="foot"><button class="close" data-cell>FECHAR</button></div>
    </div></div>`);
  const $ = (s) => root.querySelector(s);
  const shop = $('#shop'), card = $('#card'), shopMsg = $('#shopmsg'), phrase = $('#phrase'), codeShow = $('#codeshow');

  // ------------------------------------------------------------ shop
  const state = { open: false, pane: 0, r: 0, c: 0, code: '' };
  const rows = [[], [], []];  // per pane: arrays of arrays of elements
  const paneEl = (i) => shop.querySelector(`[data-pane="${i}"]`);
  const shopRows = paneEl(0);
  function drawShop() {
    $('#shopcr').textContent = api.getCredits();
    const inv = api.getInv();
    for (const el of shopRows.querySelectorAll('.row')) {
      const k = el.dataset.k; el.querySelector('.own').textContent = inv[k] ? `x${inv[k]}` : '';
    }
  }
  shopRows.innerHTML = ITEM_ORDER.map((k) => `<div class="row" data-cell data-k="${k}"><b>${ITEMS[k].label}</b><span class="pr">${ITEMS[k].price}</span><span class="us">${ITEMS[k].uses} USOS</span><span class="own"></span><em>${ITEMS[k].text}</em></div>`).join('');
  rows[0] = ITEM_ORDER.map((_, i) => [shopRows.querySelectorAll('.row')[i]]);
  const kbd = shop.querySelector('.kbd');
  kbd.innerHTML = LETTERS.map((l) => `<div class="kr">${[...l].map((ch) => `<i data-cell data-ch="${ch}">${ch}</i>`).join('')}</div>`).join('') +
    '<div class="kr"><i data-cell data-ch=" " class="w">ESPA&Ccedil;O</i><i data-cell data-ch="BACK" class="w">APAGA</i><i data-cell data-ch="OK" class="w">OK</i></div>';
  rows[1] = [[shop.querySelector('.fld')], ...[...kbd.querySelectorAll('.kr')].map((kr) => [...kr.querySelectorAll('i')])];
  const padEl = shop.querySelector('.pad');
  padEl.innerHTML = PAD.map((rw) => `<div class="kr">${rw.map((ch) => `<i data-cell data-ch="${ch === 'APAGA' ? 'BACK' : ch}">${ch}</i>`).join('')}</div>`).join('');
  rows[2] = [...padEl.querySelectorAll('.kr')].map((kr) => [...kr.querySelectorAll('i')]);
  const closeBtn = shop.querySelector('.close');

  function cells() { return [...rows[state.pane], [closeBtn]]; }
  function paint() {
    shop.querySelectorAll('.sel').forEach((e) => e.classList.remove('sel'));
    const g = cells(); state.r = Math.min(state.r, g.length - 1); state.c = Math.min(state.c, g[state.r].length - 1);
    g[state.r][state.c].classList.add('sel');
    shop.querySelectorAll('.tabs b').forEach((b) => b.classList.toggle('on', Number(b.dataset.tab) === state.pane));
    for (let i = 0; i < 3; i++) paneEl(i).hidden = i !== state.pane;
    codeShow.textContent = (state.code + '______').slice(0, Math.max(6, state.code.length));
  }
  function say(t) { shopMsg.textContent = t; }

  function press(ch) {
    if (state.pane === 1) {
      if (ch === 'BACK') phrase.value = phrase.value.slice(0, -1);
      else if (ch === 'OK') submit(phrase.value, 'phrase');
      else { phrase.value += ch; api.sound?.play('painel_tecla', { key: ch.charCodeAt(0) }); }
      if (ch !== 'OK') api.setPanel?.('type', phrase.value);
    } else if (state.pane === 2) {
      if (ch === 'BACK') state.code = state.code.slice(0, -1);
      else if (ch === 'OK') submit(state.code, 'code');
      else if (state.code.length < 12) { state.code += ch; api.sound?.play('painel_tecla', { key: Number(ch) }); }
      paint();
    }
  }
  let checking = false;
  async function submit(text, kind) {
    if (checking) return;
    checking = true; say('...');
    api.sound?.play('painel_tecla', { key: 1 });
    let res = 'NEGADO';
    try { res = await api.submit(text, kind); } catch { res = 'NEGADO'; }
    checking = false;
    say(res);
    const good = res !== 'NEGADO';
    api.setPanel?.(good ? 'ok' : 'bad', ''); setTimeout(() => api.setPanel?.('idle', ''), 1800);
    if (good) api.sound?.play('ui_ok');
  }
  function activate(el) {
    if (el === closeBtn) { close(); return; }
    if (state.pane === 0) {
      if (el.classList.contains('off')) { say('AINDA N\u00c3O'); api.sound?.play('ui_voltar'); return; }
      const k = el.dataset.k, r = api.buy(k);
      say(r.msg); drawShop(); api.sound?.play(r.ok ? 'moeda' : 'ui_voltar');
    } else if (el.classList.contains('fld')) { phrase.focus(); }
    else if (el.dataset.ch !== undefined) press(el.dataset.ch);
  }
  // mouse and touch
  shop.addEventListener('pointerdown', (e) => {
    const tab = e.target.closest('[data-tab]');
    if (tab) { state.pane = Number(tab.dataset.tab); state.r = state.c = 0; paint(); e.preventDefault(); return; }
    const cell = e.target.closest('[data-cell]');
    if (!cell || e.target === phrase) return;
    const g = cells();
    for (let r = 0; r < g.length; r++) { const c = g[r].indexOf(cell); if (c >= 0) { state.r = r; state.c = c; } }
    paint(); activate(cell); e.preventDefault();
  });
  phrase.addEventListener('input', () => { phrase.value = phrase.value.toUpperCase(); api.setPanel?.('type', phrase.value); });
  phrase.addEventListener('keydown', (e) => { if (e.key === 'Enter') { submit(phrase.value, 'phrase'); phrase.blur(); } });
  addEventListener('keydown', (e) => { // physical digits go to the keypad
    if (!state.open || state.pane !== 2 || document.activeElement === phrase) return;
    if (/^\d$/.test(e.key) && state.code.length < 12) { state.code += e.key; paint(); api.sound?.play('painel_tecla', { key: Number(e.key) }); }
    else if (e.key === 'Backspace') { state.code = state.code.slice(0, -1); paint(); }
  });

  function open(opts = {}) {
    shopRows.querySelectorAll('.row').forEach((el) => el.classList.toggle('off', Boolean(opts.only) && !opts.only.includes(el.dataset.k)));
    state.open = true; state.pane = 0; state.r = opts.only ? ITEM_ORDER.indexOf(opts.only[0]) : 0; state.c = 0; state.code = ''; phrase.value = ''; say(''); shop.hidden = false; drawShop(); paint(); api.onOpen?.(); }
  function close() { phrase.blur(); state.open = false; shop.hidden = true; api.onClose?.(); }
  const shopApi = {
    open, close, get isOpen() { return state.open; },
    nav(dx, dy) { const g = cells(); state.r = Math.max(0, Math.min(g.length - 1, state.r + dy)); state.c = Math.max(0, Math.min(g[state.r].length - 1, state.c + dx)); paint(); api.sound?.menu(); },
    confirm() { const g = cells(); activate(g[state.r][state.c]); },
    tab(d) { state.pane = (state.pane + d + 3) % 3; state.r = state.c = 0; paint(); api.sound?.menu(); },
    back() { if (document.activeElement === phrase) phrase.blur(); else close(); },
    refresh: drawShop,
  };

  // ------------------------------------------------------------ memory card
  const grid = card.querySelector('.grid'), detail = card.querySelector('.detail'), saving = card.querySelector('.saving'), cardClose = card.querySelector('.close');
  const cs = { open: false, i: 0, timer: null, onClose: null };
  function icon(kind, n) {
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const g = c.getContext('2d'), px = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    px(0, 0, 16, 16, '#1a1d29');
    if (kind === 'campaign') { px(2, 5, 5, 6, '#d9a21b'); px(9, 5, 5, 6, '#d9a21b'); px(3, 11, 3, 2, '#e8e0c8'); px(10, 11, 3, 2, '#e8e0c8'); }
    else if (kind === 'fight') { px(2, 9, 12, 3, '#6a7388'); px(3, 4, 1, 5, '#c9a24a'); px(12, 4, 1, 5, '#c9a24a'); px(3, 5, 10, 1, '#5ee6d0'); px(3, 7, 10, 1, '#5ee6d0'); }
    else if (kind === 'record') { px(7, 2, 2, 3, '#e0a526'); px(3, 5, 10, 2, '#e0a526'); px(5, 7, 6, 3, '#e0a526'); px(4, 10, 3, 3, '#e0a526'); px(9, 10, 3, 3, '#e0a526'); }
    else if (kind === 'corrupt') { // a broken icon: torn blocks and a crack
      px(2, 2, 6, 5, '#4a2a3a'); px(9, 3, 5, 4, '#2a2f5a'); px(3, 9, 4, 5, '#2a2f5a'); px(10, 9, 4, 4, '#4a2a3a');
      for (let i = 0; i < 14; i++) px(1 + i, 1 + ((i * 7) % 13), 1, 2, i % 2 ? '#ff6a5c' : '#0b0d14');
      px(7, 6, 2, 5, '#0b0d14');
    }
    else { px(5, 5, 6, 6, '#242836'); }
    c.title = String(n); return c;
  }
  function drawCard(blocks) {
    grid.innerHTML = '';
    blocks.forEach((b, i) => {
      const d = document.createElement('div'); d.className = 'blk ' + b.kind; d.dataset.i = i;
      d.appendChild(icon(b.kind, b.n)); const s = document.createElement('span'); s.textContent = String(b.n).padStart(2, '0'); d.appendChild(s);
      grid.appendChild(d);
    });
    cs.blocks = blocks; paintCard();
  }
  function paintCard() {
    grid.querySelectorAll('.blk').forEach((d, i) => d.classList.toggle('sel', i === cs.i));
    const b = cs.blocks[cs.i];
    const T = {
      empty: () => `BLOCO ${b.n}: LIVRE`,
      campaign: () => `BLOCO ${b.n}: CAMPANHA<br>LUTA ${b.fightNo}  CR ${b.credits}<br>SEMENTE ${b.seed ?? '-'}`,
      fight: () => `BLOCO ${b.n}: LUTA ${b.n - 1} - ${b.name}<br>SEMENTE ${b.seed}  ${b.secs} S  +${b.reward}`,
      record: () => `BLOCO ${b.n}: RECORDE<br>MELHOR LUTA ${b.best}  SEGREDOS ${b.secrets}`,
      corrupt: () => `BLOCO ${b.n}: ARQUIVO CORROMPIDO<br>N&Atilde;O FOI POSS&Iacute;VEL LER`,
    };
    detail.innerHTML = T[b.kind]();
  }
  grid.addEventListener('pointerdown', (e) => { const d = e.target.closest('.blk'); if (!d) return; const i = Number(d.dataset.i), same = i === cs.i; cs.i = i; paintCard(); api.sound?.menu(); e.preventDefault(); if (same) cardApi.confirm(); });
  cardClose.addEventListener('pointerdown', (e) => { e.preventDefault(); cardApi.close(); });
  const cardApi = {
    /** opts: { saving, onClose } */
    open(blocks, opts = {}) {
      cs.open = true; cs.i = opts.saving ? 0 : (cs.i ?? 0); cs.onClose = opts.onClose ?? null; drawCard(blocks);
      saving.hidden = !opts.saving; card.hidden = false;
      clearTimeout(cs.timer);
      if (opts.saving) cs.timer = setTimeout(() => cardApi.close(), opts.ms ?? 1800);
      api.onCardOpen?.(opts);
    },
    close() { if (!cs.open) return; clearTimeout(cs.timer); cs.open = false; card.hidden = true; const f = cs.onClose; cs.onClose = null; api.onCardClose?.(); if (f) f(); },
    get isOpen() { return cs.open; },
    nav(dx, dy) { const x = (cs.i % 5) + dx, y = Math.floor(cs.i / 5) + dy; if (x < 0 || x > 4 || y < 0 || y > 2) return; cs.i = y * 5 + x; paintCard(); api.sound?.menu(); },
    confirm() { if (saving.hidden) { const b = cs.blocks[cs.i]; if (b.kind === 'corrupt') { if (api.onCorrupt && api.onCorrupt()) return; api.sound?.play('ui_voltar'); } } else cardApi.close(); },
    back() { cardApi.close(); },
  };
  return { shop: shopApi, card: cardApi };
}
