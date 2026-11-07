import {
  AdditiveBlending,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
} from 'three';
import { U } from './uniforms';

/**
 * Biolumineszenz-Funken in der Tiefe. Jeder Funke pulsiert in einem eigenen
 * Rhythmus. Der Mauszeiger wirkt wie eine Störung im Wasser: Funken in der Nähe
 * weichen aus und leuchten auf, schnelle Bewegungen lösen stärkere Blitze aus.
 */
export class Bioluminescence {
  readonly mesh: Mesh;

  constructor(count: number) {
    const base = new PlaneGeometry(1, 1);
    const geo = new InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('uv', base.getAttribute('uv'));

    const seeds = new Float32Array(count * 4);
    const colors = new Float32Array(count * 3);
    const palette = [
      [0.25, 0.85, 1.0], // Cyan
      [0.2, 0.45, 1.0], // Blau
      [0.3, 1.0, 0.7], // Türkisgrün
      [0.55, 0.65, 1.0], // Lavendelblau
    ];
    for (let i = 0; i < count; i++) {
      seeds[i * 4] = Math.random();
      seeds[i * 4 + 1] = Math.random();
      seeds[i * 4 + 2] = Math.random();
      seeds[i * 4 + 3] = Math.random();
      const p = palette[Math.random() < 0.6 ? 0 : Math.floor(Math.random() * palette.length)];
      colors.set(p, i * 3);
    }
    geo.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 4));
    geo.setAttribute('aColor', new InstancedBufferAttribute(colors, 3));
    geo.instanceCount = count;

    const mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: U.uTime,
        uCamPos: U.uCamPos,
        uBiolum: U.uBiolum,
        uMouse: U.uMouse,
        uMouseExcite: U.uMouseExcite,
        uPixelAngle: U.uPixelAngle,
        uMotion: U.uMotion,
        uBox: { value: new Vector3(36, 30, 36) },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        attribute vec3 aColor;
        uniform float uTime;
        uniform vec3 uCamPos;
        uniform vec3 uBox;
        uniform vec3 uMouse;
        uniform float uMouseExcite;
        uniform float uPixelAngle;
        uniform float uMotion;
        varying vec2 vUv;
        varying vec3 vColor;
        varying float vGlow;
        void main() {
          vUv = uv;
          vColor = aColor;
          float t = uTime * uMotion;
          vec3 base = aSeed.xyz * uBox;
          vec3 drift = vec3(sin(t * 0.13 + aSeed.w * 30.0), sin(t * 0.17 + aSeed.x * 20.0), cos(t * 0.11 + aSeed.y * 25.0)) * 0.9;
          drift += vec3(0.08, 0.02, 0.05) * t;
          vec3 rel = mod(base + drift - uCamPos, uBox) - uBox * 0.5;
          vec3 world = uCamPos + rel;

          // Reaktion auf den Mauszeiger
          vec3 toM = world - uMouse;
          float dM = length(toM);
          float influence = 1.0 - smoothstep(0.0, 4.5, dM);
          world += normalize(toM + 1e-4) * influence * influence * 1.6;

          // Eigener Puls: kurzes Aufblitzen, langes Nachglühen
          float phase = fract(t * (0.05 + aSeed.w * 0.12) + aSeed.x);
          float pulse = exp(-phase * 7.0) * step(0.45, aSeed.z) + 0.12;
          vGlow = pulse + influence * (1.2 + uMouseExcite * 2.5);

          vec4 mv = viewMatrix * vec4(world, 1.0);
          float dist = -mv.z;
          float size = mix(0.05, 0.14, aSeed.y) * (1.0 + influence * 0.8);
          float minSize = dist * uPixelAngle * 2.2;
          float finalSize = max(size, minSize);
          vGlow *= pow(size / finalSize, 1.2);
          vGlow *= smoothstep(0.4, 1.5, dist) * exp(-dist * 0.045);
          mv.xy += position.xy * finalSize * 4.0;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uBiolum;
        varying vec2 vUv;
        varying vec3 vColor;
        varying float vGlow;
        void main() {
          float r = length(vUv - 0.5) * 2.0;
          // heller Kern + weiter Halo (der Halo trägt zum Bloom bei)
          float core = exp(-r * r * 60.0);
          float halo = exp(-r * r * 6.0) * 0.18;
          float a = (core * 2.2 + halo) * vGlow * uBiolum;
          if (a < 0.002) discard;
          gl_FragColor = vec4(vColor * a, 1.0);
        }
      `,
    });

    this.mesh = new Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
  }

  update() {
    this.mesh.visible = U.uBiolum.value > 0.002;
  }
}
