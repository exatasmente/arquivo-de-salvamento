import { createRender } from './render.js';
import { createInput } from './input.js';
import { createGame, DT, loadOpts, LOCAL } from './game.js';
import { readLook1998 } from './save.js';

const q = new URLSearchParams(location.search);

if (q.has('film')) {
  // film mode: the picture comes from film.js, which installs itself; no game and no loop
  await import('./film.js');
} else boot().catch((e) => {
  console.error(e);
  document.getElementById('splash')?.remove(); // the error below must be seen
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
  // The picture: the new look by default, the 1998 mode when the card keeps it on; `?look=1998|novo` and `?tier=alto|medio|leve` are for whoever makes the game (local addresses only).
  const local = LOCAL.has(location.hostname), card = params.debug ? { getItem: (k) => localStorage.getItem(k + '.debug') } : undefined;
  const lookQ = local ? q.get('look') : null;
  const render = createRender(canvas, {
    mode: lookQ ? (lookQ === '1998' || lookQ === 'atual' ? '1998' : 'novo') : (readLook1998(card) ? '1998' : 'novo'),
    tier: local && q.get('tier') ? q.get('tier') : loadOpts().quality,
  });
  const input = createInput();
  if (params.touch || input.hasTouch()) {
    // the phone's layer (src/touch/mobile.js), with the person's choices (canhoto, button size, hold or tap)
    const o = loadOpts();
    input.mountMobile(root, { left: o.left, scale: o.btn, toggle: o.toggle, lookSens: o.look });
    document.body.classList.add('touch', 'mobile');
  }
  // The size of the screen as the page shows it now. On an iPhone, when the phone turns, innerWidth/innerHeight can still be
  // the old ones and the page can be left scrolled: the picture is then bigger than the screen and the fingers land off
  // what they see. So the size comes from the visible viewport, is read again a moment later, and the page goes back to 0,0.
  const screenSize = () => { const v = window.visualViewport; return v && v.scale > 0.98 && v.scale < 1.02 ? [Math.round(v.width), Math.round(v.height)] : [innerWidth, innerHeight]; };
  const fit = () => { const [w, h] = screenSize(); render.resize(w, h); if (scrollX || scrollY) scrollTo(0, 0); };
  let refitT = [];
  const refit = () => { fit(); for (const t of refitT) clearTimeout(t); refitT = [setTimeout(fit, 150), setTimeout(fit, 600)]; };
  addEventListener('resize', refit); addEventListener('orientationchange', refit); window.visualViewport?.addEventListener('resize', refit);
  fit();
  const game = await createGame({ root, render, input, params });
  // Every program the scene needs is built now (the camera monitor's first picture, a lamp that lights late), not at the first frame that shows it.
  try { await (render.renderer.compileAsync && render.renderer.extensions.has('KHR_parallel_shader_compile') ? render.renderer.compileAsync(render.scene, render.camera) : render.renderer.compile(render.scene, render.camera)); } catch (e) { console.warn('compile', e.message); }

  // The loop is the only place with a real clock: it feeds fixed steps to the simulation.
  let last = performance.now(), acc = 0, shown = false;
  function frame(now) {
    acc += Math.min(0.1, (now - last) / 1000); last = now;
    while (acc >= DT) { if (!params.manual) game.step(DT); acc -= DT; } // ?manual: the steps come from window.__odq.advance (tests)
    game.draw();
    if (!shown) { shown = true; window.splashDone?.(); } // the first frame is up: the loading screen goes
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  if (params.debug) window.__odq = { game, render, input, params, opts: loadOpts, advance: (n) => { for (let i = 0; i < n; i++) game.step(DT); game.draw(); } };
}
