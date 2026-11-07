import { Effect, BlendFunction } from 'postprocessing';
import { Uniform } from 'three';

/**
 * Leichte Lichtbrechung durch Wasserbewegung: Das Bild "atmet" minimal.
 * Nahe der Oberfläche stärker, in der Tiefe kaum noch spürbar.
 */
export class WaterDistortionEffect extends Effect {
  constructor() {
    super(
      'WaterDistortionEffect',
      /* glsl */ `
        uniform float uTime;
        uniform float uStrength;
        void mainUv(inout vec2 uv) {
          vec2 p = uv * vec2(6.0, 4.0);
          vec2 o = vec2(
            sin(p.y * 1.7 + uTime * 0.9) + sin(p.x * 2.3 - uTime * 0.6) * 0.5,
            cos(p.x * 1.3 + uTime * 0.7) + cos(p.y * 2.9 + uTime * 0.5) * 0.5
          );
          uv += o * uStrength * 0.0016;
        }
      `,
      {
        uniforms: new Map<string, Uniform>([
          ['uTime', new Uniform(0)],
          ['uStrength', new Uniform(1)],
        ]),
      },
    );
  }
  set time(v: number) {
    this.uniforms.get('uTime')!.value = v;
  }
  set strength(v: number) {
    this.uniforms.get('uStrength')!.value = v;
  }
}

/**
 * Filmkorn mit helligkeitsabhängiger Stärke (wie bei echtem Sensor-Rauschen:
 * in mittleren Tönen sichtbar, in Tiefschwarz kaum). Läuft nach dem Tonemapping.
 */
export class FilmGrainEffect extends Effect {
  constructor(intensity = 0.05) {
    super(
      'FilmGrainEffect',
      /* glsl */ `
        uniform float uTime;
        uniform float uIntensity;
        float grainHash(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }
        void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
          vec2 px = uv * resolution;
          float t = floor(uTime * 24.0);
          float n = grainHash(px + t * 17.0) + grainHash(px * 1.37 - t * 7.0) - 1.0;
          float l = dot(inputColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          float amt = uIntensity * (0.25 + 0.75 * smoothstep(0.0, 0.25, l)) * (1.0 - smoothstep(0.6, 1.0, l) * 0.6);
          outputColor = vec4(inputColor.rgb + n * amt, inputColor.a);
        }
      `,
      {
        blendFunction: BlendFunction.NORMAL,
        uniforms: new Map<string, Uniform>([
          ['uTime', new Uniform(0)],
          ['uIntensity', new Uniform(intensity)],
        ]),
      },
    );
  }
  set time(v: number) {
    this.uniforms.get('uTime')!.value = v;
  }
}
