// HUD in blocks, the pause menu, screen flashes (with the safety limits) and debug popups.
import * as THREE from 'three';

const OPT_KEY = 'rinha.opts';
export function loadOpts() {
  try { return { reduceFlash: false, mute: false, ...JSON.parse(localStorage.getItem(OPT_KEY) || '{}') }; } catch { return { reduceFlash: false, mute: false }; }
}
function saveOpts(o) { try { localStorage.setItem(OPT_KEY, JSON.stringify(o)); } catch { /* private mode */ } }

export function createHud(root, { debug, opts, onOpts, onResume, onCard }) {
  root.insertAdjacentHTML('beforeend', `
    <div id="hud" class="fight-only">
      <div class="panel left">${bars('p')}</div>
      <div class="panel right">${bars('o')}</div>
    </div>
    <div id="fx"></div>
    <div id="dot"></div>
    <div id="vig"></div>
    <div id="fightno"></div>
    <div id="credits"></div>
    <div id="item" class="fight-only"></div>
    <div id="target"></div>
    <div id="tut" hidden><i></i><span></span></div>
    <div id="toast" hidden></div>
    <div id="apple" hidden>MA&Ccedil;&Atilde;</div>
    <div id="title" hidden><b></b><i></i></div>
    <div id="result" hidden><div class="box"><h1></h1><p></p><ul></ul><small></small><em></em></div></div>
    <div id="popups"></div>
    <div id="dbg" hidden></div>
    <div id="pause" hidden><div class="box"><h1>PAUSA</h1><ul></ul></div></div>`);
  const $ = (s) => root.querySelector(s);
  const fx = $('#fx'), popups = $('#popups'), dbg = $('#dbg'), pause = $('#pause'), list = pause.querySelector('ul');
  if (debug) dbg.hidden = false;
  const vig = $('#vig'), fightno = $('#fightno'), title = $('#title'), result = $('#result'), canvasEl = document.getElementById('c');
  const els = {
    pEq: [...root.querySelectorAll('.panel.left .eq i')], pFo: [...root.querySelectorAll('.panel.left .fo i')],
    oEq: [...root.querySelectorAll('.panel.right .eq i')], oFo: [...root.querySelectorAll('.panel.right .fo i')],
  };
  const setBlocks = (arr, frac) => { const n = Math.round(frac * arr.length * 2) / 2; arr.forEach((b, i) => { b.className = i + 1 <= n ? 'on' : i + 0.5 === n ? 'half' : ''; }); };

  // ---- pause menu ----
  const items = [
    { id: 'resume', label: () => 'CONTINUAR', act: () => onResume() },
    { id: 'flash', label: () => `REDUZIR CLAR&Otilde;ES: ${opts.reduceFlash ? 'SIM' : 'N&Atilde;O'}`, act: () => { opts.reduceFlash = !opts.reduceFlash; saveOpts(opts); onOpts?.(opts); } },
    { id: 'card', label: () => 'CART&Atilde;O DE MEM&Oacute;RIA', act: () => onCard && onCard() },
    { id: 'sound', label: () => `SOM: ${opts.mute ? 'N&Atilde;O' : 'SIM'}`, act: () => { opts.mute = !opts.mute; saveOpts(opts); onOpts?.(opts); } },
    // back to the site's home screen (the progress is the card's: what was saved stays)
    { id: 'home', label: () => 'SAIR PARA O MENU', act: () => { location.href = '../'; } },
  ];
  let sel = 0;
  function renderMenu() {
    list.innerHTML = items.map((it, i) => `<li data-i="${i}" class="${i === sel ? 'sel' : ''}">${it.label()}</li>`).join('');
  }
  list.addEventListener('pointerdown', (e) => {
    const li = e.target.closest('li'); if (!li) return;
    sel = Number(li.dataset.i); items[sel].act(); renderMenu(); e.preventDefault();
  });

  // ---- flashes: at most 3 per second, each rising and falling over at least 0.1 s, never full white ----
  const flashes = []; // { t0, strong }
  const RISE = 0.12, FALL = 0.28, PEAK = 0.5;
  function flash(t, strength = 1) {
    const recent = flashes.filter((f) => t - f.t0 < 1);
    if (recent.length >= 3 || (flashes.length && t - flashes[flashes.length - 1].t0 < RISE + FALL)) return false;
    flashes.push({ t0: t, strength });
    if (flashes.length > 8) flashes.shift();
    return true;
  }
  function drawFlash(t) {
    let a = 0;
    for (const f of flashes) {
      const u = t - f.t0;
      if (u < 0 || u > RISE + FALL) continue;
      a = Math.max(a, (u < RISE ? u / RISE : 1 - (u - RISE) / FALL) * f.strength);
    }
    fx.style.background = opts.reduceFlash ? '#05060a' : '#e9e2cc';
    fx.style.opacity = String(a * (opts.reduceFlash ? 0.45 : PEAK));
  }

  // ---- debug popups ----
  const live = [];
  function popup(text, pos, t, cls = '') {
    const el = document.createElement('div'); el.className = 'pop ' + cls; el.textContent = text; popups.appendChild(el);
    live.push({ el, pos: pos.clone(), t0: t });
  }
  const P = new THREE.Vector3();
  function drawPopups(camera, t, w, h) {
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i], u = t - p.t0;
      if (u > 1.1) { p.el.remove(); live.splice(i, 1); continue; }
      P.copy(p.pos); P.y += u * 0.35; P.project(camera);
      p.el.style.transform = `translate(${(P.x * 0.5 + 0.5) * w}px, ${(-P.y * 0.5 + 0.5) * h}px) translate(-50%,-50%)`;
      p.el.style.opacity = String(1 - Math.max(0, u - 0.7) / 0.4);
    }
  }

  result.addEventListener('pointerdown', (e) => { e.preventDefault(); if (api.result.onConfirm) api.result.onConfirm(); });
  const api = {
    update(player, opp) {
      setBlocks(els.pEq, player.balance / 100); setBlocks(els.pFo, player.stamina / 6);
      setBlocks(els.oEq, opp.balance / 100); setBlocks(els.oFo, opp.stamina / 6);
    },
    flash, drawFlash, popup, drawPopups,
    setFight(t) { fightno.textContent = t; },
    setCredits(n) { root.querySelector('#credits').textContent = `CR ${n}`; },
    setItem(t) { root.querySelector('#item').textContent = t; },
    /** The label of what E, A or a tap would use now (or none). */
    setTarget(t) { const el = root.querySelector('#target'); el.textContent = t || ''; el.classList.toggle('on', Boolean(t)); root.querySelector('#dot').classList.toggle('on', Boolean(t)); },
    setTut(text, prog) { const el = root.querySelector('#tut'); el.hidden = !text; if (text) { el.querySelector('span').textContent = text; el.querySelector('i').textContent = prog || ''; } },
    toast(text, ms = 2600) { const el = root.querySelector('#toast'); el.textContent = text; el.hidden = false; clearTimeout(el._t); el._t = setTimeout(() => { el.hidden = true; }, ms); },
    setApple(on) { root.querySelector('#apple').hidden = !on; },
    setStoneNear(on) { document.body.classList.toggle('stone-near', on); },
    setCell(on) { document.body.classList.toggle('cell', on); },
    setTitle(a, b = '') { title.hidden = !a; title.querySelector('b').textContent = a; title.querySelector('i').textContent = b; },
    // disorientation on the view: medium blurs, heavy closes the view in a tunnel
    setDaze(dz) {
      const k = dz ? Math.min(1, dz.left / dz.dur) : 0, lv = dz && dz.level;
      vig.style.opacity = lv === 'pesada' ? String(0.95 * Math.min(1, k * 1.4)) : lv === 'media' ? String(0.18 * k) : '0';
      vig.style.background = lv === 'pesada' ? 'radial-gradient(ellipse at center, rgba(0,0,0,0) 12%, rgba(0,0,0,.92) 48%, #000 70%)' : 'radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,.8) 100%)';
      canvasEl.style.filter = lv === 'media' ? `blur(${(2.6 * k).toFixed(2)}px)` : lv === 'pesada' ? `blur(${(1.2 * k).toFixed(2)}px)` : '';
    },
    result: {
      onConfirm: null,
      show(h, p, small, lines = []) { result.querySelector('h1').textContent = h; result.querySelector('p').textContent = p; result.querySelector('small').textContent = small; result.querySelector('ul').innerHTML = lines.map((l) => `<li>${l}</li>`).join(''); result.querySelector('em').textContent = 'ENTER / A / TOQUE'; result.hidden = false; document.body.classList.add('overlay'); },
      hide() { result.hidden = true; document.body.classList.remove('overlay'); },
      get open() { return !result.hidden; },
    },
    debugText(s) { if (debug) dbg.textContent = s; },
    menu: {
      show() { sel = 0; renderMenu(); pause.hidden = false; },
      hide() { pause.hidden = true; },
      nav(d) { sel = (sel + d + items.length) % items.length; renderMenu(); },
      activate() { items[sel].act(); renderMenu(); },
      get open() { return !pause.hidden; },
    },
    pauseButton: $('#pausebtn'),
  };
  return api;
}

function bars(k) {
  const blocks = (n) => '<i></i>'.repeat(n);
  return `<div class="row eq"><b>EQ</b>${blocks(10)}</div><div class="row fo"><b>F&Ocirc;</b>${blocks(6)}</div>`;
}
