// InteractionSystem: the central point, interact (a tap) and manipulate (holding the button).
//
// A target is registered by whoever owns the thing:
//   { id, aim: () => ({ c: Vector3, r }) | ({ box: Box3 }), reach, enabled(), label() -> { text, hold? } | null,
//     tap(), hold: { start(), update(dt), end(), progress?() } , priority }
// With a tap only, it fires the moment the button goes down. With a hold only, the hold starts
// at once. With both, a short press (under 0.25 s) is a tap and a longer one starts the hold
// (a left click or the right trigger starts the hold at once).
export function createInteraction(bus, { world, render, player, aimOffset, ui, holdScale = () => 1 }) {
  const THREE = render.THREE;
  const targets = new Map();
  let seq = 0;
  const o = new THREE.Vector3(), d = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const box = new THREE.Box3();
  let press = null;   // { target, t, mode: 'wait' | 'hold' | 'done' }
  let current = null; // what the central point looks at: { target, label }
  const cols = world.colliders;

  function register(t) { const id = t.id || 'T' + (++seq); t.id = id; targets.set(id, t); return id; }
  function unregister(id) { const t = targets.get(id); if (press && press.target === t) endPress(); targets.delete(id); }

  function rayFromCenter() {
    const off = aimOffset();
    const yaw = player.st.yaw + off.x, pitch = player.st.pitch + off.y;
    o.copy(player.eyePos());
    d.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  }
  function rayFromScreen(x, y) {
    const rect = render.canvas.getBoundingClientRect();
    const nx = ((x - rect.left) / rect.width) * 2 - 1, ny = -(((y - rect.top) / rect.height) * 2 - 1);
    o.copy(render.camera.position);
    render.camera.updateMatrixWorld();
    tmp.set(nx, ny, 0.5).unproject(render.camera);
    d.copy(tmp).sub(o).normalize();
  }
  function rayBox(b, maxT) {
    let t0 = 0, t1 = maxT;
    for (const ax of ['x', 'y', 'z']) {
      const inv = 1 / (d[ax] || 1e-9);
      let a = (b.min[ax] - o[ax]) * inv, c = (b.max[ax] - o[ax]) * inv;
      if (a > c) { const s = a; a = c; c = s; }
      t0 = Math.max(t0, a); t1 = Math.min(t1, c);
      if (t0 > t1) return -1;
    }
    return t0;
  }
  function occluded(t, center) {
    for (const c of cols) {
      if (c.min[1] > 1.8 || c.max[1] < 0.5) continue;
      if (center.x > c.min[0] - 0.3 && center.x < c.max[0] + 0.3 && center.z > c.min[2] - 0.3 && center.z < c.max[2] + 0.3 && center.y < c.max[1] + 0.3) continue;
      box.min.set(...c.min); box.max.set(...c.max);
      const th = rayBox(box, t - 0.05);
      if (th >= 0) return true;
    }
    return false;
  }
  function pick() {
    let best = null, bs = Infinity;
    for (const t of targets.values()) {
      if (!t.enabled()) continue;
      const aim = t.aim(); if (!aim) continue;
      const reach = t.reach ?? 2.4;
      let hit = -1, center;
      if (aim.c) {
        tmp2.copy(aim.c).sub(o); const tca = tmp2.dot(d);
        if (tca < 0.1) continue;
        const d2 = tmp2.lengthSq() - tca * tca;
        if (d2 > aim.r * aim.r) continue;
        hit = tca; center = aim.c;
      } else if (aim.box) {
        hit = rayBox(aim.box, reach + 1); center = aim.box.getCenter(tmp2);
        if (hit < 0) continue;
      } else continue;
      if (hit > reach) continue;
      if (occluded(hit, center)) continue;
      const lab = t.label?.();
      if (!lab) continue;
      const s = hit - (t.priority || 0);
      if (s < bs) { bs = s; best = { target: t, label: typeof lab === 'string' ? { text: lab } : lab, dist: hit }; }
    }
    return best;
  }
  function endPress() {
    if (press && press.mode === 'hold') press.target.hold.end?.(press.t);
    press = null;
  }
  function begin(act) {
    if (act.screen) rayFromScreen(act.screen.x, act.screen.y); else rayFromCenter();
    const hit = pick();
    if (!hit) { bus.emit('interact:none'); return; }
    const t = hit.target;
    if (t.hold && !t.tap) { t.hold.start?.(); press = { target: t, t: 0, mode: 'hold' }; }
    else if (t.hold && t.tap) {
      if (act.immediate) { t.hold.start?.(); press = { target: t, t: 0, mode: 'hold' }; }
      else press = { target: t, t: 0, mode: 'wait' };
    } else { t.tap(); press = { target: t, t: 0, mode: 'done' }; }
  }
  function release() {
    if (!press) return;
    const tg = press.target, shortHold = press.mode === 'hold' && press.t < 0.2 && tg.tap;
    if (press.mode === 'wait') tg.tap();
    endPress();
    if (shortHold) tg.tap();   // a click that was too short to be a hold is a tap
  }

  function update(dt, intent) {
    for (const a of intent.acts) { if (a.type === 'down') { endPress(); begin(a); } else release(); }
    if (press) {
      press.t += dt;
      const tg = press.target;
      if (press.mode === 'wait' && press.t >= 0.25) { tg.hold.start?.(); press.mode = 'hold'; }
      if (press.mode === 'hold') {
        const aim = tg.aim();
        const far = aim && aim.c ? aim.c.distanceTo(player.eyePos()) : 0;
        if (!tg.enabled() || far > (tg.reach ?? 2.4) + 1.2) endPress(); else tg.hold.update?.(dt * holdScale(), press.t);
      }
      if (press && press.mode === 'done' && !intent.actDown) press = null;
    }
    rayFromCenter();
    current = press && press.mode === 'hold' ? { target: press.target, label: press.target.label?.() || { text: '' }, dist: 0 } : pick();
    if (current && typeof current.label === 'string') current.label = { text: current.label };
    ui.setPrompt(current ? { text: current.label.text, hold: Boolean(current.label.hold ?? (current.target.hold && !current.target.tap)), active: Boolean(press && press.mode === 'hold'), progress: press && press.mode === 'hold' ? press.target.hold.progress?.() ?? null : null } : null);
  }
  return { register, unregister, update, get current() { return current; }, get holding() { return Boolean(press && press.mode === 'hold'); }, cancel: endPress, targets };
}
