// Hit detection by distance and trajectory. A punch hits the head when the swept path of the
// glove (previous step to this step) comes within reach of the head; the zone and the
// trajectory come from where and how the glove arrived, not from which button was pressed.
import * as THREE from 'three';
import { GLOVE_R } from './fighter.js';

export const BALANCE = { leve: 8, media: 18, pesada: 35, bloq: 2, corpo: 4 };
const LEVELS = ['leve', 'media', 'pesada'];
// trajectory x zone -> level (table of the design); the "—" cells fall back to leve
const TABLE = {
  reta: { forehead: 'leve', chin: 'media', temple: 'leve' },
  lateral: { forehead: 'leve', chin: 'media', temple: 'pesada' },
  upper: { forehead: 'leve', chin: 'pesada', temple: 'leve' },
};
export const ZONE_NAME = { forehead: 'TESTA', chin: 'QUEIXO', temple: 'TEMPORA', body: 'CORPO' };

const A = new THREE.Vector3(), B = new THREE.Vector3(), AB = new THREE.Vector3(), AP = new THREE.Vector3(), C = new THREE.Vector3();
/** Closest point of segment p0-p1 to point q (into out); returns distance. */
function closest(p0, p1, q, out) {
  AB.copy(p1).sub(p0); AP.copy(q).sub(p0);
  const l2 = AB.lengthSq();
  const k = l2 < 1e-9 ? 0 : Math.min(1, Math.max(0, AP.dot(AB) / l2));
  out.copy(p0).addScaledVector(AB, k);
  return out.distanceTo(q);
}

export function resolveStrike(att, def) {
  const a = att.action;
  if (!a || !a.def || a.hit) return null;
  const ph = att.phase();
  if (ph !== 'act' && !(ph === 'rec' && a.t < a.def.wind + a.def.act + 0.04)) return null;
  const side = a.def.hand;
  const p1 = att.gloveWorld(side, A.clone()), p0 = att.prevGlove[side];
  const gr = GLOVE_R * att.sc;
  const head = def.headCenter(B.clone()), hr = def.headRadius;
  const hitHead = closest(p0, p1, head, C) <= hr + gr * 1.0;

  let zone, level;
  // each punch has its own trajectory (straight, lateral, from below); the swept path decides
  // whether it connects, and the head's pose at that moment decides the zone
  const traj = { jab: 'reta', direct: 'reta', hookL: 'lateral', hookR: 'lateral', upper: 'upper' }[a.kind];
  if (hitHead) {
    const local = def.J.head.worldToLocal(C.clone());
    const rx = local.x / 0.098, ry = (local.y - 0.10) / 0.125;
    if (traj === 'upper') zone = ry < 0.3 ? 'chin' : 'forehead';
    else if (traj === 'lateral') {
      // the head turned toward the side the punch comes from (or facing front) gives the temple;
      // turned away gives the chin. A left hook comes from the opponent's right (negative yaw).
      const s = side === 'L' ? -1 : 1;
      zone = (def.headYaw ?? 0) * s >= -0.15 ? 'temple' : 'chin';
    } else zone = Math.abs(rx) > 1.5 ? 'temple' : ry < -0.3 ? 'chin' : 'forehead';
    level = TABLE[traj][zone];
  } else {
    const chest = def.chestWorld(B.clone());
    if (closest(p0, p1, chest, C) > 0.24 * def.sc + gr * 0.8) return null;
    zone = 'body'; level = 'corpo';
  }
  let counter = false, blocked = false;
  if (level !== 'corpo') {
    if (def.punching && ['wind', 'act'].includes(def.phase())) { counter = true; level = LEVELS[Math.min(2, LEVELS.indexOf(level) + 1)]; }
    if (def.guarding) { blocked = true; level = level === 'leve' ? 'bloq' : LEVELS[LEVELS.indexOf(level) - 1]; }
  }
  a.hit = true;
  const dx = def.x - att.x, dz = def.z - att.z, dm = Math.hypot(dx, dz) || 1;
  const amount = Math.round(BALANCE[level] * a.dmgMul * 10) / 10;
  return { att, def, zone, traj, level, counter, blocked, amount, dir: [dx / dm, dz / dm], point: C.clone(), kind: a.kind };
}
