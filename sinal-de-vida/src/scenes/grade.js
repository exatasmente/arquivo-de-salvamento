// The grate of the first cutscene (the city seen through the ventilation grate of the shaft): bars of real geometry a little in front of the
// camera, so that what the game plays and what the film mode films is the same picture (a CSS layer would not be in the film).
// `place(eye, at, t)` puts the bars in front of the camera, looking where it looks, with a very slow sway (the camera is a hand-held thing).
export const GRATE = { dist: 0.62, pitch: 0.21, bar: 0.03, cols: 9, rows: 4 };

export function buildGrate(r) {
  const T = r.THREE, g = new T.Group();
  g.visible = false; g.name = 'grade';
  const mat = r.mat('#08080b');
  const { dist, pitch, bar, cols, rows } = GRATE;
  const w = pitch * (cols - 1), h = pitch * (rows - 1);
  for (let i = 0; i < cols; i++) { const m = new T.Mesh(new T.BoxGeometry(bar, h + pitch * 1.6, bar), mat); m.position.set(-w / 2 + i * pitch, 0, dist); m.frustumCulled = false; g.add(m); }
  for (let j = 0; j < rows; j++) { const m = new T.Mesh(new T.BoxGeometry(w + pitch * 1.6, bar, bar), mat); m.position.set(0, -h / 2 + j * pitch, dist + bar * 0.2); m.frustumCulled = false; g.add(m); }
  const p = new T.Vector3();
  return {
    group: g,
    show(on) { g.visible = Boolean(on); },
    get visible() { return g.visible; },
    place(eye, at, t = 0) {
      p.set(...eye); g.position.copy(p);
      g.position.y += Math.sin(t * 0.7) * 0.004;
      g.lookAt(at[0], at[1], at[2]);
      g.updateMatrixWorld(true);
    },
  };
}
