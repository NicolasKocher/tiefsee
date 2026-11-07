import assetsMd from '../../ASSETS.md?raw';

interface CreditRow {
  asset: string;
  type: string;
  author: string;
  source: string;
  link: string;
  license: string;
}

/** Liest die Tabelle aus ASSETS.md und baut daraus den Credits-Bereich. */
export function parseAssets(md: string): CreditRow[] {
  const rows: CreditRow[] = [];
  const lines = md.split(/\r?\n/).filter((l) => l.trim().startsWith('|'));
  if (lines.length < 3) return rows;
  const header = lines[0].split('|').map((s) => s.trim().toLowerCase());
  const col = (name: string) => header.findIndex((h) => h.startsWith(name));
  const idx = {
    asset: col('asset'),
    type: col('typ'),
    author: col('autor'),
    source: col('quelle'),
    link: col('link'),
    license: col('lizenz'),
  };
  for (const line of lines.slice(2)) {
    const cells = line.split('|').map((s) => s.trim());
    const get = (i: number) => (i >= 0 ? (cells[i] ?? '') : '');
    const linkCell = get(idx.link);
    const m = linkCell.match(/\((https?:[^)]+)\)/) || linkCell.match(/(https?:\S+)/);
    rows.push({
      asset: get(idx.asset),
      type: get(idx.type),
      author: get(idx.author),
      source: get(idx.source),
      link: m ? m[1] : '',
      license: get(idx.license),
    });
  }
  return rows.filter((r) => r.asset);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function renderCredits(container: HTMLElement) {
  const rows = parseAssets(assetsMd);
  const list = container.querySelector('#credits-list')!;
  if (!rows.length) {
    list.innerHTML = '<p class="credits-empty">Alle Umgebungseffekte sind prozedural erzeugt.</p>';
    return;
  }
  list.innerHTML = rows
    .map(
      (r) => `
      <li>
        <span class="c-asset">${esc(r.asset)}</span>
        <span class="c-meta">${esc(r.type)} · ${r.link ? `<a href="${esc(r.link)}" target="_blank" rel="noopener">${esc(r.author || r.source)}</a>` : esc(r.author)} · ${esc(r.source)}</span>
        <span class="c-license">${esc(r.license)}</span>
      </li>`,
    )
    .join('');
}
