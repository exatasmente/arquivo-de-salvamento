import { createRender } from './render.js';
import { createRing } from './ring.js';
import { createInput } from './input.js';
import { createSound } from './sound.js';
import { createHud, loadOpts } from './hud.js';
import { createGame, DT } from './game.js';
import { setProvider } from './cutscene.js';
import { tallyGroups } from './secrets.js';
import * as cs from './cutscenes/player.js';

const q = new URLSearchParams(location.search);
if (q.has('film')) {
  // film mode: the picture comes from film.js, which installs itself; no game and no loop
  await import('./film.js');
} else boot();

function boot() {
  const params = { skipintro: q.has('skipintro'), debug: q.has('debug'), seed: Number(q.get('seed')) || 1, touch: q.has('touch'), film: q.has('film'), free: q.has('free'), dummy: q.has('dummy'), nointro: q.has('nointro'), fight: Number(q.get('fight')) || 0, fresh: q.has('fresh') };

  const root = document.getElementById('app');
  const canvas = document.getElementById('c');
  const opts = loadOpts();
  const render = createRender(canvas);
  const audio = createSound();
  audio.setMuted(opts.mute || q.has('mute'));
  const ring = createRing(render, params.seed);
  const input = createInput();
  if (params.free) input.setMode('free', canvas);
  if (params.touch || input.hasTouch()) {
    input.mountTouch(root, { jab: 'JAB', direct: 'DIR', hookL: 'GE', hookR: 'GD', upper: 'UP', item: 'ITEM', guard: 'GUARDA', dodge: 'ESQ', duck: 'ABX', stone: 'PEDRA' });
    document.body.classList.add('touch');
  }
  // the real cutscenes (src/cutscenes/) draw on the same renderer, on their own clock; set before the game starts its story
  cs.configureCutscenes({ render, audio, ring, seed: params.seed, groups: tallyGroups() });
  setProvider(cs);
  let game;
  const hud = createHud(root, {
    debug: params.debug, opts,
    onOpts: (o) => audio.setMuted(o.mute),
    onResume: () => game.setPause(false),
    onCard: () => game.openCardFromPause(),
  });
  game = createGame({ render, ring, input, audio, hud, params });

  function fit() { render.resize(innerWidth, innerHeight); }
  addEventListener('resize', fit); addEventListener('orientationchange', fit);
  fit();

  // The loop is the only place with a real clock: it feeds fixed steps to the simulation.
  let last = performance.now(), acc = 0;
  function frame(now) {
    acc += Math.min(0.1, (now - last) / 1000); last = now;
    while (acc >= DT) { game.step(DT); acc -= DT; } // the game keeps reading the input (the hold-to-skip), but does not draw over a cutscene
    if (!cs.isCutsceneActive()) game.draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__rinha = { game, render, input, audio, advance: (n) => { for (let i = 0; i < n; i++) game.step(DT); game.draw(); } };

}
