// The drawn pieces of the interface: the logotype, the Sun of the advertising, the pixel icons of the memory card, the key and button glyphs of the legend.
// Everything here is SVG / HTML text made in code (no image file), so it scales, takes the fonts of the game and the colours of the screen it is on.
// The look is the Posto Bom Dia's own material of 1998 (the brand manual, the clipboard, the punch card, the register tape): see menus.css.

const RAYS = 12;
/**
 * The Sun of the Posto Bom Dia: a disc with rays and a smile. `week` is the week of the campaign: in week 3 the smile is a little wider, in week 4 it
 * sometimes is not where it was (a class, `drift`, that menus.css moves by a few pixels now and then; "reduzir clarões" leaves it still).
 * It is drawn in a 100 x 100 box around (50, 50).
 */
export function solSvg({ week = 1, cls = '' } = {}) {
  const w = week >= 4 ? 4 : week >= 3 ? 3 : 1;
  const k = w === 1 ? 1 : w === 3 ? 1.45 : 1.7;                      // how deep and wide the smile is
  const rays = Array.from({ length: RAYS }, (_, i) => `<path class="ray" d="M50 4 58 20 42 20z" transform="rotate(${i * (360 / RAYS)} 50 50)"/>`).join('');
  const sx = 12 * k, sy = 9 + 6 * k;
  const face = `<circle class="eye" cx="40" cy="43" r="3.2"/><circle class="eye" cx="60" cy="43" r="3.2"/><path class="smile" d="M${50 - sx} 55 Q50 ${55 + sy} ${50 + sx} 55" fill="none"/>`;
  return `<svg class="sol${cls ? ' ' + cls : ''}" data-w="${w}" viewBox="0 0 100 100" aria-hidden="true"><g class="rays">${rays}</g><circle class="disc" cx="50" cy="50" r="25"/><g class="face${w >= 4 ? ' drift' : ''}">${face}</g></svg>`;
}

/** The mark that shows the chosen line of a menu: a small Sun (it turns, and menus.css makes it bounce). */
export const MARK = '<svg class="mk" viewBox="0 0 100 100" aria-hidden="true"><g class="rays">' + Array.from({ length: 8 }, (_, i) => `<path class="ray" d="M50 2 60 24 40 24z" transform="rotate(${i * 45} 50 50)"/>`).join('') + '</g><circle class="disc" cx="50" cy="50" r="28"/></svg>';

/** The logotype: the Sun, "O DIA" and "QUE SOBRA" in the heavy rounded type of the brand manual, red-edged and yellow, and a flag with the name of the chain. */
export function logo({ week = 1 } = {}) {
  return `<svg class="logo" viewBox="0 0 600 250" role="img" aria-label="O Dia que Sobra">
  <g class="sunwrap sol" transform="translate(14 8) scale(1.12)">${solSvg({ week, cls: 'big' }).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</g>
  <g transform="skewX(-7) translate(24 0)">
    <text class="l1 shade" x="166" y="104" textLength="330" lengthAdjust="spacingAndGlyphs">O DIA</text>
    <text class="l1" x="160" y="98" textLength="330" lengthAdjust="spacingAndGlyphs">O DIA</text>
    <text class="l2 shade" x="22" y="198" textLength="540" lengthAdjust="spacingAndGlyphs">QUE SOBRA</text>
    <text class="l2" x="16" y="192" textLength="540" lengthAdjust="spacingAndGlyphs">QUE SOBRA</text>
  </g>
  <g class="flag"><rect x="64" y="216" width="322" height="30" rx="4"/><text x="225" y="238" text-anchor="middle">POSTO BOM DIA · DESDE 1987</text></g>
</svg>`;
}

/** A pixel icon (12 x 12): '#' is the colour of the text, '+' the accent colour, '.' nothing. */
const PIX = {
  // the pump with its display and its hose: the run, the game that was kept
  run: ['..########..', '..#......#..', '..#.####.#..', '..#.#++#.#.#', '..#.####.#.#', '..#......#.#', '..########.#', '..#......#.#', '..#......###', '..#......#..', '..#......#..', '.##########.'],
  // the moon over a night
  night: ['....####....', '..###.......', '.###........', '.##.......+.', '###.........', '###.........', '###.........', '.###........', '.####....##.', '..#######...', '....####....', '............'],
  // the Sun: the record, the secrets and the endings
  record: ['.....##.....', '.#...##...#.', '..#.####.#..', '...######...', '##.##++##.##', '...######...', '##.######.##', '..#.####.#..', '.#...##...#.', '.....##.....', '............', '............'],
  // the other game of the channel: a cartridge
  rinha: ['............', '..########..', '..#......#..', '..#.####.#..', '..#.#++#.#..', '..#.####.#..', '..#......#..', '..########..', '..#.#.#.#...', '..#.#.#.#...', '............', '............'],
  // the broken block 13: a frame with a crack through it
  corrupt: ['.##########.', '.#........#.', '.#.....+..#.', '.#....+...#.', '.#...++...#.', '.#..++++..#.', '.#....++..#.', '.#....+...#.', '.#...+....#.', '.#..+.....#.', '.#........#.', '.##########.'],
  empty: ['............', '............', '............', '............', '............', '.....##.....', '.....##.....', '............', '............', '............', '............', '............'],
};
export function icon(kind) {
  const rows = PIX[kind] ?? PIX.empty;
  let a = '', b = '';
  rows.forEach((row, y) => { for (let x = 0; x < 12; x++) { const c = row[x]; if (c === '#') a += `M${x} ${y}h1v1h-1z`; else if (c === '+') b += `M${x} ${y}h1v1h-1z`; } });
  return `<svg class="pix" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true"><path class="ink" d="${a}"/><path class="acc" d="${b}"/></svg>`;
}

// ---- the legend of the buttons, by device ---------------------------------------------------------------------------------------------------------
const ARR = { u: 'M5 1 9 7H1z', d: 'M5 9 1 3h8z', l: 'M1 5 7 1v8z', r: 'M9 5 3 1v8z' };
const tri = (k) => `<svg viewBox="0 0 10 10" aria-hidden="true"><path d="${ARR[k]}"/></svg>`;
const key = (html, cls = '') => `<kbd${cls ? ` class="${cls}"` : ''}>${html}</kbd>`;
const pad = (b) => `<i class="pb b-${b.toLowerCase()}">${b}</i>`;
const bump = (b) => `<i class="pb bump">${b}</i>`;
const dpad = (kind) => `<i class="pb dpad ${kind}"><svg viewBox="0 0 20 20" aria-hidden="true"><path class="${kind.includes('v') ? 'on' : ''}" d="M7 1h6v6H7z"/><path class="${kind.includes('v') ? 'on' : ''}" d="M7 13h6v6H7z"/><path class="${kind.includes('h') ? 'on' : ''}" d="M1 7h6v6H1z"/><path class="${kind.includes('h') ? 'on' : ''}" d="M13 7h6v6h-6z"/><path class="mid" d="M7 7h6v6H7z"/></svg></i>`;
const GL = {
  keyboard: { move: key(tri('u') + tri('d'), 'arr'), adjust: key(tri('l') + tri('r'), 'arr'), tab: key('Tab'), ok: key('Enter'), back: key('Esc'), scroll: key(tri('u') + tri('d'), 'arr') },
  gamepad: { move: dpad('v'), adjust: dpad('h'), tab: bump('LB') + bump('RB'), ok: pad('A'), back: pad('B'), scroll: dpad('v') },
  touch: { move: '', adjust: '', tab: '', ok: '', back: '', scroll: '' },
};
const WORD = { move: 'Escolher', adjust: 'Ajustar', tab: 'Trocar de aba', ok: 'Confirmar', back: 'Voltar', scroll: 'Rolar' };
/**
 * The legend at the foot of a screen for the device in use. `items`: move, adjust, tab, ok, back, scroll; `backWord`: the name of the Voltar button.
 * Touch shows only what a finger does, and the Voltar button (44 px or more; `data-back`) is the one a finger can reach.
 */
export function legend(items, device, { backWord = WORD.back } = {}) {
  const g = GL[device] ?? GL.keyboard;
  if (device === 'touch' && items.includes('adjust')) items = items.filter((x) => x !== 'ok');
  return items.map((it) => {
    if (device === 'touch') {
      if (it === 'back') return `<button type="button" class="lg back" data-back="1"><svg viewBox="0 0 10 10" aria-hidden="true"><path d="${ARR.l}"/></svg>${backWord}</button>`;
      if (it === 'ok') return '<span class="lg hint">Toque para escolher</span>';
      if (it === 'adjust') return '<span class="lg hint">Toque ou arraste os controles</span>';
      return '';
    }
    if (it === 'back') return `<button type="button" class="lg back" data-back="1">${g.back}<span>${backWord}</span></button>`;
    return `<span class="lg">${g[it]}<span>${WORD[it]}</span></span>`;
  }).join('');
}

const KEYISH = /^(?:[A-Z0-9]|Shift|Tab|Esc|Espaço|Enter|Start|Select|LB|RB|RT|LT|L3|R3|setas)$/;
/** A line of a controls table with its keys drawn as keys: "W A S D" gives four keys, "Shift (segurar)" a key and the words after it. */
export function keycaps(text, esc) {
  return String(text).split(/(\s+)/).map((tk) => (KEYISH.test(tk) ? `<kbd>${esc(tk)}</kbd>` : esc(tk))).join('');
}
