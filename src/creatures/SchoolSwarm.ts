import { BufferGeometry, InstancedMesh, Material, Matrix4, Quaternion, Vector3, Euler } from 'three';
import { mulberry32 } from '../core/noise';

/**
 * Schwarmverhalten als "Köderball": Die Fische kreisen in mehreren Ringen um
 * ein gemeinsames Zentrum, jeder mit eigener Geschwindigkeit, Höhe und einem
 * leichten Ausscheren. Günstig zu rechnen und wirkt sehr organisch.
 */
export class SchoolSwarm {
  readonly mesh: InstancedMesh;
  private fish: { angle: number; radius: number; height: number; speed: number; wobble: number; scale: number }[] = [];
  private m = new Matrix4();
  private q = new Quaternion();
  private e = new Euler();
  private pos = new Vector3();
  private scl = new Vector3();

  constructor(
    geometry: BufferGeometry,
    material: Material,
    count: number,
    private spread: [number, number, number],
    seed = 7,
  ) {
    this.mesh = new InstancedMesh(geometry, material, count);
    this.mesh.frustumCulled = false;
    const rnd = mulberry32(seed);
    for (let i = 0; i < count; i++) {
      this.fish.push({
        angle: rnd() * Math.PI * 2,
        radius: 0.35 + Math.pow(rnd(), 0.6) * 0.65,
        height: (rnd() - 0.5) * 2,
        speed: 0.8 + rnd() * 0.45,
        wobble: rnd() * Math.PI * 2,
        scale: 0.8 + rnd() * 0.4,
      });
    }
  }

  update(time: number, globalSpeed: number) {
    const [sx, sy, sz] = this.spread;
    for (let i = 0; i < this.fish.length; i++) {
      const f = this.fish[i];
      const a = f.angle + time * globalSpeed * f.speed;
      const breathe = 1 + Math.sin(time * 0.3 + f.wobble) * 0.12;
      const r = f.radius * breathe;
      const y = f.height * sy * 0.5 + Math.sin(time * 0.7 + f.wobble) * 0.15 * sy;
      this.pos.set(Math.cos(a) * r * sx, y, Math.sin(a) * r * sz);
      // Tangente (gegen den Uhrzeigersinn) = Schwimmrichtung
      const heading = Math.atan2(-Math.cos(a) * sz, -Math.sin(a) * sx);
      this.e.set(Math.sin(time + f.wobble) * 0.08, heading, Math.cos(time * 1.3 + f.wobble) * 0.1);
      this.q.setFromEuler(this.e);
      this.scl.setScalar(f.scale);
      this.m.compose(this.pos, this.q, this.scl);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
