// The props of assets/props/*.glb (tools/props/): each is one mesh with one hand-painted texture, standing on y = 0, centred in x and z,
// its front toward +Z. A prop made of named parts (the station radio, tools/models/radio.py) is joined here into one still mesh: every
// part that shares the first part's texture, as the file poses it, without the lit twins (`*_on`). The radio whose parts move is
// built from the same file by radio.js. A file may carry `<name>_hull`: what of the prop takes the outline (without its small bits and thin
// rods); without it the whole prop does. They are loaded once, before the scenes are built (a top-level await), so every builder is synchronous. A prop
// that did not load is simply missing: `place` draws a plain box of the size the builder gave, and the game goes on.
import * as THREE from 'three';
import { GLTFLoader } from '../../../vendor/three/GLTFLoader.js';
import { mergeGeometries } from '../../../vendor/three/BufferGeometryUtils.js';
import { hullOf } from '../outline.js';

export const PROP_NAMES = [
  'fogareiro', 'gerador', 'quadro', 'radio', 'galao', 'carrinho', 'pneu', 'cama_improvisada', 'caixa_ferramentas',
  'bomba', 'bomba_quebrada', 'filtro_corpo', 'bateria_celula', 'bateria_base', 'bancada', 'mesa', 'banco', 'colchao_base', 'colchao_manta',
  'caixa_dagua', 'armario', 'balde', 'cozinha', 'palete', 'saco_cimento', 'betoneira', 'andaime', 'pilar_forma', 'forma_tabuas', 'tambor',
  'caixote', 'prateleira_modulo', 'lampada_gaiola', 'valvula', 'trilho', 'div_chapa', 'div_palete', 'div_lona', 'div_grade', 'cabo_bobina',
  // the second pass: what the scenes built out of plain boxes (the shelves' boxes and tins, the pipes, the shaft's ladder, the skip, the canopy, the hoarding)
  'caixa_papelao', 'lata', 'cacamba', 'cacamba_entulho', 'escada_poco', 'cano', 'cano_flange', 'cano_parede', 'cano_descida',
  'marquise_modulo', 'marquise_coluna', 'tapume_painel', 'tapume_poste',
];

/** The props that take no outline (open sheets, whose shell would show from behind as a dark patch). */
const NO_OUTLINE = new Set([]);

/** name -> { geo, map, tris, hull } for the props that arrived (hull: the outline's shell, see models/outline.js). */
export const PROPS_LOADED = new Map();

async function one(name) {
  try {
    const url = new URL(`../../../assets/props/${name}.glb`, import.meta.url).href;
    const g = await new GLTFLoader().loadAsync(url);
    let mesh = null, shell = null;
    g.scene.traverse((o) => { if (!o.isMesh) return; if (o.name.endsWith('_hull')) shell = o; else if (!mesh) mesh = o; });
    if (!mesh) return;
    const map = mesh.material.map;
    if (map) {
      map.colorSpace = THREE.NoColorSpace; map.generateMipmaps = true; map.minFilter = THREE.LinearMipmapLinearFilter; map.magFilter = THREE.LinearFilter;
      map.anisotropy = 4; map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping; map.needsUpdate = true;
    }
    g.scene.updateMatrixWorld(true);
    const parts = [];
    g.scene.traverse((o) => { if (o.isMesh && o.material === mesh.material && !o.name.endsWith('_on') && o !== shell) parts.push(o); });
    const flat = (o) => { const q = o.geometry.clone().applyMatrix4(o.matrixWorld); for (const k of Object.keys(q.attributes)) if (!['position', 'normal', 'uv'].includes(k)) q.deleteAttribute(k); return q; };
    let geo = parts.length > 1 ? mergeGeometries(parts.map(flat)) : mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    PROPS_LOADED.set(name, { geo, map, tris: (geo.index ? geo.index.count : geo.attributes.position.count) / 3, hull: NO_OUTLINE.has(name) ? null : hullOf(THREE, shell ? shell.geometry.clone().applyMatrix4(shell.matrixWorld) : geo) });
  } catch (err) { console.info(`props: ${name} did not load, a plain box stays`, err?.message ?? err); }
}
await Promise.all(PROP_NAMES.map(one));
