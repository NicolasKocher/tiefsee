import gsap from 'gsap';
import { ZONES, zoneAt, type ZoneConfig } from '../config/zones';
import type { EnvState } from '../core/environment';
import type { FocusInfo } from '../creatures/CreatureManager';
import { MAX_DEPTH, progressForDepth } from '../core/depthMap';

const fmtInt = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const fmt1 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function fmtLight(p: number): string {
  if (p >= 1) return `${fmtInt.format(p)} %`;
  if (p >= 0.01) return `${new Intl.NumberFormat('de-DE', { maximumSignificantDigits: 2 }).format(p)} %`;
  if (p >= 1e-6) return '< 0,01 %';
  return '0 %';
}

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

/**
 * HTML-Overlay über dem Canvas: Tiefenmesser, Zonen-Titel, Fakt-Karten,
 * Intro und Finale. Wird jeden Frame mit Tiefe und Fokus gefüttert, schreibt
 * aber nur ins DOM, wenn sich Werte tatsächlich ändern.
 */
export class Overlay {
  private depthNum = $('#depth-num');
  private zoneName = $('#gauge-zone');
  private pressure = $('#stat-pressure');
  private temp = $('#stat-temp');
  private light = $('#stat-light');
  private marker = $('#scale-marker');
  private hero = $('#hero');
  private hint = $('#scroll-hint');
  private finale = $('#finale');
  private gauge = $('#gauge');
  private zoneTitle = $('#zone-title');
  private ztSci = $('#zt-sci');
  private ztName = $('#zt-name');
  private ztText = $('#zt-text');
  private fact = $('#fact');
  private factCard = $('#fact-card');
  private factLine = document.querySelector('#fact-line') as SVGLineElement;
  private factDot = $('#fact-dot');
  private factDepth = $('#fact-depth');
  private factName = $('#fact-name');
  private factLatin = $('#fact-latin');
  private factText = $('#fact-text');

  private lastDepthText = '';
  private currentZone: ZoneConfig | null = null;
  private currentFact: string | null = null;
  private factOpacity = 0;
  private factPos = { x: 0, y: 0 };
  private zoneTimeline: gsap.core.Timeline | null = null;

  constructor() {
    // Zonen-Markierungen auf der Skala (logarithmisch, damit die oberen Zonen lesbar bleiben)
    const scale = $('#scale-ticks');
    for (const z of ZONES) {
      const el = document.createElement('div');
      el.className = 'tick';
      el.style.top = `${this.scalePos(z.from) * 100}%`;
      el.innerHTML = `<span>${fmtInt.format(z.from)}</span>`;
      scale.appendChild(el);
    }
    const end = document.createElement('div');
    end.className = 'tick tick-end';
    end.style.top = '100%';
    end.innerHTML = `<span>${fmtInt.format(MAX_DEPTH)}</span>`;
    scale.appendChild(end);
  }

  /** Position auf der Skala entspricht dem Scrollweg, nicht der linearen Tiefe */
  private scalePos(depth: number) {
    return Math.min(1, progressForDepth(depth) / progressForDepth(MAX_DEPTH));
  }

  update(progress: number, env: EnvState, focus: FocusInfo | null, dt: number) {
    const depth = env.depth;
    const text = fmtInt.format(Math.round(depth));
    if (text !== this.lastDepthText) {
      this.depthNum.textContent = text;
      this.lastDepthText = text;
      this.pressure.textContent = `${fmtInt.format(env.pressureBar)} bar`;
      this.temp.textContent = `${fmt1.format(env.temperatureC)} °C`;
      this.light.textContent = fmtLight(env.lightPercent);
      this.marker.style.transform = `translateY(${this.scalePos(depth) * 100}%)`;
    }

    // Intro und Hinweis ausblenden
    const heroO = 1 - smooth(progress / 0.018);
    this.hero.style.opacity = `${heroO}`;
    this.hero.style.transform = `translateY(${-progress * 1800}px)`;
    this.hero.style.visibility = heroO < 0.01 ? 'hidden' : 'visible';
    this.hint.style.opacity = `${1 - smooth(progress / 0.006)}`;
    this.gauge.style.opacity = `${smooth((progress - 0.004) / 0.012)}`;

    // Finale
    const fin = smooth((progress - 0.955) / 0.02);
    this.finale.style.opacity = `${fin}`;
    this.finale.style.visibility = fin < 0.01 ? 'hidden' : 'visible';

    // Zonen-Titel beim Eintritt in eine neue Zone
    const zone = zoneAt(depth);
    if (progress > 0.02 && zone !== this.currentZone) {
      this.currentZone = zone;
      this.zoneName.textContent = zone.name;
      this.showZone(zone);
    } else if (progress <= 0.02 && this.currentZone) {
      this.currentZone = null;
      this.zoneName.textContent = ZONES[0].name;
    }

    this.updateFact(focus, dt, progress);
  }

  private showZone(z: ZoneConfig) {
    this.ztSci.textContent = `${z.scientific} · ${fmtInt.format(z.from)} bis ${fmtInt.format(z.to)} m`;
    this.ztName.textContent = z.name;
    this.ztText.textContent = z.text;
    this.zoneTimeline?.kill();
    const els = [this.ztSci, this.ztName, this.ztText];
    this.zoneTimeline = gsap
      .timeline()
      .set(this.zoneTitle, { autoAlpha: 1 })
      .fromTo(els, { autoAlpha: 0, y: 24, filter: 'blur(8px)' }, { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: 1.4, stagger: 0.18, ease: 'power3.out' })
      .to(els, { autoAlpha: 0, y: -16, filter: 'blur(6px)', duration: 1.2, stagger: 0.08, ease: 'power2.in' }, '+=3.2')
      .set(this.zoneTitle, { autoAlpha: 0 });
  }

  private updateFact(focus: FocusInfo | null, dt: number, progress: number) {
    // Während ein Zonen-Titel eingeblendet wird, bleibt die Fakt-Karte zurück
    const zoneBusy = this.zoneTimeline?.isActive() ?? false;
    const target = focus && !zoneBusy && progress > 0.022 && progress < 0.955 ? focus.strength : 0;
    if (focus && focus.config.id !== this.currentFact && target > 0.2) {
      // neues Tier: Inhalt erst tauschen, wenn die alte Karte ausgeblendet ist
      if (this.factOpacity < 0.05) {
        this.currentFact = focus.config.id;
        const c = focus.config;
        this.factDepth.textContent = `${fmtInt.format(c.depth)} m`;
        this.factName.textContent = c.name;
        this.factLatin.textContent = c.latin;
        this.factText.textContent = c.fact;
        this.factPos.x = focus.screen.x;
        this.factCardPos.init = false;
        this.factPos.y = focus.screen.y;
      }
    }
    const show = focus && focus.config.id === this.currentFact ? target : 0;
    this.factOpacity += (show - this.factOpacity) * Math.min(1, dt * 3);
    this.fact.style.opacity = `${this.factOpacity}`;
    this.fact.style.visibility = this.factOpacity < 0.01 ? 'hidden' : 'visible';
    if (!focus || focus.config.id !== this.currentFact || this.factOpacity < 0.01) return;

    // Ankerpunkt weich nachführen, damit die Karte nicht zittert
    const k = Math.min(1, dt * 4);
    this.factPos.x += (focus.screen.x - this.factPos.x) * k;
    this.factPos.y += (focus.screen.y - this.factPos.y) * k;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const mobile = w < 760;
    const ax = Math.min(w * 0.92, Math.max(w * 0.08, (this.factPos.x * 0.5 + 0.5) * w));
    const ay = Math.min(h * 0.85, Math.max(h * 0.15, (-this.factPos.y * 0.5 + 0.5) * h));
    this.factDot.style.transform = `translate(${ax}px, ${ay}px)`;

    const card = this.factCard;
    if (mobile) {
      card.style.transform = '';
      this.factLine.setAttribute('x1', `${ax}`);
      this.factLine.setAttribute('y1', `${ay}`);
      const r = card.getBoundingClientRect();
      this.factLine.setAttribute('x2', `${Math.min(Math.max(ax, r.left + 20), r.right - 20)}`);
      this.factLine.setAttribute('y2', `${r.top}`);
      return;
    }
    // Karte neben dem Tier, ohne es zu verdecken und nicht unter dem Tiefenmesser.
    // Die Seite wechselt nur, wenn sie wirklich nicht mehr passt (Hysterese).
    const cw = 340;
    const gap = 80;
    const maxX = w - 250 - cw;
    const fitsRight = ax + gap <= maxX;
    const fitsLeft = ax - gap - cw >= 32;
    if (this.factSide === 'right' && !fitsRight) this.factSide = fitsLeft ? 'left' : 'top';
    else if (this.factSide === 'left' && !fitsLeft) this.factSide = fitsRight ? 'right' : 'top';
    else if (this.factSide === 'top' && (fitsRight || fitsLeft)) this.factSide = fitsRight ? 'right' : 'left';

    let cx: number;
    let cy: number;
    if (this.factSide === 'top') {
      // kein Platz daneben: Karte oben oder unten links, je nachdem wo das Tier nicht ist
      const ch = card.offsetHeight || 220;
      cx = 32;
      cy = ay > h * 0.5 ? 84 : h - ch - 48;
    } else {
      cx = this.factSide === 'right' ? ax + gap : ax - gap - cw;
      cy = Math.min(h - 290, Math.max(84, ay - 150));
    }
    const kc = this.factCardPos.init ? Math.min(1, dt * 5) : 1;
    this.factCardPos.x += (cx - this.factCardPos.x) * kc;
    this.factCardPos.y += (cy - this.factCardPos.y) * kc;
    this.factCardPos.init = true;
    card.style.transform = `translate(${this.factCardPos.x}px, ${this.factCardPos.y}px)`;
    const lx = this.factSide === 'left' ? this.factCardPos.x + cw : this.factCardPos.x;
    const cardBelow = this.factSide === 'top' && this.factCardPos.y > ay;
    const ly = this.factSide === 'top' ? (cardBelow ? this.factCardPos.y : this.factCardPos.y + card.offsetHeight) : this.factCardPos.y + 26;
    this.factLine.setAttribute('x1', `${ax}`);
    this.factLine.setAttribute('y1', `${ay}`);
    this.factLine.setAttribute('x2', `${this.factSide === 'top' ? Math.min(Math.max(ax, 52), cw) : lx}`);
    this.factLine.setAttribute('y2', `${ly}`);
  }

  private factSide: 'left' | 'right' | 'top' = 'right';
  private factCardPos = { x: 0, y: 0, init: false };
}

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
