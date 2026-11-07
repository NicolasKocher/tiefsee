/** Gemeinsame GLSL-Bausteine. Alles eigener Code. */

export const noiseGLSL = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.2);
    a *= 0.5;
  }
  return v;
}
`;

/**
 * Caustics über animierte Voronoi-Zellen: Helle Linien entstehen dort, wo
 * sich zwei Zellen treffen (F2 - F1 klein). Zwei Lagen mit unterschiedlicher
 * Skalierung und Drift ergeben das typische, flimmernde Netz.
 */
export const causticsGLSL = /* glsl */ `
float causticLayer(vec2 p, float t) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float f1 = 8.0;
  float f2 = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = hash22(i + g);
      o = 0.5 + 0.42 * sin(t + 6.2831 * o);
      float d = length(g + o - f);
      if (d < f1) { f2 = f1; f1 = d; }
      else if (d < f2) { f2 = d; }
    }
  }
  float e = f2 - f1;
  return pow(1.0 - smoothstep(0.0, 0.32, e), 3.0);
}
float caustics(vec2 p, float t) {
  vec2 w = vec2(vnoise(p * 0.35 + t * 0.05), vnoise(p * 0.35 - t * 0.04 + 7.0)) * 1.2;
  float a = causticLayer(p * 0.9 + w, t * 0.9);
  float b = causticLayer(p * 1.7 - w * 0.6 + 3.1, t * 1.3);
  return a * 0.65 + b * 0.45 + a * b * 0.8;
}
`;
