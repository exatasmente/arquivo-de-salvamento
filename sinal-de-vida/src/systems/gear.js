// Equipment. Phase 2 has one: the sound decoy ("isca"): aim (the arc the game draws), throw, and where it lands it
// clicks for a few seconds so the dogs go there. The numbers are in data/machines.json ("gear.isca").
//
//   const gear = createGear({ r, scene, bus, audio? });
//   gear.aim(from, dir) -> { points: [[x, y, z], …], land: [x, z], flight, hit }   the arc to draw (no side effects)
//   gear.use('isca', from, dir) -> boolean   throws it (false: not a known piece of equipment, or one is still flying)
//   gear.update(dt)                          call it every frame: it flies, lands, and clicks (all on the game's clock)
//   gear.active() -> [{ pos, left }]         decoys on the ground now
//   gear.dispose()
// `from` is the eye [x, y, z] (or [x, z], at 1.4 m); `dir` the aim [dx, dy, dz] (or a yaw number: flat-ish throw,
// forward is -z at yaw 0, like the player's). The game removes the item from the backpack when use() says true.
// Events: 'noise' { pos: [x, z], loud, kind: 'isca' } at the landing and at every click; 'isca:land' { pos };
// 'machine:sound' { name, pos } (unless `audio` is given).
import DATA from '../../data/machines.json' with { type: 'json' };
import { hits } from './player.js';

const G = DATA.gear.isca;

function vec(from, dir) {
  const f = from.length === 2 ? [from[0], 1.4, from[1]] : [from[0], from[1], from[2]];
  let d;
  if (typeof dir === 'number') d = [-Math.sin(dir) * Math.cos(0.35), Math.sin(0.35), -Math.cos(dir) * Math.cos(0.35)];
  else if (dir.length === 2) d = [dir[0], 0.35, dir[1]];
  else d = [...dir];
  const n = Math.hypot(...d) || 1;
  return { f, d: d.map((x) => x / n) };
}

export function createGear({ r, scene, bus, audio = null } = {}) {
  const colliders = scene?.colliders ?? [];
  const groundAt = (x, z) => scene?.ground?.(x, z) ?? 0;
  const thrown = []; // { pos: [x, y, z], v: [..], t, mesh }
  const landed = []; // { pos: [x, z], left (clicks), next (seconds to the next click), mesh }
  let off = false;

  const play = (name, pos, gain = 1) => {
    if (audio) audio.play(name, { pos: [pos[0], 1, pos[1]], gain });
    bus.emit('machine:sound', { name, pos: [pos[0], pos[1]], gain });
  };
  const mk = () => {
    if (!r?.THREE) return null;
    const T = r.THREE, m = new T.Mesh(new T.BoxGeometry(0.14, 0.1, 0.2), new T.MeshBasicMaterial({ color: 0xd9a83a }));
    scene?.group?.add(m); return m;
  };

  /** Simulate the throw: the points of the arc, where it lands, and how long it flies. Pure. */
  function arc(from, dir) {
    const { f, d } = vec(from, dir);
    const v = [d[0] * G.throwSpeed, d[1] * G.throwSpeed, d[2] * G.throwSpeed], dt = 0.04, pts = [[...f]];
    let p = [...f], t = 0, hit = false;
    for (let i = 0; i < 100; i++) {
      v[1] -= G.gravity * dt;
      const q = [p[0] + v[0] * dt, p[1] + v[1] * dt, p[2] + v[2] * dt];
      if (Math.hypot(q[0] - f[0], q[2] - f[2]) > G.maxRange) { v[0] = v[2] = 0; q[0] = p[0]; q[2] = p[2]; }
      if (q[1] < 2.6 && hits(colliders, q[0], q[2], 0.05)) { hit = true; q[0] = p[0]; q[2] = p[2]; v[0] *= -0.1; v[2] *= -0.1; }
      t += dt;
      const gy = groundAt(q[0], q[2]);
      if (q[1] <= gy + 0.05) { q[1] = gy + 0.05; pts.push(q); p = q; break; }
      pts.push(q); p = q;
    }
    return { points: pts, land: [p[0], p[2]], flight: t, hit };
  }

  return {
    aim(from, dir) { const a = arc(from, dir); return { points: a.points, land: a.land, flight: a.flight, hit: a.hit }; },
    use(name, from, dir) {
      if (name !== 'isca' || off) return false;
      const a = arc(from, dir);
      thrown.push({ pts: a.points, flight: a.flight, t: 0, land: a.land, mesh: mk() });
      play('isca-lanca', [from[0], from.length === 2 ? from[1] : from[2]], 0.8);
      return true;
    },
    update(dt) {
      for (let i = thrown.length - 1; i >= 0; i--) {
        const th = thrown[i]; th.t += dt;
        const k = Math.min(1, th.t / th.flight), idx = k * (th.pts.length - 1), a = Math.floor(idx), b = Math.min(a + 1, th.pts.length - 1), u = idx - a;
        const p = [0, 1, 2].map((c) => th.pts[a][c] + (th.pts[b][c] - th.pts[a][c]) * u);
        th.mesh?.position.set(p[0], p[1], p[2]);
        if (th.t >= th.flight) {
          thrown.splice(i, 1);
          landed.push({ pos: th.land, left: G.clicks, next: 0.15, mesh: th.mesh });
          bus.emit('isca:land', { pos: [...th.land] });
          bus.emit('noise', { pos: [...th.land], loud: G.landLoud, kind: 'isca' });
          play('isca-cai', th.land, 0.9);
        }
      }
      for (let i = landed.length - 1; i >= 0; i--) {
        const l = landed[i]; l.next -= dt;
        if (l.next <= 0) {
          l.left--; l.next += G.clickEvery;
          bus.emit('noise', { pos: [...l.pos], loud: G.clickLoud, kind: 'isca' });
          play('isca-estalo', l.pos, 0.7);
          if (l.left <= 0) { l.mesh?.parent?.remove(l.mesh); landed.splice(i, 1); }
        }
      }
    },
    active: () => landed.map((l) => ({ pos: [...l.pos], left: l.left })),
    dispose() { off = true; for (const th of thrown) th.mesh?.parent?.remove(th.mesh); for (const l of landed) l.mesh?.parent?.remove(l.mesh); thrown.length = landed.length = 0; },
  };
}
