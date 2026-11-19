// The drawn pieces of the interface: the logotype, the pixel icons of the memory card, the button glyphs of the legend.
// Everything here is SVG text made in code (no image file), so it scales and takes the colour of the screen it is on.

/** The logotype: SINAL in heavy condensed type, DE VIDA under it, and a signal trace that ends in a pulse. Its fonts are the game's (assets/fonts). */
export const LOGO = `<svg class="logo" viewBox="0 0 580 214" role="img" aria-label="Sinal de Vida">
  <defs>
    <linearGradient id="lgp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6eedb"/><stop offset="0.55" stop-color="#d9cdb0"/><stop offset="1" stop-color="#9a8f78"/></linearGradient>
    <filter id="lgg" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="5"/></filter>
  </defs>
  <text class="l1 shadow" x="4" y="136" filter="url(#lgg)">SINAL</text>
  <text class="l1 back" x="6" y="140">SINAL</text>
  <text class="l1 face" x="0" y="134" fill="url(#lgp)">SINAL</text>
  <rect class="bar" x="2" y="150" width="576" height="2.5"/>
  <text class="l2" x="2" y="205">DE VIDA</text>
  <path class="wave" d="M318 190 H372 l7 -6 l7 12 l9 -26 l11 44 l9 -30 l7 12 l6 -6 H578" pathLength="1"/>
  <circle class="dot" cx="578" cy="190" r="3.5"/>
</svg>`;

/** A pixel icon (12 x 12): '#' is the colour of the text, '+' the accent colour, '.' nothing. */
const PIX = {
  run: ['....#.......', '....#.......', '....#.......', '..########..', '..#......#..', '..#.+++..#..', '..#......#..', '..#.####.#..', '..#.####.#..', '..#......#..', '..########..', '............'],
  night: ['....####....', '..###.......', '.###........', '.##.......+.', '###.........', '###.........', '###.........', '.###........', '.####....##.', '..#######...', '....####....', '............'],
  other: ['............', '..########..', '..#......#..', '..#.####.#..', '..#.#++#.#..', '..#.####.#..', '..#......#..', '..########..', '..#.#.#.#...', '..#.#.#.#...', '............', '............'],
  corrupt: ['.##########.', '.#........#.', '.#.....+..#.', '.#....+...#.', '.#...++...#.', '.#..++++..#.', '.#....++..#.', '.#....+...#.', '.#...+....#.', '.#..+.....#.', '.#........#.', '.##########.'],
  channel: ['............', '.#........#.', '#..#....#..#', '#.#..++..#.#', '#.#.+..+.#.#', '#.#.+..+.#.#', '#.#..++..#.#', '#..#.++.#..#', '.#...++...#.', '.....++.....', '.....++.....', '...######...'],
  secrets: ['..####......', '.#....#.....', '.#....#.....', '.#....#.....', '..####......', '....#.......', '....#.......', '....###.....', '....#.......', '....##......', '....#.......', '............'],
  empty: ['............', '............', '............', '............', '............', '.....##.....', '.....##.....', '............', '............', '............', '............', '............'],
};
export function icon(kind) {
  const rows = PIX[kind] ?? PIX.empty;
  let a = '', b = '';
  rows.forEach((row, y) => { for (let x = 0; x < 12; x++) { const c = row[x]; if (c === '#') a += `M${x} ${y}h1v1h-1z`; else if (c === '+') b += `M${x} ${y}h1v1h-1z`; } });
  return `<svg class="pix" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true"><path class="ink" d="${a}"/><path class="acc" d="${b}"/></svg>`;
}

// ---- the legend of the buttons, by device -------------------------------------------------------------------------------------------------------
const ARR = { u: 'M5 1 9 7H1z', d: 'M5 9 1 3h8z', l: 'M1 5 7 1v8z', r: 'M9 5 3 1v8z' };
const tri = (k) => `<svg viewBox="0 0 10 10" aria-hidden="true"><path d="${ARR[k]}"/></svg>`;
const key = (html, cls = "") => `<kbd${cls ? ` class="${cls}"` : ""}>${html}</kbd>`;
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
 * The legend at the foot of a screen for the device in use. `items`: the names (move, adjust, tab, ok, back, scroll); `backAct`: the action the Voltar button runs
 * when it is touched or clicked (the legend's own button is the one a finger can reach). Touch shows only what a finger does.
 */
export function legend(items, device, { backAct = 'back', backWord = WORD.back } = {}) {
  const g = GL[device] ?? GL.keyboard;
  if (device === 'touch' && items.includes('adjust')) items = items.filter((x) => x !== 'ok');
  return items.map((it) => {
    if (device === 'touch') {
      if (it === 'back') return `<button type="button" class="lg back" data-act="${backAct}"><svg viewBox="0 0 10 10" aria-hidden="true"><path d="${ARR.l}"/></svg>${backWord}</button>`;
      if (it === 'ok') return '<span class="lg hint">Toque para escolher</span>';
      if (it === 'adjust') return '<span class="lg hint">Toque ou arraste os controles</span>';
      return '';
    }
    if (it === 'back') return `<button type="button" class="lg back" data-act="${backAct}">${g.back}<span>${backWord}</span></button>`;
    return `<span class="lg">${g[it]}<span>${WORD[it]}</span></span>`;
  }).join('');
}
