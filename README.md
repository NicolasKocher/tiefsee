# Abtauchen: A Journey into the Deep Sea

A scroll-driven website that takes you from the ocean surface down to the bottom of the
Challenger Deep in the Mariana Trench (10,935 m). Your scroll position is your dive depth.
A live depth gauge counts along, the water fades from turquoise to deep blue to black until
only bioluminescence remains, and on the way you meet real animals of each depth zone.

The site itself is in German.

## Features

- **Fully procedural environment** in Three.js with custom GLSL shaders
  - Water surface seen from below, including Snell's window and total internal reflection
  - Caustics and volumetric light shafts that fade with depth
  - Depth-dependent fog and color grading (turquoise, deep blue, black)
  - Marine snow: thousands of instanced particles with drift and fake bokeh
  - Bioluminescent particles that react to the mouse
  - Procedural abyssal plain with manganese nodules, trench wall and Challenger Deep floor
- **Postprocessing**: depth of field with automatic rack focus on the current animal,
  bloom, AgX tone mapping, vignette, film grain and subtle water distortion
- **Submersible lighting** from the twilight zone down: floodlights, a tracking key light
  and a rim light that follow the animal in focus
- **Real footage** of 12 animals from NOAA Ocean Exploration and Pexels, composited into
  the scene (see [Video compositing](#video-compositing))
- **Overlay** with depth gauge, pressure, temperature, light level, zone titles and fact
  cards anchored to the animals
- **Credits** generated at build time from [`ASSETS.md`](ASSETS.md)
- **Performance**: per-zone lazy loading, capped pixel ratio, quality tiers for mobile,
  dynamic resolution, `prefers-reduced-motion` support

## Tech stack

Vite, TypeScript, Three.js (vanilla), pmndrs/postprocessing, GSAP + ScrollTrigger, Lenis

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
```

### URL parameters

| Parameter | Effect |
|---|---|
| `?depth=4700` | Jump straight to a depth in meters |
| `?q=low\|medium\|high` | Force a quality tier |

## Project structure

```
src/
  config/      creatures.ts (all animals), zones.ts (depth zones and texts), types.ts
  core/        scroll-to-depth curve, environment curves, quality tiers, noise
  scene/       World, water surface, god rays, caustics, marine snow,
               bioluminescence, seafloor, postprocessing effects
  creatures/   Creature base class with VideoCreature, GLTFCreature, PlaceholderCreature,
               CreatureManager (lazy loading, focus, fact cards)
  ui/          overlay (gauge, zone titles, fact cards) and credits
tools/         asset research and processing scripts
public/assets/ processed video clips (WebM + MP4)
```

### Adding an animal

Every animal is one entry in [`src/config/creatures.ts`](src/config/creatures.ts): depth,
type (`video`, `gltf` or `placeholder`), asset path, key settings, swim path and fact text.
If an asset is missing or fails to load, a procedural placeholder silhouette is shown instead.

## Video compositing

`VideoCreature` renders a clip on a camera-facing plane, integrated into the scene's fog
and light. Key modes:

- `luma`: brightness becomes opacity. For deep-sea clips shot against black.
- `match`: the clip background is estimated per pixel from a blurred mipmap level and
  shifted to the scene's water color, while the animal stays opaque. Used for open-water
  clips with uneven blue backgrounds.
- `color`: classic chroma key in YCbCr space with background unmixing.
- `screen`: additive blending for glowing animals.

## Assets and licenses

All assets allow commercial use. Every asset is listed with source, link, author and
license in [`ASSETS.md`](ASSETS.md), which also feeds the credits section of the site.

- **NOAA Ocean Exploration**: works of the US federal government are in the public domain
  (17 U.S.C. § 105). Only clips credited solely to NOAA were used.
- **Pexels**: Pexels License, free for commercial use.
- **Fonts**: Cormorant Garamond, Inter and JetBrains Mono under the SIL Open Font License.

### Processing pipeline

[`tools/process-videos.mjs`](tools/process-videos.mjs) trims and crops the raw clips,
creates seamless loops via crossfade (or ping-pong for very short clips), scales them down,
strips audio and exports WebM (VP9) and MP4 (H.264). It also measures the background color
used for keying. Raw source files are expected in `tools/raw/` and are not part of the repo.

Helper scripts for research: `tools/pexels-search.mjs`, `tools/pexels-sheet.mjs` and
`tools/sheet.sh` (contact sheets for reviewing clips).
