export type QualityTier = 'high' | 'medium' | 'low';

export interface QualitySettings {
  tier: QualityTier;
  maxPixelRatio: number;
  snowCount: number;
  biolumCount: number;
  godRays: number;
  dof: boolean;
  bloomResolution: number;
  terrainSegments: number;
  /** Tiere, die weiter als diese Strecke (Welteinheiten) entfernt sind, werden entladen */
  unloadDistance: number;
}

const PRESETS: Record<QualityTier, Omit<QualitySettings, 'tier'>> = {
  high: {
    maxPixelRatio: 1.75,
    snowCount: 9000,
    biolumCount: 1400,
    godRays: 26,
    dof: true,
    bloomResolution: 0.5,
    terrainSegments: 1,
    unloadDistance: 260,
  },
  medium: {
    maxPixelRatio: 1.25,
    snowCount: 5000,
    biolumCount: 800,
    godRays: 18,
    dof: true,
    bloomResolution: 0.4,
    terrainSegments: 0.7,
    unloadDistance: 200,
  },
  low: {
    maxPixelRatio: 1,
    snowCount: 2200,
    biolumCount: 400,
    godRays: 10,
    dof: false,
    bloomResolution: 0.3,
    terrainSegments: 0.45,
    unloadDistance: 140,
  },
};

export function detectTier(): QualityTier {
  const forced = new URLSearchParams(location.search).get('q');
  if (forced === 'high' || forced === 'medium' || forced === 'low') return forced;

  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(screen.width, screen.height) < 820;
  const cores = navigator.hardwareConcurrency || 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;

  if (coarse && small) return cores >= 8 && mem >= 6 ? 'medium' : 'low';
  if (cores <= 4 || mem <= 4) return 'medium';
  return 'high';
}

export function qualityFor(tier: QualityTier): QualitySettings {
  return { tier, ...PRESETS[tier] };
}

export const prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
