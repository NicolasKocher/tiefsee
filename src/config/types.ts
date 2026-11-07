export type Vec3 = [number, number, number];

export type SwimPath =
  /** Hin- und herschwimmen zwischen zwei Punkten (relativ zum Anker), mit Wendung. */
  | { type: 'line'; from: Vec3; to: Vec3; speed: number; bob?: number }
  /** Kreis um den Anker, optional geneigt. */
  | { type: 'orbit'; radius: number; speed: number; tilt?: number; bob?: number; clockwise?: boolean }
  /** Schweben am Ort mit sanftem Treiben (Quallen, Anglerfisch). */
  | { type: 'drift'; amplitude: number; speed: number; heading?: number }
  /** Einmaliges Durchqueren des Bildes, gekoppelt an die Begegnung (Wal, Manta). */
  | { type: 'pass'; from: Vec3; to: Vec3; bob?: number };

export type CreatureKind = 'gltf' | 'video' | 'placeholder';

export type PlaceholderShape =
  | 'fish'
  | 'school'
  | 'turtle'
  | 'manta'
  | 'dolphin'
  | 'jelly'
  | 'lanternfish'
  | 'squid'
  | 'whale'
  | 'angler'
  | 'giantsquid'
  | 'dumbo'
  | 'seapig'
  | 'tripod'
  | 'snailfish'
  | 'amphipod';

export interface VideoOptions {
  /** 'luma': Helligkeit wird zu Alpha (schwarzer Hintergrund). 'screen': additive Überlagerung. 'color': Farbabstand zum Hintergrund */
  key: 'luma' | 'screen' | 'color' | 'match';
  threshold?: number;
  softness?: number;
  /** Hintergrundfarbe für den Farbabstands-Key (sRGB 0..1) */
  keyColor?: Vec3;
  /** Breite in Welteinheiten (Höhe ergibt sich aus dem Seitenverhältnis) */
  width: number;
  /** Zuschnitt im Clip (u0, v0, u1, v1) */
  crop?: [number, number, number, number];
  exposure?: number;
  saturation?: number;
  /** Ränder weich ausblenden */
  edgeFeather?: number;
  flipX?: boolean;
  /** Gewicht des Helligkeitsunterschieds beim Farb-Key (0 = nur Farbton) */
  lumaWeight?: number;
  /** Elliptische Maske: ab diesem Radius (0..1) wird ausgeblendet */
  matte?: number;
  /** match-Modus: Deckkraft des (farblich angepassten) Clip-Hintergrunds */
  baseAlpha?: number;
  /** match-Modus: Helligkeitsfaktor der Zielwasserfarbe */
  waterMatch?: number;
  /** match-Modus: Tier über den Abstand zum lokal geschätzten Hintergrund erkennen (für kleine Tiere) */
  localKey?: boolean;
  /** Abspielgeschwindigkeit */
  playbackRate?: number;
}

export interface GLTFOptions {
  /** Länge des Tiers in Welteinheiten (Modell wird darauf normiert) */
  length: number;
  /** Zusätzliche Rotation, damit das Modell entlang +X (Schwimmrichtung) zeigt */
  rotation?: Vec3;
  animation?: string;
  timeScale?: number;
  /** Instanzen als Schwarm (nur für statische Fisch-Modelle mit Vertex-Wiggle) */
  school?: { count: number; spread: Vec3 };
  envIntensity?: number;
  emissiveBoost?: number;
  tint?: string;
  roughness?: number;
  /** Prozedurales Schwimmen per Vertex-Shader, falls keine Animation existiert */
  wiggle?: { amplitude: number; frequency: number; speed: number };
}

export interface CreatureConfig {
  id: string;
  name: string;
  latin: string;
  /** Reale Tiefe in Metern, an der die Begegnung stattfindet */
  depth: number;
  fact: string;
  kind: CreatureKind;
  /** Pfad unter /public, z. B. 'assets/models/turtle.glb' */
  asset?: string;
  gltf?: GLTFOptions;
  video?: VideoOptions;
  placeholder: { shape: PlaceholderShape; length: number; color?: string; glow?: string };
  /** Position des Ankers relativ zum Kamerapfad (x seitlich, z nach vorne negativ) */
  offset: [number, number];
  path: SwimPath;
  /** 0..0.9: wie stark das Tier die Kamera begleitet (verlängert die Begegnung) */
  linger?: number;
  /** Auf dem Boden platzieren statt frei schwebend */
  ground?: 'plain' | 'floor';
  /** Fakt-Karte anzeigen (Standard: true) */
  label?: boolean;
  /** Lichtstimmung pro Tier (Phase 3) */
  light?: { key?: number; rim?: string; rimIntensity?: number };
}
