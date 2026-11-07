import { Color, Vector3 } from 'three';

/**
 * Global geteilte Uniforms. Materialien referenzieren dieselben Objekte,
 * dadurch reicht ein Update pro Frame für alle Shader.
 */
export const U = {
  uTime: { value: 0 },
  uCamPos: { value: new Vector3() },
  uCamDir: { value: new Vector3(0, 0, -1) },
  uWater: { value: new Color() },
  uZenith: { value: new Color() },
  uSunDir: { value: new Vector3(0.25, 1, -0.35).normalize() },
  uSun: { value: 1 },
  uRays: { value: 1 },
  uLamp: { value: 0 },
  uBiolum: { value: 0 },
  uFogDensity: { value: 0.02 },
  uPixelAngle: { value: 0.001 },
  uMouse: { value: new Vector3(0, 0, -10) },
  uMouseExcite: { value: 0 },
  uMotion: { value: 1 },
};
