// What the player can do in front of them (docs: "Comandos"): a tap on E / A / Usar uses what is aimed at; holding
// it manipulates (climb the rope, and later repair, sabotage, force open). The candidates are the entities'
// 'use' targets (the engine's `hooks.target`), the scene's `exits` (hold) and `hides` (use).
import { xz } from './player.js';

export const TAP = 0.3;       // seconds: a press shorter than this is a tap
export const HOLD = 1.1;      // seconds of holding to finish a manipulation
const REACH = 2.1;

export function createInteract() {
  const st = { needRelease: false, cand: null, held: 0, pressing: false, progress: 0, fired: false, lockedCand: null };
  /**
   * The candidates near the player, with their label and kind.
   * world: { exits, hides, targets: Map }, p: the player.
   */
  function list(world, p) {
    const out = [];
    for (const e of world.exits ?? []) out.push({ kind: 'hold', id: e.id, pos: xz(e.pos), radius: e.radius ?? 0.8, label: e.label ?? (e.to === 'rua' ? 'Subir' : 'Descer'), exit: e });
    for (const h of world.hides ?? []) out.push({ kind: 'use', id: h.id, pos: xz(h.pos), radius: h.radius ?? 0.8, label: p.hidden === h.id ? 'Sair' : 'Esconder', hide: h });
    for (const t of world.targets?.values?.() ?? []) { let pos; try { pos = xz(t.pos); } catch { continue; } if (t.off) continue; out.push({ kind: t.hold ? 'hold' : 'use', id: t.id ?? t.label, pos, radius: t.radius ?? 0.6, label: t.label || 'Usar', target: t }); }
    return out;
  }
  /** The best candidate in reach and in front, or null. `facing`: the yaw the player faces. */
  function focus(cands, p, facing) {
    const fx = -Math.sin(facing), fz = -Math.cos(facing);
    let best = null, bd = Infinity;
    for (const c of cands) {
      const dx = c.pos[0] - p.pos[0], dz = c.pos[1] - p.pos[1], d = Math.hypot(dx, dz);
      if (d > REACH + c.radius) continue;
      if (d > c.radius + 0.5 && (dx * fx + dz * fz) / (d || 1) < 0.3) continue;
      if (d < bd) { best = c; bd = d; }
    }
    return best;
  }
  return {
    st,
    list, focus,
    /**
     * One step. `press`: { down, at, cancel }; `project(c)` gives the screen point of a candidate (touch).
     * Returns { fire: candidate | null, tap: candidate | null, cand } for this step.
     */
    update(dt, { cands, p, facing, press, project }) {
      let cand = focus(cands, p, facing);
      if (press.at && project) {
        // A finger on an object: the one nearest the finger, within a thumb's width, in reach.
        let best = null, bd = 70;
        for (const c of cands) {
          const dx = c.pos[0] - p.pos[0], dz = c.pos[1] - p.pos[1];
          if (Math.hypot(dx, dz) > REACH + c.radius + 0.6) continue;
          const s = project(c); if (!s) continue;
          const d = Math.hypot(s[0] - press.at[0], s[1] - press.at[1]);
          if (d < bd) { best = c; bd = d; }
        }
        cand = best;
      }
      const out = { fire: null, cand, hint: null };
      // After a manipulation completes, the next one starts only when the button (or finger) is let go and pressed again.
      if (st.needRelease) { if (press.down) return out; st.needRelease = false; }
      if (press.cancel) { st.pressing = false; st.held = 0; st.progress = 0; st.lockedCand = null; st.fired = false; return { ...out, cand }; }
      if (press.down && !st.pressing) { st.pressing = true; st.held = 0; st.progress = 0; st.fired = false; st.lockedCand = cand; }
      if (press.down && st.pressing) {
        st.held += dt;
        const c = st.lockedCand;
        if (c && c.kind === 'hold' && st.held >= TAP && !st.fired) {
          st.progress = Math.min(1, (st.held - TAP) / HOLD);
          if (st.progress >= 1) { st.fired = true; st.needRelease = true; out.fire = c; }
        }
      }
      if (!press.down && st.pressing) {
        const c = st.lockedCand;
        if (!st.fired && st.held < TAP && c) { if (c.kind === 'use') out.fire = c; else out.hint = 'hold'; }
        st.pressing = false; st.held = 0; st.progress = 0; st.lockedCand = null;
      }
      return out;
    },
    reset() { st.pressing = false; st.held = 0; st.progress = 0; st.lockedCand = null; st.fired = false; },
  };
}
