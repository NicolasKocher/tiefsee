# Abtauchen: Eine Reise in die Tiefsee

Scroll-Website: Scrollposition = Tauchtiefe, von der Oberfläche bis zum Challenger Deep (10.935 m).

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # Produktions-Build nach dist/
```

## Debug
- `?depth=4700` springt direkt in eine Tiefe
- `?q=low|medium|high` erzwingt eine Qualitätsstufe

## Struktur
- `src/config/creatures.ts`: alle Tiere (Tiefe, Typ, Asset, Key-Einstellungen, Schwimmpfad, Fakt)
- `src/config/zones.ts`: Tiefenzonen mit Texten
- `src/core/`: Tiefenkurve (Scroll -> Tiefe), Umgebungskurven, Qualitätsstufen
- `src/scene/`: Wasseroberfläche, God Rays, Caustics, Marine Snow, Biolumineszenz, Terrain, Postprocessing
- `src/creatures/`: `Creature`-Basis mit `VideoCreature`, `GLTFCreature`, `PlaceholderCreature`
- `src/ui/`: Overlay (Tiefenmesser, Zonen-Titel, Fakt-Karten) und Credits aus `ASSETS.md`

## Assets
- `ASSETS.md`: Quelle, Link, Lizenz, Autor pro Asset (speist den Credits-Bereich)
- `tools/process-videos.mjs`: Clips zuschneiden, nahtlos loopen, WebM + MP4 exportieren
  (Rohdateien liegen in `tools/raw/`, nicht im Repo)
- `tools/pexels-search.mjs`, `tools/sheet.sh`: Recherche und Kontaktabzüge

## Video-Key-Modi (`VideoCreature`)
- `luma`: Helligkeit als Deckkraft, für Clips vor Schwarz
- `match`: Clip-Hintergrund wird pro Pixel (Mipmap-Schätzung) auf die Wasserfarbe der Szene
  verschoben, das Tier bleibt deckend. Für Blauwasser-Clips.
- `color`, `screen`: klassischer Farb-Key bzw. additive Überlagerung
