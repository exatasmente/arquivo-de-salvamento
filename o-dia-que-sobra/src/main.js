import { createRender } from './render.js';
import { createInput } from './input.js';
import { createGame, DT, loadOpts, LOCAL } from './game.js';

const q = new URLSearchParams(location.search);

if (q.has('film')) {
  // film mode: the picture comes from film.js, which installs itself; no game and no loop
  await import('./film.js');
} else boot().catch((e) => {
  console.error(e);
  const d = document.createElement('div'); d.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;color:#e8dfc4;font:bold 16px monospace;text-align:center;padding:20px';
  d.textContent = 'O posto não abriu: ' + e.message; document.body.appendChild(d);
});

async function boot() {
  const params = {
    seed: Number(q.get('seed')) || 1, silent: q.has("silent"), manual: q.has('manual'), debug: q.has('debug') && LOCAL.has(location.hostname), touch: q.has('touch'),
    skiptutorial: q.has('skiptutorial'), event: q.get('event') || null, sol: q.get('sol') || null,
  };
  const root = document.getElementById('app');
  const canvas = document.getElementById('c');
  const render = createRender(canvas);
  const input = createInput();
  if (params.touch || input.hasTouch()) {
    input.mountTouch(root, { sheet: 'PRANCH.', inv: 'BOLSO', flash: 'LANT.', crouch: 'AGACHAR', run: 'CORRER' });
    document.body.classList.add('touch');
  }
  const fit = () => render.resize(innerWidth, innerHeight);
  addEventListener('resize', fit); addEventListener('orientationchange', fit);
  fit();
  const game = await createGame({ root, render, input, params });

  // The loop is the only place with a real clock: it feeds fixed steps to the simulation.
  let last = performance.now(), acc = 0;
  function frame(now) {
    acc += Math.min(0.1, (now - last) / 1000); last = now;
    while (acc >= DT) { if (!params.manual) game.step(DT); acc -= DT; } // ?manual: the steps come from window.__odq.advance (tests)
    game.draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  if (params.debug) window.__odq = { game, render, input, params, opts: loadOpts, advance: (n) => { for (let i = 0; i < n; i++) game.step(DT); game.draw(); } };
}
