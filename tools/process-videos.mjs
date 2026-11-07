// Bereitet Rohclips für VideoCreature auf:
//  - Ausschnitt (Start/Ende) und Zuschnitt (Wasserzeichen, Einblendungen entfernen)
//  - nahtloser Loop per Crossfade (Ende blendet in den Anfang)
//  - Verkleinern, ohne Ton, WebM (VP9) + MP4 (H.264, faststart)
//  - misst die Hintergrundfarbe an den Rändern (für den Farb-Key)
// Aufruf: node tools/process-videos.mjs [id ...]
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ffmpegPath from 'ffmpeg-static';

const ROOT = resolve(import.meta.dirname, '..');
const RAW = join(ROOT, 'tools', 'raw');
const OUT = join(ROOT, 'public', 'assets', 'videos');
mkdirSync(OUT, { recursive: true });

/** Clip-Definitionen. crop = [x, y, w, h] in Quellpixeln. */
const CLIPS = [
  { id: 'helmet-jelly', src: 'dive08-merchant-cap-jelly-1280x720-1.mp4', start: 15.5, end: 31.5, crop: [0, 50, 1280, 670], width: 960 },
  { id: 'atolla', src: 'dive03-atolla-jelly-1280x720-1.mp4', start: 9.6, end: 33.0, crop: [0, 0, 1280, 720], width: 960 },
  { id: 'glass-squid', src: 'ex1708-glass-squid.mp4', start: 5.0, end: 8.6, crop: [0, 0, 1920, 1080], width: 960, pingpong: true, speed: 0.7 },
  { id: 'bigfin-squid', src: 'dive10-bigfin-squid-1280x720-1.mp4', start: 35.0, end: 64.0, crop: [0, 0, 1280, 720], width: 960 },
  { id: 'dumbo', src: 'dumbo-atlantis-1280x720-1.mp4', start: 5.2, end: 14.2, crop: [0, 0, 1280, 720], width: 960 },
  { id: 'swimming-cucumber', src: 'ex1502-seapig.mp4', start: 17.5, end: 42.5, crop: [0, 0, 1920, 1080], width: 960, crf: 40 },
  { id: 'fangtooth', src: 'EX1708-Fangtooth-1920x1080-1.mp4', start: 8.0, end: 19.0, crop: [0, 0, 1920, 1080], width: 960 },
  { id: 'whiplash-squid', src: 'ex1905-whiplash-squid.mp4', start: 7.6, end: 28.6, crop: [0, 0, 1920, 1080], width: 960, crf: 42 },
  // Pexels (Sonnenlichtzone)
  { id: 'turtle', src: 'px-34139432.mp4', start: 0.2, end: 13.2, crop: [0, 260, 1920, 820], width: 1100 },
  { id: 'manta', src: 'px-18932577.mp4', start: 0.0, end: 8.6, crop: [0, 0, 1920, 1080], width: 1100 },
  { id: 'dolphins', src: 'px-5607988.mp4', start: 0.5, end: 19.5, crop: [0, 0, 1920, 1080], width: 1100 },
  { id: 'sardines', src: 'px-34046687.mp4', start: 0.0, end: 3.3, crop: [0, 0, 1920, 900], width: 1100, pingpong: true, speed: 0.6, crf: 40 },
  { id: 'humpback', src: 'px-15546563.mp4', start: 0.0, end: 50.0, crop: [0, 280, 1920, 800], width: 1100 },
];

const XF = 1.2; // Crossfade-Dauer in Sekunden
// Rohclips stammen teils aus 4K-Quellen; Zuschnitt bezieht sich auf die geladene Auflösung

function ff(args) {
  execFileSync(ffmpegPath, ['-v', 'error', '-y', ...args], { stdio: 'inherit' });
}

function sampleBackground(file, t, crop) {
  // Mittelwert eines 8x8-Pixel-Felds in vier Ecken des Zuschnitts
  const [x, y, w, h] = crop;
  const pts = [
    [x + 24, y + 24],
    [x + w - 32, y + 24],
    [x + 24, y + h - 32],
    [x + w - 32, y + h - 32],
  ];
  const cols = pts.map(([px, py]) => {
    const buf = execFileSync(ffmpegPath, ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', `crop=8:8:${px}:${py},scale=1:1:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
    return [buf[0] / 255, buf[1] / 255, buf[2] / 255];
  });
  // Median pro Kanal, robust gegen ein Tier in einer Ecke
  const med = (i) => cols.map((c) => c[i]).sort((a, b) => a - b).slice(1, 3).reduce((a, b) => a + b) / 2;
  return [med(0), med(1), med(2)].map((v) => +v.toFixed(3));
}

const only = process.argv.slice(2);
for (const c of CLIPS) {
  if (only.length && !only.includes(c.id)) continue;
  const src = join(RAW, c.src);
  if (!existsSync(src)) {
    console.warn(`fehlt: ${c.src}`);
    continue;
  }
  const [x, y, w, h] = c.crop;
  const len = c.end - c.start;
  const outH = Math.round((c.width * h) / w / 2) * 2;
  const base = `crop=${w}:${h}:${x}:${y},scale=${c.width}:${outH}:flags=lanczos,fps=30,format=yuv420p`;
  // v1 = [start+XF, end], v2 = [start, start+XF]; v1-Ende blendet in v2 -> letzter Frame == erster Frame
  // Ping-Pong: vorwärts + rückwärts (für sehr kurze Clips, z. B. Schwarm); optional verlangsamt
  const slow = c.speed ? `,setpts=PTS/${c.speed}` : '';
  const filter = c.pingpong
    ? `[0:v]trim=start=${c.start}:end=${c.end},setpts=PTS-STARTPTS,${base}${slow},split[f][r];[r]reverse[rv];[f][rv]concat=n=2:v=1,format=yuv420p[v]`
    : `[0:v]trim=start=${c.start + XF}:end=${c.end},setpts=PTS-STARTPTS,${base}[a];` +
      `[0:v]trim=start=${c.start}:end=${c.start + XF},setpts=PTS-STARTPTS,${base}[b];` +
      `[a][b]xfade=transition=fade:duration=${XF}:offset=${(len - XF - XF).toFixed(3)},format=yuv420p[v]`;

  const webm = join(OUT, `${c.id}.webm`);
  const mp4 = join(OUT, `${c.id}.mp4`);
  ff(['-i', src, '-filter_complex', filter, '-map', '[v]', '-an', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(c.crf ?? 36), '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', webm]);
  ff(['-i', src, '-filter_complex', filter, '-map', '[v]', '-an', '-c:v', 'libx264', '-crf', String((c.crf ?? 36) - 12), '-preset', 'slow', '-profile:v', 'high', '-movflags', '+faststart', mp4]);
  const bg = sampleBackground(src, c.start + len / 2, c.crop);
  const kb = (f) => Math.round(statSync(f).size / 1024);
  console.log(JSON.stringify({ id: c.id, size: [c.width, outH], seconds: +(len - XF).toFixed(2), webmKB: kb(webm), mp4KB: kb(mp4), background: bg }));
}
