import { BackSide, Mesh, ShaderMaterial, SphereGeometry } from 'three';
import { U } from './uniforms';
import { noiseGLSL } from '../shaders/common';

/**
 * Riesige Kugel um die Kamera: vertikaler Farbverlauf des Wassers.
 * Oben heller (Licht von der Oberfläche), unten ins Dunkle abfallend,
 * dazu ein weicher Lichtschleier in Sonnenrichtung.
 */
export class Backdrop {
  readonly mesh: Mesh;

  constructor() {
    const mat = new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      uniforms: {
        uWater: U.uWater,
        uZenith: U.uZenith,
        uSunDir: U.uSunDir,
        uSun: U.uSun,
        uCamPos: U.uCamPos,
        uTime: U.uTime,
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uWater;
        uniform vec3 uZenith;
        uniform vec3 uSunDir;
        uniform float uSun;
        uniform float uTime;
        varying vec3 vDir;
        ${noiseGLSL}
        void main() {
          vec3 d = normalize(vDir);
          float up = max(d.y, 0.0);
          float down = max(-d.y, 0.0);
          vec3 col = mix(uWater, uZenith, pow(up, 0.75));
          col = mix(col, uWater * 0.32, pow(down, 0.6));
          // weicher Lichtschleier Richtung Sonne
          float s = max(dot(d, uSunDir), 0.0);
          col += uZenith * (pow(s, 6.0) * 0.35 + pow(s, 40.0) * 0.6) * uSun;
          // ganz leichte Struktur gegen Banding
          col += (hash12(gl_FragCoord.xy + fract(uTime) * 100.0) - 0.5) / 255.0;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.mesh = new Mesh(new SphereGeometry(500, 48, 24), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
  }

  update() {
    this.mesh.position.copy(U.uCamPos.value);
  }
}
