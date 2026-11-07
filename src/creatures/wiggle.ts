import type { Material, WebGLProgramParametersWithUniforms } from 'three';
import { U } from '../scene/uniforms';

export interface WiggleParams {
  amplitude: number;
  frequency: number;
  speed: number;
  /** Länge des Modells entlang X (lokal), für die Gewichtung zum Schwanz hin */
  length: number;
}

/**
 * Prozedurale Schwimmbewegung im Vertex-Shader: eine Welle läuft vom Kopf (+X)
 * zum Schwanz (-X), die Auslenkung wächst zum Schwanz hin. Bei Instancing
 * bekommt jede Instanz eine eigene Phase.
 */
export function applyWiggle(material: Material, p: WiggleParams) {
  const prev = material.onBeforeCompile;
  const uSwim = { value: 1 };
  material.userData.uSwim = uSwim;
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer) => {
    prev?.call(material, shader, renderer);
    shader.uniforms.uTime = U.uTime;
    shader.uniforms.uSwim = uSwim;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uTime;
         uniform float uSwim;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         {
           float wPhase = 0.0;
           #ifdef USE_INSTANCING
             wPhase = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 2.3 + instanceMatrix[3].y;
           #endif
           float L = ${p.length.toFixed(4)};
           float along = clamp((L * 0.35 - transformed.x) / L, 0.0, 1.2);
           float w = sin(transformed.x / L * ${p.frequency.toFixed(3)} * 6.2831 + uTime * ${p.speed.toFixed(3)} * (0.6 + 0.4 * uSwim) + wPhase);
           transformed.z += w * along * along * L * ${p.amplitude.toFixed(4)} * (0.5 + 0.5 * uSwim);
         }`,
      );
  };
  const prevKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => (prevKey ? prevKey() : '') + `wiggle-${p.amplitude}-${p.frequency}-${p.speed}-${p.length}`;
  material.needsUpdate = true;
  return uSwim;
}
