// Who a customer is, from a seed: a name made of syllables, and the look that buildHuman paints
// (everyday clothes, face, hair, build). Pure function of the seed.
import { mulberry32 } from './rng.js';

const FIRST_A = ['Ma', 'Jo', 'Ri', 'Pau', 'Lu', 'Ro', 'Fa', 'Ce', 'Da', 'Ge', 'Ta', 'Wa', 'Is', 'Ne'];
const FIRST_B = ['rcos', 'sé', 'cardo', 'lo', 'ís', 'berto', 'bio', 'lso', 'niel', 'raldo', 'rcísio', 'gner', 'mael', 'lson'];
const FEM_A = ['Ma', 'Ju', 'Ro', 'Lu', 'Ana', 'Pa', 'Ca', 'Si', 'Ne', 'Ra', 'Te'];
const FEM_B = ['ria', 'lia', 'sana', 'ana', 'ide', 'quel', 'reza', 'rina'];
const LAST = ['Souza', 'Lima', 'Prado', 'Neves', 'Moraes', 'Teixeira', 'Barros', 'Pinto', 'Duarte', 'Freitas', 'Campos', 'Rocha'];
const SHIRTS = ['#c8c0a8', '#6a8aa8', '#a85a52', '#7a9a6a', '#d8d0d0', '#5a5a78', '#c89a52', '#3d5a4a'];
const PANTS = ['#3a3a4a', '#4a4036', '#2e3c4e', '#5a5448'];

export function customerIdentity(seed) {
  const r = mulberry32((seed * 2246822519 + 3266489917) >>> 0 || 1);
  const female = r() < 0.4;
  const first = female ? r.pick(FEM_A) + r.pick(FEM_B) : r.pick(FIRST_A) + r.pick(FIRST_B);
  const name = `${first.trim()} ${r.pick(LAST)}`;
  return { name, female };
}

/** The `look` that models/human.js takes for a customer. */
export function customerLook(seed) {
  const { female } = customerIdentity(seed);
  const r = mulberry32((seed * 374761393 + 668265263) >>> 0 || 1);
  return { seed, outfit: 'civil', glove: 'none', female, shirt: r.pick(SHIRTS), pants: r.pick(PANTS), top: undefined };
}

/** Walking pose: swing arms and legs by phase (radians); amp 0 stands still. */
export function poseWalk(joints, phase, amp = 1) {
  const s = Math.sin(phase) * 0.55 * amp, c = Math.cos(phase);
  if (joints.hipL) joints.hipL.rotation.x = s;
  if (joints.hipR) joints.hipR.rotation.x = -s;
  if (joints.kneeL) joints.kneeL.rotation.x = Math.max(0, -c) * 0.5 * amp;
  if (joints.kneeR) joints.kneeR.rotation.x = Math.max(0, c) * 0.5 * amp;
  if (joints.shoulderL) joints.shoulderL.rotation.x = -s * 0.7;
  if (joints.shoulderR) joints.shoulderR.rotation.x = s * 0.7;
}
