import {
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  FrontSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TubeGeometry,
  CatmullRomCurve3,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PlaceholderShape } from '../config/types';
import { patchUnderwater } from '../scene/caustics';
import { applyWiggle } from './wiggle';
import { SchoolSwarm } from './SchoolSwarm';

/**
 * Einfache, aber erkennbare Silhouetten für alle Tiere. Sie dienen als
 * Platzhalter, bis echte Assets vorliegen, und als Fallback, falls ein Asset
 * nicht geladen werden kann. Alle Formen sind auf Länge 1 entlang +X gebaut.
 */

export interface ShapeInstance {
  object: Object3D;
  animate: (t: number, swim: number) => void;
  materials: (MeshStandardMaterial | MeshBasicMaterial)[];
}

function bodyMaterial(color: string, opts: Partial<{ roughness: number; transparent: boolean; opacity: number; emissive: string; emissiveIntensity: number }> = {}) {
  const m = new MeshStandardMaterial({
    color: new Color(color),
    roughness: opts.roughness ?? 0.55,
    metalness: 0.0,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    side: opts.transparent ? DoubleSide : FrontSide,
    depthWrite: !opts.transparent,
  });
  if (opts.emissive) {
    m.emissive = new Color(opts.emissive);
    m.emissiveIntensity = opts.emissiveIntensity ?? 1;
  }
  patchUnderwater(m);
  return m;
}

function glowMaterial(color: string, intensity = 4) {
  return new MeshBasicMaterial({ color: new Color(color).multiplyScalar(intensity), toneMapped: false, fog: false });
}

/** Spindelförmiger Fischkörper entlang X, Kopf bei +0.5, Schwanz bei -0.5. */
function spindle(height: number, width: number, bluntHead = 0.35, seg = 28): BufferGeometry {
  const g = new SphereGeometry(0.5, seg, Math.round(seg * 0.6));
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const t = x + 0.5; // 0 Schwanz .. 1 Kopf
    const taper = t < 0.6 ? Math.pow(t / 0.6, 0.9) : 1 - Math.pow((t - 0.6) / 0.4, 2) * (1 - bluntHead);
    p.setY(i, p.getY(i) * height * 2 * Math.max(0.06, taper));
    p.setZ(i, p.getZ(i) * width * 2 * Math.max(0.05, taper));
  }
  g.computeVertexNormals();
  return g;
}

function tailFin(span: number, length: number, forked = true): BufferGeometry {
  const s = new Shape();
  s.moveTo(0, 0);
  if (forked) {
    s.quadraticCurveTo(-length * 0.5, span * 0.3, -length, span * 0.5);
    s.quadraticCurveTo(-length * 0.6, 0, -length, -span * 0.5);
    s.quadraticCurveTo(-length * 0.5, -span * 0.3, 0, 0);
  } else {
    s.quadraticCurveTo(-length, span * 0.6, -length * 0.9, 0);
    s.quadraticCurveTo(-length, -span * 0.6, 0, 0);
  }
  const g = new ShapeGeometry(s, 8);
  return g;
}

function finTriangle(h: number, l: number): BufferGeometry {
  const s = new Shape();
  s.moveTo(l * 0.5, 0);
  s.quadraticCurveTo(0, h * 0.3, -l * 0.3, h);
  s.quadraticCurveTo(-l * 0.2, h * 0.3, -l * 0.5, 0);
  s.lineTo(l * 0.5, 0);
  return new ShapeGeometry(s, 6);
}

function fishGeometry(): BufferGeometry {
  const body = spindle(0.11, 0.06, 0.4, 16);
  const tail = tailFin(0.22, 0.14);
  tail.translate(-0.47, 0, 0);
  const dorsal = finTriangle(0.06, 0.14);
  dorsal.translate(0.02, 0.09, 0);
  return mergeGeometries([body.toNonIndexed(), tail.toNonIndexed(), dorsal.toNonIndexed()])!;
}

function amphipodGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const g = new SphereGeometry(0.09 - i * 0.004, 8, 6);
    g.scale(1, 0.9, 0.7);
    const a = (i / 6) * 1.2 - 0.6;
    g.translate(0.4 - i * 0.13, Math.cos(a) * 0.12 - 0.1, 0);
    parts.push(g.toNonIndexed());
  }
  const ant = new CylinderGeometry(0.006, 0.006, 0.4, 4);
  ant.rotateZ(-1.1);
  ant.translate(0.62, 0.1, 0);
  parts.push(ant.toNonIndexed());
  return mergeGeometries(parts)!;
}

export function buildShape(shape: PlaceholderShape, length: number, color = '#6a7680', glow?: string): ShapeInstance {
  const root = new Group();
  const mats: (MeshStandardMaterial | MeshBasicMaterial)[] = [];
  const add = <T extends Mesh>(m: T) => {
    mats.push(m.material as MeshStandardMaterial);
    return m;
  };
  let animate: ShapeInstance['animate'] = () => {};

  switch (shape) {
    case 'fish':
    case 'dolphin': {
      const isDolphin = shape === 'dolphin';
      const mat = bodyMaterial(color, { roughness: isDolphin ? 0.35 : 0.4 });
      const body = add(new Mesh(spindle(isDolphin ? 0.11 : 0.12, isDolphin ? 0.1 : 0.06, isDolphin ? 0.15 : 0.4), mat));
      root.add(body);
      if (isDolphin) {
        const beak = add(new Mesh(new CylinderGeometry(0.018, 0.03, 0.08, 10), mat));
        beak.rotation.z = Math.PI / 2;
        beak.position.set(0.52, -0.015, 0);
        root.add(beak);
        const dorsal = add(new Mesh(finTriangle(0.1, 0.12), mat));
        dorsal.position.set(0.02, 0.09, 0);
        root.add(dorsal);
        const flipper = finTriangle(0.08, 0.06);
        for (const side of [-1, 1]) {
          const f = add(new Mesh(flipper, mat));
          f.position.set(0.22, -0.05, side * 0.07);
          f.rotation.set(side * 1.9, 0, -0.3);
          root.add(f);
        }
      }
      const tailPivot = new Group();
      tailPivot.position.x = -0.42;
      const tail = add(new Mesh(tailFin(isDolphin ? 0.2 : 0.22, 0.12, !isDolphin), mat));
      tail.material.side = DoubleSide;
      if (isDolphin) tail.rotation.x = Math.PI / 2; // horizontale Fluke
      tailPivot.add(tail);
      root.add(tailPivot);
      animate = (t, swim) => {
        const f = isDolphin ? 1.6 : 6;
        const a = Math.sin(t * f * (0.6 + swim * 0.6)) * (isDolphin ? 0.35 : 0.4);
        if (isDolphin) {
          tailPivot.rotation.z = a;
          body.rotation.z = -a * 0.08;
        } else {
          tailPivot.rotation.y = a;
          body.rotation.y = -a * 0.1;
        }
      };
      break;
    }

    case 'school':
    case 'lanternfish': {
      const isLantern = shape === 'lanternfish';
      const geo = fishGeometry();
      const mat = bodyMaterial(color, { roughness: 0.3 });
      if (isLantern && glow) {
        mat.emissive = new Color(glow);
        mat.emissiveIntensity = 0.6;
      }
      mat.side = DoubleSide;
      applyWiggle(mat, { amplitude: 0.12, frequency: 1.1, speed: 9, length: 1 });
      mats.push(mat);
      const count = isLantern ? 70 : 420;
      const spread: [number, number, number] = isLantern ? [2.2 / length, 1.2 / length, 2.2 / length] : [5 / length, 2.2 / length, 5 / length];
      const swarm = new SchoolSwarm(geo, mat, count, spread, isLantern ? 3 : 11);
      root.add(swarm.mesh);
      animate = (t) => swarm.update(t, isLantern ? 0.25 : 0.45);
      break;
    }

    case 'turtle': {
      const mat = bodyMaterial(color, { roughness: 0.7 });
      const skin = bodyMaterial('#8c8a6c', { roughness: 0.8 });
      const shell = add(new Mesh(new SphereGeometry(0.5, 24, 16), mat));
      shell.scale.set(0.82, 0.24, 0.62);
      root.add(shell);
      const head = add(new Mesh(new SphereGeometry(0.1, 14, 10), skin));
      head.scale.set(1.3, 0.85, 0.9);
      head.position.set(0.47, 0.01, 0);
      root.add(head);
      const flipperGeo = new SphereGeometry(0.5, 14, 8);
      flipperGeo.scale(0.22, 0.03, 0.5);
      flipperGeo.translate(0, 0, 0.25);
      const flippers: { pivot: Group; side: number; front: boolean }[] = [];
      for (const front of [true, false]) {
        for (const side of [-1, 1]) {
          const pivot = new Group();
          pivot.position.set(front ? 0.2 : -0.26, -0.02, side * 0.24);
          const f = add(new Mesh(flipperGeo, skin));
          f.scale.setScalar(front ? 1 : 0.45);
          f.rotation.y = side > 0 ? -0.5 : Math.PI + 0.5;
          pivot.add(f);
          root.add(pivot);
          flippers.push({ pivot, side, front });
        }
      }
      animate = (t, swim) => {
        const w = t * (1.2 + swim * 0.4);
        for (const f of flippers) {
          const a = Math.sin(w + (f.front ? 0 : 1.2)) * (f.front ? 0.55 : 0.2);
          f.pivot.rotation.x = a * f.side;
        }
        head.rotation.z = Math.sin(t * 0.6) * 0.08;
      };
      break;
    }

    case 'manta': {
      const mat = bodyMaterial(color, { roughness: 0.5 });
      const belly = bodyMaterial('#d8dde0', { roughness: 0.6 });
      const body = add(new Mesh(new SphereGeometry(0.5, 20, 12), mat));
      body.scale.set(0.42, 0.07, 0.3);
      root.add(body);
      const under = add(new Mesh(new SphereGeometry(0.5, 20, 12), belly));
      under.scale.set(0.4, 0.05, 0.28);
      under.position.y = -0.012;
      root.add(under);
      // Flügel als dreieckige Form in der XZ-Ebene
      const wingShape = new Shape();
      wingShape.moveTo(0.18, 0);
      wingShape.quadraticCurveTo(0.12, 0.35, -0.05, 0.5);
      wingShape.quadraticCurveTo(-0.08, 0.25, -0.2, 0);
      wingShape.lineTo(0.18, 0);
      const wingGeo = new ShapeGeometry(wingShape, 12);
      wingGeo.rotateX(Math.PI / 2);
      const wings: Group[] = [];
      for (const side of [-1, 1]) {
        const pivot = new Group();
        pivot.position.z = side * 0.1;
        const w = add(new Mesh(wingGeo, mat));
        w.material.side = DoubleSide;
        w.scale.z = side * -1;
        pivot.add(w);
        root.add(pivot);
        wings.push(pivot);
      }
      for (const side of [-1, 1]) {
        const lobe = add(new Mesh(new CylinderGeometry(0.008, 0.02, 0.1, 6), mat));
        lobe.rotation.z = Math.PI / 2;
        lobe.position.set(0.22, -0.01, side * 0.07);
        root.add(lobe);
      }
      const tail = add(new Mesh(new CylinderGeometry(0.002, 0.01, 0.4, 5), mat));
      tail.rotation.z = Math.PI / 2;
      tail.position.x = -0.38;
      root.add(tail);
      animate = (t) => {
        const a = Math.sin(t * 0.9) * 0.45;
        wings[0].rotation.x = -a;
        wings[1].rotation.x = a;
        body.position.y = -Math.cos(t * 0.9) * 0.01;
      };
      break;
    }

    case 'jelly': {
      const bell = bodyMaterial(color, { transparent: true, opacity: 0.75, roughness: 0.2, emissive: glow ?? color, emissiveIntensity: 0.08 });
      const g = new SphereGeometry(0.5, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.55);
      const bellMesh = add(new Mesh(g, bell));
      bellMesh.scale.set(0.9, 1.3, 0.9);
      // Quallen bleiben aufrecht, die Gierdrehung des Körpers fällt optisch nicht auf
      const pivot = new Group();
      pivot.add(bellMesh);
      const tentMat = bodyMaterial(color, { transparent: true, opacity: 0.55 });
      mats.push(tentMat);
      const tentacles: Mesh[] = [];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const pts = [];
        for (let k = 0; k < 6; k++) pts.push(new Vector3(Math.cos(a) * 0.38, -k * 0.12, Math.sin(a) * 0.38));
        const tube = new Mesh(new TubeGeometry(new CatmullRomCurve3(pts), 16, 0.012, 4), tentMat);
        tube.position.y = 0.05;
        pivot.add(tube);
        tentacles.push(tube);
      }
      root.add(pivot);
      animate = (t) => {
        const p = Math.sin(t * 2.0);
        bellMesh.scale.set(0.9 + p * 0.08, 1.3 - p * 0.1, 0.9 + p * 0.08);
        tentacles.forEach((tt, i) => (tt.rotation.y = Math.sin(t * 0.8 + i) * 0.15));
        bell.emissiveIntensity = 0.05 + Math.max(0, Math.sin(t * 0.7)) * 0.25;
      };
      break;
    }

    case 'squid':
    case 'giantsquid': {
      const giant = shape === 'giantsquid';
      const mat = bodyMaterial(color, { roughness: 0.4 });
      const mantleLen = giant ? 0.28 : 0.55;
      const mantle = add(new Mesh(spindle(0.09 * (giant ? 0.6 : 1.4), 0.09 * (giant ? 0.6 : 1.4), 0.9), mat));
      mantle.scale.x = mantleLen;
      mantle.position.x = giant ? -0.36 : -0.1;
      root.add(mantle);
      const fins = add(new Mesh(new SphereGeometry(0.5, 16, 8), mat));
      fins.scale.set(giant ? 0.07 : 0.2, 0.01, giant ? 0.14 : 0.5);
      fins.position.x = giant ? -0.47 : -0.22;
      root.add(fins);
      const head = add(new Mesh(new SphereGeometry(0.5, 16, 12), mat));
      head.scale.set(giant ? 0.07 : 0.2, giant ? 0.06 : 0.2, giant ? 0.06 : 0.2);
      head.position.x = giant ? -0.2 : 0.18;
      root.add(head);
      const eyeMat = glowMaterial(giant ? '#1a1a1a' : (glow ?? '#6fb8ff'), giant ? 1 : 2.5);
      for (const side of [-1, 1]) {
        const eye = new Mesh(new SphereGeometry(giant ? 0.018 : 0.04, 10, 8), eyeMat);
        eye.position.set(head.position.x, 0.01, side * (giant ? 0.03 : 0.09));
        root.add(eye);
      }
      const arms: Group[] = [];
      const armCount = giant ? 10 : 8;
      for (let i = 0; i < armCount; i++) {
        const a = (i / armCount) * Math.PI * 2;
        const long = giant && i >= 8;
        const len = giant ? (long ? 0.75 : 0.45) : 0.45;
        const pts = [];
        for (let k = 0; k < 8; k++) {
          const s = k / 7;
          pts.push(new Vector3(s * len, Math.sin(a) * 0.02 * (1 + s * (giant ? 0.5 : 3)), Math.cos(a) * 0.02 * (1 + s * (giant ? 0.5 : 3))));
        }
        const pivot = new Group();
        pivot.position.x = head.position.x + (giant ? 0.04 : 0.08);
        const armMesh = add(new Mesh(new TubeGeometry(new CatmullRomCurve3(pts), 20, giant ? 0.006 : 0.016, 5), mat));
        pivot.add(armMesh);
        if (!giant && glow) {
          const tip = new Mesh(new SphereGeometry(0.015, 6, 6), glowMaterial(glow, 5));
          tip.position.copy(pts[pts.length - 1]);
          pivot.add(tip);
        }
        root.add(pivot);
        arms.push(pivot);
      }
      if (!giant) {
        // Haut zwischen den Armen (Vampirtintenfisch-Umhang)
        const web = add(new Mesh(new ConeGeometry(0.2, 0.32, 16, 1, true), bodyMaterial(color, { transparent: true, opacity: 0.85 })));
        web.rotation.z = Math.PI / 2;
        web.position.x = 0.36;
        root.add(web);
      }
      animate = (t) => {
        arms.forEach((a, i) => {
          a.rotation.y = Math.sin(t * 1.1 + i) * 0.12;
          a.rotation.z = Math.cos(t * 0.9 + i * 0.7) * 0.1;
        });
        fins.rotation.x = Math.sin(t * 2.2) * 0.15;
        mantle.scale.y = mantle.scale.z = 1 + Math.sin(t * 1.5) * 0.03;
      };
      break;
    }

    case 'whale': {
      const mat = bodyMaterial(color, { roughness: 0.6 });
      const body = add(new Mesh(spindle(0.085, 0.08, 0.85), mat));
      root.add(body);
      // kastenförmiger Kopf des Pottwals
      const head = add(new Mesh(new SphereGeometry(0.5, 20, 14), mat));
      head.scale.set(0.38, 0.17, 0.15);
      head.position.set(0.3, 0.01, 0);
      root.add(head);
      const jaw = add(new Mesh(new CylinderGeometry(0.012, 0.02, 0.25, 8), mat));
      jaw.rotation.z = Math.PI / 2;
      jaw.position.set(0.33, -0.065, 0);
      root.add(jaw);
      const flukePivot = new Group();
      flukePivot.position.x = -0.46;
      const fluke = add(new Mesh(tailFin(0.25, 0.08, false), mat));
      fluke.material.side = DoubleSide;
      fluke.rotation.x = Math.PI / 2;
      flukePivot.add(fluke);
      root.add(flukePivot);
      animate = (t) => {
        const a = Math.sin(t * 0.5) * 0.3;
        flukePivot.rotation.z = a;
        body.rotation.z = -a * 0.05;
      };
      break;
    }

    case 'angler': {
      const mat = bodyMaterial(color, { roughness: 0.35 });
      const body = add(new Mesh(new SphereGeometry(0.32, 22, 16), mat));
      body.scale.set(1, 0.9, 0.75);
      root.add(body);
      const mouth = new Mesh(new SphereGeometry(0.16, 16, 10), new MeshBasicMaterial({ color: '#000000' }));
      mouth.scale.set(0.6, 0.6, 1.3);
      mouth.position.set(0.24, -0.08, 0);
      root.add(mouth);
      const tailPivot = new Group();
      tailPivot.position.x = -0.3;
      const tail = add(new Mesh(tailFin(0.3, 0.2, false), mat));
      tail.material.side = DoubleSide;
      tailPivot.add(tail);
      root.add(tailPivot);
      const rod = new CatmullRomCurve3([new Vector3(0.1, 0.25, 0), new Vector3(0.25, 0.45, 0), new Vector3(0.45, 0.42, 0), new Vector3(0.5, 0.3, 0)]);
      const rodMesh = add(new Mesh(new TubeGeometry(rod, 16, 0.008, 5), mat));
      root.add(rodMesh);
      const lure = new Mesh(new SphereGeometry(0.035, 12, 10), glowMaterial(glow ?? '#9ff3ff', 6));
      lure.position.set(0.5, 0.29, 0);
      root.add(lure);
      const teeth = glowMaterial('#cfd8d6', 0.6);
      for (let i = 0; i < 8; i++) {
        const tooth = new Mesh(new ConeGeometry(0.008, 0.05, 4), teeth);
        const a = (i / 7 - 0.5) * 1.4;
        tooth.position.set(0.3, -0.03, Math.sin(a) * 0.12);
        tooth.rotation.z = Math.PI;
        root.add(tooth);
      }
      animate = (t) => {
        tailPivot.rotation.y = Math.sin(t * 2.5) * 0.3;
        const pulse = 0.7 + 0.3 * Math.sin(t * 1.7) + 0.2 * Math.sin(t * 5.3);
        (lure.material as MeshBasicMaterial).color.set(glow ?? '#9ff3ff').multiplyScalar(6 * pulse);
        lure.position.y = 0.29 + Math.sin(t * 1.3) * 0.01;
      };
      break;
    }

    case 'dumbo': {
      const mat = bodyMaterial(color, { roughness: 0.35, transparent: true, opacity: 0.92 });
      const pivot = new Group();
      pivot.rotation.z = Math.PI * 0.35; // Mantel schräg nach vorne-oben
      const mantle = add(new Mesh(new SphereGeometry(0.3, 24, 16), mat));
      mantle.scale.set(0.85, 1.1, 0.85);
      mantle.position.y = 0.15;
      pivot.add(mantle);
      const ears: Group[] = [];
      for (const side of [-1, 1]) {
        const ep = new Group();
        ep.position.set(0, 0.25, side * 0.22);
        const ear = add(new Mesh(new SphereGeometry(0.5, 12, 8), mat));
        ear.scale.set(0.16, 0.24, 0.03);
        ear.position.z = side * 0.06;
        ep.add(ear);
        pivot.add(ep);
        ears.push(ep);
      }
      const skirt = add(new Mesh(new ConeGeometry(0.32, 0.3, 24, 1, true), mat));
      skirt.position.y = -0.12;
      pivot.add(skirt);
      for (const side of [-1, 1]) {
        const eye = new Mesh(new SphereGeometry(0.03, 8, 8), new MeshBasicMaterial({ color: '#050505' }));
        eye.position.set(0.18, 0.08, side * 0.13);
        pivot.add(eye);
      }
      root.add(pivot);
      animate = (t) => {
        const a = Math.sin(t * 1.6) * 0.5;
        ears[0].rotation.x = a;
        ears[1].rotation.x = -a;
        skirt.scale.set(1 + Math.sin(t * 0.8) * 0.12, 1 - Math.sin(t * 0.8) * 0.08, 1 + Math.sin(t * 0.8) * 0.12);
      };
      break;
    }

    case 'seapig': {
      const mat = bodyMaterial(color, { roughness: 0.4, transparent: true, opacity: 0.9 });
      const body = add(new Mesh(new SphereGeometry(0.5, 20, 12), mat));
      body.scale.set(1, 0.38, 0.42);
      body.position.y = 0.2;
      root.add(body);
      const legs: Mesh[] = [];
      for (let i = 0; i < 5; i++) {
        for (const side of [-1, 1]) {
          const leg = add(new Mesh(new CylinderGeometry(0.025, 0.035, 0.16, 6), mat));
          leg.position.set(0.32 - i * 0.16, 0.06, side * 0.16);
          root.add(leg);
          legs.push(leg);
        }
      }
      for (const side of [-1, 1]) {
        const pap = add(new Mesh(new CylinderGeometry(0.01, 0.03, 0.22, 6), mat));
        pap.position.set(0.25, 0.42, side * 0.06);
        pap.rotation.z = -0.4;
        root.add(pap);
      }
      animate = (t) => legs.forEach((l, i) => (l.rotation.x = Math.sin(t * 1.2 + i) * 0.15));
      break;
    }

    case 'snailfish': {
      const mat = bodyMaterial(color, { roughness: 0.55, transparent: true, opacity: 0.78, emissive: '#5a2c28', emissiveIntensity: 0.15 });
      const body = add(new Mesh(spindle(0.13, 0.11, 0.95), mat));
      // kaulquappenförmig: Kopf dick, Schwanz lang
      const p = body.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const k = x < 0 ? 1 + x * 1.3 : 1;
        p.setY(i, p.getY(i) * k);
        p.setZ(i, p.getZ(i) * k);
      }
      body.geometry.computeVertexNormals();
      root.add(body);
      const finMat = bodyMaterial(color, { transparent: true, opacity: 0.4 });
      mats.push(finMat);
      const fin = new Mesh(new SphereGeometry(0.5, 16, 8), finMat);
      fin.scale.set(0.8, 0.12, 0.01);
      fin.position.x = -0.1;
      root.add(fin);
      for (const side of [-1, 1]) {
        const eye = new Mesh(new SphereGeometry(0.018, 8, 8), new MeshBasicMaterial({ color: '#0a0a0a' }));
        eye.position.set(0.38, 0.03, side * 0.06);
        root.add(eye);
      }
      applyWiggle(mat, { amplitude: 0.1, frequency: 0.8, speed: 2.5, length: 1 });
      applyWiggle(finMat, { amplitude: 0.1, frequency: 0.8, speed: 2.5, length: 1 });
      break;
    }

    case 'amphipod': {
      const geo = amphipodGeometry();
      const mat = bodyMaterial(color, { roughness: 0.3 });
      mats.push(mat);
      const swarm = new SchoolSwarm(geo, mat, 60, [14, 6, 14], 21);
      root.add(swarm.mesh);
      animate = (t) => swarm.update(t, 0.6);
      break;
    }

    case 'tripod':
    default: {
      const mat = bodyMaterial(color);
      root.add(add(new Mesh(spindle(0.1, 0.06), mat)));
    }
  }

  root.scale.setScalar(length);
  return { object: root, animate, materials: mats };
}
