// A low-poly boxer, used for the player and for every opponent. The simulation part (position,
// actions, stamina, balance, springs) advances with step(dt); the body is posed from that state
// alone, with two-bone IK for arms and legs, so there is no teleport between poses.
import * as THREE from 'three';
import { PLAYER_LOOK } from './look.js';
import { buildHuman, buildFirstPersonArms } from './models/human.js';

const DOWN = new THREE.Vector3(0, -1, 0);
const BASE_TWIST = -0.35;
export const GLOVE_R = 0.085;
export const HEAD_R = 0.125;
const GLOVE_CENTER = 0.12; // the glove's centre is this far past the wrist, along the forearm
export const MAX_STAMINA = 6;

const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const easeOut = (u) => 1 - (1 - u) * (1 - u);
const easeIn = (u) => Math.pow(u, 1.6);
const easeInOut = (u) => u * u * (3 - 2 * u);
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

// hand rest positions in torso space (x left+, y up, z forward)
// gloves at the cheeks, the eyes show above them; the tight guard covers the face
const GUARD_IDLE = { L: v3(0.21, 0.55, 0.34), R: v3(-0.19, 0.53, 0.30) };
const GUARD_TIGHT = { L: v3(0.09, 0.74, 0.36), R: v3(-0.09, 0.72, 0.35) };
// first person: the gloves sit low in the view, the forearms rise from the bottom corners
const FP_IDLE = { L: v3(0.19, 0.57, 0.62), R: v3(-0.19, 0.55, 0.62) };
const FP_TIGHT = { L: v3(0.12, 0.66, 0.62), R: v3(-0.12, 0.64, 0.62) };
const POLE_GUARD = { L: v3(0.35, -1, -0.1), R: v3(-0.35, -1, -0.1) };

// Punches: phases in seconds (anticipation, impact travel, recovery), the hand that throws,
// the wind-up position W, the bend of the path C, torso twist at wind-up and at impact.
export const ACTIONS = {
  jab:    { dmg: 0.6, hand: 'L', wind: 0.17, act: 0.08, rec: 0.17, Wf: v3(0.26, 0.50, 0.30), W: v3(0.17, 0.74, 0.16), C: v3(0.14, 0.76, 0.42), pole: v3(0.3, -1, -0.2), twW: -0.25, twI: -0.62, leanI: 0.10, lunge: 0.40, aim: 'straight' },
  direct: { dmg: 1, hand: 'R', wind: 0.30, act: 0.10, rec: 0.24, Wf: v3(-0.26, 0.46, 0.22), W: v3(-0.22, 0.64, 0.04), C: v3(-0.12, 0.74, 0.40), pole: v3(-0.3, -1, -0.2), twW: -0.75, twI: 0.32, leanI: 0.18, lunge: 0.52, aim: 'straight' },
  hookL:  { dmg: 1, hand: 'L', wind: 0.15, act: 0.09, rec: 0.30, Wf: v3(0.62, 0.46, 0.22), W: v3(0.62, 0.70, 0.08), C: v3(0.52, 0.72, 0.58), pole: v3(0.5, 0.1, -0.5), twW: 0.15, twI: -0.95, leanI: 0.06, lunge: 0.36, aim: 'hookL' },
  hookR:  { dmg: 1, hand: 'R', wind: 0.15, act: 0.09, rec: 0.30, Wf: v3(-0.62, 0.46, 0.22), W: v3(-0.62, 0.70, 0.08), C: v3(-0.52, 0.72, 0.58), pole: v3(-0.5, 0.1, -0.5), twW: -0.85, twI: 0.55, leanI: 0.06, lunge: 0.36, aim: 'hookR' },
  upper:  { dmg: 1, hand: 'R', wind: 0.17, act: 0.09, rec: 0.32, Wf: v3(-0.16, 0.14, 0.34), W: v3(-0.16, 0.30, 0.26), C: v3(-0.10, 0.38, 0.58), pole: v3(-0.3, -1, 0.1), twW: -0.6, twI: 0.12, leanI: 0.16, lunge: 0.30, aim: 'upper', dip: 0.14 },
};
export const PUNCHES = Object.keys(ACTIONS);
const DODGE = { dur: 0.42, cancel: 0.30, dist: { L: 0.65, R: 0.65, B: 0.75, F: 0.6, D: 0 } };

export class Fighter {
  /** look: { scale, skin, trunks, glove, hair, build } ; r: render (for materials) */
  constructor(r, look = {}) {
    this.r = r;
    this.look = look;
    this.appearance = look.appearance ?? PLAYER_LOOK;
    this.sc = look.scale ?? this.appearance.scale ?? 1;
    this.fp = Boolean(look.fp);          // first person: the body is hidden, only the gloves show
    this.freeYaw = null;                 // set to an angle to turn the body by hand (free look)
    this.guardIdle = this.fp ? FP_IDLE : GUARD_IDLE;
    this.guardTight = this.fp ? FP_TIGHT : GUARD_TIGHT;
    this.id = look.id ?? 'f';
    this.fixed = false;      // does not get pushed (a dummy)
    this.home = null;        // {x, z} a dummy returns to
    this.events = [];        // things that happened in a step (swing, hit...)
    this.reset(0, 0, 0);
    this._build();
  }

  reset(x, z, yaw) {
    Object.assign(this, {
      x, z, yaw, vx: 0, vz: 0, knockX: 0, knockZ: 0, t: 0, gait: 0, speedLocal: [0, 0],
      action: null, buffer: null, guardAmt: 0, wantGuard: false, guarding: false,
      stamina: MAX_STAMINA, balance: 100, daze: null, stunT: 0, blindT: 0, noGuardT: 0, cmdDelay: 0, dazeSpeed: 1, tell: null, fallT: 0, power: 1, takes: 1, speedScale: 1, headDip: 0, sinceHit: 9, sincePunch: 9, knockdown: false,
      head: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }, recoil: 0, recoilV: 0, flinch: 0,
      aimSeed: 1 + ((x * 31 + z * 17) | 0),
    });
    this.prevGlove = { L: new THREE.Vector3(), R: new THREE.Vector3() };
    this.prevShoulder = { L: new THREE.Vector3(), R: new THREE.Vector3() };
    this.gloveVel = { L: new THREE.Vector3(), R: new THREE.Vector3() };
  }

  _build() {
    // the body comes from buildHuman (models/human.js); the rig only moves its joints
    const A = this.appearance, scale = this.look.scale ?? A.scale ?? 1;
    const lookFor = { seed: A.seed, height: 1.75 * scale, glove: A.glove, number: A.number };
    if (A.build3) lookFor.build = A.build3;
    if (this.fp) Object.assign(lookFor, { skin: A.skin, hair: A.hair, trunks: A.trunks, beard: A.beard });
    const H = buildHuman(this.r, lookFor);
    this.human = H; this.root = H.root; const J = this.J = H.joints;
    this.sc = H.look.scale;                     // the body is scaled inside the model, not here
    this.torso = J.spine; this.neck = J.neck;
    this.SH = { L: J.shoulderL.position.clone(), R: J.shoulderR.position.clone() };
    this.len = { armA: -J.elbowL.position.y, armB: -J.wristL.position.y, legA: -J.kneeL.position.y, legB: -J.ankleL.position.y };
    this.hipBase = J.hips.position.y - 0.09;    // standing a little crouched
    // the torso-space targets below were tuned with the shoulders at 0.54: shift them to this body
    const dy = this.SH.L.y - 0.54, sv = (v) => v.clone().add(v3(0, dy, 0));
    this.A = {};
    for (const [k, d] of Object.entries(ACTIONS)) this.A[k] = { ...d, W: sv(d.W), C: sv(d.C), Wf: d.Wf ? sv(d.Wf) : null };
    this.guardIdle = { L: sv(this.guardIdle.L), R: sv(this.guardIdle.R) };
    this.guardTight = { L: sv(this.guardTight.L), R: sv(this.guardTight.R) };
    this.arms = { L: { elbow: new THREE.Vector3(), hand: new THREE.Vector3() }, R: { elbow: new THREE.Vector3(), hand: new THREE.Vector3() } };
    this.r.scene.add(this.root);
    if (this.fp) {
      // the player is only seen through his own gloves: the body is simulation, the arms are drawn on the camera
      this.root.visible = false;
      this.fpArms = buildFirstPersonArms(this.r, lookFor);
      this.fpRest = {};
      for (const sd of ['L', 'R']) {
        const sg = sd === 'L' ? 1 : -1, d1 = v3(sg * 0.14, -0.70, -0.70).normalize(), d2 = v3(-sg * 0.22, 0.58, -0.78).normalize();
        this.fpRest[sd] = { d1, d2, S: this.fpArms.joints['shoulder' + sd].position.clone() };
      }
    }
  }

  /** Draws the first-person arms on the camera so that the gloves are where the simulation puts them. */
  updateFpArms(camera) {
    if (!this.fpArms) return;
    camera.updateMatrixWorld(true);
    const inv = camera.matrixWorld.clone().invert(), p = new THREE.Vector3();
    // buildFirstPersonArms hangs on a camera looking along -Z, where the joint called "L" (+X) is
    // on the right of the screen. The player's left glove therefore drives the "R" arm and vice versa.
    for (const sd of ['L', 'R']) {
      const jn = sd === 'L' ? 'R' : 'L', rest = this.fpRest[jn], J = this.fpArms.joints;
      this.gloveWorld(sd, p).applyMatrix4(inv);       // glove centre in camera space
      const A = 0.29, B = 0.26 + GLOVE_CENTER;
      const sg = jn === 'L' ? 1 : -1;                 // +1: shoulder at +X
      const sol = this._solve(rest.S, p, A, B, v3(sg * 0.5, -1, 0.25));
      const sh = J['shoulder' + jn], el = J['elbow' + jn];
      sh.quaternion.setFromUnitVectors(rest.d1, sol.E.clone().sub(rest.S).normalize());
      const dF = sol.H.clone().sub(sol.E).normalize().applyQuaternion(sh.quaternion.clone().invert());
      el.quaternion.setFromUnitVectors(rest.d2, dF);
    }
  }

  /** Where the eyes are, for the first-person camera. */
  eye(out = new THREE.Vector3()) { out.set(0, 0.10, 0.09); return this.J.head.localToWorld(out); }

  dispose() { this.r.scene.remove(this.root); }

  // ---------- queries (world space; call after step) ----------
  headCenter(out = new THREE.Vector3()) { out.set(0, 0.10, 0.0); return this.J.head.localToWorld(out); }
  get headRadius() { return HEAD_R * this.sc * 1.05; }
  /** The centre of the glove: past the wrist, along the forearm. */
  gloveWorld(side, out = new THREE.Vector3()) { out.set(0, -GLOVE_CENTER, 0); return this.J['wrist' + side].localToWorld(out); }
  chestWorld(out = new THREE.Vector3()) { out.set(0, 0.2, 0); return this.torso.localToWorld(out); }
  fwd() { return [Math.sin(this.yaw), Math.cos(this.yaw)]; }
  leftVec() { return [Math.cos(this.yaw), -Math.sin(this.yaw)]; }

  phase(a = this.action) {
    if (!a || !a.def) return null;
    const { wind, act, rec } = a.def;
    if (a.t < wind) return 'wind';
    if (a.t < wind + act) return 'act';
    if (a.t < wind + act + rec) return 'rec';
    return null;
  }
  get punching() { return Boolean(this.action && this.action.def); }
  get striking() { return this.phase() === 'act'; }
  get exhausted() { return this.stamina < 1; }

  // ---------- simulation ----------
  /** Queue a command (punch name or 'dodge'). */
  command(k, mx = 0, my = 0) { this.buffer = { k, mx, my, age: 0 }; }

  step(dt, intent, opp) {
    this.t += dt;
    this.sinceHit += dt; this.sincePunch += dt;
    if (this.daze) { this.daze.left -= dt; if (this.daze.left <= 0) this.daze = null; }
    const dz = this.daze && this.daze.level;
    this.cmdDelay = dz === 'pesada' ? 0.25 : 0;      // heavy: commands arrive 0.25 s late
    this.dazeSpeed = dz === 'media' ? 0.7 : 1;       // medium: commands 30% slower
    if (this.knockdown) {                            // down: nothing else happens
      this.fallT += dt; this.action = null; this.buffer = null; this.tell = null; this.guardAmt = Math.max(0, this.guardAmt - 9 * dt); this.guarding = false;
      this.vx *= 0.9; this.vz *= 0.9; this.knockX *= 0.9; this.knockZ *= 0.9;
      const h = this.head; for (const a_ of ['x', 'y', 'z']) { h['v' + a_] += (-60 * h[a_] - 8 * h['v' + a_]) * dt; h[a_] += h['v' + a_] * dt; }
      return;
    }

    if (this.stunT > 0) {                            // stunned (taser): nothing but a twitch
      this.stunT -= dt; this.action = null; this.buffer = null; this.tell = null; this.guardAmt = Math.max(0, this.guardAmt - 9 * dt); this.guarding = false;
      this.vx *= 0.85; this.vz *= 0.85;
      const h = this.head; h.vx += Math.sin(this.t * 55) * 1.1; h.vz += Math.cos(this.t * 47) * 1.1;
      for (const a_ of ['x', 'y', 'z']) { h['v' + a_] += (-120 * h[a_] - 9 * h['v' + a_]) * dt; h[a_] += h['v' + a_] * dt; }
      this.x += this.vx * dt; this.z += this.vz * dt;
      return;
    }
    if (this.blindT > 0) this.blindT -= dt;
    if (this.noGuardT > 0) { this.noGuardT -= dt; intent = { ...intent, guard: false }; }
    // face the opponent
    const want = Math.atan2(opp.x - this.x, opp.z - this.z);
    if (this.freeYaw !== null) this.yaw = this.freeYaw;
    else { let d = want - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); this.yaw += d * Math.min(1, (this.blindT > 0 ? 2 : 14) * dt); }

    for (const p of intent.press ?? []) {
      if (p.k === 'dodge' && Math.hypot(p.mx ?? 0, p.my ?? 0) < 0.5) continue; // Space with no direction does nothing
      if (p.k === 'dodge' || p.k === 'duck' || ACTIONS[p.k]) this.command(p.k, p.mx ?? 0, p.my ?? 0);
    }
    if (this.buffer) { this.buffer.age += dt; if (this.buffer.age > 0.28 + this.cmdDelay) this.buffer = null; }

    // action progress and chaining
    if (this.action) {
      this.action.t += dt * this.action.speed;
      if (this.action.def && this.phase() === 'act' && !this.action.aim) this._latch(opp);
      const a = this.action, total = a.def ? a.def.wind + a.def.act + a.def.rec : DODGE.dur;
      if (a.t >= total) this.action = null;
    }
    if (this.buffer && this.buffer.age >= this.cmdDelay && this._canStart()) this._start(this.buffer);

    // guard
    this.wantGuard = Boolean(intent.guard) && !this.action;
    this.guardAmt = clamp(this.guardAmt + (this.wantGuard ? 1 : -1) * 9 * dt, 0, 1);
    this.guarding = this.guardAmt > 0.6;

    // resources
    if (!this.punching) this.stamina = Math.min(MAX_STAMINA, this.stamina + dt / 0.8);
    if (this.sinceHit > 1) this.balance = Math.min(100, this.balance + 2 * dt);

    // movement: stick relative to the facing
    const [fx, fz] = this.fwd(), [lx, lz] = this.leftVec();
    let mx = intent.moveX ?? 0, my = intent.moveY ?? 0;
    const m = Math.hypot(mx, my); if (m > 1) { mx /= m; my /= m; }
    let speed = 2.5 * this.dazeSpeed * (1 - 0.5 * this.guardAmt) * (this.action ? (this.action.def ? 0.3 : 0) : 1);
    let dvx = (fx * my - lx * mx) * speed, dvz = (fz * my - lz * mx) * speed;
    if (this.home && !this.action && Math.hypot(mx, my) < 0.01) {
      dvx = clamp((this.home.x - this.x) * 3, -1.5, 1.5); dvz = clamp((this.home.z - this.z) * 3, -1.5, 1.5);
    }
    const k = Math.min(1, 12 * dt);
    this.vx += (dvx - this.vx) * k; this.vz += (dvz - this.vz) * k;
    let ax = 0, az = 0;
    const a = this.action;
    if (a && a.def && this.phase() === 'act') { const s = a.def.lunge / a.def.act * a.speed; ax = fx * s; az = fz * s; }
    if (a && a.kind === 'dodge') {
      const u = a.t / DODGE.dur, sv = stepVel(u, DODGE.dist[a.dir]);
      if (a.dir === 'L') { ax = lx * sv; az = lz * sv; }
      if (a.dir === 'R') { ax = -lx * sv; az = -lz * sv; }
      if (a.dir === 'B') { ax = -fx * sv; az = -fz * sv; }
      if (a.dir === 'F') { ax = fx * sv; az = fz * sv; }
    }
    this.knockX *= Math.exp(-7 * dt); this.knockZ *= Math.exp(-7 * dt);
    const tx = this.vx + ax + this.knockX, tz = this.vz + az + this.knockZ;
    this.x += tx * dt; this.z += tz * dt;
    // local velocity (for the gait)
    this.speedLocal = [-(tx * lx + tz * lz), tx * fx + tz * fz];
    this.gait += Math.hypot(tx, tz) * dt * 4.2;

    // head and body reactions: damped springs
    const h = this.head, kS = 190, c = 13;
    for (const ax_ of ['x', 'y', 'z']) {
      h['v' + ax_] += (-kS * h[ax_] - c * h['v' + ax_]) * dt; h[ax_] += h['v' + ax_] * dt;
    }
    this.recoilV += (-120 * this.recoil - 11 * this.recoilV) * dt; this.recoil += this.recoilV * dt;
    this.flinch = Math.max(0, this.flinch - dt * 3);
  }

  _canStart() {
    const a = this.action; if (!a) return true;
    if (a.def) return a.t >= a.def.wind + a.def.act + a.def.rec * 0.55;
    return a.t >= DODGE.cancel;
  }

  _start(b) {
    this.buffer = null;
    if (b.k === 'dodge' || b.k === 'duck') {
      let dir = 'D';
      if (b.k === 'dodge') {
        if (Math.abs(b.mx) > Math.abs(b.my)) dir = b.mx > 0 ? 'R' : 'L'; else dir = b.my < 0 ? 'B' : 'F';
      }
      this.action = { kind: 'dodge', dir, t: 0, speed: this.dazeSpeed };
      this.events.push({ type: 'dodge', dir });
      return;
    }
    const exhausted = this.exhausted;
    this.stamina = Math.max(0, this.stamina - 1);
    this.sincePunch = 0;
    this.action = { kind: b.k, def: this.A[b.k], t: 0, speed: (exhausted ? 1 / 1.4 : 1) * this.dazeSpeed * this.speedScale, dmgMul: (exhausted ? 0.5 : 1) * ACTIONS[b.k].dmg * this.power, hit: false, aim: null };
    this.events.push({ type: 'wind', kind: b.k });
  }

  /** At the start of the impact phase the punch locks onto where the head is now. */
  _latch(opp) {
    const a = this.action, def = a.def;
    const head = opp.headCenter(new THREE.Vector3());
    const hr = opp.headRadius, Rt = hr + GLOVE_R * this.sc * 0.2;
    const sh = this.torso.localToWorld(this.SH[def.hand].clone());
    const dirH = new THREE.Vector3(sh.x - head.x, 0, sh.z - head.z).normalize();
    const lv = new THREE.Vector3(this.leftVec()[0], 0, this.leftVec()[1]);
    // a small seeded variation of where on the head the punch is aimed
    this.aimSeed = (Math.imul(this.aimSeed, 1664525) + 1013904223) >>> 0;
    const rnd = this.aimSeed / 4294967296;
    let off;
    if (def.aim === 'straight') {
      const ay = (rnd - 0.4) * 0.6 * hr; // around the middle of the face
      off = new THREE.Vector3(0, ay, 0).addScaledVector(dirH, Math.sqrt(Math.max(Rt * Rt - ay * ay, 0)));
    } else if (def.aim === 'hookL' || def.aim === 'hookR') {
      const s = def.aim === 'hookL' ? 1 : -1;
      off = new THREE.Vector3(0, (rnd - 0.4) * 0.4 * hr, 0).addScaledVector(lv, s * 0.92).addScaledVector(dirH, 0.4).setLength(Rt);
    } else {
      off = new THREE.Vector3(0, -0.6, 0).addScaledVector(dirH, 0.8).setLength(Rt);
    }
    if (this.blindT > 0) { this.aimSeed = (Math.imul(this.aimSeed, 1664525) + 1013904223) >>> 0; off.addScaledVector(lv, ((this.aimSeed / 4294967296) - 0.5) * 1.1); } // pepper in the eyes: it swings wide
    a.aim = head.add(off);
  }

  // ---------- pose ----------
  pose() {
    const t = this.t, a = this.action, sc = this.sc;
    const root = this.root;
    root.position.set(this.x, 0, this.z); root.rotation.set(0, this.yaw, 0, 'YXZ');

    // body parameters from state
    let duck = 0, leanZ = 0, leanBack = 0, dip = 0, twist = BASE_TWIST, leanX = 0.07 + 0.12 * this.guardAmt;
    let w = 0, phase = null;
    if (a && a.kind === 'dodge') {
      const u = clamp(a.t / DODGE.dur, 0, 1), bump = Math.sin(Math.PI * u);
      if (a.dir === 'D') duck = bump;
      if (a.dir === 'L') leanZ = -0.5 * bump;
      if (a.dir === 'R') leanZ = 0.5 * bump;
      if (a.dir === 'B') leanBack = 0.45 * bump;
      if (a.dir === 'F') leanBack = -0.25 * bump;
    }
    let handT = null;
    if (a && a.def) {
      const d = a.def, tt = a.t;
      phase = this.phase();
      let u;
      if (phase === 'wind') { u = tt / d.wind; w = u; twist = lerp(BASE_TWIST, d.twW, easeOut(u)); leanX += (d.dip ? -0.1 : 0.02) * u; dip = (d.dip ?? 0) * u; }
      else if (phase === 'act') { u = (tt - d.wind) / d.act; w = 1; twist = lerp(d.twW, d.twI, easeIn(u)); leanX += lerp(d.dip ? -0.1 : 0.02, d.leanI, u); dip = (d.dip ?? 0) * (1 - u) * 0.6; }
      else { u = clamp((tt - d.wind - d.act) / d.rec, 0, 1); w = 1 - easeInOut(u); twist = lerp(d.twI, BASE_TWIST, easeInOut(u)); leanX += lerp(d.leanI, 0, easeInOut(u)); }
      handT = { u, phase };
    }
    // the warning before a punch: head down before the uppercut, shoulder turned before a hook
    let headDip = 0;
    if (this.tell && !a) {
      const k = easeOut(clamp(this.tell.t / this.tell.dur, 0, 1)), kd = this.tell.kind, td = this.A[kd];
      if (kd === 'upper') { dip += 0.13 * k; leanX += 0.3 * k; headDip = 0.55 * k; }
      else if (kd === 'hookL' || kd === 'hookR') { twist = lerp(BASE_TWIST, td.twW, 1.15 * k); leanZ += (kd === 'hookL' ? -0.14 : 0.14) * k; }
      else { leanX -= 0.04 * k; dip += 0.02 * k; twist += (kd === 'direct' ? -0.3 : 0.12) * k; }
    }
    this.headDip = headDip;
    this._pre = { duck, leanZ, leanBack, dip, twist, leanX };

    // gait offsets for the feet
    const sp = Math.hypot(...this.speedLocal), moving = clamp(sp / 1.2, 0, 1);
    const dirx = sp > 0.05 ? this.speedLocal[0] / sp : 0, dirz = sp > 0.05 ? this.speedLocal[1] / sp : 0;
    const bob = Math.sin(t * 5.2) * 0.012 * (1 - moving) + Math.abs(Math.sin(this.gait)) * 0.03 * moving;
    const hipY = this.hipBase - 0.04 * this.guardAmt - 0.32 * duck - dip + bob - 0.02 * this.recoil * 4;
    const feet = [
      { x: 0.15, z: 0.26, ph: 0 }, { x: -0.17, z: -0.16, ph: Math.PI },
    ];
    ['L', 'R'].forEach((sd, i) => {
      const f = feet[i], g = this.gait + f.ph;
      const reach = 0.16 * moving;
      const fx = f.x + dirx * Math.sin(g) * reach + (i === 0 ? 0.03 * duck : 0) + leanZ * -0.2;
      const fz = f.z + dirz * Math.sin(g) * reach - leanBack * 0.15 * (i === 0 ? 1 : 0);
      const lift = Math.max(0, Math.cos(g)) * 0.07 * moving;
      const hip = this.J['hip' + sd].position;
      const sol = this._solve(hip, v3(fx, 0.09 + lift - hipY, fz), this.len.legA, this.len.legB, v3(0, 0.1, 1));
      const J = this.J, q1 = J['hip' + sd].quaternion.setFromUnitVectors(DOWN, sol.E.clone().sub(hip).normalize());
      const d2 = sol.H.clone().sub(sol.E).normalize().applyQuaternion(q1.clone().invert());
      const q2 = J['knee' + sd].quaternion.setFromUnitVectors(DOWN, d2);
      J['ankle' + sd].quaternion.copy(q1.clone().multiply(q2).invert()); // the foot stays level
    });

    // torso
    const T = this.torso;
    this.J.hips.position.set(0, hipY, 0);
    const hr = this.head;
    T.rotation.set(leanX + duck * 0.55 - leanBack + this.recoil, twist + (this.fp ? 0.3 : 0), leanZ + (this.flinch * 0.1), 'YXZ');
    this.headYaw = hr.y;
    this.neck.rotation.set(hr.x + headDip - duck * 0.35 + leanBack * 0.6, hr.y - (twist - BASE_TWIST) * 0.75 - BASE_TWIST * 0.5 + 0 , hr.z - leanZ * 0.6);
    if (this.knockdown) { // falls backwards, pivoting at the feet
      const f = easeIn(clamp(this.fallT / 0.8, 0, 1)), fw = this.fwd();
      root.rotation.set(-f * 1.5, this.yaw, 0, 'YXZ');
      root.position.set(this.x - fw[0] * 0.6 * f, 0.08 * f, this.z - fw[1] * 0.6 * f);
    }
    root.updateMatrixWorld(true);

    // hands
    for (const side of ['L', 'R']) {
      const sgn = side === 'L' ? 1 : -1;
      const wob = (ph) => v3(Math.sin(t * 2.1 + ph) * 0.016, Math.cos(t * 1.7 + ph) * 0.014, Math.sin(t * 2.6 + ph) * 0.012);
      const idle = this.guardIdle[side].clone().lerp(this.guardTight[side], this.guardAmt).add(wob(side === 'L' ? 0 : 1.7).multiplyScalar(1 - this.guardAmt * 0.7));
      let target = idle, pole = POLE_GUARD[side].clone();
      if (a && a.def && a.def.hand === side) {
        const d = a.def, u = handT.u;
        let p;
        const W = this.fp && d.Wf ? d.Wf : d.W;
        if (phase === 'wind') p = idle.clone().lerp(W, easeOut(u));
        else if (phase === 'act') {
          const I = a.aim ? T.worldToLocal(a.aim.clone()) : v3(d.W.x * 0.2, d.W.y, 0.6);
          const e = easeIn(u), q = 1 - e;
          p = W.clone().multiplyScalar(q * q).addScaledVector(d.C, 2 * q * e).addScaledVector(I, e * e);
          this._lastI = I;
        } else {
          const I = a.aim ? T.worldToLocal(a.aim.clone()) : d.C;
          const reach = I.clone();
          p = reach.lerp(idle, easeInOut(u));
          // the fist leaves the target along the bent path in reverse, then settles
          p.addScaledVector(d.C.clone().sub(I), Math.sin(Math.PI * u) * 0.15);
        }
        target = p; pole = POLE_GUARD[side].clone().lerp(d.pole, w);
      } else if (this.tell && !a && this.A[this.tell.kind].hand === side && this.tell.kind !== 'jab') {
        // the hand that will throw is cocked a little: the warning the player can read
        const kd = this.A[this.tell.kind], k = easeOut(clamp(this.tell.t / this.tell.dur, 0, 1));
        target = idle.clone().lerp(kd.W, 0.55 * k);
      } else if (a && a.kind === 'dodge') {
        target = idle.clone().lerp(this.guardTight[side], 0.7);
      }
      this._arm(side, target, pole);
      void sgn;
    }
    root.updateMatrixWorld(true);
  }

  /** Aim the shoulder and elbow joints so the wrist reaches target (torso space). */
  _arm(side, target, pole) {
    const J = this.J, arm = this.arms[side], sh = J['shoulder' + side], el = J['elbow' + side];
    const sol = this._solve(this.SH[side], target, this.len.armA, this.len.armB + GLOVE_CENTER, pole);
    arm.elbow.copy(sol.E); arm.hand.copy(sol.H);
    sh.quaternion.setFromUnitVectors(DOWN, sol.E.clone().sub(this.SH[side]).normalize());
    const dF = sol.H.clone().sub(sol.E).normalize();
    el.quaternion.setFromUnitVectors(DOWN, dF.clone().applyQuaternion(sh.quaternion.clone().invert()));
    J['wrist' + side].quaternion.identity(); // the glove hangs along the forearm
  }

  /** Two-bone IK: elbow/knee position and the reachable end point. */
  _solve(S, Tgt, A, B, pole) {
    const d = Tgt.clone().sub(S);
    let dist = d.length();
    const max = A + B - 0.004;
    if (dist > max) { d.multiplyScalar(max / dist); dist = max; }
    if (dist < 0.1) { d.setLength(0.1); dist = 0.1; }
    const dir = d.clone().divideScalar(dist);
    const along = (A * A - B * B + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(A * A - along * along, 0));
    const p = pole.clone().addScaledVector(dir, -pole.dot(dir));
    if (p.lengthSq() < 1e-6) p.set(0, -1, 0).addScaledVector(dir, dir.y);
    p.normalize();
    return { E: S.clone().addScaledVector(dir, along).addScaledVector(p, h), H: S.clone().add(d) };
  }

  /** Called after pose() each step: remembers where the gloves were, for the swept hit test. */
  trackGloves(dt) {
    // glove velocity relative to its shoulder: the torso turn is not part of the punch's path
    const p = new THREE.Vector3();
    for (const s of ['L', 'R']) {
      this.gloveWorld(s, p);
      const sh = this.torso.localToWorld(this.SH[s].clone());
      const v = p.clone().sub(this.prevGlove[s]).sub(sh.sub(this.prevShoulder[s])).divideScalar(dt);
      this.gloveVel[s].lerp(v, 0.6);
    }
  }
  savePrev() {
    for (const s of ['L', 'R']) { this.gloveWorld(s, this.prevGlove[s]); this.torso.localToWorld(this.prevShoulder[s].copy(this.SH[s])); }
  }

  // ---------- being hit ----------
  /** info: { level, traj, zone, dir:[x,z] push direction (world), amount } */
  receiveHit(info) {
    const k = { leve: 0.6, media: 1.1, pesada: 2.0, bloq: 0.15, corpo: 0.4 }[info.level] ?? 0.5;
    const h = this.head;
    if (info.level !== 'bloq') {
      const [lx, lz] = this.leftVec(), [fx, fz] = this.fwd();
      const sideK = info.dir[0] * lx + info.dir[1] * lz, frontK = info.dir[0] * fx + info.dir[1] * fz;
      if (info.traj === 'upper') h.vx -= 9 * k;
      else h.vx += frontK * -5 * k;
      h.vy += sideK * 14 * k; h.vz -= sideK * 8 * k;
      if (info.traj === 'upper') h.vx -= 6 * k;
    }
    this.recoilV -= 3.2 * k; this.flinch = 1;
    this.knockX += info.dir[0] * 1.6 * k; this.knockZ += info.dir[1] * 1.6 * k;
    this.balance = Math.max(0, this.balance - info.amount * this.takes);
    if (['leve', 'media', 'pesada'].includes(info.level)) {
      const rank = { leve: 1, media: 2, pesada: 3 }, dur = { leve: 1, media: 2, pesada: 3 }[info.level];
      if (!this.daze || rank[info.level] >= rank[this.daze.level]) this.daze = { level: info.level, left: dur, dur };
    }
    this.sinceHit = 0;
    if (this.balance <= 0) this.knockdown = true;
  }
}

function stepVel(u, dist) {
  if (!dist) return 0;
  const dur = DODGE.dur, f = Math.max(0, 1 - u / 0.45);
  return (3 * dist / (0.45 * dur)) * f * f;
}

