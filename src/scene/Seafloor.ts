import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
} from 'three';
import { fbm3, ridged3 } from '../core/noise';
import { FLOOR_Y, worldYForDepth } from '../core/depthMap';
import { noiseGLSL } from '../shaders/common';
import type { WebGLProgramParametersWithUniforms } from 'three';

/** Tiefe, in der die Tiefsee-Ebene endet und der Graben beginnt. */
export const PLAIN_DEPTH = 5850;

/**
 * Prozedurales Terrain:
 *  1) Abyssale Ebene (Sediment) mit Grabenkante vor der Kamera
 *  2) Grabenwand, an der die Kamera durch die Hadal-Zone hinabgleitet
 *  3) Grund des Challenger Deep
 * Sichtbar wird alles nur im Lichtkegel der Scheinwerfer.
 */
export class Seafloor {
  readonly group = new Group();
  readonly plainY: number;
  private wall: Mesh | null = null;
  private floor: Mesh | null = null;
  private built = false;

  constructor(private detail: number) {
    this.plainY = worldYForDepth(PLAIN_DEPTH);
    this.group.visible = false;
  }

  /**
   * Erzeugt die Geometrie. Wird im Leerlauf nach dem ersten Frame aufgerufen
   * (oder spätestens, wenn die Kamera sich nähert), damit der Start schnell bleibt.
   */
  build() {
    if (this.built) return;
    this.built = true;
    const sediment = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.96,
      metalness: 0,
    });
    patchTerrainDetail(sediment);
    this.wall = new Mesh(this.buildBank(this.detail), sediment);
    this.floor = new Mesh(this.buildFloor(this.detail), sediment);
    this.group.add(this.wall, this.floor);
  }

  /** Ebene + Kante + Wand als ein zusammenhängendes Gitter entlang eines Profils. */
  private buildBank(detail: number): BufferGeometry {
    const plainY = this.plainY;
    const edgeZ = -10;
    const wallBottom = FLOOR_Y - 2;
    const wallHeight = plainY - wallBottom;
    const plainLength = 180;

    // Profil in (z, y): von weit hinten über die Ebene zur Kante, dann die Wand hinab
    const profile: { z: number; y: number; wall: number }[] = [];
    const plainSteps = Math.round(90 * detail);
    for (let i = 0; i <= plainSteps; i++) {
      const t = i / plainSteps;
      profile.push({ z: edgeZ - plainLength * Math.pow(1 - t, 1.6), y: plainY, wall: 0 });
    }
    // abgerundete Kante
    const edgeSteps = Math.round(14 * detail) + 4;
    for (let i = 1; i <= edgeSteps; i++) {
      const a = (i / edgeSteps) * (Math.PI / 2);
      profile.push({ z: edgeZ + Math.sin(a) * 3, y: plainY - (1 - Math.cos(a)) * 4, wall: i / edgeSteps });
    }
    const wallSteps = Math.round(420 * detail);
    for (let i = 1; i <= wallSteps; i++) {
      const t = i / wallSteps;
      const y = plainY - 4 - t * (wallHeight - 4);
      // leicht überhängende und zurückweichende Abschnitte
      const z = edgeZ + 3 - 13 * Math.sqrt(t) + Math.sin(t * 9.0) * 2.0;
      profile.push({ z, y, wall: 1 });
    }

    const xSteps = Math.round(150 * detail);
    const width = 150;
    const cols = xSteps + 1;
    const rows = profile.length;
    const pos = new Float32Array(cols * rows * 3);
    const col = new Float32Array(cols * rows * 3);
    const sedimentColor = new Color('#8f8577');
    const rockColor = new Color('#3b3936');
    const c = new Color();

    for (let r = 0; r < rows; r++) {
      const p = profile[r];
      for (let k = 0; k < cols; k++) {
        const x = (k / xSteps - 0.5) * width;
        let px = x;
        let py = p.y;
        let pz = p.z;
        if (p.wall < 0.5) {
          // Sediment: sanfte Wellen und kleine Hügel
          py += (fbm3(x * 0.05, 0, pz * 0.05) - 0.5) * 3.0 + (fbm3(x * 0.4, 3, pz * 0.4) - 0.5) * 0.35;
        } else {
          // Fels: grobe Rippen + scharfe Brüche, Verschiebung Richtung Kamera (+z)
          const n = ridged3(x * 0.08, py * 0.06, 1.7) * 6.0 + (fbm3(x * 0.5, py * 0.5, 4.2) - 0.5) * 2.6 + (fbm3(x * 1.4, py * 1.4, 7.7) - 0.5) * 0.6;
          pz += n - 3.0;
          px += (fbm3(py * 0.05, 9, x * 0.05) - 0.5) * 3.0;
        }
        // Grabenkante verläuft schräg: rechts näher, links verliert sie sich im Dunkel
        pz += x * 0.85;
        const i3 = (r * cols + k) * 3;
        pos[i3] = px;
        pos[i3 + 1] = py;
        pos[i3 + 2] = pz;
        const v = fbm3(px * 0.2, py * 0.2, pz * 0.2);
        c.copy(sedimentColor).lerp(rockColor, Math.min(1, p.wall + (v - 0.5) * 0.4)).multiplyScalar(0.75 + v * 0.5);
        col[i3] = c.r;
        col[i3 + 1] = c.g;
        col[i3 + 2] = c.b;
      }
    }

    const index: number[] = [];
    for (let r = 0; r < rows - 1; r++) {
      for (let k = 0; k < cols - 1; k++) {
        const a = r * cols + k;
        const b = a + 1;
        const d = a + cols;
        const e = d + 1;
        index.push(a, d, b, b, d, e);
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('color', new BufferAttribute(col, 3));
    geo.setIndex(index);
    // Wicklung (a, d, b) ergibt Normalen nach oben (Ebene) bzw. zur Kamera (Wand)
    geo.computeVertexNormals();
    return geo;
  }

  private buildFloor(detail: number): BufferGeometry {
    const seg = Math.round(160 * detail);
    const geo = new PlaneGeometry(120, 120, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.getAttribute('position') as BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    const base = new Color('#958b7d');
    const dark = new Color('#4a4640');
    const c = new Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, FLOOR_Y + floorNoise(x, z));
      const v = fbm3(x * 0.15, 5, z * 0.15);
      c.copy(base).lerp(dark, v).multiplyScalar(0.8 + v * 0.4);
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new BufferAttribute(col, 3));
    geo.computeVertexNormals();
    return geo;
  }

  /** Höhe der Sediment-Ebene bzw. des Grabengrunds an (x, z) */
  heightAt(kind: 'plain' | 'floor', x: number, z: number): number {
    if (kind === 'plain') {
      return this.plainY + (fbm3(x * 0.05, 0, z * 0.05) - 0.5) * 3.0 + (fbm3(x * 0.4, 3, z * 0.4) - 0.5) * 0.35;
    }
    return FLOOR_Y + floorNoise(x, z);
  }

  update(camY: number) {
    // Sichtbar ab kurz vor der Ebene
    const near = camY < this.plainY + 60;
    if (near) this.build();
    this.group.visible = near;
    if (this.floor) this.floor.visible = camY < FLOOR_Y + 90;
  }
}

function floorNoise(x: number, z: number): number {
  return (
    (fbm3(x * 0.04, 0, z * 0.04) - 0.5) * 3.5 +
    (fbm3(x * 0.3, 1, z * 0.3) - 0.5) * 0.5 +
    (fbm3(x * 1.6, 2, z * 1.6) - 0.5) * 0.08
  );
}

/**
 * Feine Oberflächendetails im Fragment-Shader, unabhängig von der Gitterauflösung:
 * Sediment mit Rippeln, Spuren und Manganknollen, Fels mit Rissen und Kanten.
 * Bump-Mapping über Bildschirm-Ableitungen (ohne Tangenten, ohne Texturen).
 */
function patchTerrainDetail(m: MeshStandardMaterial) {
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vTW;
        varying vec3 vTN;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vTW = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vTN = normalize(mat3(modelMatrix) * objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vTW;
         varying vec3 vTN;
         ${noiseGLSL}
         float terrainHeight(out float nodule, out float rockAmt) {
           float flat01 = smoothstep(0.55, 0.85, abs(vTN.y));
           rockAmt = 1.0 - flat01;
           vec2 pf = vTW.xz;
           vec2 pw = vec2(vTW.x + vTW.z * 0.6, vTW.y);
           // Sediment: weiche Rippel, Wurmspuren, Knollen
           float rip = sin(pf.x * 2.1 + fbm(pf * 0.4) * 5.0) * 0.5 + 0.5;
           float sed = fbm(pf * 0.9) * 0.6 + rip * 0.12 + vnoise(pf * 9.0) * 0.06;
           float nod = smoothstep(0.78, 0.86, vnoise(pf * 3.3 + 11.0)) * smoothstep(0.35, 0.6, fbm(pf * 0.15));
           nodule = nod * flat01;
           sed += nod * 0.5;
           // Fels: Kanten und Risse
           // Fels: grobe Blöcke, horizontale Schichtung, feine Körnung
           float blocks = fbm(pw * vec2(0.35, 0.6));
           float strata = sin(vTW.y * 0.9 + fbm(pw * 0.2) * 3.0) * 0.5 + 0.5;
           float r1 = 1.0 - abs(vnoise(pw * vec2(0.6, 1.1)) * 2.0 - 1.0);
           float rock = blocks * 0.6 + strata * 0.06 + r1 * r1 * r1 * 0.12 + fbm(pw * 3.0) * 0.25 + vnoise(pw * 14.0) * 0.08;
           return mix(sed, rock, rockAmt);
         }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
         float tNod; float tRock;
         float tH = terrainHeight(tNod, tRock);
         {
           vec2 dH = vec2(dFdx(tH), dFdy(tH)) * mix(0.3, 0.8, tRock);
           vec3 sx = dFdx(-vViewPosition);
           vec3 sy = dFdy(-vViewPosition);
           vec3 R1 = cross(sy, normal);
           vec3 R2 = cross(normal, sx);
           float det = dot(sx, R1) * faceDirection;
           vec3 grad = sign(det) * (dH.x * R1 + dH.y * R2);
           normal = normalize(abs(det) * normal - grad);
         }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         {
           float nN; float nR;
           float h = terrainHeight(nN, nR);
           diffuseColor.rgb *= 0.72 + h * 0.5;
           diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.045, 0.04), nN);
         }`,
      );
  };
  m.customProgramCacheKey = () => 'terrain-detail';
}
