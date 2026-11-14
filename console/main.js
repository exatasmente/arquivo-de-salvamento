// The home screen of the site: the channel's games in a row, as on a console's home screen. The row and the
// room behind it are drawn by the engine's render (PS1 look); the words and the buttons are the page's, so they
// stay sharp and readable. A game is chosen with a controller, the keyboard, a swipe or a tap, and opens.
import * as THREE from 'three';
import { createRender } from './vendor/engine/render.js';
import { createPad, firstPad, typing } from './vendor/engine/input.js';
import { makeKit } from './vendor/engine/sound.js';
import { GAMES, CHANNEL, savedLine } from './games.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- the person's choices on this device (a convenience: the screen works the same without them) ----
const PREFS = 'arquivo.console.v1';
const prefs = (() => { try { return { sel: 0, sound: true, ...JSON.parse(localStorage.getItem(PREFS) || '{}') }; } catch { return { sel: 0, sound: true }; } })();
const keepPrefs = () => { try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch { /* private mode */ } };
let storage = null;
try { storage = localStorage; } catch { /* blocked */ }

// ---- the render: the engine's frame, a little sharper than a game's ----
const canvas = $('#c');
const r = createRender(canvas, { look: 'ps1', params: { pixels: 480, pixelsPortrait: 300 }, fog: { color: '#0b0b14', near: 7, far: 26 }, fov: { landscape: 46, portrait: 58 } });
r.light({ ambient: '#5a5a78', key: '#b8b0a0', keyDir: [-0.3, -0.6, -1] });
const scene = r.scene, camera = r.camera;
camera.position.set(0, 0, 6);
camera.lookAt(0, 0, 0);

const loader = new THREE.TextureLoader();
function cover(url) {
  const t = loader.load(url);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.NoColorSpace;
  return t;
}
function label(text, w = 128, h = 24, color = '#9a98b8') {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(11,11,20,.85)'; g.fillRect(0, 0, w, h);
  g.fillStyle = color; g.font = `bold ${Math.round(h * 0.6)}px monospace`; g.textBaseline = 'middle';
  g.fillText(text, 6, h / 2 + 1);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.NoColorSpace;
  return t;
}

// The far wall: the chosen game's cover, large and dim, behind everything.
const backMat = r.mat('#3a3a52', { map: cover(GAMES[0].cover), fogged: 0, emissive: 1, transparent: true, depthWrite: false });
const back = new THREE.Mesh(new THREE.PlaneGeometry(1, 9 / 16), backMat);
scene.add(back);

// Dust: small quads on a slow ring around the row (one geometry, turned as a whole).
const dust = (() => {
  const pos = [], rnd = (() => { let s = 7; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); })();
  for (let i = 0; i < 160; i++) {
    const a = rnd() * Math.PI * 2, rad = 4 + rnd() * 8, y = (rnd() - 0.5) * 8, s = 0.02 + rnd() * 0.03;
    const x = Math.cos(a) * rad, z = -Math.abs(Math.sin(a)) * rad - 1.5;
    pos.push(x - s, y - s, z, x + s, y - s, z, x + s, y + s, z, x - s, y - s, z, x + s, y + s, z, x - s, y + s, z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  const m = new THREE.Mesh(g, r.glow('#8a7e60', { fogged: 0.8, side: THREE.DoubleSide }));
  m.position.z = -3;
  scene.add(m);
  return m;
})();

// The row: one tile per game, then an empty slot (the next game's).
const row = new THREE.Group();
scene.add(row);
const tiles = GAMES.map((g, i) => {
  const t = new THREE.Group();
  const frameMat = r.mat('#2e2e5c', { emissive: 0.6 });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.6, 0.06), frameMat);
  frame.position.z = -0.035;
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(1, 9 / 16), r.mat('#ffffff', { map: cover(g.cover), emissive: 0.75 }));
  t.add(frame, pic);
  t.userData = { i, frameMat, picMat: pic.material, x: 0, z: 0, s: 1, ry: 0, k: 0 };
  row.add(t);
  return t;
});
const empty = (() => {
  const t = new THREE.Group();
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 9 / 16)), new THREE.LineBasicMaterial({ color: 0x4a4a7c }));
  const word = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.1), r.mat('#ffffff', { map: label('VAZIO', 80, 20, '#6e6c90'), emissive: 1, fogged: 0 }));
  t.add(edges, word);
  t.userData = { i: GAMES.length, x: 0, z: 0, s: 1, ry: 0, k: 0 };
  row.add(t);
  return t;
})();
const slots = [...tiles, empty];

// ---- power-on: a memory card is read block by block, then the row comes in. Once per visit (a game that
// closes back to this page does not turn the console on again); any key, tap or button skips it. ----
const BOOTED = 'arquivo.console.booted';
const bootWanted = (() => {
  if (/[?&]noboot(=|&|$)/.test(location.search)) return false;
  try { return !sessionStorage.getItem(BOOTED); } catch { return true; }
})();
const boot = { on: bootWanted, t: 0, lit: 0, out: 0 };
const bootCard = (() => {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1, 0.1), r.mat('#f5b700', { emissive: 0.35 }));
  const notch = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.12, 0.08), r.mat('#7a3a00', { emissive: 0.3 }));
  notch.position.set(0.02, -0.44, -0.03);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.42), r.mat('#0b0b14', { emissive: 1 }));
  win.position.set(0, 0.16, 0.051);
  g.add(body, notch, win);
  const blocks = [];
  for (let i = 0; i < 15; i++) {
    const m = r.mat('#1b1e29', { emissive: 1 });
    const q = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.09), m);
    q.position.set(-0.22 + (i % 5) * 0.11, 0.29 - Math.floor(i / 5) * 0.12, 0.053);
    g.add(q); blocks.push(m);
  }
  for (const x of [-0.22, 0, 0.22]) {
    const c = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.16), r.mat('#0b0b14', { emissive: 1 }));
    c.position.set(x, -0.24, 0.051); g.add(c);
  }
  g.userData.blocks = blocks;
  g.visible = false;
  scene.add(g);
  return g;
})();
const savedCount = () => GAMES.filter((x) => savedLine(x, storage) !== null).length;
function bootStatus(text) { const el = $('#boot .status'); if (el) el.textContent = text; }
function endBoot() {
  if (!boot.on && document.body.classList.contains('ready')) return;
  boot.on = false;
  bootCard.visible = false;
  try { sessionStorage.setItem(BOOTED, '1'); } catch { /* private mode */ }
  // the row comes in from behind
  for (const s of slots) { s.userData.z = -5; s.userData.s = 0.4; }
  row.visible = true;
  document.body.classList.add('ready');
  setTimeout(() => $('#boot')?.remove(), 600);
}
function bootStep(dt, t) {
  boot.t += dt;
  const b = boot.t;
  bootCard.visible = true;
  row.visible = false;
  const inK = Math.min(1, b / 0.8), ease = 1 - (1 - inK) ** 3;
  const outK = Math.max(0, (b - 3.0) / 0.5);
  bootCard.position.set(0, 0.35 + outK * 1.5, -3 + ease * 3 - outK * 4);
  bootCard.rotation.set(still ? 0 : Math.sin(t * 1.3) * 0.06, (1 - ease) * -1.6 + (still ? 0 : Math.sin(t * 0.8) * 0.12), 0);
  const vh = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), vw = vh * camera.aspect;
  const scale = Math.min((vw * 0.42) / 0.8, vh * 0.34);
  bootCard.scale.setScalar(scale);
  const lit = Math.max(0, Math.min(15, Math.floor((b - 0.9) / 0.08)));
  while (boot.lit < lit) {
    bootCard.userData.blocks[boot.lit].uniforms.uColor.value.set('#e0a526');
    boot.lit++;
    blip('tick');
  }
  if (b > 0.5 && b < 0.9) bootStatus('LENDO O CARTÃO DE MEMÓRIA…');
  if (b > 2.2 && !boot.said) {
    boot.said = true;
    const n = savedCount();
    bootStatus(`${GAMES.length} JOGOS NO ARQUIVO · ${n === 0 ? 'NENHUM SALVO' : n === 1 ? '1 SALVO' : `${n} SALVOS`}`);
    blip('chime');
  }
  if (b > 3.1) document.getElementById('boot')?.classList.add('out');
  if (b > 3.5) endBoot();
}

// ---- layout: the row sits where the page leaves room for it (#stage), at the size of that room ----
const stage = $('#stage');
const lay = { tileW: 1, spacing: 1.2, y: 0 };
// The size of the screen as the page shows it now (an iPhone that turns can still report the old size for a moment, and
// leave the page scrolled: the picture would then be bigger than the screen and the taps would land off the tiles).
const screenSize = () => { const v = window.visualViewport; return v && v.scale > 0.98 && v.scale < 1.02 ? [Math.round(v.width), Math.round(v.height)] : [innerWidth, innerHeight]; };
function fit() {
  const [W, H] = screenSize();
  if (scrollX || scrollY) scrollTo(0, 0);
  r.resize(W, H);
  const d = camera.position.z;
  const vh = 2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), vw = vh * camera.aspect;
  const b = stage.getBoundingClientRect();
  lay.y = (0.5 - (b.top + b.height / 2) / H) * vh;
  const byHeight = (b.height / H) * vh * 0.78 * (16 / 9);
  lay.tileW = Math.min(byHeight, vw * (W < 600 ? 0.78 : 0.42));
  lay.spacing = lay.tileW * (W < 600 ? 0.92 : 1.02);
  row.position.y = lay.y;
  row.scale.setScalar(lay.tileW);
  back.scale.setScalar(Math.max(vw, vh * 16 / 9) * 2.4);
  back.position.set(0, 0, -9);
}
let refitT = [];
const refit = () => { fit(); for (const t of refitT) clearTimeout(t); refitT = [setTimeout(fit, 150), setTimeout(fit, 600)]; };
addEventListener('resize', refit); addEventListener('orientationchange', refit); window.visualViewport?.addEventListener('resize', refit);

// ---- state ----
let sel = Math.min(GAMES.length - 1, Math.max(0, prefs.sel | 0));
let focus = 'row';           // 'row' | 'dock' | 'panel'
let dockIdx = 0;
let leaving = false;
let device = matchMedia('(any-pointer: coarse)').matches ? 'touch' : 'keyboard';
let panelRows = [], panelIdx = 0;
const dockBtns = [...document.querySelectorAll('#dock button')];

function show() {
  const g = GAMES[sel];
  $('#title').textContent = g.title;
  $('#hook').textContent = g.hook;
  $('#desc').textContent = g.desc;
  const s = savedLine(g, storage);
  $('#saved').textContent = s || `NOVO · ${g.tags}`;
  $('#saved').classList.toggle('new', !s);
  const n = GAMES.filter((x) => savedLine(x, storage) !== null || (storage && storage.getItem(x.card))).length;
  $('#blocks').textContent = n === 0 ? 'CARTÃO DE MEMÓRIA VAZIO' : `CARTÃO · ${n} ${n === 1 ? 'JOGO SALVO' : 'JOGOS SALVOS'}`;
  backMat.uniforms.map.value = tiles[sel].userData.picMat.uniforms.map.value;
  backMat.opacity = 0;
  document.title = `${g.title} · Arquivo de Salvamento`;
  for (const [i, b] of dockBtns.entries()) b.classList.toggle('on', focus === 'dock' && i === dockIdx);
  $('#row-a11y').textContent = `${g.title}. ${s || 'Sem jogo salvo.'}`;
}

function choose(d) {
  const n = Math.min(GAMES.length - 1, Math.max(0, sel + d));
  if (n === sel) { blip('edge'); return; }
  sel = n; prefs.sel = sel; keepPrefs();
  blip('move');
  show();
}

function play() {
  if (leaving) return;
  leaving = true;
  blip('go');
  const g = GAMES[sel];
  document.body.classList.add('leaving');
  setTimeout(() => { location.href = g.url; }, still ? 60 : 520);
}

// ---- the panels (videos, the channel, options): a list navigated like the rest ----
let installEvt = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; });
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const ios = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

async function offlineState() {
  if (!('serviceWorker' in navigator)) return 'Este navegador não guarda os jogos para jogar sem internet.';
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg || !reg.active) return 'Preparando para jogar sem internet…';
  const answer = await new Promise((res) => {
    const ch = new MessageChannel();
    const t = setTimeout(() => res(null), 1500);
    ch.port1.onmessage = (e) => { clearTimeout(t); res(e.data); };
    reg.active.postMessage({ type: 'status' }, [ch.port2]);
  });
  if (!answer) return 'Preparando para jogar sem internet…';
  return answer.ready ? 'Pronto: os jogos abrem sem internet.' : `Guardando os jogos para jogar sem internet (${answer.have} de ${answer.total})…`;
}

function openPanel(kind) {
  const g = GAMES[sel];
  let head = '', rows = [];
  if (kind === 'videos') {
    head = `VÍDEOS · ${g.title}`;
    rows = g.videos.map(([t, u]) => ({ html: `<span class="ic">▶</span>${esc(t)}`, href: u }));
  } else if (kind === 'channel') {
    head = 'ONDE O CANAL ESTÁ';
    rows = CHANNEL.map(([t, u]) => ({ html: `<span class="ic">◆</span>${esc(t)}`, href: u }));
  } else {
    head = 'OPÇÕES';
    if (!standalone()) {
      if (installEvt) rows.push({ html: '<span class="ic">⬇</span>Instalar neste aparelho', act: async () => { const e = installEvt; installEvt = null; await e.prompt(); closePanel(); } });
      else if (ios()) rows.push({ html: '<span class="ic">⬇</span>Instalar: toque em Compartilhar e em “Adicionar à Tela de Início”', act: null });
      else rows.push({ html: '<span class="ic">⬇</span>Instalar: no menu do navegador, “Instalar app” ou “Adicionar à tela inicial”', act: null });
    }
    rows.push({ html: `<span class="ic">♪</span>Som do menu: ${prefs.sound ? 'ligado' : 'desligado'}`, act: () => { prefs.sound = !prefs.sound; keepPrefs(); openPanel('options'); } });
    rows.push({ html: '<span class="ic">◌</span><span class="off">…</span>', act: null, id: 'offline' });
  }
  panelRows = rows; panelIdx = Math.max(0, rows.findIndex((x) => x.href || x.act));
  $('#panel h2 span').textContent = head;
  $('#panel ul').innerHTML = rows.map((x, i) => x.href
    ? `<li><a href="${esc(x.href)}" target="_blank" rel="noopener" data-i="${i}">${x.html}</a></li>`
    : `<li><button type="button" data-i="${i}"${x.act ? '' : ' disabled'}>${x.html}</button></li>`).join('');
  $('#panel').hidden = false;
  focus = 'panel';
  markPanel();
  if (kind === 'options') offlineState().then((s) => { const el = $('#panel .off'); if (el) el.textContent = s; });
}
function markPanel() { for (const el of document.querySelectorAll('#panel [data-i]')) el.classList.toggle('on', Number(el.dataset.i) === panelIdx); }
function closePanel() { $('#panel').hidden = true; focus = 'dock'; blip('back'); show(); }
function panelGo() {
  const x = panelRows[panelIdx];
  if (!x) return;
  if (x.href) { blip('go'); window.open(x.href, '_blank', 'noopener'); }
  else if (x.act) { blip('go'); x.act(); }
}
function panelMove(d) {
  const live = panelRows.map((x, i) => (x.href || x.act ? i : -1)).filter((i) => i >= 0);
  if (!live.length) return;
  const at = live.indexOf(panelIdx);
  const next = live[Math.min(live.length - 1, Math.max(0, at + d))];
  if (next !== panelIdx) { panelIdx = next; blip('move'); markPanel(); } else blip('edge');
}
$('#panel').addEventListener('click', (e) => {
  if (e.target === $('#panel') || e.target.closest('.close')) { closePanel(); return; }
  const el = e.target.closest('[data-i]');
  if (!el) return;
  panelIdx = Number(el.dataset.i); markPanel();
  if (el.tagName === 'BUTTON') panelGo(); else blip('go');
});

// ---- the dock ----
function dockGo(i) {
  const act = dockBtns[i].dataset.act;
  if (act === 'play') play(); else { blip('go'); openPanel(act); }
}
dockBtns.forEach((b, i) => b.addEventListener('click', () => { device = device === 'gamepad' ? device : 'touch'; dockIdx = i; dockGo(i); }));

// ---- one meaning for every device: move, go, back, videos ----
function act(k, d = 0) {
  if (leaving) return;
  if (boot.on) { endBoot(); return; }
  if (focus === 'panel') {
    if (k === 'y' && d) panelMove(d); else if (k === 'go') panelGo(); else if (k === 'back') closePanel();
    return;
  }
  if (focus === 'row') {
    if (k === 'x') choose(d);
    else if (k === 'y' && d > 0) { focus = 'dock'; dockIdx = 0; blip('move'); show(); }
    else if (k === 'go') play();
    else if (k === 'videos') openPanel('videos');
    return;
  }
  // dock
  if (k === 'x') { const n = Math.min(dockBtns.length - 1, Math.max(0, dockIdx + d)); if (n !== dockIdx) { dockIdx = n; blip('move'); show(); } else blip('edge'); }
  else if ((k === 'y' && d < 0) || k === 'back') { focus = 'row'; blip('move'); show(); }
  else if (k === 'go') dockGo(dockIdx);
  else if (k === 'videos') openPanel('videos');
}

addEventListener('keydown', (e) => {
  if (typing()) return;
  if (boot.on && !e.repeat) { e.preventDefault(); endBoot(); return; }
  const map = { ArrowLeft: ['x', -1], KeyA: ['x', -1], ArrowRight: ['x', 1], KeyD: ['x', 1], ArrowUp: ['y', -1], KeyW: ['y', -1], ArrowDown: ['y', 1], KeyS: ['y', 1],
    Enter: ['go'], Space: ['go'], Escape: ['back'], Backspace: ['back'] };
  const m = map[e.code];
  if (!m) return;
  // a link or a button that has the browser's focus keeps Enter for itself
  if (e.code === 'Enter' && document.activeElement && document.activeElement.closest?.('#panel, #dock')) return;
  e.preventDefault();
  device = 'keyboard'; hints();
  act(m[0], m[1] || 0);
});

// A swipe across the screen changes the game; a tap on a tile chooses it, and on the chosen one opens it.
const ray = new THREE.Raycaster();
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  if (boot.on) { endBoot(); return; }
  if (focus === 'panel' || leaving) return;
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), stepped: 0 };
  device = e.pointerType === 'mouse' ? 'keyboard' : 'touch'; hints();
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const steps = Math.trunc((drag.x - e.clientX) / 70);
  if (steps !== drag.stepped) { choose(steps - drag.stepped); drag.stepped = steps; }
});
canvas.addEventListener('pointerup', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const moved = Math.hypot(e.clientX - drag.x, e.clientY - drag.y), quick = performance.now() - drag.t < 450;
  const was = drag; drag = null;
  if (was.stepped || moved > 12 || !quick) return;
  const rc = canvas.getBoundingClientRect();   // the picture where it really is, not where the window says it should be
  ray.setFromCamera(new THREE.Vector2(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1), camera);
  const hit = ray.intersectObjects(tiles, true)[0];
  if (!hit) return;
  let o = hit.object; while (o.parent && !tiles.includes(o)) o = o.parent;
  const i = o.userData.i;
  focus = 'row';
  if (i === sel) play(); else choose(i - sel);
});
canvas.addEventListener('pointercancel', () => { drag = null; });
let lastWheel = 0;
addEventListener('wheel', (e) => {
  if (focus === 'panel' || Math.abs(e.deltaX) + Math.abs(e.deltaY) < 30) return;
  const now = performance.now();
  if (now - lastWheel < 260) return;
  lastWheel = now;
  choose(Math.sign(Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY));
}, { passive: true });

// The controller: read once a frame through the engine.
const pad = createPad();
function readPad() {
  const p = pad.read();
  if (!p) return;
  if (p.any || p.nav) { if (device !== 'gamepad') { device = 'gamepad'; hints(); } }
  if (boot.on) { if (p.any) endBoot(); return; }
  if (p.nav) act(p.nav.dx ? 'x' : 'y', p.nav.dx || p.nav.dy);
  const dirs = [[12, 'y', -1], [13, 'y', 1], [14, 'x', -1], [15, 'x', 1]];
  for (const [b, k, d] of dirs) if (p.down[b]) act(k, d);
  if (p.down[0] || p.down[9]) act('go');
  if (p.down[1]) act('back');
  if (p.down[3]) act('videos');
}

// ---- what the bottom line says: the controller's buttons only while a controller is connected ----
let lastHints = '';
function hints() {
  const padOn = Boolean(firstPad());
  const dev = padOn && device === 'gamepad' ? 'gamepad' : device === 'gamepad' ? (matchMedia('(any-pointer: coarse)').matches ? 'touch' : 'keyboard') : device;
  const g = (t, sq) => `<i class="g${sq ? ' sq' : ''}">${t}</i>`;
  let html;
  if (focus === 'panel') {
    html = dev === 'gamepad' ? `<span>${g('A')}ABRIR</span><span>${g('B')}VOLTAR</span>`
      : dev === 'touch' ? '<span>TOQUE PARA ABRIR</span><span>TOQUE FORA PARA VOLTAR</span>'
        : `<span>${g('↑ ↓', 1)}ESCOLHER</span><span>${g('ENTER', 1)}ABRIR</span><span>${g('ESC', 1)}VOLTAR</span>`;
  } else if (dev === 'gamepad') {
    html = `<span>${g('◀ ▶', 1)}ESCOLHER</span><span>${g('A')}JOGAR</span><span>${g('B')}VOLTAR</span><span>${g('Y')}VÍDEOS</span>`;
  } else if (dev === 'touch') {
    html = '<span>DESLIZE PARA ESCOLHER</span><span>TOQUE NO JOGO PARA JOGAR</span>';
  } else {
    html = `<span>${g('← →', 1)}ESCOLHER</span><span>${g('ENTER', 1)}JOGAR</span><span>${g('↓', 1)}MAIS</span>`;
  }
  if (html !== lastHints) { $('#hints').innerHTML = html; lastHints = html; }
}
addEventListener('gamepadconnected', () => { device = 'gamepad'; hints(); });
addEventListener('gamepaddisconnected', () => { device = matchMedia('(any-pointer: coarse)').matches ? 'touch' : 'keyboard'; hints(); });

// ---- the menu's sound: short tones from the engine's kit, after the first gesture ----
let kit = null;
function blip(kind) {
  if (!prefs.sound) return;
  if (!kit && navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try {
    if (!kit) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const out = ctx.createGain(); out.gain.value = 0.35; out.connect(ctx.destination);
      kit = makeKit({ ctx }, { node: out });
    }
    if (kit.ctx.state === 'suspended') kit.ctx.resume();
    const t = kit.ctx.currentTime + 0.01;
    if (kind === 'tick') kit.tone(t, 0.025, { type: 'square', f0: 1320, g: 0.05, lp: 3000 });
    else if (kind === 'chime') { kit.tone(t, 0.5, { type: 'triangle', f0: 392, g: 0.14 }); kit.tone(t + 0.12, 0.6, { type: 'triangle', f0: 587, g: 0.12 }); kit.tone(t + 0.24, 0.9, { type: 'triangle', f0: 784, g: 0.1 }); }
    else if (kind === 'move') kit.tone(t, 0.05, { type: 'square', f0: 660, g: 0.12, lp: 2400 });
    else if (kind === 'edge') kit.tone(t, 0.06, { type: 'square', f0: 180, g: 0.1, lp: 1200 });
    else if (kind === 'back') kit.tone(t, 0.08, { type: 'square', f0: 520, f1: 330, g: 0.12, lp: 2000 });
    else if (kind === 'go') { kit.tone(t, 0.07, { type: 'square', f0: 523, g: 0.12, lp: 2600 }); kit.tone(t + 0.07, 0.16, { type: 'square', f0: 784, g: 0.12, lp: 2600 }); }
  } catch { /* no sound on this device */ }
}

// ---- the frame ----
const t0 = performance.now();
let tPrev = t0;
function frame(now = performance.now()) {
  const dt = Math.min(0.05, Math.max(0, (now - tPrev) / 1000)), t = (now - t0) / 1000;
  tPrev = now;
  readPad();
  r.time(t);
  if (boot.on) bootStep(dt, t);
  const ease = 1 - Math.exp(-dt * (still ? 60 : 9));
  for (const s of slots) {
    const u = s.userData, off = u.i - sel, chosen = off === 0 && u.i < GAMES.length;
    const tx = off * lay.spacing / lay.tileW + (off ? Math.sign(off) * 0.12 : 0);
    const tz = chosen ? (leaving ? 2.2 : 0.15) : -0.35 - Math.abs(off) * 0.1;
    const ts = chosen ? 1 : 0.66;
    const tr = chosen ? 0 : -Math.sign(off) * 0.32;
    u.x += (tx - u.x) * ease; u.z += (tz - u.z) * ease; u.s += (ts - u.s) * ease; u.ry += (tr - u.ry) * ease;
    u.k += ((chosen ? 1 : 0) - u.k) * ease;
    const bob = chosen && !still ? Math.sin(t * 1.6) * 0.012 : 0;
    s.position.set(u.x, bob, u.z);
    s.scale.setScalar(u.s);
    s.rotation.set(chosen && !still ? Math.sin(t * 0.9) * 0.025 : 0, u.ry + (chosen && !still ? Math.sin(t * 0.7) * 0.05 : 0), 0);
    if (u.frameMat) {
      u.frameMat.uniforms.uColor.value.set(u.k > 0.5 ? (focus === 'row' ? '#f5b700' : '#8a7a3a') : '#2e2e5c');
      u.picMat.uniforms.uColor.value.setScalar(0.45 + u.k * 0.55);
    }
  }
  backMat.opacity += ((leaving || boot.on ? 0 : 0.5) - backMat.opacity) * (1 - Math.exp(-dt * 3));
  if (!still) dust.rotation.y = t * 0.03;
  r.draw();
  requestAnimationFrame(frame);
}

// Coming back to this page from a game with the browser's back button: the page is as it was left.
addEventListener('pageshow', (e) => { if (e.persisted) { leaving = false; document.body.classList.remove('leaving'); show(); } });

fit();
show();
hints();
if (boot.on) { row.visible = false; document.getElementById('boot')?.classList.add('lit'); } else endBoot();
requestAnimationFrame(frame);

// ---- offline: the service worker keeps the site and both games after the first visit ----
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => { /* the page still works online */ }); });
}
