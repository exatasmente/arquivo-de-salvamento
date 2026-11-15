// R9: Dona Cida's bag, put away on the counter after the choice (to give back at her next visit, or without the photo she is going to look for).
// It is a prop that outlives the script (`branches.keep`): it stays on the counter until she comes (the `conta` consequence, or the next night's visit).
import { makeThing } from './common.js';

export const BAG_AT = [15.2, 1.0, 8.5];
export function bagProp(ctx) {
  const bag = makeThing(ctx.render, 'bolsa');
  bag.position.set(BAG_AT[0], BAG_AT[1], BAG_AT[2]); bag.rotation.y = 0.35; bag.visible = true;
  return {
    data: { at: BAG_AT },
    update() { return ctx.branches.done('r9', 'conta') || (ctx.progression.st.recurringSeen.includes('cida:cida-7') && !ctx.customers.list.some((c) => c.rec?.id === 'cida')); },   // (it stays until she comes and goes)
    dispose() { ctx.render.scene.remove(bag); },
  };
}
export function restoreProp(ctx) { return bagProp(ctx); }
/** Nights 18 and 19, for who put the bag away: it is still on the counter until she comes. */
export function run(ctx) { ctx.branches.keep(bagProp(ctx), 'branches/r9-guardada.js'); return { update: () => true }; }
