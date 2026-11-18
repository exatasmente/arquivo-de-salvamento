// The scene "galeria": the base, a drainage gallery under the viaduct of the avenue. The shell (floor, four walls,
// the vault with its ribs) is made here; everything inside (the rooms, the machines, the beds, the shaft with its
// rope and the thick cable) is the entities of data/scenes/galeria.json, built through the engine (placeEntities).
// The scene editor, the game and the film mode build the scene with this function.
//
// Contract with the game: buildScene(r, { layout, editor, hooks }) -> { group, ents, views, lights.apply(), update(t, ctx),
//   spawn, colliders, exits, hides, setDaylight(k), ground(x, z), setActive(on) }.
import { kitOf } from '../models/kit.js';
import { placeEntities, invert, makeThings } from './common.js';
import { buildShell, MOUTH } from './galeria-shell.js';
import LAYOUT from '../../data/scenes/galeria.json' with { type: 'json' };

/** Where the camera starts in the scene editor and the first shot. */
export const VIEWS = {
  inicio: { eye: [11, 1.6, 3.5], at: [3, 1.1, -0.5] },
  alto: { eye: [-6, 8, 13], at: [0, 0.5, -1] },
};
/** The inside of the gallery, in metres: x from -14 to 14, z from -5 to 5; the floor is y = 0. */
export const BOUNDS = { x: 14, z: 5, wall: 2.4, apex: 3.7 };
/** The shaft up to the street (its entity id) and where a person arrives when coming down. */
export const SHAFT = { id: 'boca', pos: [9, 0, 0] };
export const SIZE = 28;

export function buildScene(r, { layout = LAYOUT, editor = false, hooks = {} } = {}) {
  const T = r.THREE, kit = kitOf(r), group = new T.Group();
  const { x: BX, z: BZ, wall: WH, apex } = BOUNDS;
  let daylight = 0;

  // --- the entities ----------------------------------------------------------------------------------------
  const things = new T.Group(); group.add(things);
  const place = placeEntities({ r, layout, editor, hooks, group: things, chunk: 5, night: () => 1, points: 8 });
  place.refreshBoxes();

  // --- the shell: the unfinished station, painted with the light of the lamps and the shadow of everything in it ----------------
  const shell = new T.Group(); group.add(shell);
  const walls = [];
  const lampList = layout.entities.filter((e) => e.type === 'lampada' && (e.params?.acesa ?? true)).map((e) => {
    const c = new T.Color(e.params?.cor ?? '#ffd48a'), q = e.params?.queda ?? 0.4;
    return { x: e.pos[0], z: e.pos[2], y: e.pos[1] - q - 0.3, range: e.params?.alcance ?? 8, color: `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}` };
  });
  const { tunnelColliders } = buildShell({ r, T, kit, shell, walls, lampList, boxes: [...place.boxes.values()], place, BX, BZ, WH, apex });

  const WALLS = [{ id: 'muro-norte', min: [-BX - 1, -BZ - 1], max: [BX + 1, -BZ] }, { id: 'muro-sul-a', min: [-BX - 1, BZ], max: [MOUTH.x0, BZ + 1] }, { id: 'muro-sul-b', min: [MOUTH.x1, BZ], max: [BX + 1, BZ + 1] }, ...tunnelColliders, { id: 'muro-oeste', min: [-BX - 1, -BZ], max: [-BX, BZ] }, { id: 'muro-leste', min: [BX, -BZ], max: [BX + 1, BZ] }];
  const colliders = [...WALLS];
  const sync = () => { colliders.length = WALLS.length; for (const b of place.boxes.values()) colliders.push(b); };
  sync();

  // the states of the things of the base, which the game changes (setThing): the pump, the filter, the board, the batteries, the radio
  const things_ = makeThings(place.ents, {
    bomba: { ids: ['bomba'], states: { parada: { estado: 'parada' }, funcionando: { estado: 'funcionando' }, quebrada: { estado: 'quebrada' } } },
    filtro: { ids: ['filtro'], states: { entupido: { estado: 'entupido' }, limpo: { estado: 'limpo' }, ausente: { estado: 'ausente' } } },
    quadro: { ids: ['quadro'], states: { ligado: { ligado: true }, desligado: { ligado: false } } },
    bateria: { ids: ['bateria-1', 'bateria-2'], states: { cheia: { carga: 1 }, meia: { carga: 0.5 }, vazia: { carga: 0 } }, number: (v) => ({ carga: Math.max(0, Math.min(1, v)) }) },
    radio: { ids: ['radio'], states: { quebrado: { ligado: false }, ligado: { ligado: true } } },
  });
  let eye = [0, 1.6, 0];
  const lights = {
    apply() {
      r.light({ ambient: '#2a2e3c', key: '#1e1d24', keyDir: [0.3, 1, 0.2], fog: '#05070a', fogNear: 5, fogFar: 22 });
      place.lightsNear(eye, daylight);
    },
  };
  const shaft = () => place.ents.pos(SHAFT.id) ?? SHAFT.pos;
  const api = {
    group, ents: place.ents, views: VIEWS, lights, size: SIZE, bounds: BOUNDS,
    spawn: { pos: [5.6, 0, -0.2], yaw: Math.PI / 2 },
    colliders, hides: [],
    get exits() { const s = shaft(); return [{ id: 'boca', pos: [s[0], 0, s[2]], radius: 1.5, to: 'rua', spawn: { pos: [-1.2, 0, 8.2], yaw: 0 }, kind: 'corda' }]; },
    /** Where a person arrives when coming down the rope. */
    arrival: () => { const s = shaft(); return { pos: [s[0] - 1.3, 0, s[2] + 1.0], yaw: Math.PI / 2 }; },
    /** 0 is night, 1 noon. Only what comes down the shaft changes: the cone and the patch of light, and the glow it casts. */
    setDaylight(k) {
      daylight = Math.max(0, Math.min(1, k));
      for (const m of place.daylights.values()) m.daylight(daylight);
      if (!place.lamps.size) return;
      lights.apply();
    },
    ground: place.ground, setActive: place.setActive, place,
    /** Changes a thing of the base: setThing('bomba', 'funcionando' | 'parada' | 'quebrada'), ('filtro', 'entupido' | 'limpo' | 'ausente'), ('quadro', 'ligado' | 'desligado'), ('bateria', 'cheia' | 'meia' | 'vazia' | 0..1), ('radio', 'quebrado' | 'ligado'); or the id of one entity with a map of its params. Returns whether it was applied. */
    setThing: things_.setThing, thing: things_.thing,
    update(t, ctx) {
      r.time(t); place.ents.update(t, ctx); place.tick(t);
      if (ctx?.listener) { eye = ctx.listener; place.lightsNear(eye, daylight); }
      if (editor) { place.refreshBoxes(); sync(); }
    },
  };
  Object.defineProperty(api, 'hides', { get: () => [...place.hides.values()] });
  api.setDaylight(0);
  return api;
}
