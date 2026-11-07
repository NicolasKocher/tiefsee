import { Creature, type CreatureContext } from './Creature';
import { buildShape, type ShapeInstance } from './shapes';

/** Einfache Silhouette, solange (oder falls) kein echtes Asset vorhanden ist. */
export class PlaceholderCreature extends Creature {
  private shape: ShapeInstance | null = null;

  async load() {
    const p = this.config.placeholder;
    this.shape = buildShape(p.shape, p.length, p.color, p.glow);
    this.body.add(this.shape.object);
  }

  protected animate(ctx: CreatureContext, swim: number) {
    this.shape?.animate(ctx.time, swim);
    for (const m of this.shape?.materials ?? []) {
      const uSwim = m.userData.uSwim as { value: number } | undefined;
      if (uSwim) uSwim.value = swim;
    }
  }

  protected applyOpacity(o: number) {
    for (const m of this.shape?.materials ?? []) {
      if (m.userData.baseOpacity === undefined) m.userData.baseOpacity = m.opacity;
      const wantTransparent = o < 0.999 || m.userData.baseOpacity < 1;
      if (m.transparent !== wantTransparent) {
        m.transparent = wantTransparent;
        m.needsUpdate = true;
      }
      m.opacity = m.userData.baseOpacity * o;
    }
  }
}
