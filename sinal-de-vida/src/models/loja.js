// The enterable buildings of the street: a shop, a workshop, a depot or an apartment lobby (type `loja`): the ground floor is
// hollow, with a door on the street (+Z), a floor, the things of its kind (models/interiors.js says which and where), and the
// floors above.
// Returns, besides the root: `colliderBoxes` (local rects), `hides`, `light`, `dynamic`.
import { mulberry32 } from '../../vendor/engine/rng.js';
import { lojaPlan, DOOR, SIGN } from './interiors.js';

const GH = 4; // height of the ground floor
const WALLM = { farmacia: { c: '#b8c4bc', map: 'azulejo' }, mercado: { c: '#a8a498', map: 'umido' }, comida: { c: '#b8a890', map: 'azulejo' }, oficina: { c: '#8a8c88', map: 'concreto' }, deposito: { c: '#8a8a84', map: 'concreto' }, saguao: { c: '#a89a86', map: 'umido' } };
const FLOORM = { farmacia: { c: '#9aa49e', map: 'azulejo' }, mercado: { c: '#8a8a86', map: 'piso' }, comida: { c: '#8a7a6a', map: 'piso' }, oficina: { c: '#6a6a66', map: 'piso' }, deposito: { c: '#6e6e6a', map: 'piso' }, saguao: { c: '#8a7e70', map: 'piso' } };
const M = {
  wood: { c: '#9a7a52', map: 'madeira' }, woodDark: { c: '#5a4430', map: 'madeira' }, metal: { c: '#7a808a', map: 'metal' }, grey: { c: '#6a6e74', map: 'metal' },
  steel: { c: '#aab0b8', map: 'metal' }, black: { c: '#1c1d20' }, rust: { c: '#8a6a52', map: 'ferrugem' }, cloth: { c: '#8a8a80', map: 'tecido' },
  glass: { c: '#33465c', map: 'vidro' }, card: { c: '#a88a5a', map: 'madeira' }, white: { c: '#c8c8c0', map: 'metal' },
};
const CAN = ['#a8442a', '#c8a040', '#4a7a4a', '#8a8a90', '#6a7a9a', '#b8b0a0'];

/** One prop of a plan, drawn in a batch whose origin is the centre of the building floor. */
function drawProp(b, p, r) {
  b.pushRot(p.rot, [p.x, 0, p.z]);
  const o = [0, 0, 0];
  switch (p.t) {
    case 'shelf': {
      const L = p.w, H = p.h, dd = p.d;
      for (const s of [-1, 1]) b.box(M.grey, [0.05, H, dd], [s * (L / 2 - 0.03), 0, 0]);
      b.box(M.grey, [L, H, 0.02], [0, 0, -dd / 2 + 0.01], { cell: 3 });
      const levels = Math.floor(H / 0.45);
      for (let i = 0; i <= levels; i++) b.box(M.woodDark, [L, 0.035, dd], [0, 0.12 + i * 0.45, 0]);
      for (let i = 0; i < levels; i++) for (let k = 0; k < Math.floor(L / 0.28); k++) {
        if (r() < 0.3) continue;
        const x = -L / 2 + 0.2 + k * 0.28, y = 0.16 + i * 0.45, z = (r() - 0.5) * 0.1;
        if (p.items === 'latas') b.cyl({ c: CAN[Math.floor(r() * CAN.length)], map: 'metal' }, 0.055, 0.055, 0.13, 6, [x, y, z]);
        else if (p.items === 'frascos') b.cyl({ c: ['#d8d4c4', '#8a5a2a', '#4a7a5a', '#c8c8d0'][Math.floor(r() * 4)], map: 'tecido' }, 0.035, 0.035, 0.14 + r() * 0.06, 5, [x, y, z]);
        else if (p.items === 'caixas') b.box(M.card, [0.24, 0.16 + r() * 0.1, 0.3], [x, y, z * 0.5]);
        else b.box({ c: ['#7a808a', '#8a6a52', '#4a5a6a'][Math.floor(r() * 3)], map: 'metal' }, [0.14 + r() * 0.1, 0.08 + r() * 0.1, 0.16], [x, y, z]);
      }
      break;
    }
    case 'counter':
      b.box(M.wood, [p.w, 0.06, p.d], [0, p.h - 0.06, 0]);
      b.box(M.grey, [p.w - 0.1, p.h - 0.06, p.d - 0.1], [0, 0, 0], { cell: 3 });
      for (let i = 0; i < Math.floor(p.w / 0.9); i++) b.box(M.black, [0.7, 0.4, 0.02], [-p.w / 2 + 0.6 + i * 0.9, 0.2, p.d / 2 - 0.04]);
      if (p.reg) { b.box(M.grey, [0.4, 0.22, 0.34], [p.w * 0.25, p.h, 0]); b.box(M.black, [0.3, 0.14, 0.02], [p.w * 0.25, p.h + 0.1, 0.18], { rx: -0.3 }); }
      break;
    case 'fridge': b.box(M.white, [p.w, p.h, p.d]); b.box(M.black, [p.w - 0.1, 0.02, 0.02], [0, p.h * 0.5, p.d / 2 + 0.005]); b.box(M.steel, [0.04, 0.5, 0.04], [p.w / 2 - 0.12, p.h * 0.55, p.d / 2 + 0.02]); break;
    case 'stove': b.box(M.grey, [p.w, p.h, p.d]); for (let i = 0; i < 4; i++) b.cyl(M.black, 0.1, 0.1, 0.03, 8, [-p.w / 2 + 0.4 + i * 0.5, p.h, 0]); b.box(M.steel, [p.w, 0.5, 0.5], [0, 1.9, 0]); break;
    case 'table': b.box(M.wood, [p.w, 0.05, p.d], [0, p.h - 0.05, 0]); for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(M.woodDark, [0.05, p.h - 0.05, 0.05], [sx * (p.w / 2 - 0.05), 0, sz * (p.d / 2 - 0.05)]);
      for (const s of [-1, 1]) { b.box(M.woodDark, [0.4, 0.04, 0.4], [s * 0.3, 0.42, p.d / 2 + 0.35]); b.box(M.woodDark, [0.04, 0.42, 0.04], [s * 0.3, 0, p.d / 2 + 0.35]); } break;
    case 'stool': b.cyl(M.metal, 0.03, 0.03, p.h, 5, o); b.cyl(M.black, 0.17, 0.17, 0.05, 8, [0, p.h, 0]); break;
    case 'bench': b.box(M.wood, [p.w, 0.07, p.d], [0, p.h - 0.07, 0]); for (const s of [-1, 1]) b.box(M.grey, [0.07, p.h - 0.07, p.d - 0.1], [s * (p.w / 2 - 0.08), 0, 0]);
      if (p.vise) { b.box(M.grey, [0.2, 0.2, 0.16], [-p.w / 2 + 0.4, p.h, 0]); b.cyl(M.steel, 0.02, 0.02, 0.3, 4, [0, p.h + 0.1, 0], { rx: Math.PI / 2 }); }
      for (let i = 0; i < 4; i++) b.box({ c: ['#b0b4bc', '#b98a38', '#5a6a8a', '#8a4a3a'][i], map: 'metal' }, [0.04, 0.03, 0.22], [-0.4 + i * 0.3, p.h, (r() - 0.5) * 0.3], { ry: r() * 2 }); break;
    case 'barrel': b.cyl({ c: p.color, map: 'metal' }, 0.3, 0.3, p.h, 10, o); b.cyl(M.steel, 0.31, 0.31, 0.04, 10, [0, p.h * 0.33, 0]); b.cyl(M.steel, 0.31, 0.31, 0.04, 10, [0, p.h * 0.66, 0]); break;
    case 'pallet': b.box(M.woodDark, [p.w, 0.12, p.d]);
      for (let i = 0; i < 4; i++) b.box(M.card, [0.6, 0.3, 0.5], [-0.35 + (i % 2) * 0.7, 0.12 + Math.floor(i / 2) * 0.3, (r() - 0.5) * 0.2], { ry: (r() - 0.5) * 0.3 });
      b.box(M.card, [0.55, 0.3, 0.5], [0, 0.72, 0]); break;
    case 'crates': { const n = Math.max(1, Math.round(p.h / 0.7)); for (let i = 0; i < n; i++) b.box(M.wood, [p.w * (1 - i * 0.06), 0.68, p.d * (1 - i * 0.06)], [(r() - 0.5) * 0.08, i * 0.7, (r() - 0.5) * 0.08], { ry: (r() - 0.5) * 0.25 }); break; }
    case 'mail': b.box(M.grey, [p.w, p.h, p.d], [0, 0.9, 0]); for (let i = 0; i < 3; i++) b.box(M.black, [p.w - 0.1, 0.02, 0.02], [0, 1.0 + i * 0.2, p.d / 2 + 0.005]); break;
    case 'stairs': for (let i = 0; i < 10; i++) b.box({ c: '#7a7468', map: 'concreto' }, [p.w, 0.2 * (i + 1), 0.4], [0, 0, -p.d / 2 + 0.2 + i * 0.4]); b.box(M.grey, [0.05, 1.0, p.d], [p.w / 2, 0.5, 0]); break;
    case 'sofa': b.box({ c: '#6a5a4a', map: 'tecido' }, [p.w, 0.4, p.d], [0, 0, 0]); b.box({ c: '#6a5a4a', map: 'tecido' }, [p.w, 0.5, 0.2], [0, 0.4, -p.d / 2 + 0.1]); for (const s of [-1, 1]) b.box({ c: '#5a4a3a', map: 'tecido' }, [0.2, 0.5, p.d], [s * (p.w / 2 - 0.1), 0, 0]); break;
    case 'plant': b.cyl({ c: '#6a4a3a', map: 'ferrugem' }, 0.2, 0.15, 0.3, 8, o); for (let i = 0; i < 4; i++) b.box({ c: '#5a4a2a' }, [0.03, 0.7, 0.03], [(r() - 0.5) * 0.2, 0.3, (r() - 0.5) * 0.2], { rx: (r() - 0.5) * 0.6, rz: (r() - 0.5) * 0.6 }); break;
    case 'basket': b.box({ c: '#3a5a8a', map: 'metal' }, [p.w, p.h, p.d]); break;
    case 'plate': b.plane({ c: '#ffffff', map: `p:${p.picto}` }, p.w, p.h, [0, 1.4, 0], { full: true }); break;
    default: break;
  }
  b.popRot();
}

export function buildLoja(kit, p, e) {
  const T = kit.T, r = mulberry32(p.semente * 101 + 7), w = Math.max(6, Math.round(p.largura / 3) * 3), d = p.profundidade, fl = p.andares;
  const uh = Math.round(3.2 * fl * 10) / 10, th = 0.3;
  const plan = lojaPlan(p.interior, w, d, p.semente);
  const root = new T.Group(), shell = new T.Group(), inside = new T.Group(), cap = new T.Group();
  root.add(shell, inside, cap);
  let tris = 0;
  const batch = () => { const b = new kit.Batch(); b.rotStack = []; return b; };
  // rotated placement of props: wrap the batch so every call is offset and turned (a small transform stack on the batch)
  const finish = (b, g) => { const built = b.build(); tris += b.tris; for (const m of [...built.children]) g.add(m); return built; };
  const outer = { c: p.cor, map: p.fachada === 'tijolo' ? 'tijolo' : 'concreto' };
  const inner = WALLM[p.interior] ?? WALLM.saguao;
  const walls = [];
  const wall = (name, nx, nz, size, pos, specs) => {
    const b = new kit.Batch(); b.box(outer, size, pos, { cell: 3, tile: 3, nojitter: true, skip: ['-y', '+y'], specs });
    const g = new T.Group(); g.userData.normal = [nx, nz]; g.name = `p-${name}`; finish(b, g); shell.add(g); walls.push(g);
  };
  const doorL = DOOR.x - DOOR.w / 2, doorR = DOOR.x + DOOR.w / 2;
  wall('fundo', 0, -1, [w, GH, th], [0, 0, -d / 2 + th / 2], { '+z': inner, '-z': outer });
  wall('oeste', -1, 0, [th, GH, d], [-w / 2 + th / 2, 0, 0], { '+x': inner, '-x': outer });
  wall('leste', 1, 0, [th, GH, d], [w / 2 - th / 2, 0, 0], { '-x': inner, '+x': outer });
  // the front: two pieces with the door between them, a lintel and the sign over it
  {
    const b = new kit.Batch(), fz = d / 2 - th / 2, spec = { '+z': outer, '-z': inner };
    const lw = doorL + w / 2, rw = w / 2 - doorR;
    b.box(outer, [lw, GH, th], [(-w / 2 + doorL) / 2, 0, fz], { cell: 3, tile: 3, nojitter: true, skip: ['-y', '+y'], specs: spec });
    b.box(outer, [rw, GH, th], [(w / 2 + doorR) / 2, 0, fz], { cell: 3, tile: 3, nojitter: true, skip: ['-y', '+y'], specs: spec });
    b.box(outer, [DOOR.w, GH - 2.6, th], [DOOR.x, 2.6, fz], { cell: 3, nojitter: true, skip: ['-y', '+y'], specs: spec });
    // storefront glass (dark) with a frame, on each side of the door
    for (const [x0, x1] of [[-w / 2 + 0.6, doorL - 0.5], [doorR + 0.5, w / 2 - 0.6]]) if (x1 - x0 > 1) {
      b.box(M.glass, [x1 - x0, 2.0, 0.05], [(x0 + x1) / 2, 0.55, d / 2 + 0.02], { tile: 2, cell: 4, nojitter: true });
      b.box({ c: '#26282c', map: 'concreto' }, [x1 - x0 + 0.2, 0.12, 0.12], [(x0 + x1) / 2, 0.45, d / 2 + 0.04]);
      b.box({ c: '#26282c', map: 'concreto' }, [x1 - x0 + 0.2, 0.12, 0.12], [(x0 + x1) / 2, 2.6, d / 2 + 0.04]);
    }
    // door frame, a half-open door leaf hanging crooked, the sign over the door
    for (const s of [-1, 1]) b.box({ c: '#1c1d20' }, [0.12, 2.6, 0.14], [DOOR.x + s * (DOOR.w / 2), 0, d / 2 + 0.03]);
    b.box(M.grey, [0.9, 2.5, 0.05], [doorR - 0.45, 0, d / 2 + 0.5], { ry: -1.2 });
    const sign = SIGN[p.interior] ?? 'nenhum', pic = p.letreiro !== 'nenhum' ? p.letreiro : sign;
    if (pic !== 'nenhum') { b.box({ c: '#1c1d20' }, [1.6, 1.0, 0.1], [DOOR.x, 2.9, d / 2 + 0.03]); b.plane({ c: '#ffffff', map: `p:${pic}` }, 0.9, 0.9, [DOOR.x, 2.95, d / 2 + 0.09], { full: true }); }
    b.box({ c: '#26282c', map: 'concreto' }, [w, 0.35, 0.3], [0, GH - 0.2, d / 2 + 0.08], { cell: 6 });
    const g = new T.Group(); g.userData.normal = [0, 1]; g.name = 'p-frente'; finish(b, g); shell.add(g); walls.push(g);
  }
  // the floor, and under it the dust and the dirt
  { const b = new kit.Batch(); b.box(FLOORM[p.interior] ?? FLOORM.saguao, [w - 0.2, 0.12, d - 0.2], [0, -0.04, 0], { cell: 2, tile: 2, nojitter: true, skip: ['-y'] }); finish(b, inside); }

  // the upper floors, the roof edge and the lit windows (the cap)
  {
    const b = new kit.Batch(), up = { c: p.cor, map: p.fachada === 'tijolo' ? 'tijolo' : 'modulo' };
    b.box(up, [w, uh, d], [0, GH, 0], { tile: [3, 3.2], cell: 6, nojitter: true, specs: { '+y': { c: '#2a2c30', map: 'concreto' }, '-y': { c: '#4a4a48', map: 'concreto' }, '+z': p.fachada === 'vidro' ? { c: '#9aa8b8', map: 'vidro' } : up } });
    b.box({ c: '#2a2c30', map: 'concreto' }, [w + 0.3, 0.4, d + 0.3], [0, GH + uh, 0], { cell: 8 });
    const cols = Math.floor(w / 3);
    for (let row = 0; row < fl; row++) for (let c = 0; c < cols; c++) {
      if (r() >= p.luzes) continue;
      b.plane({ c: ['#e8c878', '#d8d0a0', '#f0e0a8', '#c8d8e0'][Math.floor(r() * 4)], emissive: 1, fogged: 0.7, night: true, dayC: '#1e2834' }, 1.4, 1.5, [-w / 2 + c * 3 + 1.5, GH + row * 3.2 + 0.85, d / 2 + 0.03], {});
    }
    finish(b, cap);
  }
  // what stands inside: one batch with a small transform stack
  {
    const b = new kit.Batch(), T4 = new T.Matrix4(), stack = [];
    const add = b.add.bind(b), base = b.matrix.bind(b);
    let cur = new T.Matrix4();
    b.pushRot = (rot, pos) => { stack.push(cur); cur = new T.Matrix4().compose(new T.Vector3(...pos), new T.Quaternion().setFromEuler(new T.Euler(0, rot, 0)), new T.Vector3(1, 1, 1)); };
    b.popRot = () => { cur = stack.pop(); };
    b.add = (spec, geo, m) => add(spec, geo, cur.clone().multiply(m));
    void T4; void base;
    for (const pr of plan.props) drawProp(b, pr, r);
    // the clutter on the floor
    for (const c of plan.clutter) { const sp = { c: c.c, map: 'concreto' }; b.pushRot(c.rot, [c.x, 0.02, c.z]); b.box(sp, [c.s, c.h, c.s * 0.7]); b.popRot(); }
    finish(b, inside);
  }
  // the wear and the fittings of the room: ceiling beams and pipes, dead tube lights, conduits, stains and cracks on the walls, worn pictogram decals,
  // vents, a fallen ceiling tile, puddles and drips (all from the seed of the shop)
  {
    const b = new kit.Batch(), dr = mulberry32(p.semente * 211 + 5), hw = w / 2 - th, hd = d / 2 - th, ch = GH - 0.02;
    for (let z = -hd + 1.5; z < hd; z += 3.2) b.box({ c: '#3a3c3c', map: 'concreto' }, [w - 0.7, 0.28, 0.22], [0, ch - 0.28, z], { cell: 4 });                     // the beams
    for (const s2 of [-1, 1]) b.cyl({ c: '#5a646c', map: 'metal' }, 0.06, 0.06, d - 1, 8, [s2 * (hw - 0.4), ch - 0.4, 0], { rx: Math.PI / 2 });                         // the pipes
    for (let i = 0; i < Math.floor(d / 4.2); i++) { const z = -hd + 1.6 + i * 4.2, on = dr() < 0.25; b.box({ c: '#c8c8c0', emissive: on ? 0.5 : 0, fogged: 0.6 }, [1.2, 0.05, 0.16], [dr() * 2 - 1, ch - 0.34, z], { ry: (dr() - 0.5) * 0.1 }); b.box({ c: '#26282a', map: 'metal' }, [1.3, 0.04, 0.2], [0, ch - 0.3, z]); } // the tube lights (a few still on)
    for (let i = 0; i < 12; i++) { const side = dr() < 0.5 ? -1 : 1, z = -hd + dr() * (d - 1), y = 0.4 + dr() * 2.4; b.plane({ c: '#10181a', opacity: 0.4 }, 0.5 + dr() * 1.2, 0.8 + dr() * 1.6, [side * (hw - 0.01), y, z], { ry: -side * Math.PI / 2, cell: 9 }); } // damp stains on the side walls
    for (let i = 0; i < 6; i++) b.plane({ c: '#10181a', opacity: 0.4 }, 0.6 + dr(), 0.8 + dr() * 1.4, [(dr() - 0.5) * (w - 2), 0.3 + dr() * 2, -d / 2 + th + 0.01], { cell: 9 }); // and on the back wall
    for (let i = 0; i < 5; i++) { const x = (dr() - 0.5) * (w - 2), y = 0.8 + dr() * 1.8; b.box({ c: '#101012' }, [0.01, 0.4 + dr() * 0.9, 0.012], [x, y, -d / 2 + th + 0.005], { cell: 9 }); b.box({ c: '#101012' }, [0.3 + dr() * 0.4, 0.012, 0.01], [x + 0.1, y, -d / 2 + th + 0.006], { cell: 9 }); } // cracks
    const pics = ['perigo', 'seta', 'proibido', 'caixa', 'vialume'];
    for (let i = 0; i < 3; i++) { const x = (dr() - 0.5) * (w - 3); b.plane({ c: '#9a9488', map: `p:${pics[Math.floor(dr() * pics.length)]}`, opacity: 0.85 }, 0.6, 0.6, [x, 1.3 + dr() * 0.6, -d / 2 + th + 0.012], { full: true }); } // worn pictogram decals
    for (let i = 0; i < 3; i++) { const x = (dr() - 0.5) * (w - 3); b.box({ c: '#202224', map: 'metal' }, [0.5, 0.35, 0.05], [x, 2.7, -d / 2 + th + 0.03], { cell: 3 }); for (let k = 0; k < 4; k++) b.box({ c: '#08090a' }, [0.44, 0.012, 0.01], [x, 2.58 + k * 0.07, -d / 2 + th + 0.058], { cell: 3 }); } // vents
    b.box({ c: '#8a8a82', map: 'concreto' }, [0.6, 0.03, 0.6], [(dr() - 0.5) * (w - 3), 0.02, (dr() - 0.5) * (d - 6)], { ry: dr() * 3, cell: 3 });                      // a fallen tile
    for (let i = 0; i < 4; i++) b.plane({ c: '#0c1a24', opacity: 0.55 }, 0.6 + dr() * 1.0, 0.5 + dr() * 0.8, [(dr() - 0.5) * (w - 3), 0.03, (dr() - 0.5) * (d - 3)], { flat: true, ry: dr() * 3, cell: 9 }); // puddles
    for (let i = 0; i < 18; i++) b.box({ c: ['#4a443a', '#6a5a46', '#3a3834', '#8a8a84'][Math.floor(dr() * 4)], map: 'concreto' }, [0.04 + dr() * 0.16, 0.03 + dr() * 0.08, 0.04 + dr() * 0.14], [(dr() - 0.5) * (w - 1.4), 0.02, (dr() - 0.5) * (d - 1.4)], { ry: dr() * 3, cell: 3 }); // plaster fallen
    finish(b, inside);
  }
  // the lamp of the room (a weak light, cold): the only one per entity
  const light = { color: '#8a9aa8', range: Math.max(7, Math.min(12, d * 0.6)), y: GH - 0.6, z: 0, night: false };
  // the colliders (local): the three walls, the front in two pieces, the props
  const cb = [
    { x: 0, z: -d / 2 + th / 2, w, d: th }, { x: -w / 2 + th / 2, z: 0, w: th, d }, { x: w / 2 - th / 2, z: 0, w: th, d },
    { x: (-w / 2 + doorL) / 2, z: d / 2 - th / 2, w: doorL + w / 2, d: th }, { x: (w / 2 + doorR) / 2, z: d / 2 - th / 2, w: w / 2 - doorR, d: th },
    ...plan.boxes,
  ];
  return {
    root, dynamic: true, colliderBoxes: cb, hides: plan.hides.map((h) => ({ ...h })), light, plan, w, d,
    get tris() { return Math.round(tris); },
  };
}
