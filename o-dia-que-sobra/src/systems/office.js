// OfficeSystem: the administration work at the desk. The office computer has a screen of its own (the
// night's report and the incident log); an occurrence is registered by type and time, counts for the
// night's performance when something of that type did happen, and stays on the card for the story.
//
// The computer wakes on its entry screen: two accounts, the manager's (one press and you are in) and "VALDIR"
// with an empty "SENHA:" and a blinking cursor. Choosing VALDIR opens a password field. In this phase the field
// is checked by its PBKDF2 hash (vault.js; the phrase is written nowhere in this repository). The right phrase opens VALDIR's account: the
// report of the 1998 promotion and his schedule (sealed text, opened with the phrase itself) and an occurrence that asks for the date (also a hash).
// The camera monitor is the CameraSystem's (systems/cameras.js); it asks `openRegister` to register an occurrence
// from a camera.
import { money } from '../util.js';
import { check, openAccount } from './vault.js';

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const mono = (px, bold = true) => `${bold ? 'bold ' : ''}${Math.round(px)}px "Courier New", monospace`;
const ACCOUNTS = [['GERENTE', 'SENHA: ' + '*'.repeat(6)], ['VALDIR', 'SENHA:']];
const KEYS = [['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'], ['J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R'], ['S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', ' '], ['APAGAR', 'OK', 'VOLTAR']];
const MAX_TYPED = 24;

/**
 * The entry screen, seen straight on, drawn over the whole canvas (w x h). The same drawing is the computer's screen in the
 * posto, in the menu and (as a function of time only) in the filming mode.
 * s: { sel: 0 | 1, mode: 'ask' | 'senha', typed: '', msg: '' }; t: seconds (the cursor blinks twice a second).
 */
export function drawLogin(g, w, h, s, t) {
  const fs = h * 0.065, blink = Math.floor(t * 2) % 2 === 0;
  g.fillStyle = '#050805'; g.fillRect(0, 0, w, h);
  g.textBaseline = 'top'; g.textAlign = 'left';
  g.font = mono(fs); g.fillStyle = '#8fd08a';
  g.fillText('POSTO  -  ENTRADA', w * 0.06, h * 0.07);
  g.fillStyle = '#5a8a58'; g.fillText(s.mode === 'senha' ? 'CONTA: VALDIR' : 'ESCOLHA A CONTA', w * 0.06, h * 0.17);
  ACCOUNTS.forEach(([n, p], i) => {
    const yy = h * (0.34 + i * 0.27), sel = s.sel === i, dim = s.mode === 'senha' && i === 0;
    g.strokeStyle = sel ? '#8fd08a' : '#2a4a28'; g.lineWidth = Math.max(1, h * 0.012); g.strokeRect(w * 0.06, yy, w * 0.88, h * 0.2);
    g.fillStyle = dim ? '#2f4a2e' : sel ? '#bff0b8' : '#5a8a58'; g.font = mono(fs * 1.1); g.fillText(n, w * 0.09, yy + h * 0.02);
    g.font = mono(fs * 0.9);
    const field = i === 1 && s.mode === 'senha' ? 'SENHA: ' + '*'.repeat(s.typed.length) : p;
    g.fillText(field, w * 0.09, yy + h * 0.1);
    if (i === 1 && sel && blink) { g.fillStyle = '#bff0b8'; g.fillRect(w * 0.09 + g.measureText(field + (field.endsWith(':') ? ' ' : '')).width, yy + h * 0.1, fs * 0.55, fs * 0.9); }
  });
  if (s.msg) { g.font = mono(fs); g.fillStyle = '#d07a68'; g.fillText(s.msg, w * 0.06, h * 0.9); }
}

export function createOffice(bus, { world, render, interaction, ui, time, progression, tasks, cash, data, inventory }) {
  const THREE = render.THREE;
  const cfg = data.tasks.ocorrencias;
  const incidents = [];        // what happened: { tipo, at, info, registered }
  const registered = [];       // what the player wrote down: { tipo, nome, hora, at, valida }
  const props = world.posto.props || {};

  // ------------------------------------------------------------------ the computer's own screen
  const SW = 256, SH = 192;
  const cv = document.createElement('canvas'); cv.width = SW; cv.height = SH;
  const g = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv); tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.NoColorSpace;
  const dark = document.createElement('canvas'); dark.width = 16; dark.height = 12;
  { const d = dark.getContext('2d'); d.fillStyle = '#05070a'; d.fillRect(0, 0, 16, 12); }
  const darkTex = new THREE.CanvasTexture(dark); darkTex.magFilter = darkTex.minFilter = THREE.NearestFilter; darkTex.generateMipmaps = false; darkTex.colorSpace = THREE.NoColorSpace;
  let using = false;
  let unlocked = false;                                             // the manager's account is open this night
  const login = { sel: 1, mode: 'ask', typed: '', msg: '' };       // idle, the computer shows VALDIR's line with the cursor
  const blinkT = () => time.minutes * 0.75;                         // 1.5 real seconds per game minute: the cursor blinks every 0.75 s
  function drawScreen() {
    if (!unlocked) { drawLogin(g, SW, SH, login, blinkT()); tex.needsUpdate = true; return; }
    g.setTransform(2, 0, 0, 2, 0, 0);
    g.fillStyle = '#071810'; g.fillRect(0, 0, 128, 96);
    g.fillStyle = '#143c28'; g.fillRect(0, 0, 128, 11);
    g.fillStyle = '#9af0b8'; g.font = 'bold 8px monospace'; g.textBaseline = 'top'; g.textAlign = 'left';
    g.fillText('POSTO BOM DIA', 3, 2); g.fillText(time.text(), 100, 2);
    const n = progression.night;
    const rows = using
      ? ['> RELATORIO DA NOITE', '> REGISTRAR OCORRENCIA', '', `PONTOS ${n.pontos}`, `TAREFAS ${n.tarefas}  ERROS ${n.erros}`]
      : [`NOITE ${progression.st.day}`, `ATEND. ${n.atendimentos}  VENDAS ${n.vendas}`, `TAREFAS ${n.tarefas}`, `OCORRENCIAS ${registered.length}`, '', cash.opened ? 'CAIXA ABERTO' : 'CAIXA FECHADO'];
    g.fillStyle = '#6fd08e'; g.font = '8px monospace';
    rows.forEach((t, i) => g.fillText(t, 4, 18 + i * 11));
    if (Math.floor(time.minutes * 2) % 2 === 0) { g.fillStyle = '#9af0b8'; g.fillRect(4, 86, 5, 7); }
    g.setTransform(1, 0, 0, 1, 0, 0);
    tex.needsUpdate = true;
  }
  function setScreens() {
    props.computador?.setScreen?.(tex);
    props.monitor?.setScreen?.(darkTex);   // the CameraSystem puts its own picture on the monitor when it is built
    drawScreen();
  }
  setScreens();
  bus.on('time:minute', () => drawScreen());
  bus.on('perf:change', () => drawScreen());

  // ------------------------------------------------------------------ what happened tonight (the log the occurrences are checked against)
  bus.on('incident', (tipo, info = {}) => { incidents.push({ tipo, at: time.minutes, info, registered: false }); });
  bus.on('event:seen', (id) => { if (id === 'carro-vazio') incidents.push({ tipo: 'carro-sem-motorista', at: time.minutes, info: { id }, registered: false }); });

  // ------------------------------------------------------------------ styles of the entry screen
  if (!document.getElementById('odq-office-style')) {
    const st = document.createElement('style'); st.id = 'odq-office-style';
    st.textContent = `
      .odqlogin .box { padding: 10px 14px 12px; width: min(620px, 96vw); background: #14120e; border-color: #4a4638; }
      .odqlogin h1 { font-size: 15px; letter-spacing: 3px; margin: 0 0 6px; color: #8fd08a; text-align: left; }
      .odqlogin .vw { margin: 0 auto; width: min(100%, 560px, calc(44vh * 4 / 3)); aspect-ratio: 4 / 3; border: 6px solid #22201a; background: #000; box-sizing: border-box; }
      .odqlogin canvas { display: block; width: 100%; height: 100%; image-rendering: pixelated; image-rendering: crisp-edges; image-rendering: pixelated; }
      .odqlogin .row { display: flex; flex-wrap: wrap; gap: 5px; justify-content: center; margin-top: 8px; }
      .odqlogin button { font: inherit; font-size: 15px; padding: 8px 0; min-width: 44px; min-height: 40px; background: #1f1d18; color: #cfe8c8; border: 2px solid #4a4638; cursor: pointer; touch-action: manipulation; }
      .odqlogin .row.acc button { padding: 8px 18px; min-width: 130px; }
      .odqlogin .row.kb button { width: 9.4%; min-width: 30px; padding: 6px 0; font-size: 14px; }
      .odqlogin .row.kb.fn button { width: auto; padding: 6px 14px; font-size: 13px; }
      .odqlogin button.sel { border-color: #e0b24a; color: #fff2c0; outline: 2px solid #000; }
      .odqlogin small { margin-top: 8px; color: #8a9a7e; font-size: 11px; }
      @media (max-width: 520px) { .odqlogin .row.kb { gap: 3px; } .odqlogin .row.kb button { width: 9.6%; min-width: 0; font-size: 13px; } .odqlogin .row.acc button { min-width: 0; flex: 1; } }`;
    document.head.appendChild(st);
  }

  // ------------------------------------------------------------------ the entry screen (a modal drawn over the 3D picture)
  let lw = null, lt = null, lkey = null, msgTimer = null, ksel = [0, 0];
  const sfx = (n) => bus.emit('sfx', n, {});
  function stopLogin() {
    if (lt) { clearInterval(lt); lt = null; }
    if (lkey) { document.removeEventListener('keydown', lkey, true); lkey = null; }
    if (msgTimer) { clearTimeout(msgTimer); msgTimer = null; }
  }
  const normKey = (k) => k.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  function loginHint() {
    return login.mode === 'senha' ? 'Digite a senha, ENTER confirma · ou use as teclas da tela · ESC volta' : 'Setas escolhem a conta · ENTER entra · ESC sai';
  }
  function paintLogin() {
    drawLogin(g, SW, SH, login, performance.now() / 1000);   // a screen blinks in real time; it never touches the simulation
    tex.needsUpdate = true;
    if (!lw) return;
    lw.querySelectorAll('[data-acc]').forEach((b) => b.classList.toggle('sel', Number(b.dataset.acc) === login.sel));
    lw.querySelectorAll('[data-k]').forEach((b) => b.classList.toggle('sel', b.dataset.pos === `${ksel[0]},${ksel[1]}`));
    lw.querySelector('[data-h]').textContent = loginHint();
  }
  function loginScreen() {
    stopLogin();
    using = true;
    login.mode = 'ask'; login.sel = 0; login.typed = ''; login.msg = '';
    lw = document.createElement('div'); lw.className = 'screen odqlogin';
    const kbRows = KEYS.slice(0, 3).map((row, r) => `<div class="row kb">${row.map((k, c) => `<button data-cell data-a="key" data-k="${k}" data-pos="${r},${c}">${k === ' ' ? '&#9141;' : k}</button>`).join('')}</div>`).join('');
    const fnRow = `<div class="row kb fn">${KEYS[3].map((k, c) => `<button data-cell data-a="fn" data-k="${k}" data-pos="3,${c}">${k}</button>`).join('')}</div>`;
    lw.innerHTML = `<div class="box"><h1>COMPUTADOR</h1><div class="vw" data-vw></div>
      <div class="row acc" data-ask>${ACCOUNTS.map(([n], i) => `<button data-cell data-a="acc" data-acc="${i}">${n}</button>`).join('')}</div>
      <div data-kb hidden>${kbRows}${fnRow}</div><small data-h></small></div>`;
    lw.querySelector('[data-vw]').appendChild(cv);
    const h = ui.menu({ title: 'COMPUTADOR', items: [{ label: () => '', act() {} }], onBack: leave });
    ui.el.modal.replaceChildren(lw);
    h.handle = loginPress; h.click = loginClick; h.redraw = paintLogin;
    lt = setInterval(paintLogin, 250);
    paintLogin();
  }
  function showKb(on) {
    lw.querySelector('[data-ask]').hidden = on; lw.querySelector('[data-kb]').hidden = !on;
  }
  function toAsk() {
    login.mode = 'ask'; login.typed = ''; login.msg = ''; login.sel = 1;
    if (lkey) { document.removeEventListener('keydown', lkey, true); lkey = null; }
    showKb(false); paintLogin();
  }
  function toSenha() {
    login.mode = 'senha'; login.sel = 1; login.typed = ''; login.msg = ''; ksel = [0, 0];
    showKb(true); paintLogin();
    // typing on a real keyboard: letters go to the field and never reach the game's own keys (W A S D E Q)
    lkey = (e) => {
      if (!lw || !lw.isConnected) { stopLogin(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Backspace') { type('APAGAR'); }
      else if (e.key === 'Enter') { submit(); }
      else if (e.key.length === 1 && /[A-Za-zÀ-ÿ 0-9]/.test(e.key)) { type(normKey(e.key)); }
      else return;
      e.stopPropagation(); e.preventDefault();
    };
    document.addEventListener('keydown', lkey, true);
  }
  function type(k) {
    login.msg = '';
    if (k === 'APAGAR') login.typed = login.typed.slice(0, -1);
    else if (login.typed.length < MAX_TYPED) login.typed += k;
    sfx('tecla'); paintLogin();
  }
  let checking = false, account = null;     // account: VALDIR's screens once the phrase is right
  async function submit() {
    // the phrase is checked against its hash; nothing in this file says what it is
    if (checking || !login.typed) return;
    checking = true; const phrase = login.typed; login.msg = 'CONFERINDO...'; paintLogin();
    let ok = false;
    try { ok = await check('senha', phrase); if (ok) account = await openAccount(phrase); } catch { ok = false; }
    checking = false;
    if (!lw || !lw.isConnected) return;    // left the screen while it was checking
    if (ok && account) { enterValdir(); return; }
    login.msg = 'SENHA INCORRETA'; login.typed = '';
    sfx('ui_voltar');
    paintLogin();
    if (msgTimer) clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { login.msg = ''; msgTimer = null; paintLogin(); }, 2200);
  }
  function enterValdir() {
    stopLogin(); lw = null; sfx('ui_ok');
    bus.emit('secret:found', 's1');
    valdirHome();
  }
  function valdirHome() {
    using = true;
    ui.menu({
      title: 'COMPUTADOR · VALDIR', subtitle: 'conta antiga',
      lines: ['Último acesso: 1998.'],
      items: [
        { label: () => 'RELATÓRIO DA PROMOÇÃO', act: () => valdirPage('RELATÓRIO DA PROMOÇÃO', account.relatorio) },
        { label: () => 'ESCALA DE VALDIR', act: () => valdirPage('ESCALA', account.escala) },
        { label: () => 'REGISTRAR OCORRÊNCIA (VALDIR)', act: valdirOccurrence },
        { label: () => 'TROCAR DE CONTA', act: () => { account = null; lock(); } },
        { label: () => 'SAIR', act: () => { account = null; leave(); } },
      ],
      onBack: () => { account = null; leave(); },
    });
  }
  function valdirPage(title, lines) {
    ui.menu({ title, lines, items: [{ label: () => 'VOLTAR', act: valdirHome }], onBack: valdirHome });
  }
  /** VALDIR's account asks for the date: the occurrence of the shift that was never closed. The date is checked by its hash. */
  async function valdirOccurrence() {
    if (progression.hasFlag('valdir:ocorrencia')) { bus.emit('hint', 'A ocorrência de Valdir já está registrada.'); return valdirHome(); }
    const typed = await ui.textPrompt({ title: 'OCORRÊNCIA · TURNO NÃO ENCERRADO', lines: ['Informe a data em que o turno de Valdir ficou aberto.', 'Formato: DD/MM/AAAA'], max: 24, okLabel: 'REGISTRAR' });
    if (typed === null) return valdirHome();
    let ok = false; try { ok = await check('data', typed); } catch { ok = false; }
    if (ok) {
      progression.flag('valdir:ocorrencia'); bus.emit('secret:found', 'valdir'); bus.emit('sfx', 'tecla', {});
      return ui.menu({ title: 'OCORRÊNCIA REGISTRADA', lines: ['O sistema aceitou a data.', 'O turno de Valdir continua aberto.'], items: [{ label: () => 'VOLTAR', act: valdirHome }], onBack: valdirHome });
    }
    bus.emit('sfx', 'ui_voltar', {});
    ui.menu({ title: 'DATA NÃO CONFERE', lines: ['O sistema não reconhece essa data para o turno.'], items: [{ label: () => 'TENTAR DE NOVO', act: valdirOccurrence }, { label: () => 'VOLTAR', act: valdirHome }], onBack: valdirHome });
  }
  function enterManager() { stopLogin(); unlocked = true; sfx('ui_ok'); drawScreen(); home(); }
  function loginPress(p) {
    if (login.mode === 'ask') {
      if (p.k === 'nav') { login.sel = login.sel === 0 ? 1 : 0; sfx('ui_mover'); paintLogin(); }
      else if (p.k === 'confirm') { if (login.sel === 0) enterManager(); else { sfx('ui_ok'); toSenha(); } }
      else if (p.k === 'back' || p.k === 'esc') leave();
      return;
    }
    if (p.k === 'nav') {
      let [r, c] = ksel;
      if (p.dy) { const nr = (r + p.dy + KEYS.length) % KEYS.length; c = nr === 3 ? Math.min(2, Math.floor(c / 3)) : (r === 3 ? c * 3 + 1 : c); r = nr; }
      if (p.dx) c = (c + p.dx + KEYS[r].length) % KEYS[r].length;
      ksel = [r, c]; sfx('ui_mover'); paintLogin();
    } else if (p.k === 'confirm') keyAct(KEYS[ksel[0]][ksel[1]]);
    else if (p.k === 'back' || p.k === 'esc') { sfx('ui_voltar'); toAsk(); }
  }
  function keyAct(k) {
    if (k === 'OK') submit(); else if (k === 'VOLTAR') { sfx('ui_voltar'); toAsk(); } else type(k);
  }
  function loginClick(cell) {
    const a = cell.dataset.a;
    if (a === 'acc') { login.sel = Number(cell.dataset.acc); sfx('ui_ok'); if (login.sel === 0) enterManager(); else toSenha(); }
    else if (a === 'key' || a === 'fn') { const [r, c] = cell.dataset.pos.split(',').map(Number); ksel = [r, c]; keyAct(cell.dataset.k); }
  }
  function lock() { unlocked = false; loginScreen(); }

  // ------------------------------------------------------------------ the desk
  const lab = (m) => time.fmt(Math.max(0, m));
  let regCtx = { back: null, cam: null };   // an occurrence started from a camera comes back to the monitor
  function reportLines() {
    const n = progression.night, pend = tasks.pending();
    const lines = [
      `Hora ${time.text()} · Noite ${progression.st.day}`,
      `Atendimentos ${n.atendimentos} · Vendas ${n.vendas} · Abastecimentos ${n.abastecimentos}`,
      `Tarefas feitas ${n.tarefas} · Pendentes ${pend.length}`,
      `Erros ${n.erros} · Reclamações ${n.reclamacoes}`,
      `Caixa: ${cash.opened ? 'aberto' : 'ainda fechado'} · Vendas no caixa ${money(cash.sales)}`,
      `Ocorrências registradas ${registered.length}`,
      `Pontos da noite ${n.pontos}`,
    ];
    if (pend.length) lines.push('Pendentes: ' + pend.slice(0, 4).map((t) => t.text.replace(/\s*\[.*$/, '')).join('; ') + (pend.length > 4 ? '…' : ''));
    for (const o of registered) lines.push(`${o.hora}  ${o.nome}`);
    return lines;
  }

  function home() {
    stopLogin();
    using = true; drawScreen();
    ui.menu({
      title: 'COMPUTADOR', subtitle: 'Posto Bom Dia · escritório',
      lines: () => [`${time.text()} · Noite ${progression.st.day}`],
      items: [
        { label: () => 'RELATÓRIO DA NOITE', act: report },
        { label: () => 'REGISTRAR OCORRÊNCIA', act: () => { regCtx = { back: null, cam: null }; pickType(); } },
        { label: () => 'TROCAR DE CONTA', act: lock },
        { label: () => 'SAIR', act: leave },
      ],
      onBack: leave,
    });
  }
  function leave() { stopLogin(); using = false; lw = null; ui.closeModal(); drawScreen(); bus.emit('sfx', 'ui_voltar', {}); }
  function report() {
    ui.menu({ title: 'RELATÓRIO DA NOITE', lines: reportLines(), items: [{ label: () => 'VOLTAR', act: home }], onBack: home });
  }
  /** Where the register flow goes back to: the computer's menu, or the monitor it was started from. */
  function backFromRegister() {
    const b = regCtx.back; regCtx = { back: null, cam: null };
    if (b) b(); else home();
  }
  function pickType() {
    ui.menu({
      title: 'REGISTRAR OCORRÊNCIA', lines: regCtx.cam ? ['Pela câmera. Qual foi o tipo?'] : ['Qual foi o tipo?'],
      items: [...cfg.tipos.map((t) => ({ label: () => t.nome.toUpperCase(), act: () => pickTime(t) })), { label: () => 'VOLTAR', act: backFromRegister }],
      onBack: backFromRegister,
    });
  }
  function pickTime(tipo) {
    const now = time.minutes;
    ui.menu({
      title: tipo.nome.toUpperCase(), lines: ['A que horas foi?'],
      items: [...cfg.atrasosMin.map((a) => ({ label: () => (a === 0 ? `AGORA (${lab(now)})` : `${a} MIN ATRÁS (${lab(now - a)})`), act: () => confirm(tipo, now - a) })), { label: () => 'VOLTAR', act: pickType }],
      onBack: pickType,
    });
  }
  function confirm(tipo, at) {
    ui.menu({
      title: 'CONFIRMAR', lines: [`${tipo.nome}`, `Horário: ${lab(at)}`, 'Fica gravado no relatório da noite.'],
      items: [{ label: () => 'REGISTRAR', act: () => record(tipo, at) }, { label: () => 'VOLTAR', act: () => pickTime(tipo) }],
      onBack: () => pickTime(tipo),
    });
  }
  function record(tipo, at) {
    const hit = incidents.find((i) => !i.registered && i.tipo === tipo.id && Math.abs(i.at - at) <= 25);
    const seventh = regCtx.cam === 'cam7';          // the figure is always there, on the camera the monitor does not list: it counts
    const valid = Boolean(hit) || seventh;
    if (hit) hit.registered = true;
    const rec = { tipo: tipo.id, nome: tipo.nome, hora: lab(at), at, valida: valid };
    if (regCtx.cam) rec.cam = regCtx.cam;   // registered from a camera (counts for the story as well)
    registered.push(rec);
    progression.st.occurrences.push(rec);
    progression.occurrence(valid);
    if (valid) progression.flag('ocorrencia:' + tipo.id);
    if (seventh) { progression.flag('cam7:ocorrencia'); bus.emit('secret:found', 's3'); }
    bus.emit('sfx', 'tecla', {}); bus.emit('occurrence', rec);
    bus.emit('hint', valid ? 'Ocorrência registrada.' : 'Registrada, mas não achei nada disso no que aconteceu.');
    drawScreen();
    ui.menu({
      title: 'OCORRÊNCIA REGISTRADA', lines: [`${rec.hora}  ${tipo.nome}`, valid ? 'O gerente vai ler isto no relatório.' : 'Não bate com nada que aconteceu: conta contra.'],
      items: [{ label: () => (regCtx.back ? 'VOLTAR ÀS CÂMERAS' : 'VOLTAR'), act: backFromRegister }], onBack: backFromRegister,
    });
  }

  /** Starts the register flow from outside the computer (the monitor): { cam: 'cam3', back: () => reopen the monitor }. */
  function openRegister({ cam = null, back = null } = {}) {
    regCtx = { back, cam };
    pickType();
  }

  interaction.register({
    id: 'computador', reach: 2.6, priority: 1,
    aim: () => ({ box: world.aimBox('computador', 0.18) }),
    enabled: () => true,
    label: () => ({ text: 'Usar o computador' }),
    tap: () => { bus.emit('sfx', 'tecla', {}); if (unlocked) home(); else loginScreen(); },
  });
  return {
    incidents, registered,
    reset() { stopLogin(); incidents.length = 0; registered.length = 0; using = false; unlocked = false; account = null; checking = false; lw = null; regCtx = { back: null, cam: null }; Object.assign(login, { sel: 1, mode: 'ask', typed: '', msg: '' }); drawScreen(); },
    drawScreen, openRegister, drawLogin,
    /** What using the computer does: the entry screen, or the menu when the manager's account is already open. */
    open() { if (unlocked) home(); else loginScreen(); },
    get unlocked() { return unlocked; },
    summary() { return registered.map((o) => ({ tipo: o.tipo, hora: o.hora, valida: o.valida })); },
    unregisteredReal: () => incidents.filter((i) => !i.registered).length,
  };
}
