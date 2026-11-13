// The master chain is the engine's (vendor/engine/sound.js); this game's rooms and their reverb.
import { createChain as engineChain } from '../../vendor/engine/sound.js';

const ROOMS = { fora: 0.04, loja: 0.16, escritorio: 0.14, estoque: 0.3, banheiro: 0.42, casa: 0.12, deposito: 0.34 };

export function createChain(ctx, opts = {}) {
  return engineChain(ctx, { ...opts, rooms: ROOMS, room: 'loja' });
}
