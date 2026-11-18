// The body that is seen in the third person. The model is `buildPerson` of
// src/models/person.js (the Blender person: skeleton, animations), which has its own stand-in until the .glb arrives;
// if the module cannot be used at all, a stand-in made of boxes keeps the game playable: same contract,
// { root, update(dt, state), setPose(...), height }.
//
// The game does not say which animation a person is doing (`action` of update); the body hears it where the game already
// says it, on the event bus, and asks the model for it by itself:
//   'noise' kind 'voice'  (the hand radio was used)      -> 'radio' for a moment
//   'noise' kind 'craft'  (a job at the bench)           -> 'manipular' for a moment
//   'noise' kind 'hide'   (got into a hiding place)      -> 'esconder', held until the person moves, then 'sair'
//   'machine:sound' 'isca-lanca' (a decoy thrown)        -> 'arremessar' once
// and only for the person standing where the event happened (the player, or whoever is at that spot). A caller that passes
// `action` itself always wins. Lying down (knocked out, asleep, wounded) comes from the model: the game tilts the root and
// the model takes the pose that fits (see person.js).
import { bus } from '../bus.js';

const NEAR = 0.7;          // metres: how close an event must be to count as this person's
const HOLD = { radio: 2.4, manipular: 1.6, arremessar: 1.05 };

export async function loadBody(r, opts) {
  try {
    const m = await import('../models/person.js');
    const p = m.buildPerson(r, opts);
    if (p && p.root) return listen({ ...p, standIn: false });
  } catch (e) {
    console.info('body: models/person.js not usable, using the stand-in', e?.message ?? e);
  }
  return standIn(r);
}

/** Wraps a body so that it takes the actions the bus announces. */
function listen(b) {
  let forced = null, clock = 0, hideLeft = false;
  const near = (pos) => pos && Math.hypot(b.root.position.x - pos[0], b.root.position.z - pos[1]) < NEAR && b.root.visible;
  const start = (action) => { forced = { action, until: HOLD[action] ? clock + HOLD[action] : Infinity, since: clock }; hideLeft = false; };
  bus.on('noise', (n) => {
    if (!near(n.pos)) return;
    if (n.kind === 'voice') start('radio');
    else if (n.kind === 'craft') start('manipular');
    else if (n.kind === 'hide') start('esconder');
  });
  bus.on('machine:sound', (n) => { if (n.name === 'isca-lanca' && near(n.pos)) start('arremessar'); });
  const update = b.update;
  b.update = (dt, st = {}) => {
    clock += dt;
    let action = st.action ?? null;
    if (!action && forced) {
      const moving = Math.abs(st.speed ?? 0) > 0.3;
      if (forced.action === 'esconder' && moving) { forced = { action: 'sair', until: clock + 0.6, since: clock }; }
      else if (clock >= forced.until) forced = null;
      if (forced) action = forced.action === 'esconder' || forced.action === 'sair' ? forced.action : (moving && forced.action !== 'arremessar' ? null : forced.action);
    }
    update(dt, { ...st, action });
  };
  return b;
}

function standIn(r) {
  const T = r.THREE, root = new T.Group();
  const cloth = r.mat('#4a5a6a'), skin = r.mat('#c89a78'), dark = r.mat('#2a2d36');
  const box = (w, h, d, m, x, y, z) => { const b = new T.Mesh(new T.BoxGeometry(w, h, d), m); b.position.set(x, y, z); return b; };
  const body = new T.Group(); root.add(body);
  const torso = box(0.46, 0.6, 0.26, cloth, 0, 1.15, 0), head = box(0.24, 0.26, 0.24, skin, 0, 1.6, 0);
  const legL = new T.Group(), legR = new T.Group(); legL.position.set(-0.12, 0.8, 0); legR.position.set(0.12, 0.8, 0);
  legL.add(box(0.17, 0.8, 0.2, dark, 0, -0.4, 0)); legR.add(box(0.17, 0.8, 0.2, dark, 0, -0.4, 0));
  const armL = new T.Group(), armR = new T.Group(); armL.position.set(-0.3, 1.4, 0); armR.position.set(0.3, 1.4, 0);
  armL.add(box(0.12, 0.6, 0.14, cloth, 0, -0.3, 0)); armR.add(box(0.12, 0.6, 0.14, cloth, 0, -0.3, 0));
  body.add(torso, head, legL, legR, armL, armR);
  const shadow = new T.Mesh(new T.CircleGeometry(0.42, 16), r.mat('#000000', { opacity: 0.35, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02; root.add(shadow);
  let phase = 0, crouchK = 0;
  return {
    standIn: true, root, height: 1.75,
    setPose() {},
    update(dt, { speed = 0, crouch = false, run = false } = {}) {
      phase += dt * (3 + speed * 1.6) * (speed > 0.05 ? 1 : 0);
      const sw = Math.sin(phase) * Math.min(1, speed / 2) * (run ? 0.9 : 0.6);
      legL.rotation.x = sw; legR.rotation.x = -sw; armL.rotation.x = -sw; armR.rotation.x = sw;
      crouchK += ((crouch ? 1 : 0) - crouchK) * Math.min(1, dt * 10);
      body.scale.y = 1 - crouchK * 0.28; body.rotation.x = crouchK * 0.25 + (run ? 0.12 : 0);
    },
  };
}
