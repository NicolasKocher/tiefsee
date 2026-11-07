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
import { causticsGLSL, noiseGLSL } from '../shaders/common';

/**
 * Marine Snow: tausende instanzierte Billboards in einer Box, die sich um die
 * Kamera wickelt (modulo). Die Partikel sind in der Welt fixiert, die Kamera
 * taucht durch sie hindurch. Beleuchtung: Restlicht von oben, Caustics an der
 * Oberfläche, in der Tiefe nur der Lichtkegel der Scheinwerfer.
 * Unscharfe Nahpartikel imitieren das Bokeh einer Unterwasserkamera.
 */
export class MarineSnow {
  readonly mesh: Mesh;
  private material: ShaderMaterial;

  constructor(count: number) {
    const base = new PlaneGeometry(1, 1);
    const geo = new InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('uv', base.getAttribute('uv'));

    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      seeds[i * 4] = Math.random();
      seeds[i * 4 + 1] = Math.random();
      seeds[i * 4 + 2] = Math.random();
      // Größenverteilung: viele kleine, wenige größere Flocken
      seeds[i * 4 + 3] = Math.pow(Math.random(), 3.0);
    }
    geo.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 4));
    geo.instanceCount = count;

    this.material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: U.uTime,
        uCamPos: U.uCamPos,
        uZenith: U.uZenith,
        uWater: U.uWater,
        uSun: U.uSun,
        uRays: U.uRays,
        uLamp: U.uLamp,
        uFogDensity: U.uFogDensity,
        uPixelAngle: U.uPixelAngle,
        uMotion: U.uMotion,
        uBox: { value: new Vector3(46, 46, 46) },
        uFocus: { value: 12 },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uTime;
        uniform vec3 uCamPos;
        uniform vec3 uBox;
        uniform float uPixelAngle;
        uniform float uFocus;
        uniform float uMotion;
        varying vec2 vUv;
        varying float vAlpha;
        varying float vBlur;
        varying vec3 vWorld;
        varying float vViewDist;
        varying float vLampCone;
        void main() {
          vUv = uv;
          float t = uTime * uMotion;
          vec3 base = aSeed.xyz * uBox;
          // Strömung + langsames Absinken + individuelles Taumeln
          vec3 drift = vec3(0.22, -0.05, 0.08) * t;
          drift += vec3(sin(t * 0.3 + aSeed.x * 40.0), cos(t * 0.25 + aSeed.y * 30.0), sin(t * 0.2 + aSeed.z * 20.0)) * 0.35;
          vec3 rel = mod(base + drift - uCamPos, uBox) - uBox * 0.5;
          vec3 world = uCamPos + rel;
          vWorld = world;

          vec4 mv = viewMatrix * vec4(world, 1.0);
          float dist = -mv.z;
          vViewDist = dist;
          float size = mix(0.018, 0.09, aSeed.w);
          // Bokeh: Abstand vom Fokus vergrößert die Partikel, Helligkeit wird verteilt
          float coc = clamp(abs(dist - uFocus) / max(dist, 0.5) * 0.9, 0.0, 1.0);
          float blurSize = size + coc * 0.045 * min(dist, 6.0) / 6.0;
          float minSize = dist * uPixelAngle * 1.8;
          float finalSize = max(blurSize, minSize);
          vAlpha = pow(size / finalSize, 1.4);
          vBlur = clamp(coc * 1.5, 0.0, 1.0);
          // Lichtkegel der Scheinwerfer im View-Space (Kamera schaut entlang -Z)
          vec3 vdir = normalize(mv.xyz);
          vLampCone = smoothstep(0.86, 0.985, dot(vdir, normalize(vec3(0.0, -0.06, -1.0))));

          mv.xy += position.xy * finalSize;
          gl_Position = projectionMatrix * mv;
          if (dist < 0.15) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uZenith;
        uniform vec3 uWater;
        uniform float uSun;
        uniform float uRays;
        uniform float uLamp;
        uniform float uTime;
        uniform float uFogDensity;
        varying vec2 vUv;
        varying float vAlpha;
        varying float vBlur;
        varying vec3 vWorld;
        varying float vViewDist;
        varying float vLampCone;
        ${noiseGLSL}
        ${causticsGLSL}
        void main() {
          vec2 c = vUv - 0.5;
          float r = length(c) * 2.0;
          // scharf: weicher Punkt, unscharf: Scheibe mit hellerem Rand (Bokeh)
          float sharp = exp(-r * r * 5.0);
          float disc = smoothstep(1.0, 0.82, r) * (0.55 + 0.45 * smoothstep(0.4, 0.95, r));
          float shape = mix(sharp, disc * 0.35, vBlur);
          if (shape < 0.002) discard;

          float sunLight = 0.35 * uSun + 0.09;
          float caust = uRays > 0.01 ? caustics(vWorld.xz * 0.55 + vWorld.y * 0.15, uTime * 0.9) * uRays : 0.0;
          vec3 col = uZenith * (sunLight + caust * 1.6);
          // Scheinwerfer: Streulicht im Kegel, quadratischer Abfall
          float lamp = uLamp * vLampCone * 1.15 / (1.0 + 0.05 * vViewDist * vViewDist);
          col += vec3(0.85, 0.92, 1.0) * lamp;

          float fog = exp(-uFogDensity * uFogDensity * vViewDist * vViewDist * 0.6);
          float nearFade = smoothstep(0.15, 0.8, vViewDist);
          float a = shape * vAlpha * fog * nearFade;
          gl_FragColor = vec4(col * a * 1.5, 1.0);
        }
      `,
    });

    this.mesh = new Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }

  setFocus(distance: number) {
    this.material.uniforms.uFocus.value = distance;
  }
}
