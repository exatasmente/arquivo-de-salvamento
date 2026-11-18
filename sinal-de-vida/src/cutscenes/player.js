// Plays one cutscene of the registry on the game's page, in real time, with its recorded sound when it has one: `?cena=<name>` in
// the address (`?cena=radio-teste`). The same scene, camera and acting the film mode shoots; the time is the sound's own clock,
// so the mouth and the voice stay together. A click (or a key, or a tap) starts it and starts it again; no HUD, only the captions.
import { createRender } from '../render.js';
import { CUTSCENES } from './index.js';
import { jonasReady } from '../models/jonas.js';

export async function playCutscene(name) {
  const def = CUTSCENES[name];
  const app = document.getElementById('app'), canvas = document.getElementById('c');
  document.getElementById('hint')?.remove();
  const note = document.createElement('div');
  note.style.cssText = 'position:fixed;left:0;right:0;bottom:7%;text-align:center;color:#e8e4d8;font:600 clamp(14px,2.4vw,22px)/1.35 system-ui,sans-serif;text-shadow:0 2px 6px #000,0 0 2px #000;padding:0 8%;pointer-events:none';
  app.append(note);
  if (!def) { note.textContent = `Cena desconhecida. Há: ${Object.keys(CUTSCENES).join(', ')}`; return; }
  const r = createRender(canvas);
  const fit = () => r.resize(innerWidth, innerHeight);
  fit(); addEventListener('resize', fit);
  await jonasReady.catch(() => {});
  const sc = def.build(r);
  r.scene.add(sc.group);
  const total = def.total ?? Math.max(...Object.values(def.views).map((v) => v[1]));
  const sound = def.audio ? new Audio(new URL(`../../${def.audio}`, import.meta.url).href) : null;
  if (sound) sound.preload = 'auto';
  let t0 = null;                                   // without a sound: the page's clock when it started
  const time = () => (sound ? sound.currentTime : t0 === null ? 0 : Math.min(total, (performance.now() - t0) / 1000));
  const start = () => { if (sound) { sound.currentTime = 0; sound.play().catch(() => {}); } else t0 = performance.now(); started = true; };
  let started = false;
  addEventListener('pointerdown', start); addEventListener('keydown', start);
  const who = { jonas: 'Jonas', voz: 'Voz no rádio' };
  function draw() {
    const t = Math.min(total - 1e-3, time());
    const cam = def.camera(t);
    // the shots are framed for a wide picture: on an upright screen the lens opens so the same width is seen
    let lens = cam.lens ?? r.camera.baseFov;
    if (cam.lens && r.camera.aspect < 16 / 9) lens = Math.min(120, (2 * Math.atan(Math.tan((cam.lens * Math.PI) / 360) * (16 / 9) / r.camera.aspect) * 180) / Math.PI);
    if (lens && r.camera.fov !== lens) { r.camera.fov = lens; r.camera.updateProjectionMatrix(); }
    sc.lights.apply();
    r.camera.position.set(...cam.eye); r.camera.lookAt(...cam.at);
    sc.update(t, { listener: cam.eye, dir: [cam.at[0] - cam.eye[0], cam.at[1] - cam.eye[1], cam.at[2] - cam.eye[2]] });
    r.draw();
    const line = started ? (def.lines ?? []).find((l) => t >= l.start - 0.1 && t < l.start + l.dur + 0.4) : null;
    const text = !started ? 'Clique para ver a cena' : line ? `${who[line.who] ?? line.who}: ${line.text}` : '';
    if (note.textContent !== text) note.textContent = text;
    requestAnimationFrame(draw);
  }
  // for a test from outside: where the cutscene is
  window.__cena = { name, total, time, get started() { return started; }, start };
  requestAnimationFrame(draw);
}
