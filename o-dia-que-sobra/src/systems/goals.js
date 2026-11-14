// GoalSystem: the player marks one goal on the clipboard (a task or an open order of the night) and the game shows where to go, in two
// ways and without a long text: a small PS1 marker in the world over the right place (the stock room box and then the shelf, the phone,
// the pump, the bathroom, the rubbish, the breaker...), and an arrow on the edge of the screen when that place is out of sight. The marker
// goes away when the goal is done. It never points at a secret or at anything that would give a clue (the badge, camera 7, the sign's board
// on the last night), and it is a child of the scene, which the cutscene stage hides, so cutscenes and the film mode never show it.
//
// A goal is a key: `t:<task id>` or `o:<order id>`. Nothing here reads a real clock; the marker bobs with the simulation time.
import { money } from '../util.js';

const FORBIDDEN = /placa|cracha|cam7|camera7|deposito|valdir/;

export function createGoals(bus, { world, render, player, tasks, customers, chores, inventory, progression, ui, camera, lastNight = 24 }) {
  const THREE = render.THREE;
  let key = null;
  const marker = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.16, 0),
    new THREE.MeshBasicMaterial({ color: 0xffd84a, fog: false, depthTest: false, transparent: true, opacity: 0.92 }),
  );
  marker.name = 'goal-marker'; marker.visible = false; marker.renderOrder = 50; render.scene.add(marker);
  const ring = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), new THREE.MeshBasicMaterial({ color: 0x120c02, wireframe: true, fog: false, depthTest: false, transparent: true, opacity: 0.6 }));
  ring.renderOrder = 49; marker.add(ring);
  const V = new THREE.Vector3(), W = new THREE.Vector3();

  const centerOf = (id, y) => { const b = world.aimBox(id, 0); if (!b) return null; b.getCenter(V); return new THREE.Vector3(V.x, y ?? b.max.y + 0.35, V.z); };
  const anchorAt = (id, y = 1.4) => { const a = world.anchor(id); return a ? new THREE.Vector3(a.pos.x, y, a.pos.z) : null; };

  /** where / aim / stand of an order: the marker hangs over the next step, the camera looks at it, the walk goes to the places to stand. */
  function stepOf(c, fallback) {
    return {
      where: () => { const st = customers.orderStep?.(c); return st?.at ? new THREE.Vector3(st.at.x, st.at.y + 0.45, st.at.z) : fallback(); },
      aim: () => customers.orderStep?.(c)?.at || null,
      stand: () => customers.orderStep?.(c)?.stand || [],
    };
  }

  /** The open orders of the night (what a customer asked for that the player has not done yet). */
  function orders() {
    const out = [];
    for (const c of customers.list) {
      if (c.done) continue;
      if (c.kind === 'car' && c.ordered) {
        const extra = (c.entrega || []).reduce((a, p) => a + p.cents, 0);
        const left = (c.entrega || []).filter((p) => !p.done).map((p) => customers.orderName(p).replace(/^o /, ''));
        const text = `Bomba ${c.pump}: ${money(c.value + extra)}` + (left.length ? ` (falta levar: ${left.join(', ')})` : '');
        out.push({
          key: `o:car${c.id}`, text, ...stepOf(c, () => (c.car ? new THREE.Vector3(c.car.root.position.x, 2.2, c.car.root.position.z) : anchorAt('bomba' + c.pump, 2.2))),
        });
      } else if (c.kind === 'walk' && c.role === 'normal' && !c.noCounter && (c.state === 'scanning' || c.state === 'ready')) {
        out.push({ key: `o:loja${c.id}`, text: `Balcão: ${c.name}`, ...stepOf(c, () => anchorAt('balcao', 1.6)) });
      } else if (c.kind === 'walk') c.prods.forEach((p, i) => { if (p.atras && !p.done) out.push({ key: `o:atras${c.id}-${i}`, text: `Balcão: ${p.nome} (prateleira atrás do balcão)`, where: () => centerOf('atras-' + p.k) }); });
    }
    return out;
  }

  /**
   * The tool or item a task needs before its own place, when the hands do not hold it yet: { at: where to look, tool: the thing }. The goal
   * leads there first (the mop and bucket, the ladder, the box in the stock room), and only then to the place of the task.
   */
  function toolOf(t) {
    const id = t.id, carry = inventory.carry;
    if (id === 'banheiro' || id.startsWith('mancha-')) {
      if (carry?.kind === 'limpeza') return null;
      const b = world.aimBox('rodo', 0); return b ? { at: b.getCenter(new THREE.Vector3()) } : null;
    }
    if (id.startsWith('lampada-')) {
      if (carry?.kind === 'escada' || world.posto.ladder?.at) return null;
      const b = world.aimBox('escada', 0); return b ? { at: b.getCenter(new THREE.Vector3()) } : null;
    }
    if (id.startsWith('repor-')) {
      const sh = tasks.shelves.get(id.slice(6)); if (!sh || sh.done) return null;
      const bx = world.boxes[sh.boxN];
      const holding = (carry?.kind === 'caixa' && carry.n === sh.boxN) || tasks.cart.boxes.some((e) => e.rec.n === sh.boxN);
      if (holding || !bx?.root) return null;
      const p = new THREE.Vector3(); bx.root.getWorldPosition(p); return { at: p.setY(p.y + 0.25) };
    }
    return null;
  }
  /** Floor points round (x, z) to stand on, the one on the player's side first. */
  function ringAround(x, z, rs = [0.9, 1.4]) {
    const out = [];
    for (const r of rs) for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; out.push({ x: x + Math.cos(a) * r, z: z + Math.sin(a) * r, d: Math.hypot(x + Math.cos(a) * r - player.st.x, z + Math.sin(a) * r - player.st.z) }); }
    return out.sort((u, v) => (u.d - v.d));
  }
  /** What the player should go to for task `t`, as a point in the world (or null). */
  function whereTask(t) {
    const id = t.id, carry = inventory.carry;
    if (FORBIDDEN.test(id)) return null;
    if (id === 'abrir-caixa' || id === 'fechar-caixa') return centerOf('caixa');
    if (id === 'ponto') return world.punch ? world.punch.pos.clone() : null;
    if (id === 'telefone') return anchorAt('telefone', 1.5);
    if (id === 'banheiro') return carry?.kind === 'limpeza' ? anchorAt('porta-banheiro-' + (chores.bathroom?.side || 'm'), 2.3) : centerOf('rodo');   // the mop and the bucket first
    if (id.startsWith('repor-')) {
      const sh = tasks.shelves.get(id.slice(6)); if (!sh || sh.done) return null;
      const bx = world.boxes[sh.boxN];
      const holding = (carry?.kind === 'caixa' && carry.n === sh.boxN) || tasks.cart.boxes.some((e) => e.rec.n === sh.boxN);
      if (holding || !bx?.root) return centerOf(sh.row.id, null) || null;
      const p = new THREE.Vector3(); bx.root.getWorldPosition(p); return new THREE.Vector3(p.x, p.y + 1.1, p.z);   // the right box, in the stock room
    }
    if (id.startsWith('lixo-')) {
      if (carry?.kind === 'saco') return centerOf('conteiner');
      const f = chores.floorBag?.(id.slice(5)); if (f) return new THREE.Vector3(f.x, 1.0, f.z);
      return centerOf(id.slice(5));
    }
    if (id.startsWith('mancha-')) return carry?.kind === 'limpeza' ? centerOf(id.slice(7), 1.0) : centerOf('rodo');
    if (id.startsWith('lampada-')) {
      const L = world.light(id.slice(8));
      return carry?.kind === 'escada' && L ? new THREE.Vector3(L.pos[0], L.pos[1] - 0.2, L.pos[2]) : (world.posto.ladder?.at ? (L ? new THREE.Vector3(L.pos[0], L.pos[1] - 0.2, L.pos[2]) : null) : centerOf('escada'));
    }
    if (id.startsWith('disjuntor-')) return progression.st.day >= lastNight ? null : centerOf('disjuntor-' + id.slice(10), 1.6);
    if (id.startsWith('bomba-')) return centerOf('registro' + id.slice(6), 1.1);
    if (id.startsWith('cli')) {
      const c = customers.list.find((q) => 'cli' + q.id === id); if (!c) return null;
      if (c.kind === 'car') return c.car ? new THREE.Vector3(c.car.root.position.x, 2.2, c.car.root.position.z) : null;
      return c.human ? new THREE.Vector3(c.human.root.position.x, 2.2, c.human.root.position.z) : anchorAt('leitor', 1.6);
    }
    return null;
  }
  /** Short text for the HUD line: no brackets, no long tails. */
  function shortText(text) {
    let t = text.replace(/\s*\[.*$/, '').replace(/\s*\(.*?\)/g, '').replace(/:\s.*$/, '').trim();
    if (t.length > 90) t = t.slice(0, 89).trimEnd() + '…';       // (the HUD line wraps: only a very long text is cut)
    return t;
  }

  /** Everything that can be marked now, in the order of the clipboard (tasks first, then orders). */
  function list() {
    const out = [];
    for (const t of tasks.list) {
      if (t.done || t.failed || FORBIDDEN.test(t.id)) continue;
      // a customer's task goes where the service is done (the pump, the counter), whatever the customer or the car is doing now
      const c = t.id.startsWith('cli') ? customers.list.find((q) => 'cli' + q.id === t.id) : null;
      const step = c && (c.kind === 'car' || c.kind === 'walk') ? stepOf(c, () => whereTask(t)) : {
        where: () => whereTask(t),
        aim: () => toolOf(t)?.at || null,
        stand: () => { const k = toolOf(t); return k ? ringAround(k.at.x, k.at.z) : []; },
      };
      out.push({ key: 't:' + t.id, text: t.text, short: shortText(t.text), ...step });
    }
    for (const o of orders()) out.push({ key: o.key, text: o.text, short: shortText(o.text), where: o.where, aim: o.aim, stand: o.stand });
    return out;
  }
  const find = (k) => list().find((g) => g.key === k) || null;

  function select(k) {
    key = k && find(k) ? k : null;
    bus.emit('goal:change', key); bus.emit('sfx', key ? 'ui_ok' : 'ui_voltar', {});
    return key;
  }
  /** Tab / the pad's left and right on the open clipboard: the next goal, then none, then the first again. */
  function cycle(d = 1) {
    const ks = [null, ...list().map((g) => g.key)];
    const i = Math.max(0, ks.indexOf(key));
    return select(ks[(i + d + ks.length) % ks.length]);
  }
  const toggle = (k) => select(key === k ? null : k);

  // the arrow and the marker follow the camera: called once a frame after the player has put the camera in place
  let t0 = 0;
  function frame(dt, simT, cam, size, on) {
    t0 = simT;
    const g = on && key ? find(key) : null;
    if (key && !g && on) { key = null; bus.emit('goal:change', null); }      // done (or gone): the marker leaves
    ui.setGoal(g ? g.short : null);
    if (!g) { marker.visible = false; ui.setArrow(null); return; }
    const p = g.where();
    if (!p) { marker.visible = false; ui.setArrow(null); return; }
    marker.position.set(p.x, p.y + Math.sin(simT * 2.4) * 0.07, p.z); marker.rotation.y = simT * 1.3; marker.visible = true;
    const d = Math.hypot(p.x - player.st.x, p.z - player.st.z);
    marker.scale.setScalar(Math.max(1, Math.min(3.2, d / 5)));     // a little bigger far away, so it can be seen
    // on screen? else the arrow on the edge
    cam.updateMatrixWorld(true);
    W.copy(p).project(cam);
    const behind = W.z > 1, w = size.w, h = size.h;
    let nx = W.x, ny = W.y;
    if (behind) { nx = -nx; ny = -ny; if (Math.abs(nx) < 0.01 && Math.abs(ny) < 0.01) ny = -1; }
    const out = behind || Math.abs(nx) > 0.92 || Math.abs(ny) > 0.88;
    if (!out) { ui.setArrow(null); return; }
    const m = Math.max(Math.abs(nx) / 0.9, Math.abs(ny) / 0.84, 1e-6);
    const ex = nx / m, ey = ny / m;
    ui.setArrow({ x: (ex * 0.5 + 0.5) * w, y: (0.5 - ey * 0.5) * h, rot: Math.atan2(ex, ey) });
  }
  const reset = () => { key = null; marker.visible = false; ui.setArrow(null); ui.setGoal(null); };
  bus.on('shift:open', () => reset());

  return {
    list, orders, select, cycle, toggle, frame, reset, marker,
    get key() { return key; },
    get current() { return key ? find(key) : null; },
    get visible() { return marker.visible; },
    get time() { return t0; },
  };
}
