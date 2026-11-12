// PS1 look shaders: vertex snapping, affine textures, vertex light and short fog.
export const PS1_VERT = /* glsl */ `
uniform vec2 uRes; uniform vec3 uLightDir, uLightColor, uAmbient;
uniform vec3 uPointPos[4]; uniform vec3 uPointColor[4]; uniform float uPointRange[4];
uniform float uFogNear, uFogFar, uRepeat;
varying vec2 vUvA; varying float vW; varying vec3 vLight; varying float vFog;
void main() {
  mat4 model = modelMatrix;
  #ifdef USE_INSTANCING
    model = modelMatrix * instanceMatrix;
  #endif
  vec4 world = model * vec4(position, 1.0);
  vec3 n = normalize(mat3(model) * normal);
  vec3 l = uAmbient + uLightColor * max(dot(n, normalize(-uLightDir)), 0.0);
  for (int i = 0; i < 4; i++) {
    vec3 toP = uPointPos[i] - world.xyz; float d = length(toP);
    l += uPointColor[i] * max(dot(n, toP / max(d, 1e-3)), 0.0) * clamp(1.0 - d / max(uPointRange[i], 1e-3), 0.0, 1.0);
  }
  vLight = l;
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
varying vec2 vUvA; varying float vW; varying vec3 vLight; varying float vFog;
float bayer(vec2 p) {
  int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0));
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return float(m[y * 4 + x]) / 16.0;
}
void main() {
  vec2 uv = vUvA / vW;
  vec4 tex = uHasMap > 0.5 ? texture2D(map, uv) : vec4(1.0);
  if (tex.a < 0.5) discard;
  vec3 c = tex.rgb * uColor * mix(vLight, vec3(1.0), uEmissive);
  c = mix(c, uFogColor, vFog * uFogged);
  c += (bayer(gl_FragCoord.xy) - 0.5) / 24.0;
  c = floor(clamp(c, 0.0, 1.0) * 31.0 + 0.5) / 31.0;
  gl_FragColor = vec4(c, uAlpha);
}`;

