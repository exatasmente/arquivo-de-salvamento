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
} else if (q.has('editor')) {
  // the scene editor: one scene alone, its props editable (scene-view.js)
  const { viewScene } = await import('./scene-view.js');
  await viewScene(q.get('editor') || 'cela');
} else boot();

function boot() {
  const params = { skipintro: q.has('skipintro'), debug: q.has('debug'), seed: Number(q.get('seed')) || 1, touch: q.has('touch'), film: q.has('film'), free: q.has('free'), dummy: q.has('dummy'), nointro: q.has('nointro'), fight: Number(q.get('fight')) || 0, fresh: q.has('fresh'), cutscenes: q.has('cutscenes'), notitle: q.has('notitle') };

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

  // The size of the screen as the page shows it now. On an iPhone, when the phone turns, innerWidth/innerHeight can still be
  // the old ones and the page can be left scrolled: the picture is then bigger than the screen and the fingers land off
  // what they see. So the size comes from the visible viewport, is read again a moment later, and the page goes back to 0,0.
  const screenSize = () => { const v = window.visualViewport; return v && v.scale > 0.98 && v.scale < 1.02 ? [Math.round(v.width), Math.round(v.height)] : [innerWidth, innerHeight]; };
  function fit() { const [w, h] = screenSize(); render.resize(w, h); if (scrollX || scrollY) scrollTo(0, 0); }
  let refitT = [];
  const refit = () => { fit(); for (const t of refitT) clearTimeout(t); refitT = [setTimeout(fit, 150), setTimeout(fit, 600)]; };
  addEventListener('resize', refit); addEventListener('orientationchange', refit); window.visualViewport?.addEventListener('resize', refit);
  fit();

  // The loop is the only place with a real clock: it feeds fixed steps to the simulation.
  let last = performance.now(), acc = 0, shown = false;
  function frame(now) {
    acc += Math.min(0.1, (now - last) / 1000); last = now;
    while (acc >= DT) { game.step(DT); acc -= DT; } // the game keeps reading the input (the hold-to-skip), but does not draw over a cutscene
    if (!cs.isCutsceneActive()) game.draw();
    requestAnimationFrame(frame);
    if (!shown) { shown = true; window.splashDone?.(); } // the first frame is up: the loading screen goes
  }
  requestAnimationFrame(frame);
  window.__rinha = { game, render, input, audio, advance: (n) => { for (let i = 0; i < n; i++) game.step(DT); game.draw(); } };

}
