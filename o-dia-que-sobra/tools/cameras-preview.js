// Preview of the camera monitor and the office computer's entry screen, with the game's own ui, input, world, office and
// camera system around them (and nothing else). The player stands at the office desk.
//   ?view=grid|single|cam1..cam6   open the monitor      ?login=ask|senha   open the computer      ?mode=manual  the steps come from __p.advance(seconds)
//   ?sanity=0..5   the sanity stage        ?fail=chiado|atraso|queda   a failure on cam1        ?ghost=figura|carro|voce   something only the cameras see
//   ?breaker=loja  the breaker of an area is down        ?t=120  start with the game clock this many seconds in
import { createRender } from '../src/render.js';
import { createInput } from '../src/input.js';
import { createBus } from '../src/bus.js';
import { createWorld } from '../src/systems/world.js';
import { createTime } from '../src/systems/time.js';
import { createPlayer } from '../src/systems/player.js';
import { createSanity } from '../src/systems/sanity.js';
import { createProgression } from '../src/systems/progression.js';
import { createLighting } from '../src/systems/lighting.js';
import { createInteraction } from '../src/systems/interaction.js';
import { createOffice } from '../src/systems/office.js';
import { createCameras } from '../src/systems/cameras.js';
import { createUI } from '../src/ui.js';

const q = new URLSearchParams(location.search);
const names = ['items', 'customers', 'tasks', 'events', 'progression', 'medication'];
const data = {};
await Promise.all(names.map(async (n) => { data[n] = await (await fetch(`../data/${n}.json`)).json(); }));
data.cast = await (await fetch('../data/cast.json')).json();

const canvas = document.getElementById('c'), root = document.getElementById('app');
const render = createRender(canvas), input = createInput();
if (q.has('touch') || input.hasTouch()) { input.mountTouch(root, { sheet: 'PRANCH.', inv: 'BOLSO', flash: 'LANT.', crouch: 'AGACHAR', run: 'CORRER' }); document.body.classList.add('touch'); }
const fit = () => render.resize(innerWidth, innerHeight); addEventListener('resize', fit); fit();
const bus = createBus();
const world = await createWorld(render, { seed: 1 });
const time = createTime(bus, { secondsPerHour: 90 }); time.start(Number(q.get('at') ?? 150));
const player = createPlayer(bus, { world }); world.guard = player.st;
const sanity = createSanity(bus, { opts: {} }); sanity.reset(100, 1);
const stage = Number(q.get('sanity') ?? 0); if (stage) sanity.add(-[0, 25, 45, 65, 85, 100][stage], 'preview');
const progression = createProgression(bus, { rules: data.progression });
progression.fromRun({ day: 1, week: 2, wallet: 40, tutorialDone: true, flags: [], eventsSeen: [] });
const lighting = createLighting(bus, { world, render, player, flash: () => ({ on: false, charge: 0 }), opts: {} });
let modals = 0;
const ui = createUI(root, {
  device: () => input.device(), glyph: () => 'E', babble() {}, canvas, fx: () => ({}), keyFails: () => false, scramble: (t) => t, valuesKey: () => '', sfx() {},
  setModal(open) { modals += open ? 1 : -1; if (open) { input.setMode('ui', canvas); interaction.cancel(); } else if (modals <= 0) { modals = 0; input.setMode('play', canvas); } },
  sheetData: () => ({}), inventory: () => ({ slots: [], sel: 0, flash: {} }), tick: () => 0,
});
const interaction = createInteraction(bus, { world, render, player, aimOffset: () => ({ x: 0, y: 0 }), ui });
const cash = { opened: false, sales: 0 }, tasks = { pending: () => [] };
const office = createOffice(bus, { world, render, interaction, ui, time, progression, tasks, cash, data, inventory: null });
const cameras = createCameras(bus, { render, world, ui, time, sanity, input, data, player, interaction, office, lighting });
bus.emit('shift:open', 1);

const desk = world.anchor('monitor').pos;
player.place({ x: desk.x, z: desk.z + 0.3 }, 0); player.st.eye = 1.55;
let simT = 0;
const wx = () => ({ hora: time.minutes / 60, telefoneToca: false, gaveta: 0, placaSorriso: 0 });
if (q.get('breaker')) world.posto.breakers.setOn(q.get('breaker'), false);
function step(dt) {
  const intent = input.sample();
  for (const p of intent.press) { if (ui.modalOpen) ui.handle(p); }
  ui.update(dt); simT += dt;
  if (!ui.modalOpen || cameras.watching) { time.step(dt); player.step(dt, intent); interaction.update(dt, intent); cameras.update(dt, simT); }
  world.update(simT, dt, wx()); lighting.update(dt, simT);
}
function draw() { player.apply(render.camera, simT, {}); cameras.draw(); render.draw(); }
const DT = 1 / 60;
const manual = q.has('manual');
let last = performance.now(), acc = 0;
function frame(now) { acc += Math.min(0.1, (now - last) / 1000); last = now; while (acc >= DT) { if (!manual) step(DT); acc -= DT; } draw(); requestAnimationFrame(frame); }
requestAnimationFrame(frame);

// scenarios
const ghostSpec = { figura: { kind: 'figura', x: 12.3, z: 9.7, yaw: Math.PI, pose: 'fixo' }, carro: { kind: 'carro', pump: 2 }, voce: { kind: 'voce', x: 13, z: 15, yaw: 0 } };
if (q.get('ghost')) cameras.ghost(q.get('ghost') === 'carro' ? 'cam2' : q.get('ghost') === 'voce' ? 'cam4' : 'cam1', ghostSpec[q.get('ghost')]);
if (q.get('fail')) cameras.fail('cam1', { kind: q.get('fail'), secs: 9999, level: 0.7, delay: 4 });
window.__p = {
  bus, world, time, player, sanity, ui, input, cameras, office, render, interaction, progression, lighting,
  advance(sec) { for (let i = 0; i < Math.round(sec / DT); i++) step(DT); draw(); },
  press(p) { input.queue.push(p); },
  get simT() { return simT; },
};
if (q.get('t')) __p.advance(Number(q.get('t')));
const v = q.get('view');
if (v) { cameras.open(); if (v === 'single') __p.press({ k: 'digit', d: 1 }); else if (/^cam\d$/.test(v)) __p.press({ k: 'digit', d: Number(v[3]) }); }
if (q.get('login')) office.open();
