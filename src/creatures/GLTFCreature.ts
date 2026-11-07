import {
  AnimationMixer,
  Box3,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Vector3,
  type AnimationAction,
  type Material,
} from 'three';
import { Creature, type CreatureContext } from './Creature';
import { assetUrl, gltfLoader } from './loaders';
import { patchUnderwater } from '../scene/caustics';
import { applyWiggle } from './wiggle';
import { SchoolSwarm } from './SchoolSwarm';

/**
 * Geriggtes, animiertes glTF/GLB-Modell. Das Modell wird auf die konfigurierte
 * Länge normiert, so ausgerichtet, dass es entlang +X schwimmt, und seine
 * Materialien bekommen Caustics und Unterwasser-Licht.
 */
export class GLTFCreature extends Creature {
  private mixer: AnimationMixer | null = null;
  private action: AnimationAction | null = null;
  private materials: Material[] = [];
  private swarm: SchoolSwarm | null = null;
  private swimUniforms: { value: number }[] = [];

  async load() {
    const opts = this.config.gltf!;
    const gltf = await gltfLoader().loadAsync(assetUrl(this.config.asset!));
    const model = gltf.scene;

    // Ausrichtung und Normierung
    const holder = new Group();
    if (opts.rotation) model.rotation.set(...opts.rotation);
    holder.add(model);
    holder.updateMatrixWorld(true);
    const box = new Box3().setFromObject(holder, true);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const longest = Math.max(size.x, size.y, size.z);
    const s = opts.length / longest;
    model.position.sub(center);
    holder.scale.setScalar(s);

    const tint = opts.tint ? new Color(opts.tint) : null;
    model.traverse((o: Object3D) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const std = m as MeshStandardMaterial;
        if ('isMeshStandardMaterial' in std) {
          if (opts.roughness !== undefined) std.roughness = opts.roughness;
          if (tint) std.color.multiply(tint);
          if (opts.emissiveBoost) std.emissiveIntensity *= opts.emissiveBoost;
          std.envMapIntensity = opts.envIntensity ?? 1;
          patchUnderwater(std);
          if (opts.wiggle) {
            this.swimUniforms.push(applyWiggle(std, { ...opts.wiggle, length: longest }));
          }
        }
        this.materials.push(m);
      }
    });

    if (opts.school) {
      // erstes Mesh als Schwarm-Geometrie verwenden
      let first: Mesh | null = null;
      model.traverse((o) => {
        if (!first && (o as Mesh).isMesh) first = o as Mesh;
      });
      if (!first) throw new Error('Schwarm-Modell ohne Mesh');
      const fm = first as Mesh;
      const geo = fm.geometry.clone();
      fm.updateWorldMatrix(true, false);
      geo.applyMatrix4(fm.matrixWorld);
      geo.translate(-center.x, -center.y, -center.z);
      geo.scale(s, s, s);
      const mat = (Array.isArray(fm.material) ? fm.material[0] : fm.material) as MeshStandardMaterial;
      const spread = opts.school.spread;
      this.swarm = new SchoolSwarm(geo, mat, opts.school.count, spread, 5);
      this.body.add(this.swarm.mesh);
    } else {
      this.body.add(holder);
    }

    if (gltf.animations.length) {
      this.mixer = new AnimationMixer(model);
      const clip = (opts.animation && gltf.animations.find((a) => a.name === opts.animation)) || gltf.animations[0];
      this.action = this.mixer.clipAction(clip);
      this.action.play();
      this.action.time = Math.random() * clip.duration;
    }
  }

  protected animate(ctx: CreatureContext, swim: number) {
    const ts = this.config.gltf?.timeScale ?? 1;
    if (this.action) this.action.timeScale = ts * (0.75 + 0.35 * Math.min(1.5, swim));
    this.mixer?.update(ctx.dt);
    this.swarm?.update(ctx.time, 0.45);
    for (const u of this.swimUniforms) u.value = swim;
  }

  protected applyOpacity(o: number) {
    for (const m of this.materials) {
      if (m.userData.baseOpacity === undefined) {
        m.userData.baseOpacity = m.opacity;
        m.userData.baseTransparent = m.transparent;
      }
      const t = o < 0.999 || m.userData.baseTransparent;
      if (m.transparent !== t) {
        m.transparent = t;
        m.needsUpdate = true;
      }
      m.opacity = m.userData.baseOpacity * o;
    }
  }
}
