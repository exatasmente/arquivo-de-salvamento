// One scene alone, for the scene editor (`?editor=<scene>`, `?editor` alone is the cell): the scene built as
// the game builds it, its lights on, the camera at its first view, the clock running. The engine's door
// (window.__engine) is this scene's: its props can be picked, moved and saved in data/scenes/<scene>.json.
import { createRender } from './render.js';

export const SCENES = ['casa', 'cela', 'galpao', 'pomar', 'treino'];

export async function viewScene(name) {
  if (!SCENES.includes(name)) throw new Error(`no scene ${name} (${SCENES.join(', ')})`);
  const canvas = document.getElementById('c');
  const r = createRender(canvas);
  const fit = () => r.resize(innerWidth, innerHeight);
  fit();
  addEventListener('resize', fit);
  const { buildScene } = await import(`./scenes/${name}.js`);
  const sc = buildScene(r, { seed: 1, editor: true });
  r.scene.add(sc.group);
  sc.lights?.apply?.();
  const view = Object.values(sc.views ?? {})[0];
  if (view) { r.camera.position.set(...view.eye); r.camera.lookAt(...view.at); }
  const t0 = performance.now();
  const frame = () => {
    sc.update?.((performance.now() - t0) / 1000);
    r.draw();
    requestAnimationFrame(frame);
  };
  frame();
}
