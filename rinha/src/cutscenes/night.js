// The orchard at night, for every cutscene that shows it (pomar.js and pomar-cerco.js), so the
// shots match: a dark violet-blue sky with a moon and stars and no sun, cold dim ambient light and
// a cold blue fog. The lit house door and windows, the red apples and the eyes of the creatures
// stay the brightest things. Applied on top of scenes/pomar.js (which is the dusk version).
import { rng } from './common.js';

export function nightify(r, sc) {
  const T = r.THREE;
  // the sky texture is a dusk gradient: tint it down to a deep blue-violet; the sun goes away
  sc.parts.sky.material.uniforms.uColor.value.setRGB(0.2, 0.24, 0.42);
  sc.parts.sun.visible = false;
  sc.group.traverse((o) => { if (o.isMesh && o.geometry?.parameters?.height === 0.8 && o.geometry.type === 'BoxGeometry') o.material.uniforms.uColor.value.setRGB(0.22, 0.26, 0.46); }); // the clouds, lit by the moon
  // moon and stars on the sky dome (the dome is a sphere of radius 72 around the origin)
  const moon = new T.Mesh(new T.CircleGeometry(3.4, 12), r.mat('#e4eaff', { emissive: 1, fogged: 0 }));
  moon.position.set(-16, 26, -58); moon.lookAt(0, 6, 0); sc.group.add(moon);
  const starM = r.mat('#dfe6ff', { emissive: 1, fogged: 0 }), rand = rng(77);
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2, el = 0.25 + rand() * 1.1, rad = 66;
    const s = new T.Mesh(new T.BoxGeometry(0.5, 0.5, 0.2), starM);
    s.position.set(Math.sin(a) * Math.cos(el) * rad, Math.sin(el) * rad * 0.9, Math.cos(a) * Math.cos(el) * rad); s.lookAt(0, 0, 0); sc.group.add(s);
  }
  // light: cold and dim, the door spill stays warm
  const L = sc.lights;
  L.ambient = 0x4e5a86; L.key = 0x3c4872; L.fog = 0x161c38; L.fogNear = 8; L.fogFar = 40;
  L.points[1] = { ...L.points[1], hex: 0x9ab8ff, k: 0.7 };     // the moon in the clearing
  L.points[2] = { ...L.points[2], hex: 0x7a8cd8, k: 0.45 };
  L.points[3] = { ...L.points[3], hex: 0x7a8cd8, k: 0.4 };
  L.apply();
}

/** The house (scenes/casa.js): the sky seen through the open back door is a dusk plane; make it night, like the orchard. */
export function nightDoor(sc) {
  sc.group.traverse((o) => {
    const u = o.isMesh && o.material?.uniforms?.uColor?.value;
    if (u && u.getHexString() === '6a4a62') u.setRGB(0.07, 0.09, 0.2);
  });
}
