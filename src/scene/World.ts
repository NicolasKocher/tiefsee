import {
  Color,
  DirectionalLight,
  FogExp2,
  HalfFloatType,
  HemisphereLight,
  MathUtils,
  Object3D,
  PerspectiveCamera,
  Scene,
  SpotLight,
  PointLight,
  Vector2,
  Vector3,
  WebGLRenderer,
  NoToneMapping,
  SRGBColorSpace,
  Raycaster,
} from 'three';
import {
  BloomEffect,
  DepthOfFieldEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import { U } from './uniforms';
import { Backdrop } from './Backdrop';
import { WaterSurface } from './WaterSurface';
import { GodRays } from './GodRays';
import { MarineSnow } from './MarineSnow';
import { Bioluminescence } from './Bioluminescence';
import { Seafloor } from './Seafloor';
import { FilmGrainEffect, WaterDistortionEffect } from './effects';
import { createEnvState, updateEnv, type EnvState } from '../core/environment';
import { depthAt, worldYAt } from '../core/depthMap';
import { MonotoneSpline } from '../core/spline';
import type { QualitySettings } from '../core/quality';
import { CreatureManager } from '../creatures/CreatureManager';
import { CREATURES } from '../config/creatures';
import { initLoaders } from '../creatures/loaders';

/** Kameraneigung über den Scroll-Fortschritt (Grad): erst nach oben zur Oberfläche, dann geradeaus. */
const pitchSpline = new MonotoneSpline([
  [0, 52],
  [0.012, 38],
  [0.03, 4],
  [0.05, -2],
  [0.93, -3],
  [0.975, -21],
  [1, -21],
]);

export class World {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly env: EnvState = createEnvState();
  readonly creatures: CreatureManager;

  private composer: EffectComposer;
  private dof: DepthOfFieldEffect | null = null;
  private bloom: BloomEffect;
  private distortion = new WaterDistortionEffect();
  private grain: FilmGrainEffect;
  private vignette: VignetteEffect;

  private backdrop = new Backdrop();
  private surface = new WaterSurface();
  private rays: GodRays;
  private snow: MarineSnow;
  private biolum: Bioluminescence;
  private seafloor: Seafloor;

  private hemi = new HemisphereLight(0xffffff, 0x000000, 1);
  private sun = new DirectionalLight(0xdff6ff, 2);
  private lampL = new SpotLight(0xe8f1ff, 0, 0, 0.62, 0.95, 1.4);
  private lampR = new SpotLight(0xe8f1ff, 0, 0, 0.62, 0.95, 1.4);
  /** Schwenkbarer Scheinwerfer, der dem Tier im Fokus folgt (wie bei einem ROV) */
  private keyLight = new SpotLight(0xeef4ff, 0, 60, 0.22, 0.9, 1.4);
  /** Gegenlicht hinter dem Tier für Kontur vor schwarzem Hintergrund */
  private rimLight = new PointLight(0x9fd8ff, 0, 18, 1.6);
  private keyTarget = new Vector3();
  private keyStrength = 0;
  private groundRay = new Raycaster();

  private focusTarget = new Vector3(0, 0, -12);
  private focusDistance = 12;
  private mouse = new Vector2();
  private mouseSmoothed = new Vector2();
  private lastMouse = new Vector2();
  private raycaster = new Raycaster();
  private pixelRatio: number;
  private time = 0;

  constructor(
    canvas: HTMLCanvasElement,
    readonly quality: QualitySettings,
    private reducedMotion: boolean,
  ) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      stencil: false,
      depth: true,
      powerPreference: 'high-performance',
    });
    this.pixelRatio = Math.min(window.devicePixelRatio, quality.maxPixelRatio);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NoToneMapping;
    initLoaders(this.renderer);

    this.camera = new PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 600);
    this.scene.add(this.camera);
    this.scene.fog = new FogExp2(0x000000, 0.02);

    // Licht
    this.scene.add(this.hemi);
    this.sun.position.copy(U.uSunDir.value).multiplyScalar(50);
    this.scene.add(this.sun, this.sun.target);
    for (const [lamp, x] of [
      [this.lampL, -1.2],
      [this.lampR, 1.2],
    ] as const) {
      // Lampen sitzen hinter der Kamera am Rahmen des Tauchboots: weniger Hotspots im Nahbereich
      lamp.position.set(x, 0.5, 2.5);
      const target = new Object3D();
      target.position.set(x * 0.4, -0.6, -10);
      this.camera.add(lamp, target);
      lamp.target = target;
    }

    this.keyLight.position.set(0, 0.6, 0.3);
    this.camera.add(this.keyLight);
    this.scene.add(this.keyLight.target, this.rimLight);

    // Umgebung
    this.rays = new GodRays(quality.godRays);
    this.snow = new MarineSnow(quality.snowCount);
    this.biolum = new Bioluminescence(quality.biolumCount);
    this.seafloor = new Seafloor(quality.terrainSegments);
    this.scene.add(this.backdrop.mesh, this.surface.mesh, this.rays.mesh, this.snow.mesh, this.biolum.mesh, this.seafloor.group);

    this.creatures = new CreatureManager(CREATURES, quality, (kind, x, z) => this.seafloor.heightAt(kind, x, z));
    this.scene.add(this.creatures.group);

    // Postprocessing
    this.composer = new EffectComposer(this.renderer, {
      frameBufferType: HalfFloatType,
      multisampling: quality.tier === 'high' ? 4 : 0,
    });
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (quality.dof) {
      this.dof = new DepthOfFieldEffect(this.camera, {
        focusDistance: 12,
        focusRange: 9,
        bokehScale: 1.7,
        resolutionScale: 0.5,
      });
      this.composer.addPass(new EffectPass(this.camera, this.dof));
    }
    this.bloom = new BloomEffect({
      intensity: 1.1,
      luminanceThreshold: 0.75,
      luminanceSmoothing: 0.35,
      mipmapBlur: true,
      radius: 0.78,
      resolutionScale: quality.bloomResolution,
    });
    this.composer.addPass(new EffectPass(this.camera, this.bloom));
    this.vignette = new VignetteEffect({ offset: 0.28, darkness: 0.62 });
    this.grain = new FilmGrainEffect(quality.tier === 'low' ? 0.035 : 0.045);
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
    this.composer.addPass(new EffectPass(this.camera, this.distortion, tone, this.vignette, this.grain));

    U.uMotion.value = reducedMotion ? 0.35 : 1;

    window.addEventListener('resize', () => this.resize());
    window.addEventListener('pointermove', (e) => {
      this.mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    });
    this.resize();

    // Terrain im Leerlauf vorbereiten, damit es später keinen Ruckler gibt
    const idle =
      (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback ??
      ((cb: () => void) => window.setTimeout(cb, 2500));
    idle(() => this.seafloor.build(), { timeout: 8000 });
  }

  /** Entfernung zum Terrain entlang der Blickrichtung */
  private groundDistance(): number {
    this.groundRay.set(this.camera.position, U.uCamDir.value);
    this.groundRay.far = 60;
    const hit = this.groundRay.intersectObject(this.seafloor.group, true)[0];
    return hit ? hit.distance : Infinity;
  }

  private updateKeyLight(focus: ReturnType<CreatureManager['getFocus']>, lamps: number, dt: number) {
    const want = focus ? focus.strength : 0;
    this.keyStrength += (want - this.keyStrength) * Math.min(1, dt * 2);
    if (focus) this.keyTarget.lerp(focus.world, this.keyStrength < 0.05 ? 1 : Math.min(1, dt * 3));
    const cfg = focus?.config.light;
    const key = cfg?.key ?? 1;
    const dist = this.keyTarget.distanceTo(this.camera.position);
    // Intensität mit der Entfernung skalieren, damit nahe und ferne Tiere ähnlich hell wirken
    this.keyLight.intensity = lamps * this.keyStrength * key * (6 + dist * dist * 0.4);
    this.keyLight.target.position.copy(this.keyTarget);
    this.keyLight.target.updateMatrixWorld();
    // Gegenlicht: hinter dem Tier, leicht erhöht
    const away = tmpA.copy(this.keyTarget).sub(this.camera.position).normalize();
    this.rimLight.position.copy(this.keyTarget).addScaledVector(away, 2.5 + dist * 0.12);
    this.rimLight.position.y += 1.2 + dist * 0.05;
    this.rimLight.distance = 6 + dist * 0.4;
    this.rimLight.color.set(cfg?.rim ?? '#8fd0ff');
    this.rimLight.intensity = lamps * this.keyStrength * (cfg?.rimIntensity ?? 1) * (6 + dist * 1.2);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    // Auf schmalen Bildschirmen etwas mehr Bildwinkel, damit Tiere nicht angeschnitten werden
    this.camera.fov = w / h < 0.8 ? 64 : 52;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h, false);
    U.uPixelAngle.value = MathUtils.degToRad(this.camera.fov) / (h * this.pixelRatio);
  }

  setPixelRatio(pr: number) {
    if (Math.abs(pr - this.pixelRatio) < 0.05) return;
    this.pixelRatio = pr;
    this.renderer.setPixelRatio(pr);
    this.resize();
  }

  getPixelRatio() {
    return this.pixelRatio;
  }

  update(progress: number, dt: number) {
    this.time += dt;
    const t = this.time;
    const depth = depthAt(progress);
    const env = updateEnv(this.env, depth);

    // Globale Uniforms
    U.uTime.value = t;
    U.uWater.value.copy(env.water);
    U.uZenith.value.copy(env.zenith);
    U.uSun.value = env.sun;
    U.uRays.value = env.rays;
    U.uLamp.value = env.lamps;
    U.uBiolum.value = env.biolum;
    U.uFogDensity.value = env.fogDensity;
    const fog = this.scene.fog as FogExp2;
    fog.color.copy(env.water);
    fog.density = env.fogDensity;

    // Licht
    this.hemi.color.copy(env.zenith);
    this.hemi.groundColor.copy(env.water).multiplyScalar(0.25);
    this.hemi.intensity = 0.07 + 1.7 * env.sun;
    this.sun.intensity = 2.6 * env.sun;
    this.sun.color.copy(env.zenith).lerp(new Color(1, 1, 1), 0.5);
    const lamp = env.lamps * 300;
    this.lampL.intensity = lamp;
    this.lampR.intensity = lamp;

    // Kamera
    const camY = worldYAt(progress);
    const motion = this.reducedMotion ? 0 : 1;
    this.mouseSmoothed.lerp(this.mouse, Math.min(1, dt * 2.5));
    const swayX = Math.sin(t * 0.13) * 0.6 * motion;
    const swayZ = Math.cos(t * 0.11) * 0.4 * motion;
    const bobY = Math.sin(t * 0.4) * 0.08 * motion;
    this.camera.position.set(swayX, camY + bobY, swayZ);

    let pitch = pitchSpline.at(progress);
    // über der Tiefsee-Ebene nach unten blicken, um den Boden zu zeigen
    const abovePlain = camY - this.seafloor.plainY;
    pitch -= 20 * bump(abovePlain, -6, 5, 34);
    const yaw = (Math.sin(t * 0.07) * 3 - this.mouseSmoothed.x * 2.2) * motion;
    const roll = Math.sin(t * 0.17) * 0.5 * motion;
    pitch += this.mouseSmoothed.y * 1.6 * motion;
    this.camera.rotation.set(MathUtils.degToRad(pitch), MathUtils.degToRad(yaw), MathUtils.degToRad(roll), 'YXZ');
    this.camera.updateMatrixWorld();

    U.uCamPos.value.copy(this.camera.position);
    this.camera.getWorldDirection(U.uCamDir.value);

    // Mausposition in der Welt (für die Biolumineszenz)
    this.raycaster.setFromCamera(this.mouse, this.camera);
    U.uMouse.value.copy(this.raycaster.ray.origin).addScaledVector(this.raycaster.ray.direction, 7);
    const mouseSpeed = this.mouse.distanceTo(this.lastMouse) / Math.max(dt, 1e-3);
    this.lastMouse.copy(this.mouse);
    U.uMouseExcite.value += (Math.min(1, mouseSpeed * 0.25) - U.uMouseExcite.value) * Math.min(1, dt * 4);

    // Module
    this.backdrop.update();
    this.surface.update(camY);
    this.rays.update(camY);
    this.biolum.update();
    this.seafloor.update(camY);

    this.creatures.update({ time: t, dt, camY, camPos: this.camera.position, env, reducedMotion: this.reducedMotion }, this.camera);

    // Schärfe auf das Tier im Fokus ziehen (Rack Focus), sonst auf den Boden
    const focus = this.creatures.getFocus();
    let want = 14;
    const ground = this.seafloor.group.visible ? this.groundDistance() : Infinity;
    if (ground < 45) want = ground;
    if (focus && focus.strength > 0.15) want = focus.distance;
    // Der Such-Scheinwerfer ist schon in der Dämmerzone aktiv, die Flächenlampen erst tiefer
    this.updateKeyLight(focus, Math.max(env.lamps, 1 - Math.min(1, env.sun * 8)), dt);
    this.focusDistance += (want - this.focusDistance) * Math.min(1, dt * 1.8);
    this.focusTarget.copy(this.camera.position).addScaledVector(U.uCamDir.value, this.focusDistance);
    if (this.dof) {
      this.dof.target = this.focusTarget;
      this.dof.cocMaterial.focusRange = Math.max(4, this.focusDistance * 0.9);
    }
    this.snow.setFocus(this.focusDistance);

    // Postprocessing-Parameter abhängig von der Tiefe
    this.distortion.time = t;
    this.distortion.strength = (0.25 + env.rays * 0.75) * motion;
    this.grain.time = t;
    this.bloom.intensity = 0.9 + env.biolum * 0.6;
    this.vignette.darkness = 0.5 + (1 - env.sun) * 0.25;

    this.composer.render(dt);
  }
}

const tmpA = new Vector3();

/** Weicher Buckel: 0 außerhalb [a, d], 1 zwischen b und c. */
function bump(x: number, a: number, b: number, d: number) {
  if (x <= a || x >= d) return 0;
  if (x < b) return smooth((x - a) / (b - a));
  return 1 - smooth((x - b) / (d - b));
}
const smooth = (t: number) => t * t * (3 - 2 * t);
