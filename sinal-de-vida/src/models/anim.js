// A tiny layer over three's AnimationMixer for animations that are a pure function of their arguments: every frame the
// caller says which clips weigh how much, and at what time inside each; nothing remembers the last frame. (The same
// arguments always give the same pose, which is what the film mode needs.)
import * as THREE from 'three';

export class Layers {
  constructor(root) {
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = new Map();
  }

  /** Registers a clip under a name. */
  add(name, clip, additive = false) {
    const a = this.mixer.clipAction(clip);
    if (additive) a.blendMode = THREE.AdditiveAnimationBlendMode;
    a.setLoop(THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = false;
    this.actions.set(name, a);
    return a;
  }

  has(name) { return this.actions.has(name); }

  /** weights: { name: [weight, seconds] }. Names not listed (or with ~0 weight) are off. */
  apply(weights) {
    for (const [name, a] of this.actions) {
      const w = weights[name];
      if (w && w[0] > 1e-3) {
        if (!a.isRunning()) a.play();
        a.enabled = true; a.paused = false;
        a.setEffectiveWeight(w[0]);
        a.time = w[1];
      } else if (a.isRunning()) a.stop();
    }
    this.mixer.update(0);
  }
}

export const clamp01 = (x) => Math.max(0, Math.min(1, x));
export const ease = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
