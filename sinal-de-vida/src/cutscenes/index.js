// The registry of the cutscenes: the film mode lists their views from here. A new cutscene is a file next to
// this one with `export default { name, views, camera(t), sfx }`, added below.
import galeria from './galeria.js';
import rua from './rua.js';
import aGaleria from './a-galeria.js';
import radioTeste from './radio-teste.js';
import radioCurto from './radio-curto.js';
import noite1 from './noite1.js';
import emenda from './emenda.js';
import fuga from './fuga.js';

export const CUTSCENES = { galeria, rua, 'a-galeria': aGaleria, 'radio-teste': radioTeste, 'radio-curto': radioCurto, noite1, emenda, fuga };
