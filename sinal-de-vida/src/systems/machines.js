// The machines of the street: for phase 2, the robot dog. It hears (a big radius that depends on the loud of each
// noise), feels heat up close, and goes through four states with the sensor colour of the design:
//   calm (follows its patrol, weak amber) -> suspicious (heard something, goes to see; amber) -> search (looks around
//   the last point; amber blinking 1 per second, a fixed light with "reduce flashes") -> chase (found someone: white;
//   runs, knocks them down) -> down (a pause) -> search -> calm, back to the route.
// Everything is a function of the game's own clock (the sum of the dt it is given, stepped at 1/60 s) and of the
// seed: no Math.random, no wall clock, so the film mode films the same.
//
//   const machines = createMachines({ r, scene, bus, seed, audio?, buildDog? });
//   machines.update(dt, { people })   people = [{ id, pos: [x, z], crouch, hidden, heat }]
//   machines.list()                    [{ id, state, estado, pos, yaw, target }]
//   machines.setReduceFlash(on); machines.dispose()
// Events: 'machine:state' { id, state, estado, pos }, 'person:down' { id, by }, 'machine:lost' { id, pos, phase }
//   (phase 'lost' = chase gave way to a search; 'gaveup' = the search ended and the dog went back to its route),
//   'machine:sound' { name, pos, gain } (if `audio` is not given: the game plays it), and it emits 'noise' for a fall.
// Listens: 'noise' { pos: [x, z], loud, kind, src? } (loud x hearRadius is how far it is heard); kind 'isca' is a decoy.
import DATA from '../../data/machines.json' with { type: 'json' };
import { mulberry32 } from '../../vendor/engine/rng.js';
import { hits } from './player.js';
import { noiseOf, heatRadius } from './stealth.js';

export const STATES = ['calm', 'suspicious', 'search', 'chase', 'down'];
/** The design's names for the four states (and the pause after a knock-down, a search for the game). */
export const ESTADOS = { calm: 'calma', suspicious: 'desconfiada', search: 'busca', chase: 'caça', down: 'busca' };

let dogModule = null;
try { dogModule = await import('../models/dog.js'); } catch { dogModule = null; }

const D = DATA.dog, S = DATA.sensor, STEP = 1 / 60;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const hexNum = (s) => parseInt(s.slice(1), 16);

/** A box with a round sensor: only until the real model (src/models/dog.js) exists. */
function fallbackDog(r) {
  const T = r.THREE, root = new T.Group();
  const body = new T.Mesh(new T.BoxGeometry(0.7, 0.35, 1.1), new T.MeshBasicMaterial({ color: 0x3a3d44 })); body.position.y = 0.45; root.add(body);
  const eye = new T.Mesh(new T.SphereGeometry(0.12, 8, 6), new T.MeshBasicMaterial({ color: 0xe8a42a })); eye.position.set(0, 0.5, -0.58); root.add(eye);
  return { root, update(dt, { sensorHex }) { eye.material.color.setHex(sensorHex ?? 0xe8a42a); } };
}

export function createMachines({ r, scene, bus, seed = 1, audio = null, buildDog = dogModule?.buildDog ?? null } = {}) {
  const rand = mulberry32((seed >>> 0) ^ 0x51ed);
  const colliders = scene?.colliders ?? [];
  let now = 0, acc = 0, reduceFlash = false, people = [];
  const downedUntil = new Map(); // person id -> time they can be knocked down again
  const noises = [];             // heard since the last step
  const dogs = [];

  const patrols = scene?.patrols ?? [];
  patrols.forEach((p, i) => {
    if (!p.path || p.path.length < 1) return;
    const rg = mulberry32(((seed >>> 0) * 2654435761 + i * 40503) >>> 0);
    const path = p.path.map((q) => [q[0], q[1]]);
    const loop = path.length > 2 && dist(path[0], path[path.length - 1]) < 2.5;
    const pi = Math.floor(rg() * path.length), pos = [...path[pi]];
    const next = (pi + 1) % path.length;
    const model = (buildDog ?? fallbackDog)(r, { seed: ((seed >>> 0) + i * 977) >>> 0 });
    scene.group?.add(model.root);
    const d = {
      id: p.id ?? `cao-${i}`, path, loop, pi: loop ? next : Math.min(pi + 1, path.length - 1), dir: 1, pos,
      yaw: Math.atan2(-(path[next][0] - pos[0]), -(path[next][1] - pos[1])) || 0, speed: 0,
      state: 'calm', t: 0, pause: 0, returning: false, target: null, targetId: null, lastSeen: null, lost: 0,
      legs: [], leg: 0, fromChase: false, decoyUntil: 0, stuck: 0, rg, model, sfx: 0, home: [...pos],
    };
    dogs.push(d);
  });

  const play = (name, pos, gain = 1) => {
    if (audio) audio.play(name, { pos: [pos[0], 1, pos[1]], gain });
    bus.emit('machine:sound', { name, pos: [pos[0], pos[1]], gain });
  };

  function setState(d, state) {
    if (d.state === state) return;
    const prev = d.state;
    d.state = state; d.t = 0;
    bus.emit('machine:state', { id: d.id, state, estado: ESTADOS[state], pos: [...d.pos] });
    if (state === 'suspicious' && prev === 'calm') play('cao-desconfiado', d.pos);
    if (state === 'search' && prev !== 'down') play('cao-busca', d.pos);
    if (state === 'chase') play('cao-caca', d.pos);
  }

  function startSearch(d, fromChase) {
    const c = d.target ?? d.pos;
    d.legs = [];
    const a0 = d.rg() * Math.PI * 2;
    for (let i = 0; i < D.searchLegs; i++) {
      const a = a0 + i * (Math.PI * 2 / D.searchLegs) + d.rg() * 0.6, k = D.searchRadius * (0.5 + 0.5 * d.rg());
      d.legs.push([c[0] + Math.cos(a) * k, c[1] + Math.sin(a) * k]);
    }
    d.leg = 0; d.fromChase = fromChase || d.fromChase; d.pause = 0;
    setState(d, 'search');
  }

  /** Walk toward a point at `v` m/s with the body turning at turnRate; slides along colliders. Returns metres moved. */
  function move(d, tx, tz, v, dt) {
    const dx = tx - d.pos[0], dz = tz - d.pos[1], dd = Math.hypot(dx, dz);
    if (dd < 1e-4) { d.speed = 0; return 0; }
    const want = Math.atan2(-dx, -dz), diff = wrap(want - d.yaw);
    d.yaw = wrap(d.yaw + Math.max(-D.turnRate * dt, Math.min(D.turnRate * dt, diff)));
    const k = Math.max(0, Math.cos(Math.min(Math.abs(diff), Math.PI / 2))) ** 2;
    const step = Math.min(dd, v * k * dt);
    // Straight at it if free; else steer around (the side it chose last, then the other) in growing angles;
    // else slide along the wall.
    let x = d.pos[0], z = d.pos[1], ok = false;
    const ux = dx / dd, uz = dz / dd, sgn = d.side ?? 1;
    for (const a of [0, 0.6 * sgn, -0.6 * sgn, 1.2 * sgn, -1.2 * sgn, 1.9 * sgn]) {
      const c = Math.cos(a), s2 = Math.sin(a), nx = d.pos[0] + (ux * c - uz * s2) * step, nz = d.pos[1] + (ux * s2 + uz * c) * step;
      if (!hits(colliders, nx, nz, D.radius)) { x = nx; z = nz; ok = true; if (a !== 0 && Math.sign(a) !== sgn) d.side = -sgn; if (a !== 0) d.side = Math.sign(a); break; }
    }
    if (!ok) {
      const nx = d.pos[0] + ux * step, nz = d.pos[1] + uz * step;
      if (!hits(colliders, nx, z, D.radius)) x = nx;
      if (!hits(colliders, x, nz, D.radius)) z = nz;
    }
    const moved = Math.hypot(x - d.pos[0], z - d.pos[1]);
    d.pos = [x, z]; d.speed = moved / dt;
    d.stuck = moved < step * 0.25 && step > 1e-4 ? d.stuck + dt : 0;
    return moved;
  }
  function look(d, ang, dt) { d.yaw = wrap(d.yaw + Math.max(-D.turnRate * dt, Math.min(D.turnRate * dt, wrap(ang - d.yaw)))); d.speed = 0; }

  function hear(d, n) {
    if (d.state === 'chase' || d.state === 'down') return;
    if (n.src === d.id) return;
    const dd = dist(d.pos, n.pos), radius = n.loud * D.hearRadius;
    if (dd > radius) return;
    const decoy = n.kind === 'isca';
    // A dog drawn to a decoy ignores quieter people unless they are right next to it.
    if (!decoy && d.decoyUntil > now && dd > radius * 0.3) return;
    if (decoy) d.decoyUntil = now + D.decoyHold;
    d.target = [n.pos[0], n.pos[1]];
    d.returning = false;
    if (d.state === 'calm') { setState(d, 'suspicious'); }
    else if (d.state === 'search') { d.t = Math.min(d.t, 1); if (dd > D.arriveRadius * 1.5) setState(d, 'suspicious'); }
    else d.t = Math.min(d.t, D.reactDelay); // suspicious: a new noise, a short look first
  }

  function sense(d) {
    let best = null, bd = Infinity;
    for (const p of people) {
      if ((downedUntil.get(p.id) ?? 0) > now) continue;
      const dd = dist(d.pos, p.pos);
      if (dd <= heatRadius({ crouch: p.crouch, hidden: p.hidden, heat: p.heat ?? 1 }) && dd < bd) { best = p; bd = dd; }
    }
    return best;
  }

  function stepDog(d, dt) {
    d.t += dt;
    if (d.state !== 'chase' && d.state !== 'down') {
      const p = sense(d);
      if (p) { d.targetId = p.id; d.lastSeen = [...p.pos]; d.lost = 0; setState(d, 'chase'); }
    }
    const V = D.speed;
    switch (d.state) {
      case 'calm': {
        if (d.returning) {
          const q = d.path[d.pi];
          if (move(d, q[0], q[1], V.return, dt) >= 0 && dist(d.pos, q) < 0.8) { d.returning = false; d.fromChase = false; }
          if (d.stuck > D.stuckTime) { d.returning = false; d.stuck = 0; }
          break;
        }
        if (d.pause > 0) { d.pause -= dt; d.speed = 0; d.yaw = wrap(d.yaw + Math.sin(d.t * 1.3) * dt * 0.7); break; }
        if (d.path.length < 2) { d.speed = 0; break; }
        const q = d.path[d.pi];
        move(d, q[0], q[1], V.calm, dt);
        if (dist(d.pos, q) < 0.6 || d.stuck > D.stuckTime) {
          d.stuck = 0; d.pause = D.waypointPause;
          if (d.loop) d.pi = (d.pi + 1) % d.path.length;
          else { if (d.pi + d.dir < 0 || d.pi + d.dir >= d.path.length) d.dir = -d.dir; d.pi += d.dir; }
        }
        break;
      }
      case 'suspicious': {
        const q = d.target;
        if (!q) { startSearch(d, false); break; }
        if (d.t < D.reactDelay) { look(d, Math.atan2(-(q[0] - d.pos[0]), -(q[1] - d.pos[1])), dt); break; }
        move(d, q[0], q[1], V.suspicious, dt);
        // Gives up on a point it cannot get closer to (a wall in the way) and searches where it stands.
        const dq = dist(d.pos, q);
        if (!d.prog || d.prog.q !== q) d.prog = { q, best: dq, at: d.t };
        else if (dq < d.prog.best - 0.4) { d.prog.best = dq; d.prog.at = d.t; }
        if (dq < D.arriveRadius || d.stuck > D.stuckTime || d.t - d.prog.at > D.progressTime) { d.stuck = 0; d.prog = null; startSearch(d, false); }
        break;
      }
      case 'search': {
        const q = d.legs[d.leg];
        if (q) {
          if (d.pause > 0) { d.pause -= dt; look(d, d.yaw + Math.sin(d.t * 2.2) * 2, dt); }
          else {
            move(d, q[0], q[1], V.search, dt);
            if (dist(d.pos, q) < 0.7 || d.stuck > D.stuckTime) { d.stuck = 0; d.leg++; d.pause = 0.6; }
          }
        } else look(d, d.yaw + 1.6, dt);
        if (d.t >= D.searchTime && now >= d.decoyUntil) {
          const escaped = d.fromChase;
          // Back to the nearest point of the route.
          let bi = 0, bd = Infinity;
          d.path.forEach((q2, i) => { const x = dist(d.pos, q2); if (x < bd) { bd = x; bi = i; } });
          d.pi = bi; d.returning = true; d.target = null; d.fromChase = false;
          setState(d, 'calm');
          if (escaped) bus.emit('machine:lost', { id: d.id, pos: [...d.pos], phase: 'gaveup' });
        }
        break;
      }
      case 'chase': {
        let tgt = null, bd = Infinity;
        for (const p of people) {
          if ((downedUntil.get(p.id) ?? 0) > now) continue;
          const dd = dist(d.pos, p.pos);
          const keep = p.hidden ? dd < D.hiddenHeatRadius + 0.6 : dd <= (p.crouch ? D.loseRadius * 0.5 : D.loseRadius);
          if (keep && (p.id === d.targetId ? dd - 2 : dd) < bd) { tgt = p; bd = dd; }
        }
        if (tgt) {
          d.targetId = tgt.id; d.lastSeen = [...tgt.pos]; d.lost = 0;
          move(d, tgt.pos[0], tgt.pos[1], V.chase, dt);
          if (dist(d.pos, tgt.pos) <= D.catchRadius && !tgt.hidden) {
            downedUntil.set(tgt.id, now + D.downCooldown);
            bus.emit('person:down', { id: tgt.id, by: d.id });
            bus.emit('noise', { pos: [tgt.pos[0], tgt.pos[1]], loud: noiseOf('fall'), kind: 'fall', src: d.id });
            play('cao-derruba', d.pos);
            d.target = [...tgt.pos]; d.targetId = null; d.speed = 0;
            setState(d, 'down');
          }
        } else {
          d.lost += dt;
          if (d.lastSeen && dist(d.pos, d.lastSeen) > 0.8 && d.lost < D.loseTime) move(d, d.lastSeen[0], d.lastSeen[1], V.chase * 0.8, dt);
          else look(d, d.yaw + 1.8, dt);
          if (d.lost >= D.loseTime) {
            d.target = d.lastSeen ? [...d.lastSeen] : [...d.pos]; d.targetId = null;
            bus.emit('machine:lost', { id: d.id, pos: [...d.pos], phase: 'lost' });
            startSearch(d, true);
          }
        }
        break;
      }
      case 'down': {
        d.speed = 0; look(d, d.yaw + 2.2 * Math.sin(d.t * 3), dt);
        if (d.t >= D.downPause) startSearch(d, true);
        break;
      }
    }
    // A servo hum from the wheels, faster the faster it goes (the stingers are on the state changes).
    d.sfx -= dt;
    if (d.sfx <= 0 && d.speed > 0.2) { d.sfx = d.state === 'chase' ? 0.32 : d.state === 'calm' ? 1.1 : 0.6; play('cao-rolar', d.pos, Math.min(1, 0.4 + d.speed / 5)); }
  }

  function sensorOf(d) {
    let hex = S[d.state === 'down' ? 'down' : d.state];
    if (d.state === 'search' || d.state === 'down') {
      const on = reduceFlash || (now * S.blinkHz) % 1 < 0.5;
      if (!on) hex = S.searchOff;
    }
    return hex;
  }

  const offNoise = bus.on('noise', (n) => { if (n?.pos && n.loud > 0) noises.push({ pos: n.pos, loud: n.loud, kind: n.kind, src: n.src }); });
  const offOpt = bus.on('options:reduceFlash', (v) => { reduceFlash = !!v; });

  return {
    update(dt, ctx = {}) {
      people = (ctx.people ?? []).map((p) => ({ ...p, pos: p.pos.length === 3 ? [p.pos[0], p.pos[2]] : p.pos }));
      acc = Math.min(acc + dt, 0.25);
      while (acc >= STEP) {
        acc -= STEP; now += STEP;
        if (noises.length) { const q = noises.splice(0); for (const n of q) for (const d of dogs) hear(d, n); }
        for (const d of dogs) if (!d.puppet) stepDog(d, STEP);
      }
      for (const d of dogs) {
        const P = d.puppet;
        if (P) { d.pos = [P.pos[0], P.pos[1]]; d.yaw = P.yaw ?? d.yaw; d.speed = P.speed ?? 0; }
        const hex = P?.sensor ?? sensorOf(d), y = (P?.h ?? scene?.ground?.(d.pos[0], d.pos[1]) ?? 0) + (P?.y ?? 0);      // (`h`: the floor it stands on, when the story has it off the street: a stair, a landing)
        d.model.root.position.set(d.pos[0], y, d.pos[1]);
        d.model.root.rotation.order = 'YXZ'; d.model.root.rotation.y = d.yaw; d.model.root.rotation.x = P?.pitch ?? 0;
        d.model.update(dt, { speed: d.speed, state: P ? (P.state ?? 'desconfiada') : d.state === 'down' ? 'search' : d.state, sensorColor: P && !P.sensor ? null : hex, sensorHex: hexNum(hex), look: P?.look, action: P?.action ?? null, lift: P?.y ?? 0 });
      }
    },
    /** The story sends a dog to look at a point (`target`): a dog in a chase is left alone. Returns whether it went. */
    cue(id, { target, pos = null }) {
      const d = dogs.find((x) => x.id === id);
      if (!d || d.state === 'chase' || d.state === 'down') return false;
      if (pos) { d.pos = [pos[0], pos[1]]; d.stuck = 0; }
      d.target = [target[0], target[1]]; d.returning = false; d.decoyUntil = 0; d.prog = null;
      if (d.state === 'suspicious') d.t = Math.min(d.t, D.reactDelay); else setState(d, 'suspicious');
      return true;
    },
    /**
     * The story takes a dog and poses it itself (a sequence of action): `s` = { pos, yaw, speed, state, sensor, y, pitch, look, action }, once a step. `null` gives it back
     * (see `release`). A dog in a pose of the story does not hear, see or hunt.
     */
    puppet(id, s) { const d = dogs.find((x) => x.id === id); if (!d) return false; d.puppet = s ? { ...s } : null; return true; },
    /** Gives a posed dog back to the street: it goes on from `pos`, calm, back to its route (it ignores nothing; use `grace` for the person). */
    release(id, { pos, yaw } = {}) {
      const d = dogs.find((x) => x.id === id); if (!d) return false;
      d.puppet = null; if (pos) d.pos = [pos[0], pos[1]]; if (yaw !== undefined) d.yaw = yaw;
      d.speed = 0; d.target = null; d.stuck = 0; d.prog = null; d.state = 'calm'; d.t = 0; d.returning = true; d.pause = 0;
      let bi = 0, bd = Infinity; d.path.forEach((q, i) => { const x = dist(d.pos, q); if (x < bd) { bd = x; bi = i; } }); d.pi = bi;
      d.model.root.rotation.x = 0; d.model.root.rotation.order = 'YXZ';
      return true;
    },
    /** A person is not seen or caught by any dog for `sec` seconds (the dog that has just failed to get him: it is lost). */
    grace(personId, sec) { downedUntil.set(personId, now + sec); },
    list: () => dogs.map((d) => ({ id: d.id, state: d.state, estado: ESTADOS[d.state], pos: [...d.pos], yaw: d.yaw, target: d.target ? [...d.target] : null, sensor: sensorOf(d) })),
    setReduceFlash(on) { reduceFlash = !!on; for (const d of dogs) d.model.setReducedFlashes?.(reduceFlash); },
    get time() { return now; },
    dispose() { offNoise(); offOpt(); for (const d of dogs) d.model.root.parent?.remove(d.model.root); dogs.length = 0; },
  };
}
