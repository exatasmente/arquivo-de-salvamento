// The phone's layer alone (tools/mobile-preview.html): what each finger sends, on a picture that turns with the look.
import { mountMobile } from '../src/touch/mobile.js';
import { createTilt } from '../src/touch/tilt.js';

const canvas = document.getElementById('c'), g = canvas.getContext('2d');
const logEl = document.getElementById('log');
const st = { yaw: 0, pitch: 0, x: 0, z: 0, mx: 0, my: 0, run: false, breath: false, lines: [] };
const log = (t) => { st.lines.unshift(t); st.lines.length = Math.min(st.lines.length, 8); };
window.__preview = st;

const PUMP = { list: [{ text: 'Bico Aditivada' }, { text: 'Bico Etanol' }, { text: 'Pegar o bico' }], primary: 2, label: 'Bico Comum' };
let state = new URLSearchParams(location.search).get('state') || 'walk';
let hold = null;

const m = mountMobile(document.getElementById('app'), {
  move: (mx, my, run) => { st.mx = mx; st.my = my; if (run !== st.run) log(run ? 'correr' : 'andar'); st.run = run; },
  look: (dy, dp) => { st.yaw += dy; st.pitch = Math.max(-1.2, Math.min(1.2, st.pitch + dp)); },
  press: (k) => log(`press ${k}`),
  tap: (x, y) => log(`tap ${Math.round(x)},${Math.round(y)}`),
  act: (i, t) => { log(`act ${i} ${t}`); if (t === 'down') hold = { i, t0: performance.now() }; else hold = null; },
  breath: (on) => { st.breath = on; log(`breath ${on}`); },
  used: () => {},
});
m.setHand({ name: 'Lanterna', count: 2, icon: '◐' });
const tilt = createTilt({ onLook: (dy, dp) => { st.yaw += dy; st.pitch = Math.max(-1.2, Math.min(1.2, st.pitch + dp)); } });

function setState(s) {
  state = s;
  m.setHiding(s === 'hide');
  if (s === 'walk') m.setActions(null);
  log(`state ${s}`);
}
for (const b of document.querySelectorAll('#bar [data-s]')) b.addEventListener('click', () => setState(b.dataset.s));
document.getElementById('gyro').addEventListener('click', async () => { if (tilt.on) { tilt.disable(); log('giroscópio desligado'); } else log(`giroscópio ${(await tilt.enable()) ? 'ligado' : 'indisponível'}`); });
let left = false;
document.getElementById('left').addEventListener('click', () => { left = !left; m.setOptions({ left }); log(`canhoto ${left}`); });
setState(state);

function frame() {
  const W = innerWidth, H = innerHeight;
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  // the picture: a floor grid seen from where the look points, so a drag or the gyroscope shows
  g.fillStyle = '#0a0b10'; g.fillRect(0, 0, W, H);
  const horizon = H / 2 + st.pitch * H * 0.6;
  g.fillStyle = '#14161e'; g.fillRect(0, horizon, W, H - horizon);
  g.strokeStyle = 'rgba(201,162,74,.35)';
  for (let i = -20; i <= 20; i++) { const x = W / 2 + ((i * 0.3 - st.yaw) % 6) * W * 0.4; g.beginPath(); g.moveTo(x, horizon); g.lineTo(W / 2 + (x - W / 2) * 4, H); g.stroke(); }
  st.x += st.mx * (st.run ? 0.08 : 0.04); st.z += st.my * (st.run ? 0.08 : 0.04);
  g.fillStyle = '#f2c230'; g.beginPath(); g.arc(W / 2 + Math.sin(st.x) * 40, H * 0.3 + Math.cos(st.z) * 20, 6, 0, 7); g.fill();
  if (state === 'pump') {
    const at = { x: W / 2 - st.yaw * 300, y: H * 0.42 - st.pitch * 200 };
    const list = PUMP.list.map((r) => ({ ...r }));
    m.setActions({ ...PUMP, list, at });
  } else if (state === 'hide') {
    m.setActions({ list: [{ text: 'Sair do esconderijo' }], breath: st.breath ? Math.max(0, 1 - ((performance.now() / 1000) % 6) / 6) : 1 });
  }
  logEl.textContent = `yaw ${st.yaw.toFixed(2)} pitch ${st.pitch.toFixed(2)} move ${st.mx.toFixed(2)},${st.my.toFixed(2)}${st.run ? ' CORRE' : ''}\n${st.lines.join('\n')}`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
