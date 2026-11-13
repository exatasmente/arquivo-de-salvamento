// PS1 look shaders: vertex snapping, affine textures, vertex light (ambient, one key light, up to 8
// point lights) and short fog. The flashlight is a cone of light computed per pixel, in bands.
export const POINT_LIGHTS = 8;

export const PS1_VERT = /* glsl */ `
uniform vec2 uRes; uniform vec3 uLightDir, uLightColor, uAmbient;
uniform vec3 uPointPos[${POINT_LIGHTS}]; uniform vec3 uPointColor[${POINT_LIGHTS}]; uniform float uPointRange[${POINT_LIGHTS}];
uniform float uFogNear, uFogFar, uRepeat;
varying vec2 vUvA; varying float vW; varying vec3 vLight; varying float vFog; varying vec3 vWorld; varying vec3 vNormal; varying vec3 vCol;
void main() {
  #ifdef USE_COLOR
    vCol = color;
  #else
    vCol = vec3(1.0);
  #endif
  mat4 model = modelMatrix;
  #ifdef USE_INSTANCING
    model = modelMatrix * instanceMatrix;
  #endif
  vec4 world = model * vec4(position, 1.0);
  vec3 n = normalize(mat3(model) * normal);
  vec3 l = uAmbient + uLightColor * max(dot(n, normalize(-uLightDir)), 0.0);
  for (int i = 0; i < ${POINT_LIGHTS}; i++) {
    vec3 toP = uPointPos[i] - world.xyz; float d = length(toP);
    float a = clamp(1.0 - d / max(uPointRange[i], 1e-3), 0.0, 1.0);
    l += uPointColor[i] * clamp(dot(n, toP / max(d, 1e-3)) * 0.75 + 0.25, 0.0, 1.0) * a * (0.4 + 0.6 * a);
  }
  vLight = l; vWorld = world.xyz; vNormal = n;
  vec4 view = viewMatrix * world;
  vFog = clamp((-view.z - uFogNear) / max(uFogFar - uFogNear, 1e-3), 0.0, 1.0);
  vec4 clip = projectionMatrix * view;
  if (clip.w > 0.0) {
    vec2 g = uRes * 0.5;
    clip.xy = floor(clip.xy / clip.w * g + 0.5) / g * clip.w;
  }
  gl_Position = clip;
  // uv * w interpolated with perspective, divided by w per pixel: affine, as on the hardware.
  vUvA = uv * uRepeat * clip.w; vW = clip.w;
}`;

export const PS1_FRAG = /* glsl */ `
uniform sampler2D map; uniform float uHasMap, uEmissive, uFogged, uAlpha;
uniform vec3 uColor, uFogColor;
uniform vec3 uSpotPos, uSpotDir, uSpotColor; uniform float uSpotCos, uSpotRange, uSpotOn;
varying vec2 vUvA; varying float vW; varying vec3 vLight; varying float vFog; varying vec3 vWorld; varying vec3 vNormal; varying vec3 vCol;
float bayer(vec2 p) {
  int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0));
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return float(m[y * 4 + x]) / 16.0;
}
void main() {
  vec2 uv = vUvA / vW;
  vec4 tex = uHasMap > 0.5 ? texture2D(map, uv) : vec4(1.0);
  if (tex.a < 0.5) discard;
  vec3 light = vLight;
  if (uSpotOn > 0.5) {
    vec3 L = uSpotPos - vWorld; float d = length(L); L /= max(d, 1e-3);
    float cd = dot(-L, uSpotDir);
    float cone = floor(smoothstep(uSpotCos, uSpotCos + 0.10, cd) * 4.0 + 0.5) / 4.0;
    float att = clamp(1.0 - d / uSpotRange, 0.0, 1.0);
    float ndl = clamp(dot(normalize(vNormal), L) * 0.6 + 0.4, 0.0, 1.0);
    light += uSpotColor * cone * att * (0.4 + 0.6 * att) * ndl;
  }
  vec3 c = tex.rgb * uColor * vCol * mix(light, vec3(1.0), uEmissive);
  c = mix(c, uFogColor, vFog * uFogged);
  c += (bayer(gl_FragCoord.xy) - 0.5) / 24.0;
  c = floor(clamp(c, 0.0, 1.0) * 31.0 + 0.5) / 31.0;
  gl_FragColor = vec4(c, uAlpha);
}`;
