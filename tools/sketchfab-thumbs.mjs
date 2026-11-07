// Lädt Vorschaubilder für Sketchfab-Modelle (zur Qualitätsbewertung)
import { writeFileSync, mkdirSync } from 'node:fs';
mkdirSync('tools/thumbs', { recursive: true });
for (const uid of process.argv.slice(2)) {
  const m = await (await fetch(`https://api.sketchfab.com/v3/models/${uid}`)).json();
  const imgs = (m.thumbnails?.images ?? []).sort((a, b) => b.width - a.width);
  const img = imgs.find((i) => i.width <= 1024) ?? imgs[0];
  const buf = Buffer.from(await (await fetch(img.url)).arrayBuffer());
  writeFileSync(`tools/thumbs/${uid}.jpg`, buf);
  console.log(uid, m.name, '|', m.license?.label, '|', m.user?.displayName, '|', `${m.faceCount} faces`, '| anim', m.animationCount, '|', m.viewerUrl);
}
