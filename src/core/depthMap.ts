import { MonotoneSpline } from './spline';

/** Tiefe des Challenger Deep in Metern. */
export const MAX_DEPTH = 10935;

/** Länge der Kamerafahrt in Welteinheiten. */
export const WORLD_PATH = 1300;

/** Startposition der Kamera knapp unter der Oberfläche. */
export const START_Y = -5;

/**
 * Scroll-Fortschritt (0..1) -> reale Tiefe in Metern.
 * Die Zonen bekommen bewusst ähnlich viel Scrollweg, obwohl sie real
 * sehr unterschiedlich mächtig sind. Sonst wäre die Sonnenlichtzone nach
 * zwei Prozent vorbei.
 */
const depthSpline = new MonotoneSpline([
  [0.0, 0],
  [0.035, 3],
  [0.08, 40],
  [0.18, 200],
  [0.37, 1000],
  [0.57, 4000],
  [0.715, 6000],
  [0.94, MAX_DEPTH - 25],
  [0.975, MAX_DEPTH],
  [1.0, MAX_DEPTH],
]);

/**
 * Scroll-Fortschritt -> Welt-Y der Kamera. Fast linear, damit die Fahrt
 * gleichmäßig wirkt, am Ende sanft abgebremst (Aufsetzen am Grund).
 */
const worldSpline = new MonotoneSpline([
  [0.0, START_Y],
  [0.035, -9],
  [0.5, -9 - (WORLD_PATH - 9) * 0.5],
  [0.94, -WORLD_PATH + 14],
  [0.975, -WORLD_PATH],
  [1.0, -WORLD_PATH],
]);

export function depthAt(progress: number): number {
  return Math.max(0, depthSpline.at(progress));
}

export function worldYAt(progress: number): number {
  return worldSpline.at(progress);
}

export function progressForDepth(depth: number): number {
  return depthSpline.inverse(depth);
}

/** Welt-Y, an dem die Kamera eine bestimmte reale Tiefe erreicht. */
export function worldYForDepth(depth: number): number {
  return worldSpline.at(progressForDepth(depth));
}

/** Welt-Y des Meeresgrunds im Challenger Deep. */
export const FLOOR_Y = -WORLD_PATH - 3.2;
