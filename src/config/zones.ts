export interface ZoneConfig {
  id: string;
  name: string;
  scientific: string;
  from: number;
  to: number;
  text: string;
}

export const ZONES: ZoneConfig[] = [
  {
    id: 'epi',
    name: 'Sonnenlichtzone',
    scientific: 'Epipelagial',
    from: 0,
    to: 200,
    text: 'Hier lebt der Großteil aller bekannten Meerestiere. Das Phytoplankton dieser dünnen Schicht erzeugt rund die Hälfte des Sauerstoffs, den wir atmen.',
  },
  {
    id: 'meso',
    name: 'Dämmerzone',
    scientific: 'Mesopelagial',
    from: 200,
    to: 1000,
    text: 'Das Licht reicht nicht mehr für Photosynthese. Viele Tiere sind silbrig, rot oder durchsichtig. Hier beginnt das Leuchten.',
  },
  {
    id: 'bathy',
    name: 'Mitternachtszone',
    scientific: 'Bathypelagial',
    from: 1000,
    to: 4000,
    text: 'Kein Sonnenlicht dringt mehr hierher. Das einzige Licht erzeugen die Tiere selbst, um zu jagen, zu locken oder sich zu tarnen.',
  },
  {
    id: 'abyss',
    name: 'Abyssal',
    scientific: 'Abyssopelagial',
    from: 4000,
    to: 6000,
    text: 'Nahe dem Gefrierpunkt, ewige Nacht, über 400 bar Druck. Die Tiefseeebenen bedecken rund die Hälfte der Erdoberfläche.',
  },
  {
    id: 'hadal',
    name: 'Hadal',
    scientific: 'Hadopelagial',
    from: 6000,
    to: 10935,
    text: 'Benannt nach Hades, dem Herrscher der Unterwelt. Die Tiefseegräben machen weniger als zwei Prozent des Meeresbodens aus und sind kaum erforscht.',
  },
];

export function zoneAt(depth: number): ZoneConfig {
  for (const z of ZONES) if (depth < z.to) return z;
  return ZONES[ZONES.length - 1];
}
