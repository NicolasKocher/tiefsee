// Pexels-Videosuche ohne API-Key: liest die eingebetteten Seitendaten aus.
// Ausgabe: id | Dauer | Größe | Titel | Autor | bestes HD-File | Vorschaubild
import { execFileSync } from 'node:child_process';
const q = process.argv.slice(2).join(' ');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
// curl statt fetch: Cloudflare liefert fetch eine Challenge-Seite
const html = execFileSync('curl', ['-sL', '-A', UA, `https://www.pexels.com/search/videos/${encodeURIComponent(q)}/?orientation=landscape`], { maxBuffer: 64 << 20 }).toString();
const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
if (!m) { console.log('keine Daten'); process.exit(); }
const data = JSON.parse(m[1]);
const found = [];
(function walk(o) {
  if (!o || typeof o !== 'object') return;
  if (o.type === 'video' && o.attributes?.video) found.push(o.attributes);
  else if (o.attributes?.video_files || o.attributes?.video?.video_files) found.push(o.attributes);
  for (const k in o) walk(o[k]);
})(data);
const seen = new Set();
for (const a of found) {
  if (seen.has(a.id)) continue; seen.add(a.id);
  const files = a.video?.video_files ?? a.video_files ?? [];
  const best = files.filter((f) => f.width >= 1280 && f.width <= 1920 && f.width > f.height).sort((x, y) => y.width - x.width)[0];
  const thumb = a.video?.thumbnail?.medium ?? a.image?.medium ?? a.video?.preview_src ?? '';
  console.log([a.id, `${a.video?.duration ?? '?'}s`, `${a.width}x${a.height}`, a.title, a.user?.username ?? a.user?.first_name, best?.link ?? '-', thumb].join(' | '));
}
