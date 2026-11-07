// Gibt Autor und Seiten-URL für Pexels-Video-IDs aus (aus den Suchseiten-Daten)
import { execFileSync } from 'node:child_process';
const [term, ...ids] = process.argv.slice(2);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';
const html = execFileSync('curl', ['-sL', '-A', UA, `https://www.pexels.com/search/videos/${encodeURIComponent(term)}/?orientation=landscape`], { maxBuffer: 64 << 20 }).toString();
const data = JSON.parse(html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)[1]);
(function walk(o) {
  if (!o || typeof o !== 'object') return;
  if (o.attributes && ids.includes(String(o.attributes.id)) && o.attributes.user) {
    const a = o.attributes;
    console.log(a.id, '|', [a.user.first_name, a.user.last_name].filter(Boolean).join(' '), '| @' + a.user.username, '|', `https://www.pexels.com/video/${a.slug}-${a.id}/`);
    ids.splice(ids.indexOf(String(a.id)), 1);
  }
  for (const k in o) walk(o[k]);
})(data);
