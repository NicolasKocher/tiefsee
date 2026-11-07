import { Camera, Group, Vector3 } from 'three';
import type { CreatureConfig } from '../config/types';
import { worldYForDepth } from '../core/depthMap';
import type { QualitySettings } from '../core/quality';
import { Creature, type CreatureContext } from './Creature';
import { PlaceholderCreature } from './PlaceholderCreature';
import { GLTFCreature } from './GLTFCreature';
import { VideoCreature } from './VideoCreature';

type LoadState = 'idle' | 'loading' | 'ready' | 'failed';

interface Slot {
  config: CreatureConfig;
  baseY: number;
  placeholder: Creature | null;
  real: Creature | null;
  state: LoadState;
  blend: number;
  /** Zeitpunkt, seit dem das Tier in Ladereichweite ist (gegen Laden beim schnellen Durchscrollen) */
  nearSince: number;
}

export interface FocusInfo {
  config: CreatureConfig;
  world: Vector3;
  screen: { x: number; y: number };
  distance: number;
  /** 0..1: wie präsent das Tier gerade ist (steuert Fakt-Karte) */
  strength: number;
}

/** Abstand (Welteinheiten), ab dem ein Asset vorgeladen wird. */
const PRELOAD = 170;
/** Abstand, ab dem ein Tier gerendert wird. */
const VISIBLE = 75;

/**
 * Verwaltet alle Tiere: legt sie an, lädt Assets pro Zone nach (lazy),
 * blendet vom Platzhalter zum echten Asset über, entlädt ferne Tiere und
 * ermittelt das Tier im Fokus (für Schärfe und Fakt-Karte).
 */
export class CreatureManager {
  readonly group = new Group();
  private slots: Slot[];
  private tmp = new Vector3();
  private focus: FocusInfo | null = null;

  constructor(
    configs: CreatureConfig[],
    private quality: QualitySettings,
    private groundHeight: (kind: 'plain' | 'floor', x: number, z: number) => number,
  ) {
    this.slots = configs.map((config) => ({
      config,
      baseY: worldYForDepth(config.depth),
      placeholder: null,
      real: null,
      state: 'idle',
      blend: 0,
      nearSince: -1,
    }));
  }

  private relY(slot: Slot, camY: number) {
    const x = slot.baseY - camY;
    const follow = slot.config.linger ?? 0;
    return x - follow * 24 * Math.tanh(x / 24);
  }

  private create(slot: Slot, kind: 'placeholder' | 'real'): Creature {
    const cfg = slot.config;
    const c =
      kind === 'placeholder'
        ? new PlaceholderCreature(cfg)
        : cfg.kind === 'gltf'
          ? new GLTFCreature(cfg)
          : new VideoCreature(cfg);
    c.baseY = slot.baseY;
    if (cfg.ground) c.groundY = this.groundHeight(cfg.ground, cfg.offset[0], cfg.offset[1]);
    return c;
  }

  private ensurePlaceholder(slot: Slot) {
    if (slot.placeholder || slot.state === 'ready') return;
    const p = this.create(slot, 'placeholder');
    slot.placeholder = p;
    p.load().then(() => this.group.add(p.root));
  }

  private startLoad(slot: Slot) {
    if (slot.state !== 'idle' || slot.config.kind === 'placeholder' || !slot.config.asset) return;
    slot.state = 'loading';
    const real = this.create(slot, 'real');
    real
      .load()
      .then(() => {
        slot.real = real;
        slot.state = 'ready';
        real.setOpacity(0);
        this.group.add(real.root);
      })
      .catch((err) => {
        console.warn(`[Tiefsee] Asset für "${slot.config.id}" nicht geladen, Platzhalter bleibt.`, err);
        slot.state = 'failed';
        real.dispose();
      });
  }

  private unload(slot: Slot) {
    slot.placeholder?.dispose();
    slot.placeholder = null;
    if (slot.real) {
      slot.real.dispose();
      slot.real = null;
      slot.state = 'idle';
      slot.blend = 0;
    }
  }

  update(ctx: CreatureContext, camera: Camera) {
    let best: FocusInfo | null = null;
    let bestScore = Infinity;

    for (const slot of this.slots) {
      const rel = this.relY(slot, ctx.camY);
      const dist = Math.abs(rel);

      if (dist < PRELOAD) {
        if (slot.nearSince < 0) slot.nearSince = ctx.time;
        // erst laden, wenn das Tier eine halbe Sekunde in Reichweite bleibt
        if (ctx.time - slot.nearSince > 0.5) this.startLoad(slot);
        // Platzhalter nur, wenn kein Asset vorgesehen ist, es fehlschlug oder es im Bild noch lädt
        const needsPlaceholder =
          slot.config.kind === 'placeholder' || slot.state === 'failed' || (slot.state === 'loading' && dist < VISIBLE * 0.5);
        if (needsPlaceholder) this.ensurePlaceholder(slot);
      } else {
        slot.nearSince = -1;
        if (dist > this.quality.unloadDistance) {
          this.unload(slot);
          continue;
        }
      }

      const visible = dist < VISIBLE;
      // Überblendung Platzhalter -> Asset
      if (slot.state === 'ready' && slot.real) {
        slot.blend = Math.min(1, slot.blend + ctx.dt * 1.2);
        slot.real.setOpacity(visible ? slot.blend : 0);
        if (slot.placeholder) {
          slot.placeholder.setOpacity(visible ? 1 - slot.blend : 0);
          if (slot.blend >= 1) {
            slot.placeholder.dispose();
            slot.placeholder = null;
          }
        }
      } else if (slot.placeholder) {
        slot.placeholder.setOpacity(visible ? 1 : 0);
      }

      const active = slot.real && slot.state === 'ready' ? slot.real : slot.placeholder;
      if (!visible) continue;
      slot.placeholder?.update(ctx);
      if (slot.real && slot.real !== slot.placeholder) slot.real.update(ctx);

      if (active && slot.config.label !== false) {
        const wp = active.focusPoint(this.tmp);
        const d = wp.distanceTo(ctx.camPos);
        const score = Math.abs(rel) + d * 0.15;
        if (score < bestScore) {
          const ndc = wp.clone().project(camera);
          const inFront = ndc.z < 1 && Math.abs(ndc.x) < 1.15 && Math.abs(ndc.y) < 1.15;
          if (inFront || Math.abs(rel) < 6) {
            bestScore = score;
            const strength = 1 - smoothstep(5, 15, Math.abs(rel));
            best = {
              config: slot.config,
              world: wp.clone(),
              screen: { x: ndc.x, y: ndc.y },
              distance: d,
              strength: inFront ? strength : strength * 0.5,
            };
          }
        }
      }
    }
    this.focus = best;
  }

  getFocus(): FocusInfo | null {
    return this.focus;
  }
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
