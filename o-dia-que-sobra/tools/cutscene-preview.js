// Preview of the cutscenes: pick one, scrub its time with the slider (a pure function of time, drawn with the
// film mode's own stage), or play it live with the real player (hold Esc for 1 s to skip).
// ?cs=<name>&t=<seconds> opens at a moment; ?manual keeps the loop stopped (tests call __cs.at(name, t)).
import { createRender } from '../src/render.js';
import { createStage, CUTSCENES, configureCutscenes, playCutscene, isCutsceneActive } from '../src/cutscenes/player.js';
import { drawOverlay, OVERLAY_SCALE } from '../src/cutscenes/common.js';

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('c'), $ = (id) => document.getElementById(id);
const render = createRender(canvas);
const fit = () => render.resize(innerWidth, innerHeight - 40);
addEventListener('resize', fit); fit();
const stage = createStage(render, { seed: Number(q.get('seed')) || 1 });
const ov = document.createElement('canvas'); ov.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;image-rendering:pixelated;z-index:5'; $('app').appendChild(ov);
const og = ov.getContext('2d');
configureCutscenes({ render, seed: Number(q.get('seed')) || 1 });

for (const [n, d] of Object.entries(CUTSCENES)) $('cs').add(new Option(`${n} (${d.duration} s)`, n));
function fillViews() { const d = CUTSCENES[$('cs').value]; $('view').innerHTML = ''; for (const [n, v] of Object.entries(d.views)) $('view').add(new Option(`${n} ${v[0]}-${v[1]}`, v[0])); }
function at(name, t) {
  if (isCutsceneActive()) return;
  const st = stage.frame(name, t, { flashMode: $('rf').checked ? 'dark' : 'flash' });
  const w = Math.round(render.size.w * OVERLAY_SCALE), h = Math.round(render.size.h * OVERLAY_SCALE);
  if (ov.width !== w || ov.height !== h) { ov.width = w; ov.height = h; }
  ov.style.width = render.size.cssW + 'px'; ov.style.height = render.size.cssH + 'px';
  stage.draw(); drawOverlay(og, w, h, st);
  $('info').textContent = `${name} ${t.toFixed(2)} s`;
}
$('cs').onchange = () => { fillViews(); $('t').value = 0; at($('cs').value, 0); };
$('view').onchange = () => { const d = CUTSCENES[$('cs').value]; $('t').value = Number($('view').value) / d.duration; at($('cs').value, Number($('view').value)); };
$('t').oninput = () => at($('cs').value, Number($('t').value) * CUTSCENES[$('cs').value].duration);
$('play').onclick = () => {
  const name = $('cs').value; stage.leave(); ov.style.display = 'none';
  import('../src/audio/index.js').then((m) => { const ctx = m.createAudioContext(); const audio = m.createAudio(ctx); configureCutscenes({ audio }); go(); }).catch(go);
  function go() { playCutscene(name, { reduceFlash: $('rf').checked, onEnd: (i) => { ov.style.display = ''; $('info').textContent = i.skipped ? 'pulada' : 'acabou'; at(name, 0); } }); }
};
$('stop').onclick = () => { import('../src/cutscenes/player.js').then((m) => m.skipCutscene()); };
if (q.get('cs') && CUTSCENES[q.get('cs')]) $('cs').value = q.get('cs');
fillViews();
at($('cs').value, Number(q.get('t') ?? 0));
window.__cs = { at, stage, render };
