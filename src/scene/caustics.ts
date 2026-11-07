import type { Material, MeshStandardMaterial, MeshPhysicalMaterial, WebGLProgramParametersWithUniforms } from 'three';
import { U } from './uniforms';
import { causticsGLSL, noiseGLSL } from '../shaders/common';

type PatchableMaterial = MeshStandardMaterial | MeshPhysicalMaterial;

/**
 * Erweitert ein Standard-Material um:
 *  - Caustics von oben (nur nahe der Oberfläche, über uRays gesteuert)
 *  - weiches Unterwasser-Streulicht von oben (Top-Light)
 * Funktioniert mit Skinning und Instancing.
 */
export function patchUnderwater(material: Material, opts: { causticScale?: number } = {}) {
  const m = material as PatchableMaterial;
  if (!('isMeshStandardMaterial' in m) || m.userData.underwaterPatched) return;
  m.userData.underwaterPatched = true;
  const scale = (opts.causticScale ?? 0.55).toFixed(3);

  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer) => {
    prev?.call(m, shader, renderer);
    shader.uniforms.uTime = U.uTime;
    shader.uniforms.uRays = U.uRays;
    shader.uniforms.uSun = U.uSun;
    shader.uniforms.uZenith = U.uZenith;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vUwWorld;
         varying vec3 vUwNormal;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
         vec4 uwP = vec4(transformed, 1.0);
         vec3 uwN = objectNormal;
         #ifdef USE_INSTANCING
           uwP = instanceMatrix * uwP;
           uwN = mat3(instanceMatrix) * uwN;
         #endif
         vUwWorld = (modelMatrix * uwP).xyz;
         vUwNormal = normalize(mat3(modelMatrix) * uwN);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uTime;
         uniform float uRays;
         uniform float uSun;
         uniform vec3 uZenith;
         varying vec3 vUwWorld;
         varying vec3 vUwNormal;
         ${noiseGLSL}
         ${causticsGLSL}`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
           float up = max(dot(normalize(vUwNormal), vec3(0.0, 1.0, 0.0)), 0.0);
           float c = 0.0;
           if (uRays > 0.001) {
             c = caustics(vUwWorld.xz * ${scale} + vUwWorld.y * 0.15, uTime * 0.9);
           }
           vec3 causticLight = uZenith * c * uRays * (0.25 + up * 1.2) * 1.4;
           vec3 topLight = uZenith * uSun * up * 0.18;
           outgoingLight += diffuseColor.rgb * (causticLight + topLight);
         }
         #include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => 'underwater-' + scale;
  m.needsUpdate = true;
}
