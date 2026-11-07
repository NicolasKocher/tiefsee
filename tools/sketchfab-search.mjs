// Sucht herunterladbare, animierte Modelle mit kommerziell nutzbarer Lizenz (CC-BY / CC0)
const q = process.argv.slice(2).join(' ');
const params = new URLSearchParams({ type: 'models', q, downloadable: 'true', sort_by: '-likeCount', count: '24' });
const res = await fetch(`https://api.sketchfab.com/v3/search?${params}`);
const data = await res.json();
for (const m of data.results ?? []) {
  const lic = m.license?.label ?? '?';
  if (!/CC Attribution$|CC0|Public Domain/i.test(lic) && !/^CC Attribution$/i.test(lic)) continue;
  console.log([m.uid, m.likeCount, m.animationCount ? `anim:${m.animationCount}` : 'static', `${Math.round(m.faceCount / 1000)}k`, lic, m.name, m.user?.username].join(' | '));
}
