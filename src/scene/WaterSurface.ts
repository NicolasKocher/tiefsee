import { DoubleSide, Mesh, PlaneGeometry, ShaderMaterial } from 'three';
import { U } from './uniforms';
import { noiseGLSL } from '../shaders/common';

/**
 * Wasseroberfläche von unten gesehen.
 * Physikalisch motiviert: Innerhalb des Snellius-Fensters (ca. 48,6° zur Senkrechten)
 * sieht man durch die Oberfläche den Himmel, außerhalb spiegelt sich die Tiefe
 * durch Totalreflexion. Die Wellen verzerren beides.
 */
export class WaterSurface {
  readonly mesh: Mesh;

  constructor() {
    const geo = new PlaneGeometry(600, 600, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new ShaderMaterial({
      side: DoubleSide,
      transparent: false,
      depthWrite: true,
      uniforms: {
        uTime: U.uTime,
        uCamPos: U.uCamPos,
        uWater: U.uWater,
        uZenith: U.uZenith,
        uSunDir: U.uSunDir,
        uFogDensity: U.uFogDensity,
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uCamPos;
        uniform vec3 uWater;
        uniform vec3 uZenith;
        uniform vec3 uSunDir;
        uniform float uFogDensity;
        varying vec3 vWorld;
        ${noiseGLSL}

        float waves(vec2 p) {
          float t = uTime;
          float h = 0.0;
          h += sin(dot(p, vec2(0.82, 0.57)) * 1.3 + t * 1.1) * 0.05;
          h += sin(dot(p, vec2(-0.45, 0.89)) * 2.2 + t * 1.5) * 0.03;
          h += sin(dot(p, vec2(0.96, -0.28)) * 3.7 + t * 2.1) * 0.015;
          h += (fbm(p * 0.9 + vec2(t * 0.18, t * 0.11)) - 0.5) * 0.22;
          h += (vnoise(p * 4.1 - t * 0.6) - 0.5) * 0.025;
          return h;
        }

        void main() {
          vec2 p = vWorld.xz;
          float e = 0.08;
          float h = waves(p);
          float hx = waves(p + vec2(e, 0.0));
          float hz = waves(p + vec2(0.0, e));
          vec3 n = normalize(vec3(-(hx - h) / e, 1.0, -(hz - h) / e));

          vec3 I = normalize(vWorld - uCamPos);   // Blick nach oben
          vec3 nd = -n;                            // Normale zum Betrachter (nach unten)
          vec3 T = refract(I, nd, 1.333);
          float cosI = clamp(dot(I, n), 0.0, 1.0);

          // Snellius-Fenster mit weicher Kante (kritischer Winkel ~48.6°)
          float window = smoothstep(0.62, 0.70, cosI) * step(0.0001, dot(T, T));

          // Himmel durch das Fenster
          vec3 Td = normalize(T + vec3(0.0, 0.0001, 0.0));
          vec3 skyHorizon = vec3(1.25, 1.45, 1.5);
          vec3 skyTop = vec3(0.55, 0.9, 1.35);
          vec3 sky = mix(skyHorizon, skyTop, clamp(Td.y, 0.0, 1.0)) * 0.95;
          float sunAmt = max(dot(Td, uSunDir), 0.0);
          sky += vec3(1.0, 0.95, 0.85) * (pow(sunAmt, 900.0) * 14.0 + pow(sunAmt, 60.0) * 1.2);
          // Fresnel: zur Fensterkante hin weniger Transmission
          float fres = pow(1.0 - cosI, 3.0);
          vec3 through = mix(sky, uZenith * 1.6, fres * 0.6);

          // Totalreflexion: Spiegelung der Tiefe, leicht gewellt
          vec3 R = reflect(I, nd);
          float rDown = clamp(-R.y, 0.0, 1.0);
          vec3 mirror = mix(uWater * 0.75, uWater * 0.3, pow(rDown, 0.5));
          mirror += uZenith * 0.15 * (vnoise(p * 1.5 + uTime * 0.3));

          vec3 col = mix(mirror, through, window);

          // Funkeln an Wellenkämmen
          float sparkle = pow(max(dot(normalize(reflect(-uSunDir, n)), -I), 0.0), 300.0);
          col += vec3(1.0) * sparkle * 2.0 * window;

          // Unterwasser-Nebel
          float dist = length(vWorld - uCamPos);
          float fog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist * 0.7);
          // Nebelfarbe wie der Hintergrund in dieser Blickrichtung, sonst entsteht eine Horizontkante
          vec3 bg = mix(uWater, uZenith, pow(max(I.y, 0.0), 0.75));
          col = mix(col, bg, fog);
          // zum Rand der Fläche hin vollständig im Hintergrund auflösen
          col = mix(col, bg, smoothstep(140.0, 260.0, dist));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.mesh = new Mesh(geo, mat);
    this.mesh.frustumCulled = false;
  }

  update(camY: number) {
    const cam = U.uCamPos.value;
    this.mesh.position.set(cam.x, 0, cam.z);
    this.mesh.visible = camY > -160;
  }
}
