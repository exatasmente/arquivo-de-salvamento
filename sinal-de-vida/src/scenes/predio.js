// The scene "predio": the residential block of the chase (night 1, scene 4), alone. Everything of it is an entity of
// data/scenes/predio.json, built through the engine (placeEntities) by the builders of models/predio/: the shell (the fronts, the hall,
// the stairs' core, the corridor, the flat) and each thing in it (the doors, the mailboxes, the stairs, the cupboard, the furniture, the
// fire escape, the lamps, the places of the lure). Its entities stand in the street's own frame (scenes/predio-plan.js), so the street
// puts the whole of it in as one entity (`predio-fuga` of data/scenes/rua.json) without moving a thing.
// The scene editor (`?editor=predio`) builds it with this function, every part of the inside shown; the game and the film mode get
// it through the street (scenes/rua.js), the inside shown only while the chase is in it.
//
// Contract with the game: buildScene(r, { layout, editor, hooks, embed }) -> { group, ents, views, lights, update(t, ctx), spawn,
//   colliders, exits, hides, setDaylight(k), ground(x, z), setActive(on), fuga }.
//   fuga.apply({ space, door, glass, aptDoor, cupboard, window, step, ladder })   what the chase asks of the building at a moment
//     space: 'fora' (only the outside), 'hall', 'vao', 'andar', 'tudo'; door / aptDoor / cupboard: radians open; glass: 0 whole, 1 cracked,
//     2 gone; tip: the cupboard going over (radians); pano: the sheet is still on the table; window: 0 shut .. 1 up; step: 0 in place .. 1 hanging; ladder: 0 up .. 1 down.
//   fuga.tris() -> { fora, dentro };  fuga.parts: the things that move, for the tests.
import { kitOf, countTris } from '../models/kit.js';
import { placeEntities } from './common.js';
import { PREDIO_BUILDERS } from '../models/predio/index.js';
import { BLOCK, WINDOW, APT, CORR, HALL, STAIR } from './predio-plan.js';
import LAYOUT from '../../data/scenes/predio.json' with { type: 'json' };

const Y = BLOCK.y;
/** Where the camera starts in the scene editor, and a view of each part of the inside. */
export const VIEWS = {
  inicio: { eye: [-7.5, 2.4, 3.5], at: [-12.5, 6.5, -11.6] },
  hall: { eye: [HALL.x0 + 0.4, Y[0] + 3.4, HALL.z1 - 0.5], at: [-11, Y[0] + 0.9, -18] },
  vao: { eye: [STAIR.cx + 0.3, Y[3] + 2.9, STAIR.cz + 0.25], at: [STAIR.cx, Y[0], STAIR.cz] },
  corredor: { eye: [CORR.x1 - 0.5, CORR.y + 2.2, -18.4], at: [CORR.x0, CORR.y + 0.4, -18.9] },
  apartamento: { eye: [APT.x0 + 0.5, APT.y + 2.4, APT.z1 - 0.5], at: [APT.x1 - 0.6, APT.y + 0.8, APT.z0 + 0.6] },
  escada: { eye: [-19.5, 2.2, -4.5], at: [-13.5, 7.5, -11.2] },
};
export const SIZE = 40;

export function buildScene(r, { layout = LAYOUT, editor = false, hooks = {}, embed = false } = {}) {
  const T = r.THREE, kit = kitOf(r), group = new T.Group();
  // alone, it stands on a piece of pavement and of road (in the street, the street's own are under it)
  if (!embed) { const b = new kit.Batch(); b.box({ c: '#b8b6b0', map: 'calcada' }, [40, 0.15, 5], [-12, 0, -9.1], { tile: 3, cell: 4, skip: ['-y'] }); b.box({ c: '#7e7c82', map: 'asfalto' }, [40, 0.3, 14], [-12, -0.3, 0.4], { tile: 4, cell: 4, skip: ['-y'] }); b.box({ c: '#5e5648', map: 'umido' }, [40, 0.2, 16], [-12, -0.06, -19.6], { tile: 5, cell: 6, skip: ['-y'] }); group.add(b.build()); }
  const things = new T.Group(); group.add(things);
  const place = placeEntities({ r, layout, editor, hooks, group: things, chunk: 0, night: () => 1, points: 8, override: PREDIO_BUILDERS });
  place.refreshBoxes();
  // the night at the flat's window is a light too (no lamp hangs there)
  place.lamps.set('janela#noite', { pos: [WINDOW.x, APT.y + 1.6, APT.z1 - 0.6], base: { color: '#506494', range: 5.5 } });
  const X = (id) => { try { return place.ents.entity(id) ? place.ents.X(id) : null; } catch { return null; } };
  const state = { space: null };
  const show = (space) => {
    const on = { fora: true, hall: space === 'hall' || space === 'vao' || space === 'tudo', vao: space !== 'fora', andar: space === 'andar' || space === 'vao' || space === 'tudo' };
    for (const m of Object.values(place.ents.made)) {
      if (m.spaces) for (const k of ['hall', 'vao', 'andar']) m.spaces[k].visible = on[k];
      else if (m.space) m.root.visible = on[m.space];
    }
  };
  const fuga = {
    apply(fx = {}) {
      const s = { space: editor ? 'tudo' : 'fora', door: 0, glass: 0, aptDoor: 0.5, cupboard: 0, tip: 0, pano: true, window: 0, step: 0, ladder: 0, ...fx };
      state.space = s.space; show(s.space);
      const d = X('porta-rua')?.ctl; d?.door(s.door); d?.glass(s.glass);
      X('porta-apto')?.ctl.set(s.aptDoor); X('armario')?.ctl.door(s.cupboard); X('armario')?.ctl.tip(s.tip); X('janela')?.ctl.set(s.window);
      const e = X('escada-incendio')?.ctl; e?.step(s.step); e?.ladder(s.ladder);
      const sheet = X('pano'); if (sheet && !s.pano) sheet.root.visible = false;          // (the sheet on the table: gone once he has it)
    },
    tris() { const was = state.space; show('fora'); const fora = countTris(things); show('tudo'); const tudo = countTris(things); show(was ?? 'fora'); return { fora, dentro: tudo - fora }; },
    get parts() { const c = (id) => X(id)?.ctl ?? {}; return { ext: group, ins: X('casca')?.spaces.hall, door: c('porta-rua').pivot, aptDoor: c('porta-apto').pivot, cupDoor: c('armario').pivot, sash: c('janela').sash, ladder: c('escada-incendio').ladderNode, loose: c('escada-incendio').looseNode }; },
  };
  place.ents.all?.();
  fuga.apply({});
  let eye = VIEWS.inicio.eye;
  const lights = { apply() { r.light({ ambient: '#4a5684', key: '#8490c0', keyDir: [0.55, 1, 0.35], fog: '#080b16', fogNear: 14, fogFar: 70 }); place.lightsNear(eye, 0); } };
  return {
    group, ents: place.ents, views: VIEWS, lights, size: SIZE, place, fuga,
    spawn: { pos: [-13.3, -9.5], yaw: 0 },
    get colliders() { return [...place.boxes.values()]; },
    exits: [], hides: [],
    setDaylight() { lights.apply(); },
    ground: () => 0.15,
    setActive: place.setActive,
    update(t, ctx) {
      r.time(t); place.ents.update(t, ctx); place.tick(t);
      if (ctx?.listener) { eye = ctx.listener; place.lightsNear(eye, 0); }
      if (editor) { place.refreshBoxes(); show('tudo'); }
    },
  };
}
