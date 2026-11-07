import { Group, Matrix4, Object3D, Quaternion, Vector3 } from 'three';
import type { CreatureConfig, SwimPath } from '../config/types';
import type { EnvState } from '../core/environment';

export interface CreatureContext {
  time: number;
  dt: number;
  camY: number;
  camPos: Vector3;
  env: EnvState;
  reducedMotion: boolean;
}

/** Breite der "Begleit"-Zone in Welteinheiten. */
const LINGER_WIDTH = 24;

/**
 * Gemeinsame Basis für alle Tiere. Kümmert sich um Position auf dem Schwimmpfad,
 * Begleit-Effekt (das Tier bleibt länger im Bild) und Ausrichtung in
 * Schwimmrichtung. Unterklassen liefern nur Darstellung und Animation.
 */
export abstract class Creature {
  /** Wird auf dem Pfad bewegt */
  readonly root = new Group();
  /** Wird in Schwimmrichtung gedreht; lokale +X-Achse = vorne */
  readonly body = new Group();

  phase = Math.random() * Math.PI * 2;
  private sample: PathSample = { x: 0, y: 0, z: 0, prevY: 0 };
  protected speed = 0;
  private prevPos = new Vector3();
  private hasPrev = false;
  private heading = new Quaternion();
  private targetQ = new Quaternion();
  private m = new Matrix4();
  /** Sichtbarkeit 0..1 für weiche Übergänge (z. B. Platzhalter -> Asset) */
  opacity = 1;
  baseY = 0;
  groundY: number | null = null;

  constructor(readonly config: CreatureConfig) {
    this.root.add(this.body);
    this.root.name = config.id;
  }

  abstract load(): Promise<void>;
  protected abstract animate(ctx: CreatureContext, swimSpeed: number): void;
  protected applyOpacity(_o: number): void {}

  /** Relative vertikale Lage zur Kamera inklusive Begleit-Effekt. */
  relativeY(camY: number): number {
    const x = this.baseY - camY;
    const follow = this.config.linger ?? 0;
    return x - follow * LINGER_WIDTH * Math.tanh(x / LINGER_WIDTH);
  }

  /** Fortschritt der Begegnung: 0 = Tier noch unter der Kamera, 1 = vorbei. */
  encounter(camY: number, range = 30): number {
    const r = this.relativeY(camY);
    return Math.min(1, Math.max(0, 0.5 + r / (2 * range)));
  }

  update(ctx: CreatureContext) {
    const cfg = this.config;
    const motion = ctx.reducedMotion ? 0.5 : 1;
    const anchorY = this.groundY ?? ctx.camY + this.relativeY(ctx.camY);
    const local = evalPath(cfg.path, this, ctx, motion, this.sample);

    this.root.position.set(cfg.offset[0] + local.x, anchorY + local.y, cfg.offset[1] + local.z);

    // Schwimmrichtung aus der Bewegung, beim Schweben aus dem Pfad
    const p = this.root.position;
    const vel = tmpV.copy(p).sub(this.prevPos);
    const dist = vel.length();
    if (this.hasPrev && ctx.dt > 0) {
      this.speed += (dist / ctx.dt - this.speed) * Math.min(1, ctx.dt * 3);
    }
    let dir: Vector3 | null = null;
    if (cfg.path.type === 'drift') {
      const h = (cfg.path.heading ?? 0) + Math.sin(ctx.time * 0.11 + this.phase) * 0.35;
      dir = tmpD.set(Math.cos(h), Math.sin(ctx.time * 0.3 + this.phase) * 0.08, -Math.sin(h));
    } else if (cfg.path.type === 'pass') {
      dir = tmpD.set(cfg.path.to[0] - cfg.path.from[0], cfg.path.to[1] - cfg.path.from[1], cfg.path.to[2] - cfg.path.from[2]).normalize();
    } else if (this.hasPrev && dist > 1e-5) {
      // Vertikale Komponente der Begleitbewegung ignorieren, sonst kippt das Tier
      vel.y = (local.y - local.prevY) * 1.0;
      if (vel.lengthSq() > 1e-10) dir = tmpD.copy(vel).normalize();
    }
    if (dir) {
      dir.y = Math.max(-0.5, Math.min(0.5, dir.y));
      dir.normalize();
      lookAlongX(this.m, dir);
      this.targetQ.setFromRotationMatrix(this.m);
      if (!this.hasPrev) this.heading.copy(this.targetQ);
      this.heading.slerp(this.targetQ, Math.min(1, ctx.dt * 1.8));
      this.body.quaternion.copy(this.heading);
    }
    this.prevPos.copy(p);
    this.hasPrev = true;

    const swim = cfg.path.type === 'pass' ? 1 : Math.min(2, this.speed / Math.max(0.2, cfg.placeholder.length));
    this.animate(ctx, swim);
  }

  setOpacity(o: number) {
    this.opacity = o;
    this.applyOpacity(o);
    this.root.visible = o > 0.001;
  }

  /** Weltposition des Tiers (für Fokus und Fakt-Karte) */
  focusPoint(out: Vector3): Vector3 {
    return this.root.getWorldPosition(out);
  }

  dispose() {
    this.root.removeFromParent();
    this.root.traverse((o: Object3D) => {
      const mesh = o as Object3D & { geometry?: { dispose(): void }; material?: unknown };
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const mat of mats as { dispose(): void; map?: { dispose(): void } }[]) {
        mat.map?.dispose();
        mat.dispose();
      }
    });
  }
}

const tmpV = new Vector3();
const tmpD = new Vector3();
const up = new Vector3(0, 1, 0);
const tmpZ = new Vector3();
const tmpY = new Vector3();

/** Rotationsmatrix, deren +X-Achse in Richtung dir zeigt und die aufrecht bleibt. */
function lookAlongX(m: Matrix4, dir: Vector3) {
  tmpZ.crossVectors(dir, up);
  if (tmpZ.lengthSq() < 1e-6) tmpZ.set(0, 0, 1);
  tmpZ.normalize();
  tmpY.crossVectors(tmpZ, dir).normalize();
  m.makeBasis(dir, tmpY, tmpZ);
}

interface PathSample {
  x: number;
  y: number;
  z: number;
  prevY: number;
}
/** Wertet den Schwimmpfad aus. Rückgabe relativ zum Anker. */
function evalPath(path: SwimPath, c: Creature, ctx: CreatureContext, motion: number, sample: PathSample): PathSample {
  const t = ctx.time * motion;
  const ph = c.phase;
  sample.prevY = sample.y;
  switch (path.type) {
    case 'orbit': {
      const a = t * path.speed * (path.clockwise ? -1 : 1) + ph;
      const tilt = path.tilt ?? 0;
      sample.x = Math.cos(a) * path.radius;
      sample.z = Math.sin(a) * path.radius;
      sample.y = Math.sin(a) * path.radius * tilt + Math.sin(t * 0.37 + ph) * (path.bob ?? 0);
      break;
    }
    case 'line': {
      const dx = path.to[0] - path.from[0];
      const dy = path.to[1] - path.from[1];
      const dz = path.to[2] - path.from[2];
      const len = Math.hypot(dx, dy, dz);
      const omega = (path.speed * Math.PI) / Math.max(1, len);
      const a = t * omega + ph;
      const u = 0.5 - 0.5 * Math.cos(a);
      // schmale Ellipse: das Tier wendet in einem Bogen statt auf der Stelle
      const side = Math.sin(a) * Math.min(2.2, len * 0.15);
      const nx = -dz / len;
      const nz = dx / len;
      sample.x = path.from[0] + dx * u + nx * side;
      sample.y = path.from[1] + dy * u + Math.sin(t * 0.5 + ph) * (path.bob ?? 0);
      sample.z = path.from[2] + dz * u + nz * side;
      break;
    }
    case 'drift': {
      const A = path.amplitude;
      const s = path.speed;
      sample.x = Math.sin(t * s * 0.7 + ph) * A;
      sample.y = Math.sin(t * s + ph * 1.3) * A * 0.6;
      sample.z = Math.cos(t * s * 0.5 + ph * 0.7) * A * 0.5;
      break;
    }
    case 'pass': {
      // scroll-gekoppelt: das Tier quert das Bild, während die Kamera vorbeitaucht
      const e = smooth(c.encounter(ctx.camY, 26));
      const breathe = Math.sin(t * 0.25 + ph) * 0.03;
      const u = e + breathe;
      sample.x = path.from[0] + (path.to[0] - path.from[0]) * u;
      sample.y = path.from[1] + (path.to[1] - path.from[1]) * u + Math.sin(t * 0.4 + ph) * (path.bob ?? 0);
      sample.z = path.from[2] + (path.to[2] - path.from[2]) * u;
      break;
    }
  }
  return sample;
}

const smooth = (x: number) => x * x * (3 - 2 * x);
