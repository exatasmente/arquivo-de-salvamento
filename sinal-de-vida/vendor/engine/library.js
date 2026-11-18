// The engine's library of looks and shaders. A game imports this file to have them (in its editor too):
// `import '../vendor/engine/library.js';`. Each one is a function of the game's clock (the film mode films what
// the game shows), light on a phone, and makes no flash (no change of the whole picture's brightness from one
// frame to the next). A game's own looks and shaders live in its src/looks/, registered the same way.
import { derivedLook, defineShader } from './looks.js';

/** A hash and a value noise, shared by the shaders below (each shader is its own GLSL program). */
const NOISE = `
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}`;

// ---- looks ---------------------------------------------------------------------------------------

export const N64 = derivedLook({
  id: 'n64',
  label: 'N64',
  desc: 'Mais suave que o PS1: vértices firmes, textura sem entortar e filtrada, muitas cores e pouco pontilhado.',
  defaults: { jitter: false, affine: false, textureFilter: 'linear', colorLevels: 63, dither: 0.25 },
});

export const VHS = derivedLook({
  id: 'vhs',
  label: 'Fita VHS',
  desc: 'O PS1 gravado numa fita: cor que vaza para o lado, linhas de varredura, chiado e a imagem que treme de leve na horizontal. Tudo anda com o relógio do jogo.',
  defaults: { jitter: false, affine: false, colorLevels: 63, dither: 0.5 },
  extra: {
    bleed: { type: 'number', label: 'Cor que vaza (px)', min: 0, max: 4, step: 0.25, default: 1.5 },
    saturation: { type: 'number', label: 'Saturação', min: 0, max: 1.5, step: 0.05, default: 0.75 },
    scanlines: { type: 'number', label: 'Linhas de varredura', min: 0, max: 1, step: 0.05, default: 0.35 },
    noise: { type: 'number', label: 'Chiado', min: 0, max: 0.3, step: 0.01, default: 0.06 },
    wobble: { type: 'number', label: 'Tremida horizontal (px)', min: 0, max: 3, step: 0.25, default: 0.75 },
  },
  // No brightness that jumps between frames: the noise is small and averages out, the scanlines stay put.
  post: () => `
float hq(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec3 post(vec2 uv) {
  float frame = floor(uTime * 30.0);
  float row = floor(uv.y * uRes.y);
  float wob = (hq(vec2(row * 0.37, frame)) - 0.5) * p_wobble / uRes.x;
  vec2 u = uv + vec2(wob, 0.0);
  float px = p_bleed / uRes.x;
  vec3 c = vec3(texture2D(tFrame, u + vec2(px, 0.0)).r, texture2D(tFrame, u).g, texture2D(tFrame, u - vec2(px, 0.0)).b);
  float g = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(g), c, p_saturation);
  c *= 1.0 - p_scanlines * 0.5 * (1.0 - mod(row, 2.0));
  c += (hq(uv * uRes + frame * 1.37) - 0.5) * p_noise;
  return c;
}`,
});

// ---- shaders -------------------------------------------------------------------------------------

defineShader({
  id: 'agua',
  label: 'Água',
  desc: 'Uma superfície de água: ondas que andam e um brilho que acompanha as cristas, na cor da água.',
  params: {
    cor: { type: 'color', label: 'Cor da água', default: '#2f6f8f' },
    brilho: { type: 'color', label: 'Cor do brilho', default: '#cfe8ff' },
    escala: { type: 'number', label: 'Tamanho das ondas', min: 0.2, max: 8, step: 0.1, default: 1.5 },
    velocidade: { type: 'number', label: 'Velocidade', min: 0, max: 3, step: 0.05, default: 0.6 },
  },
  surface: `${NOISE}
vec3 surface(vec3 base, vec2 uv, vec3 world, float t) {
  vec2 p = world.xz * s_escala;
  float w = vnoise(p + vec2(t * s_velocidade, t * s_velocidade * 0.6)) * 0.6 + vnoise(p * 2.3 - vec2(t * s_velocidade * 0.8, 0.0)) * 0.4;
  float crest = smoothstep(0.62, 0.8, w);
  return mix(base * s_cor * (0.75 + 0.35 * w), s_brilho, crest * 0.6);
}`,
});

defineShader({
  id: 'vidro-sujo',
  label: 'Vidro sujo',
  desc: 'Um vidro com manchas e poeira que escurecem e tingem a superfície, parado no tempo.',
  params: {
    sujeira: { type: 'color', label: 'Cor da sujeira', default: '#5a5040' },
    quanto: { type: 'number', label: 'Quanto de sujeira', min: 0, max: 1, step: 0.05, default: 0.7 },
    escala: { type: 'number', label: 'Tamanho das manchas', min: 0.5, max: 12, step: 0.25, default: 3 },
  },
  surface: `${NOISE}
vec3 surface(vec3 base, vec2 uv, vec3 world, float t) {
  float n = vnoise(uv * s_escala * 4.0) * 0.6 + vnoise(uv * s_escala * 11.0) * 0.4;
  float d = smoothstep(0.3, 0.7, n) * s_quanto;
  // The smudges darken toward the dirt's colour; the dust between them greys the glass a little.
  return mix(base * 0.85 + s_sujeira * 0.15, s_sujeira * 0.8, d);
}`,
});

defineShader({
  id: 'metal-oxidado',
  label: 'Metal oxidado',
  desc: 'Metal com placas de ferrugem nas áreas que o ruído escolhe, no lugar do mundo (a ferrugem não anda com a peça girada).',
  params: {
    ferrugem: { type: 'color', label: 'Cor da ferrugem', default: '#8a4a22' },
    quanto: { type: 'number', label: 'Quanto de ferrugem', min: 0, max: 1, step: 0.05, default: 0.5 },
    escala: { type: 'number', label: 'Tamanho das placas', min: 0.2, max: 6, step: 0.1, default: 1.2 },
  },
  surface: `${NOISE}
vec3 surface(vec3 base, vec2 uv, vec3 world, float t) {
  vec2 p = (world.xz + world.y * 0.7) * s_escala;
  float n = vnoise(p) * 0.65 + vnoise(p * 3.1) * 0.35;
  float r = smoothstep(1.0 - s_quanto, 1.05 - s_quanto * 0.6, n);
  return mix(base, s_ferrugem * (0.7 + 0.3 * vnoise(p * 9.0)), r);
}`,
});

defineShader({
  id: 'tela-chiado',
  label: 'Tela com chiado',
  desc: 'Uma tela de TV sem sinal: chiado que muda a cada quadro do relógio, com linhas de varredura. O brilho médio fica igual de um quadro a outro (sem clarão).',
  params: {
    intensidade: { type: 'number', label: 'Intensidade do chiado', min: 0, max: 1, step: 0.05, default: 0.8 },
    linhas: { type: 'number', label: 'Linhas de varredura', min: 0, max: 1, step: 0.05, default: 0.4 },
    quadros: { type: 'number', label: 'Quadros de chiado por segundo', min: 1, max: 30, step: 1, default: 15 },
  },
  surface: `${NOISE}
vec3 surface(vec3 base, vec2 uv, vec3 world, float t) {
  float frame = floor(t * s_quadros);
  float n = h21(floor(uv * 160.0) + frame * 17.0);
  float line = 1.0 - s_linhas * 0.5 * (1.0 - mod(floor(uv.y * 120.0), 2.0));
  return mix(base, vec3(0.25 + 0.5 * n) * line, s_intensidade);
}`,
});
