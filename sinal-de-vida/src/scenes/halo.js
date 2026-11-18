// A soft halo round the light band of the broken dog, so that its colours read from far away and on a small screen (the band alone is a few pixels).
// A billboard of the colour that the band shows, drawn over the world without touching the alpha channel of the look (it keeps the depth there).
// Pure function of what it is told: `set(hex | null, size)`, `follow(dog)` puts it on the band.
export function buildHalo(r) {
  const T = r.THREE, cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.25, 'rgba(255,255,255,0.55)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const tex = new T.CanvasTexture(cv);
  const mat = new T.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, depthWrite: false, fog: false });
  mat.blending = T.CustomBlending; mat.blendEquation = mat.blendEquationAlpha = T.AddEquation;
  mat.blendSrc = T.SrcAlphaFactor; mat.blendDst = T.OneFactor; mat.blendSrcAlpha = T.ZeroFactor; mat.blendDstAlpha = T.OneFactor;
  const sprite = new T.Sprite(mat); sprite.visible = false; sprite.renderOrder = 5; sprite.frustumCulled = false;
  return {
    sprite,
    /** Puts the halo on the band of `dog`, lying down: a little above its middle. */
    follow(dog) { sprite.position.set(dog.root.position.x, dog.root.position.y + 0.32, dog.root.position.z); },
    /** `hex`: the colour the band shows (null: dark). `size`: metres across. */
    set(hex, size = 0.9) { sprite.visible = Boolean(hex); if (hex) { mat.color.set(hex); sprite.scale.set(size, size, 1); } },
  };
}
