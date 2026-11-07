import {
  AdditiveBlending,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
} from 'three';
import { U } from './uniforms';
import { noiseGLSL } from '../shaders/common';

/**
 * Volumetrische Lichtstrahlen als zylindrisch ausgerichtete, additive Bänder.
 * Jedes Band ist entlang der Sonnenrichtung geneigt, wird nach unten breiter
 * und schwächer und flackert durch die Wellenbewegung an der Oberfläche.
 */
export class GodRays {
  readonly mesh: Mesh;

  constructor(count: number) {
    const base = new PlaneGeometry(1, 1, 1, 24);
    base.translate(0, -0.5, 0); // Oberkante bei y = 0
    const geo = new InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('uv', base.getAttribute('uv'));

    const offsets = new Float32Array(count * 2);
    const dims = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 5 + Math.pow(Math.random(), 0.7) * 70;
      offsets[i * 2] = Math.cos(a) * r;
      offsets[i * 2 + 1] = Math.sin(a) * r - 12;
      dims[i * 3] = 1.2 + Math.random() * 4.5; // Breite
      dims[i * 3 + 1] = 60 + Math.random() * 120; // Länge
      dims[i * 3 + 2] = Math.random() * 100; // Seed
    }
    geo.setAttribute('aOffset', new InstancedBufferAttribute(offsets, 2));
    geo.setAttribute('aDims', new InstancedBufferAttribute(dims, 3));
    geo.instanceCount = count;

    const mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: U.uTime,
        uCamPos: U.uCamPos,
        uSunDir: U.uSunDir,
        uZenith: U.uZenith,
        uRays: U.uRays,
        uFogDensity: U.uFogDensity,
      },
      vertexShader: /* glsl */ `
        attribute vec2 aOffset;
        attribute vec3 aDims;
        uniform vec3 uCamPos;
        uniform vec3 uSunDir;
        uniform float uTime;
        varying vec2 vUv;
        varying float vSeed;
        varying float vViewDist;
        varying float vAlong;
        void main() {
          vUv = uv;
          vSeed = aDims.z;
          vec3 axis = normalize(-uSunDir + vec3(0.0, 0.0, 0.0));
          // Die Bänder schwanken leicht mit der Oberfläche
          float sway = sin(uTime * 0.25 + aDims.z) * 0.6;
          vec3 top = vec3(aOffset.x + sway, 0.0, aOffset.y);
          float along = -position.y * aDims.y;
          vec3 center = top + axis * along;
          vec3 toCam = normalize(uCamPos - center);
          vec3 right = normalize(cross(axis, toCam));
          float width = aDims.x * (1.0 + (-position.y) * 1.8);
          vec3 world = center + right * position.x * width;
          vAlong = -position.y;
          vec4 mv = viewMatrix * vec4(world, 1.0);
          vViewDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uZenith;
        uniform float uRays;
        uniform float uFogDensity;
        varying vec2 vUv;
        varying float vSeed;
        varying float vViewDist;
        varying float vAlong;
        ${noiseGLSL}
        void main() {
          float x = vUv.x;
          float edge = pow(1.0 - abs(x - 0.5) * 2.0, 1.6);
          // feine Längsstreifen, die über die Zeit wandern
          float streak = vnoise(vec2(x * 7.0 + vSeed, uTime * 0.35 + vSeed))
                       * 0.7 + vnoise(vec2(x * 19.0 - vSeed, uTime * 0.6)) * 0.45;
          float flicker = 0.65 + 0.35 * vnoise(vec2(vSeed * 3.0, uTime * 0.8));
          float topFade = smoothstep(0.0, 0.04, vAlong);
          float lenFade = exp(-vAlong * 2.6) * (1.0 - smoothstep(0.75, 1.0, vAlong));
          float near = smoothstep(1.5, 9.0, vViewDist);
          float fog = exp(-uFogDensity * uFogDensity * vViewDist * vViewDist * 0.35);
          float a = edge * streak * flicker * topFade * lenFade * near * fog * uRays * 0.16;
          gl_FragColor = vec4(uZenith * 1.4 * a, 1.0);
        }
      `,
    });

    this.mesh = new Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  update(camY: number) {
    this.mesh.visible = U.uRays.value > 0.002 && camY > -260;
  }
}
