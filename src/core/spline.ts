/**
 * Monotone kubische Interpolation (Fritsch-Carlson).
 * Garantiert, dass zwischen monotonen Stützstellen keine Überschwinger entstehen.
 * Damit bleibt der Tiefenmesser streng steigend und die Kamerafahrt ohne Ruckler.
 */
export class MonotoneSpline {
  private xs: number[];
  private ys: number[];
  private ms: number[];

  constructor(points: [number, number][]) {
    this.xs = points.map((p) => p[0]);
    this.ys = points.map((p) => p[1]);
    const n = points.length;
    const d: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      d.push((this.ys[i + 1] - this.ys[i]) / (this.xs[i + 1] - this.xs[i]));
    }
    const m: number[] = new Array(n);
    m[0] = d[0];
    m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) {
      m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    }
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) {
        m[i] = 0;
        m[i + 1] = 0;
        continue;
      }
      const a = m[i] / d[i];
      const b = m[i + 1] / d[i];
      const s = a * a + b * b;
      if (s > 9) {
        const t = 3 / Math.sqrt(s);
        m[i] = t * a * d[i];
        m[i + 1] = t * b * d[i];
      }
    }
    this.ms = m;
  }

  at(x: number): number {
    const { xs, ys, ms } = this;
    const n = xs.length;
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * ys[i] +
      (t3 - 2 * t2 + t) * h * ms[i] +
      (-2 * t3 + 3 * t2) * ys[i + 1] +
      (t3 - t2) * h * ms[i + 1]
    );
  }

  /** Umkehrfunktion per Bisektion (funktioniert, weil die Kurve monoton ist). */
  inverse(y: number): number {
    const { xs } = this;
    let lo = xs[0];
    let hi = xs[xs.length - 1];
    const rising = this.at(hi) >= this.at(lo);
    for (let k = 0; k < 48; k++) {
      const mid = (lo + hi) / 2;
      const v = this.at(mid);
      if ((v < y) === rising) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }
}
