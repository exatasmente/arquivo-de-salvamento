// Preview of the day off without the game: the real render, input, ui and dayoff system, with a bus and a wallet of its own.
// ?week=1..4 ?wallet=reais ?contas=aluguel:30,luz:12,geladeira:20 ?sanidade=n ?seed=n ?manual (tests call __d.advance(n)) ?touch ?silent
import { createRender } from '../src/render.js';
import { createInput } from '../src/input.js';
import { createBus } from '../src/bus.js';
import { createUI } from '../src/ui.js';
import { createDayOff } from '../src/systems/dayoff.js';

const q = new URLSearchParams(location.search);
const root = document.getElementById('app'), canvas = document.getElementById('c');
const render = createRender(canvas);
const input = createInput();
if (q.has('touch') || input.hasTouch()) { input.mountTouch(root, { sheet: 'PRANCH.', inv: 'BOLSO', flash: 'LANT.', crouch: 'AGACHAR', run: 'CORRER' }); document.body.classList.add('touch'); }
const fit = () => render.resize(innerWidth, innerHeight);
addEventListener('resize', fit); fit();

const bus = createBus();
const log = [];
for (const ev of ['money:pay', 'money:spend', 'inventory:add', 'dayoff:event', 'dayoff:end', 'dayoff:pause']) bus.on(ev, (d) => log.push([ev, d]));
// a stand-in for the progression: the wallet in reais
const eco = { wallet: Number(q.get('wallet') ?? 60), refused: 0, bag: [] };
const take = (valor, motivo) => { if (eco.wallet + 1e-9 < valor) { eco.refused++; bus.emit('money:refused', { motivo }); return false; } eco.wallet = Math.round((eco.wallet - valor) * 100) / 100; bus.emit('money:change', { wallet: eco.wallet }); return true; };
bus.on('money:pay', (d) => take(d.valor, d.motivo));
bus.on('money:spend', (d) => take(d.valor, d.item));
bus.on('inventory:add', (d) => eco.bag.push(d.item));
let ended = null;
bus.on('dayoff:end', (d) => { ended = d; document.title = 'fim'; });

let audioSys = null;
if (!q.has('silent')) {
  const mod = await import('../src/audio/index.js');
  const { createAudioSystem } = await import('../src/systems/audio.js');
  const dummy = { st: { x: 0, z: 0, eye: 1.6, yaw: 0 } };
  audioSys = createAudioSystem(bus, { world: { areaAt: () => null }, player: dummy, lighting: { area: 'quarto' }, mod, opts: { mute: false } });
}
const ui = createUI(root, {
  device: () => input.device(), glyph: () => 'E', babble: (s, t, o) => audioSys?.babble(s, t, o) ?? Math.max(0.8, t.length * 0.05), canvas: render.canvas,
  fx: () => ({ shake: 0 }), keyFails: () => false, scramble: (t) => t, valuesKey: () => '', sfx: (n) => bus.emit('sfx', n, {}),
  setModal(open) { if (open) input.setMode('ui', render.canvas); else { input.setMode('play', render.canvas); if (input.device() !== 'touch') input.lock(); } },
  sheetData: () => ({}), inventory: () => ({ slots: [], sel: 0, flash: {} }), tick: () => 0,
});
const week = Number(q.get('week') ?? 1);
const contas = (q.get('contas') ?? 'aluguel:30,luz:12,geladeira:20').split(',').filter(Boolean).map((s) => { const [id, v] = s.split(':'); return { id, valor: Number(v) }; });
const dayoff = createDayOff(bus, { r: render, input, ui, audio: null, data: {}, rng: null });
const unlock = () => { audioSys?.init(); };
addEventListener('pointerdown', unlock, { once: true }); addEventListener('keydown', unlock, { once: true });

const DT = 1 / 60;
await dayoff.start({ week, day: week * 7, wallet: eco.wallet, contas, sanidade: Number(q.get('sanidade') ?? 50), seed: q.get('seed') ? Number(q.get('seed')) : undefined });
const advance = (n = 1) => { for (let i = 0; i < n; i++) { dayoff.update(DT); } dayoff.draw(); };
window.__d = { dayoff, bus, eco, log, ui, input, render, advance, get ended() { return ended; } };
let last = performance.now(), acc = 0;
function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000); last = now;
  while (acc >= DT) { if (!q.has('manual')) dayoff.update(DT); acc -= DT; }
  dayoff.draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
