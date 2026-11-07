import { Color } from 'three';

/**
 * Tiefenabhängige Umgebungsparameter. Alle Kurven werden über die reale Tiefe
 * definiert, nicht über die Scrollposition. So bleibt das Verhalten physikalisch
 * plausibel, egal wie die Scroll-Verteilung später angepasst wird.
 */

type ColorKey = [number, string];

function sampleColor(keys: ColorKey[], depth: number, out: Color): Color {
  if (depth <= keys[0][0]) return out.set(keys[0][1]);
  for (let i = 0; i < keys.length - 1; i++) {
    const [d0, c0] = keys[i];
    const [d1, c1] = keys[i + 1];
    if (depth <= d1) {
      // logarithmische Interpolation: die Farbe kippt oben schnell, unten langsam
      const t = (Math.log1p(depth) - Math.log1p(d0)) / (Math.log1p(d1) - Math.log1p(d0));
      return out.set(c0).lerp(tmp.set(c1), smooth(t));
    }
  }
  return out.set(keys[keys.length - 1][1]);
}

const tmp = new Color();
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Wasserfarbe horizontal (Nebel, Hintergrund). Türkis > Tiefblau > Schwarz. */
const WATER: ColorKey[] = [
  [0, '#2a9dbb'],
  [12, '#1a86a8'],
  [45, '#0f6290'],
  [110, '#0a426f'],
  [220, '#062a4d'],
  [450, '#03152c'],
  [800, '#010a17'],
  [1400, '#00040a'],
  [3000, '#000205'],
  [11000, '#000103'],
];

/** Farbe nach oben (Richtung Licht). */
const ZENITH: ColorKey[] = [
  [0, '#9fe8f5'],
  [10, '#5cc6e0'],
  [40, '#2a92bd'],
  [120, '#11598c'],
  [260, '#07325c'],
  [600, '#031630'],
  [1200, '#010711'],
  [3000, '#000306'],
  [11000, '#000103'],
];

export interface EnvState {
  depth: number;
  water: Color;
  zenith: Color;
  /** Relative Sonnenlichtmenge 0..1 */
  sun: number;
  /** Stärke der Lichtstrahlen und Caustics 0..1 */
  rays: number;
  /** Sichtweite-Nebeldichte (FogExp2) */
  fogDensity: number;
  /** Stärke der Tauchboot-Scheinwerfer 0..1 */
  lamps: number;
  /** Sichtbarkeit der Biolumineszenz 0..1 */
  biolum: number;
  /** Physikalische Anzeigen */
  pressureBar: number;
  temperatureC: number;
  lightPercent: number;
}

export function createEnvState(): EnvState {
  return {
    depth: 0,
    water: new Color(),
    zenith: new Color(),
    sun: 1,
    rays: 1,
    fogDensity: 0.02,
    lamps: 0,
    biolum: 0,
    pressureBar: 1,
    temperatureC: 28,
    lightPercent: 100,
  };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const ramp = (v: number, a: number, b: number) => smooth(clamp01((v - a) / (b - a)));

/** Grobes Temperaturprofil im Westpazifik (Marianen). */
function temperature(depth: number): number {
  if (depth < 60) return 28.5 - depth * 0.02;
  if (depth < 1000) {
    const t = (depth - 60) / 940;
    return 27.3 - (27.3 - 4.3) * Math.pow(t, 0.55);
  }
  if (depth < 4000) return 4.3 - ((depth - 1000) / 3000) * 2.8;
  // unterhalb von 4000 m bleibt es nahe 1,5 °C, ganz unten steigt es durch Kompression leicht an
  return 1.5 + ((depth - 4000) / 7000) * 0.9;
}

export function updateEnv(env: EnvState, depth: number): EnvState {
  env.depth = depth;
  sampleColor(WATER, depth, env.water);
  sampleColor(ZENITH, depth, env.zenith);

  env.lightPercent = 100 * Math.exp(-depth / 43);
  env.sun = Math.exp(-depth / 70);
  env.rays = 1 - ramp(depth, 25, 170);
  // Sichtweite: oben klar (~45 m), in der Dämmerzone trüber, unten nur Lampenreichweite
  env.fogDensity = 0.016 + ramp(depth, 0, 400) * 0.02 - ramp(depth, 700, 2000) * 0.012;
  env.lamps = ramp(depth, 650, 1300);
  env.biolum = ramp(depth, 280, 1100);
  env.pressureBar = 1.013 + depth * 0.1013;
  env.temperatureC = temperature(depth);
  return env;
}
