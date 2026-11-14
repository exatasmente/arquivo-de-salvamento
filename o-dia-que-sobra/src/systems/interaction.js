// InteractionSystem: the central point, interact (a tap) and manipulate (holding the button).
//
// A target is registered by whoever owns the thing:
//   { id, aim: () => ({ c: Vector3, r }) | ({ box: Box3 }), reach, enabled(), label() -> { text, hold? } | null,
//     tap(), hold: { start(), update(dt), end(), progress?() } , priority }
// With a tap only, it fires the moment the button goes down. With a hold only, the hold starts
// at once. With both, a short press (under 0.25 s) is a tap and a longer one starts the hold
// (a left click or the right trigger starts the hold at once).
export function createInteraction(bus, { world, render, player, aimOffset, ui, holdScale = () => 1, lists = true }) {
  const THREE = render.THREE;
  const targets = new Map();
  let seq = 0;
  const o = new THREE.Vector3(), d = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const box = new THREE.Box3();
  let press = null;   // { target, t, mode: 'wait' | 'hold' | 'done' }
  let current = null; // what the central point looks at: { target, label, all, sel }
  let sel = 0, selKey = '';            // which of the overlapping actions E does (the player changes it)
  let choice = null;                   // a finger on an overlapped spot: the list stays up for a moment and the player taps the action: { list, t }
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
  /**
   * Everything the aim fits right now, in the order the player would want them: the work first (what has the highest priority and is nearest), the targets that
   * ask to come `last` (hiding) at the end. Only what is within 1.6 m of the nearest one counts, so a far lamp behind a shelf never joins the list.
   */
  function candidates() {
    const out = [];
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
      // rank: -1 comes first (hiding while the Sun is about), 1 comes last (hiding the rest of the time); `order()` decides it from the state of the game
      const rank = t.order ? t.order() : t.last ? 1 : 0;
      out.push({ target: t, label: typeof lab === 'string' ? { text: lab } : lab, dist: hit, s: hit - (t.priority || 0), rank });
    }
    if (!out.length) return out;
    out.sort((a, b) => (a.rank - b.rank) || (a.s - b.s));
    const near = Math.min(...out.map((c) => c.dist));
    return out.filter((c) => c.dist <= near + 1.6);
  }
  const pick = () => candidates()[0] || null;
  function endPress() {
    if (press && press.mode === 'hold') press.target.hold.end?.(press.t);
    press = null;
  }
  function startOn(hit, act) {
    const t = hit.target;
    if (t.hold && !t.tap) { t.hold.start?.(); press = { target: t, t: 0, mode: 'hold' }; }
    else if (t.hold && t.tap) {
      if (act.immediate) { t.hold.start?.(); press = { target: t, t: 0, mode: 'hold' }; }
      else press = { target: t, t: 0, mode: 'wait' };
    } else { t.tap(); press = { target: t, t: 0, mode: 'done' }; }
  }
  function begin(act) {
    // an action chosen from the list on the screen (a tap on its row)
    if (act.choice !== undefined) {
      const c = (choice?.list || (current?.all?.length > 1 ? current.all : null))?.[act.choice]; choice = null;
      if (c && c.target.enabled() && c.target.label?.()) startOn(c, act);
      return;
    }
    if (act.screen) rayFromScreen(act.screen.x, act.screen.y); else rayFromCenter();
    const all = candidates();
    if (!all.length) { choice = null; bus.emit('interact:none', act); return; }
    // a key for one action of the list (2, 3), or the one that is selected (E, A, the click)
    const hit = act.pick !== undefined ? all[act.pick] : null;
    if (act.pick !== undefined) { if (hit) startOn(hit, act); return; }
    // a finger on a spot where two or more actions fit: show them all and let the finger choose; one action only: as ever
    // (a hiding place that comes first, with the Sun about, is done at the first touch, without the list)
    if (lists && act.screen && all.length > 1 && all[0].rank >= 0) { choice = { list: all, t: 0 }; return; }
    startOn(act.screen ? all[0] : all[Math.min(sel, all.length - 1)], act);
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
    if (choice) { choice.t += dt; if (choice.t > 5 || !choice.list.some((c) => c.target.enabled())) choice = null; }
    rayFromCenter();
    let all = [];
    if (press && press.mode === 'hold') current = { target: press.target, label: press.target.label?.() || { text: '' }, dist: 0, all, sel: 0 };
    else {
      all = candidates();
      const key = all.map((c) => c.target.id).join('|');
      if (key !== selKey) { selKey = key; sel = 0; }
      sel = Math.min(sel, Math.max(0, all.length - 1));
      current = all[sel] || null;
      if (current) { current.all = all; current.sel = sel; }
    }
    if (current && typeof current.label === 'string') current.label = { text: current.label };
    // the list for the screen: what a finger opened, or what the central point fits (two or more)
    const rows = !lists ? null : choice ? choice.list : all.length > 1 ? all : null;
    const holdOf = (c) => Boolean(c.label.hold ?? (c.target.hold && !c.target.tap));
    ui.setPrompt(current || choice ? {
      text: (current || choice.list[0]).label.text, hold: current ? holdOf(current) : holdOf(choice.list[0]), active: Boolean(press && press.mode === 'hold'),
      progress: press && press.mode === 'hold' ? press.target.hold.progress?.() ?? null : null,
      list: rows ? rows.map((c) => ({ text: c.label.text, hold: holdOf(c) })) : null, sel: choice ? -1 : sel,
    } : null);
  }
  /** Which of the overlapping actions the next E / A does: +1 / -1. */
  function cycle(d = 1) { const n = current?.all?.length || 0; if (n < 2) return false; sel = (sel + d + n) % n; return true; }
  return { register, unregister, update, cycle, get current() { return current; }, get choosing() { return Boolean(choice); }, get holding() { return Boolean(press && press.mode === 'hold'); }, cancel: endPress, targets };
}
