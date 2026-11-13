// EntityAI: the Sun (Valdir, still on shift, with the paper mask). A state machine with a condition for each step, never a bare draw:
//   ausente -> aparicao -> observacao -> aproximacao -> perseguicao -> ataque -> sumindo -> ausente
//  - observacao (week 2+, sanity < 80, the player in a risk area): the figure stands 15-30 m away, still; gone if the flashlight
//    lands on it, if the player comes within 8 m, or in the light of a lit place.
//  - aproximacao (sanity < 40, risk area, dark): it walks only when the player is not looking, and stops when looked at.
//  - perseguicao (sanity < 20, or 60 s in the dark of a risk area in week 3+): fast, straight to where it HEARD the player (a running step,
//    a door, the flashlight switched on) or SAW them (inside the cone of the flashlight or a lit place). It does not know where the player is.
//    It never enters a lit area (the shop, the office, the canopy lamps): it fades. A locked door holds it for 20 s, then it gives up.
//  - ataque: only at sanity 0, or when it reaches the player in a chase: a silent cut of 0.3 s on the paper face, then black. No sound, no shake.
//  - movement: it walks the nav graph (nav.js), through doors that are open or that it opens itself and round the buildings. A door
//    locked from inside cuts the way: if the way through it is the short one it goes to the door and bangs on it for a few seconds,
//    then goes round (the stock room has three doors and the back door) if there is a way round; if there is none it keeps
//    banging and gives up after 20 s. The conditions and the states of the machine are the ones above; only the walking changed.
//  - hiding (esconderijo1..4 with E/A) works if it did not see the player go in; holding the breath (Space/X/button) when it passes near keeps it from hearing.
import { buildEntity } from '../models/entity.js';
import { mulberry32 } from '../rng.js';
import { getNav } from './nav.js';

export const LOCKABLE = { 'porta-estoque': 'estoque', 'porta-escritorio': 'escritorio', 'porta-estoque-escritorio': 'estoque' };
const HIDES = ['esconderijo1', 'esconderijo2', 'esconderijo3', 'esconderijo4'];

export function createEntity(bus, { world, render, player, sanity, lighting, inventory, progression, time, interaction, ui, kit }) {
  const THREE = render.THREE;
  const nav = getNav(world, player);
  const ent = buildEntity(render, { seed: 5, stage: 1 });
  ent.root.visible = false; render.scene.add(ent.root);
  const S = { state: 'ausente', t: 0, cool: 20, pose: 'costas', since: 0, target: null, lockT: 0, darkT: 0, seenOnce: false, forced: false, sawEnter: false, black: 0, hidden: null, breath: 6, holding: false, near: 0, lastStep: 0, rng: mulberry32(9), stuck: 0, attackT: 0 };
  const locked = new Set();
  nav.setLocked(() => locked);
  const BANG = 5;                 // seconds at a locked door before it goes round
  const nr = { goal: null, pts: null, i: 0, t: 0, sig: '', bang: 0, lockedDoor: null };
  const P = new THREE.Vector3(), v = new THREE.Vector3();
  const pos = ent.root.position;
  const dist = () => Math.hypot(pos.x - player.st.x, pos.z - player.st.z);
  const heard = [];   // { x, z, t }
  bus.on('noise', (lvl) => { if (S.hidden) return; if (lvl > 0) heard.push({ x: player.st.x, z: player.st.z, r: lvl >= 1 ? 16 : lvl >= 0.5 ? 7 : 2.5, t: 0 }); });
  bus.on('sfx', (name, o = {}) => { if ((name === 'porta_abre' || name === 'porta_fecha') && o.pos) heard.push({ x: o.pos[0], z: o.pos[2], r: 20, t: 0, door: true }); });

  const lit = (x, z) => lighting.litAt(x, z);
  const playerLit = () => lit(player.st.x, player.st.z) || (inventory.flash.on && inventory.flash.charge > 0);
  const hidden = () => S.hidden !== null;
  const eye = () => player.eyePos();
  const losToPlayer = () => kit.clear(P.set(pos.x, 1.4, pos.z), eye());
  const looking = () => kit.look(v.set(pos.x, 1.4, pos.z)) > 0.55 && losToPlayer();

  function blockedE(x, z) {
    for (const c of world.colliders) {
      if (c.enabled === false || c.min[1] > 1.6 || c.max[1] < 0.35) continue;
      if (c.door && !locked.has(c.door)) continue;       // closed doors it opens itself, locked ones it cannot
      if (x > c.min[0] - 0.3 && x < c.max[0] + 0.3 && z > c.min[2] - 0.3 && z < c.max[2] + 0.3) return c;
    }
    return null;
  }
  const lockSig = () => [...locked].sort().join('|');
  /** Plans the way to (tx, tz): round the locked doors; if the short way is through one, go and bang on it first. */
  function plan(tx, tz) {
    nr.goal = { x: tx, z: tz }; nr.t = 1.5; nr.sig = lockSig(); nr.i = 0;
    const free = nav.path(pos, nr.goal);
    const direct = locked.size ? nav.path(pos, nr.goal, { ignoreLocked: true }) : free;
    const through = direct && direct.find((p) => p.doors && p.doors.some((id) => locked.has(id)));
    nr.lockedDoor = through ? through.doors.find((id) => locked.has(id)) : null;
    nr.pts = nr.lockedDoor && (nr.bang < BANG || !free) ? direct : (free || direct);
  }
  function walk(tx, tz, speed, dt) {
    const dx = tx - pos.x, dz = tz - pos.z, d = Math.hypot(dx, dz); if (d < 0.05) return d;
    nr.t -= dt;
    if (!nr.goal || Math.hypot(nr.goal.x - tx, nr.goal.z - tz) > 1.5 || nr.t <= 0 || nr.sig !== lockSig()) plan(tx, tz);
    // the next waypoint of the way (straight at the goal if the graph has none)
    while (nr.pts && nr.i < nr.pts.length - 1 && Math.hypot(nr.pts[nr.i].x - pos.x, nr.pts[nr.i].z - pos.z) < 0.35) nr.i++;
    const w = nr.pts && nr.pts[nr.i] ? nr.pts[nr.i] : { x: tx, z: tz };
    const wx = w.x - pos.x, wz = w.z - pos.z, wd = Math.hypot(wx, wz) || 1;
    const k = Math.min(wd, speed * dt) / wd, nx = pos.x + wx * k, nz = pos.z + wz * k;
    let moved = false;
    const ox = pos.x, oz = pos.z, bx = blockedE(nx, pos.z), bz = blockedE(pos.x, nz);
    if (!bx) pos.x = nx; if (!bz) pos.z = nz;
    moved = Math.hypot(pos.x - ox, pos.z - oz) > speed * dt * 0.3;       // sliding along a wall is not getting there
    for (const id of Object.keys(world.doors)) { const a = world.anchor(id); if (a && !locked.has(id) && Math.hypot(a.pos.x - pos.x, a.pos.z - pos.z) < 1.8 && !world.doorOpen(id)) world.setDoor(id, 1); }
    S.stuck = moved ? 0 : S.stuck + dt;
    if (S.stuck > 0.3 && nr.lockedDoor) nr.bang += dt;       // at the locked door: knocking
    ent.root.rotation.y = Math.atan2(wx, wz);
    return d;
  }
  function place(p) { pos.set(p.x, 0, p.z); ent.root.visible = true; }
  function spawnFar(min, max) {
    for (let i = 0; i < 20; i++) {
      const a = S.rng() * Math.PI * 2, d = min + S.rng() * (max - min), x = player.st.x + Math.cos(a) * d, z = player.st.z + Math.sin(a) * d;
      if (Math.abs(x) > 60 || Math.abs(z) > 50 || blockedE(x, z) || lit(x, z)) continue;
      if (!kit.clear(P.set(x, 1.4, z), eye()) && min > 10) continue;
      return { x, z };
    }
    return null;
  }
  const say = (pose, since = 0) => { S.pose = pose; S.since = since; };
  function go(state) { nr.goal = null; nr.bang = 0; S.state = state; S.t = 0; bus.emit('entity:state', state); }
  function fade() { go('sumindo'); say('sumir', 0); }
  const SOL = (n, pz, gain = 1) => bus.emit('sfx', n, { pos: [pz.x, 1.2, pz.z], gain, opts: n === 'sol_presenca' ? { dur: 3.5 } : undefined });

  function attack() {
    go('ataque'); S.attackT = 0;
    player.st.frozen = true; inventory.flash.charge = Math.max(inventory.flash.charge, 5); inventory.flash.on = true;   // a little light on the face for the cut
    // the cut: the paper face very close, looking at the player
    const f = player.forward(); pos.set(player.st.x + f.x * 0.8, 0, player.st.z + f.z * 0.8); ent.root.visible = true; ent.root.rotation.y = Math.atan2(-f.x, -f.z);
    player.st.pitch = 0.1; say('olhando', 0);
    bus.emit('entity:attack');
  }

  function canAppear(ctx) { return (progression.st.week >= 2 || S.forced) && (ctx.danger >= 3 || S.forced); }

  function update(dt, simT, ctx) {
    S.t += dt; S.since += dt;
    for (let i = heard.length - 1; i >= 0; i--) { heard[i].t += dt; if (heard[i].t > 6) heard.splice(i, 1); }
    // breath
    const holding = ctx.breath && S.breath > 0 && S.hidden !== null || (ctx.breath && S.breath > 0);
    S.holding = Boolean(holding);
    S.breath = S.holding ? Math.max(0, S.breath - dt) : Math.min(6, S.breath + dt * 0.8);
    if (S.state === 'ausente') {
      ent.root.visible = false;
      S.cool -= dt;
      if (ctx.sanity === 0 && S.t > 4 && !hidden()) { const p = spawnFar(6, 9); if (p) { place(p); go('perseguicao'); S.target = null; S.seenOnce = false; S.sure = true; say('correr'); } return; }
      if (S.cool <= 0 && ctx.sanity < 80 && canAppear(ctx) && S.rng() < dt * 0.06) {
        const p = spawnFar(15, 30); if (p) { place(p); ent.setStage(Math.min(4, progression.st.week)); go('observacao'); say('observar'); S.seenOnce = false; }
      }
      return;
    }
    const d = dist(), vis = looking();
    ent.update(simT, { pose: S.pose, desde: S.since, olhar: 0 });
    if (S.state === 'sumindo') { if (S.t > 2) { ent.root.visible = false; go('ausente'); S.cool = 50 + S.rng() * 50; S.forced = false; } return; }
    if (S.state === 'ataque') {
      S.attackT += dt;
      if (S.attackT > 0.3) S.black = Math.min(1, (S.attackT - 0.3) / 0.25);
      if (S.attackT > 1.9) { S.black = 1; S.done = true; }
      return;
    }
    if (lit(pos.x, pos.z) && !S.forcedLit) { fade(); return; }           // the strong light makes it go
    // seen: costs sanity once per appearance
    if (vis && !S.seenOnce && d < 40) { S.seenOnce = true; sanity.add(-10, 'sol'); bus.emit('event:seen', 'sol'); }
    if (S.state === 'observacao') {
      const flashHit = inventory.flash.on && inventory.flash.charge > 0 && player.forward().dot(v.set(pos.x - player.st.x, 1.2 - player.st.eye, pos.z - player.st.z).normalize()) > 0.93 && d < inventory.flash.range;
      if (flashHit || d < 8 || S.t > 28) { fade(); return; }
      if (S.t % 4 < dt) SOL('sol_presenca', pos, 0.6);
      ent.root.rotation.y = Math.atan2(player.st.x - pos.x, player.st.z - pos.z);
      if (ctx.sanity < 40 && ctx.danger >= 3 && !playerLit() || S.forceApproach) go('aproximacao');
      return;
    }
    if (S.state === 'aproximacao') {
      if (ctx.sanity < 20 || (S.darkT > 60 && progression.st.week >= 3)) { go('perseguicao'); S.target = null; sanity.add(-20, 'perseguido'); say('correr'); return; }
      if (ctx.danger < 3 || playerLit() && !S.forceApproach) { if (S.t > 4) { fade(); return; } }
      if (vis) { say('olhando'); } else if (d > 3) { say('andar'); walk(player.st.x, player.st.z, 1.5, dt); if ((simT * 2 | 0) !== (S.lastStep | 0) && (S.lastStep = simT)) SOL('sol_passos', pos, 0.8); }
      if (d < 6 && S.t % 5 < dt) SOL('sol_respira', pos, 0.7);
      if (S.t > 70) fade();
      return;
    }
    if (S.state === 'perseguicao') {
      // it hears the running step, a door, the flashlight; it sees what is in a light
      for (const h of heard) if (Math.hypot(h.x - pos.x, h.z - pos.z) < h.r + 14 && Math.hypot(h.x - player.st.x, h.z - player.st.z) < h.r + 16) S.target = { x: h.x, z: h.z };
      if (inventory.flash.on && d < 26 && vis) S.target = { x: player.st.x, z: player.st.z };
      if (!hidden() && vis && d < 14 && playerLit()) { S.target = { x: player.st.x, z: player.st.z }; S.seesPlayer = true; } else S.seesPlayer = false;
      if (S.sure && !hidden()) S.target = { x: player.st.x, z: player.st.z };
      say('correr');
      if (S.target) {
        const td = walk(S.target.x, S.target.z, 4.0, dt);
        if ((simT * 3 | 0) !== (S.lastStep | 0) && (S.lastStep = simT)) SOL('sol_passos', pos, 1);
        if (td < 0.6) { S.target = null; S.search = 0; }
      } else { S.search = (S.search || 0) + dt; if (S.search > 8) { fade(); return; } say('observar'); }
      // a locked door: it bangs on it for 20 s, then gives up
      if (S.stuck > 0.5) { S.lockT += dt; if (S.lockT > 20) { S.lockT = 0; fade(); return; } } else S.lockT = Math.max(0, S.lockT - dt);
      // reaching the player
      if (d < 1.0 && !hidden() && ctx.sanity < 100) { attack(); return; }
      if (hidden() && d < 2.2) {
        if (S.sawEnter || (!S.holding && S.near > 1.4)) { attack(); return; }
        S.near = S.holding ? 0 : S.near + dt;
      } else S.near = 0;
      if (S.t > 120) fade();
      return;
    }
  }

  // ---------------------------------------------------------------- hiding
  const stand = new THREE.Vector3(); let back = null;
  for (const id of HIDES) {
    interaction.register({
      id: 'esconder-' + id, reach: 2.2, priority: 3,
      aim: () => ({ box: world.aimBox(id, 0.15) }),
      enabled: () => (S.hidden === null || S.hidden === id) && !player.st.pushing && !inventory.carry,
      label: () => ({ text: S.hidden === id ? 'Sair do esconderijo' : 'Esconder-se' }),
      tap: () => {
        const a = world.anchor(id);
        if (S.hidden === id) { S.hidden = null; player.st.frozen = false; player.st.crouch = false; if (back) { player.st.x = back.x; player.st.z = back.z; } bus.emit('hidden', false); return; }
        back = { x: player.st.x, z: player.st.z };
        S.sawEnter = S.state === 'perseguicao' && looking() && dist() < 16;
        S.hidden = id; player.st.frozen = true; player.st.crouch = true; inventory.flash.on = false;
        player.st.x = a.pos.x; player.st.z = a.pos.z; player.st.yaw = Math.atan2(-a.dir.x, -a.dir.z); player.st.pitch = 0;
        bus.emit('hidden', true);
      },
    });
  }
  // ---------------------------------------------------------------- locking the doors of the stock room and the office (from inside)
  const roomOf = (id) => LOCKABLE[id];
  for (const id of Object.keys(LOCKABLE)) {
    interaction.register({
      id: 'trancar-' + id, reach: 2.4, priority: 1,
      aim: () => ({ box: world.aimBox(id, 0.1) }),
      enabled: () => !world.doorOpen(id) && (locked.has(id) || S.state !== 'ausente' && (world.areaAt(player.st.x, 1, player.st.z)?.id === roomOf(id))),
      label: () => (locked.has(id) ? { text: 'Destrancar a porta' } : { text: 'Trancar a porta, por dentro' }),
      tap: () => {
        if (locked.has(id)) { locked.delete(id); bus.emit('sfx', 'disjuntor', {}); bus.emit('hint', 'Porta destrancada.'); }
        else { locked.add(id); bus.emit('sfx', 'disjuntor', {}); bus.emit('hint', 'Porta trancada. Ela segura, mas não para sempre.'); }
      },
    });
  }
  return {
    S, update, locked, ent, force(state, week) { S.forced = true; S.forceApproach = state !== 'observacao'; const p = spawnFar(state === 'perseguicao' ? 10 : 18, state === 'perseguicao' ? 16 : 26) || { x: player.st.x + 15, z: player.st.z }; ent.setStage(week || 2); place(p); go(state); S.target = null; S.seenOnce = false; say(state === 'perseguicao' ? 'correr' : 'observar'); },
    get state() { return S.state; }, get hidden() { return S.hidden; }, get holding() { return S.holding; }, get black() { return S.black; }, get done() { return S.done; },
    reset() { S.state = 'ausente'; S.t = 0; S.cool = 30; S.black = 0; S.done = false; S.hidden = null; S.forced = false; S.forceApproach = false; S.sure = false; locked.clear(); nr.goal = null; nr.bang = 0; ent.root.visible = false; heard.length = 0; S.darkT = 0; player.st.frozen = false; },
    darkTick(dt, inRiskDark) { S.darkT = inRiskDark ? S.darkT + dt : Math.max(0, S.darkT - dt); },
  };
}
