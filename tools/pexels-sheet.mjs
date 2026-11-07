// Sucht auf Pexels und erzeugt einen nummerierten Vorschau-Kontaktabzug.
// node tools/pexels-sheet.mjs <name> <suchbegriff...>
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import ffmpeg from 'ffmpeg-static';
const [name, ...q] = process.argv.slice(2);
const out = execFileSync('node', ['tools/pexels-search.mjs', ...q]).toString().trim().split('\n').filter((l) => l.includes('|'));
const rows = out.slice(0, 16).map((l) => l.split(' | '));
mkdirSync('tools/thumbs/px', { recursive: true });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';
const files = [];
rows.forEach((r, i) => {
  const f = `tools/thumbs/px/${r[0]}.jpg`;
  try { execFileSync('curl', ['-sL', '-A', UA, '-o', f, r[6]]); files.push(f); } catch { /* übersprungen */ }
});
const args = ['-v', 'error', '-y'];
files.forEach((f) => args.push('-i', f));
let fc = '';
files.forEach((_, i) => (fc += `[${i}]scale=320:180:force_original_aspect_ratio=increase,crop=320:180,setsar=1,drawtext=text='${i}':x=6:y=4:fontsize=26:fontcolor=yellow:borderw=2[v${i}];`));
const layout = files.map((_, i) => `${(i % 4) * 320}_${Math.floor(i / 4) * 180}`).join('|');
fc += files.map((_, i) => `[v${i}]`).join('') + `xstack=inputs=${files.length}:layout=${layout}:fill=black`;
args.push('-filter_complex', fc, '-frames:v', '1', `tools/sheets/px-${name}.jpg`);
execFileSync(ffmpeg, args);
writeFileSync(`tools/sheets/px-${name}.txt`, rows.map((r, i) => `${i} | ${r.slice(0, 6).join(' | ')}`).join('\n'));
console.log(rows.map((r, i) => `${i} | ${r[0]} | ${r[2]} | ${r[3]} | ${r[4]}`).join('\n'));
