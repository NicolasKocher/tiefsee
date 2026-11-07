import '@fontsource/cormorant-garamond/300.css';
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './style.css';

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { World } from './scene/World';
import { Overlay } from './ui/Overlay';
import { renderCredits } from './ui/Credits';
import { detectTier, prefersReducedMotion, qualityFor } from './core/quality';
import { progressForDepth } from './core/depthMap';

gsap.registerPlugin(ScrollTrigger);

const quality = qualityFor(detectTier());
const canvas = document.getElementById('gl') as HTMLCanvasElement;
const world = new World(canvas, quality, prefersReducedMotion);
const overlay = new Overlay();
renderCredits(document.getElementById('credits')!);

// ── Scroll ──────────────────────────────────────────────
// Lenis glättet das Scrollen, ScrollTrigger liefert den Fortschritt der Tauchfahrt.
// Bei reduzierter Bewegung bleibt das native Scrollen aktiv.
let lenis: Lenis | null = null;
if (!prefersReducedMotion) {
  lenis = new Lenis({ lerp: 0.075, wheelMultiplier: 0.9, touchMultiplier: 1.4 });
  lenis.on('scroll', ScrollTrigger.update);
}

const scroll = { target: 0, value: 0 };
let scrollReady = false;
ScrollTrigger.create({
  trigger: '#scroll-track',
  start: 'top top',
  end: 'bottom bottom',
  onUpdate: (self) => {
    scroll.target = self.progress;
  },
  onRefresh: (self) => {
    // Beim Start direkt an die aktuelle Position springen statt hinzufahren
    if (!scrollReady) {
      scroll.target = scroll.value = self.progress;
      scrollReady = true;
    }
  },
});

// Credits-Bereich: Overlay ausblenden, sobald er ins Bild scrollt
gsap.to('#overlay', {
  autoAlpha: 0,
  ease: 'none',
  scrollTrigger: { trigger: '#credits', start: 'top 85%', end: 'top 35%', scrub: true },
});

// ── Render-Loop ────────────────────────────────────────
// Alles hängt am GSAP-Ticker, damit Lenis, ScrollTrigger und WebGL im selben Takt laufen.
let frameTimes: number[] = [];
let adaptiveChecks = 0;
let last = performance.now();

gsap.ticker.lagSmoothing(0);
gsap.ticker.add((time) => {
  lenis?.raf(time * 1000);
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  // Zusätzliche Dämpfung der Kamerafahrt: keine Sprünge, auch bei schnellem Scrollen
  const k = prefersReducedMotion ? 1 : 1 - Math.exp(-dt * 4.5);
  scroll.value += (scroll.target - scroll.value) * k;

  world.update(scroll.value, dt);
  overlay.update(scroll.value, world.env, world.creatures.getFocus(), dt);

  adaptQuality(dt);
  if (!document.body.classList.contains('ready')) {
    requestAnimationFrame(() => document.body.classList.add('ready'));
  }
});

/**
 * Dynamische Auflösung: Fällt die Bildrate dauerhaft unter ~45 fps, wird die
 * Pixel Ratio schrittweise reduziert. Steigt sie wieder, geht es behutsam hoch.
 */
function adaptQuality(dt: number) {
  frameTimes.push(dt);
  if (frameTimes.length < 90) return;
  frameTimes.sort((a, b) => a - b);
  const median = frameTimes[Math.floor(frameTimes.length / 2)];
  frameTimes = [];
  adaptiveChecks++;
  if (adaptiveChecks < 2) return; // Einschwingen nach dem Laden abwarten
  const pr = world.getPixelRatio();
  const max = Math.min(window.devicePixelRatio, quality.maxPixelRatio);
  if (median > 1 / 45 && pr > 0.6) world.setPixelRatio(Math.max(0.6, pr * 0.85));
  else if (median < 1 / 58 && pr < max) world.setPixelRatio(Math.min(max, pr * 1.08));
}

// Nach Seitenreload oben beginnen, damit Intro und Tiefenmesser stimmen
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

// Debug-Helfer: ?depth=4000 springt direkt in eine Tiefe
const jump = new URLSearchParams(location.search).get('depth');
if (jump) {
  {
    requestAnimationFrame(() => {
      const p = progressForDepth(Number(jump));
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const track = document.getElementById('scroll-track')!;
      const y = p * (track.offsetHeight - window.innerHeight);
      window.scrollTo(0, Math.min(max, y));
      lenis?.scrollTo(y, { immediate: true });
      scroll.value = scroll.target = p;
    });
  }
}

if (import.meta.env.DEV) {
  // Debug: rendert synchron eine Tiefe (auch in Hintergrund-Tabs ohne rAF)
  const renderAt = async (depth: number, frames = 120) => {
    const p = progressForDepth(depth);
    const track = document.getElementById('scroll-track')!;
    const y = p * (track.offsetHeight - window.innerHeight);
    window.scrollTo(0, y);
    lenis?.scrollTo(y, { immediate: true, force: true });
    ScrollTrigger.update();
    document.body.classList.add('ready');
    scroll.value = scroll.target = p;
    for (let i = 0; i < frames; i++) {
      world.update(p, 1 / 60);
      overlay.update(p, world.env, world.creatures.getFocus(), 1 / 60);
      if (i % 30 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    return { depth, p, focus: world.creatures.getFocus()?.config.id ?? null };
  };
  (window as unknown as { __tiefsee: unknown }).__tiefsee = { world, scroll, renderAt };
}
