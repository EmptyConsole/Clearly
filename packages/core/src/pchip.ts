// Shape-preserving monotone cubic interpolation (PCHIP), Fritsch and Carlson (1980),
// "Monotone Piecewise Cubic Interpolation", SIAM J. Numer. Anal. 17(2).
// On every interval the curve is monotone between its two data values, so it never overshoots:
// a flat stretch stays flat and a notch never rings above its neighbours.

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Builds an interpolant over points with strictly increasing x. Outside the range it holds the end value. */
export function pchip(points: readonly Point[]): (x: number) => number {
  const n = points.length;
  if (n === 0) throw new Error('pchip needs at least one point');
  for (let i = 1; i < n; i++) {
    if (!((points[i] as Point).x > (points[i - 1] as Point).x)) {
      throw new Error('pchip x values must be strictly increasing');
    }
  }
  if (n === 1) {
    const y0 = (points[0] as Point).y;
    return () => y0;
  }
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const h: number[] = [];
  const delta: number[] = [];
  for (let k = 0; k < n - 1; k++) {
    const hk = (xs[k + 1] as number) - (xs[k] as number);
    h.push(hk);
    delta.push(((ys[k + 1] as number) - (ys[k] as number)) / hk);
  }
  // Step 1: initial tangents, the average of neighbouring secants (one-sided at the ends).
  const m: number[] = new Array<number>(n).fill(0);
  m[0] = delta[0] as number;
  m[n - 1] = delta[n - 2] as number;
  for (let k = 1; k < n - 1; k++) {
    const d0 = delta[k - 1] as number;
    const d1 = delta[k] as number;
    // Step 2: where the data turn (or are flat on either side), the tangent is zero.
    m[k] = d0 * d1 <= 0 ? 0 : (d0 + d1) / 2;
  }
  // Step 3: on each interval, keep (alpha, beta) inside the circle of radius 3 (FC region).
  for (let k = 0; k < n - 1; k++) {
    const d = delta[k] as number;
    if (d === 0) {
      m[k] = 0;
      m[k + 1] = 0;
      continue;
    }
    const alpha = (m[k] as number) / d;
    const beta = (m[k + 1] as number) / d;
    // A tangent with the wrong sign for this interval would overshoot; zero it.
    if (alpha < 0) m[k] = 0;
    if (beta < 0) m[k + 1] = 0;
    const a = Math.max(alpha, 0);
    const b = Math.max(beta, 0);
    const r2 = a * a + b * b;
    if (r2 > 9) {
      const tau = 3 / Math.sqrt(r2);
      m[k] = tau * a * d;
      m[k + 1] = tau * b * d;
    }
  }
  return (x: number): number => {
    if (x <= (xs[0] as number)) return ys[0] as number;
    if (x >= (xs[n - 1] as number)) return ys[n - 1] as number;
    let k = 0;
    while (k < n - 2 && x > (xs[k + 1] as number)) k++;
    const hk = h[k] as number;
    const t = (x - (xs[k] as number)) / hk;
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    return (
      h00 * (ys[k] as number) +
      h10 * hk * (m[k] as number) +
      h01 * (ys[k + 1] as number) +
      h11 * hk * (m[k + 1] as number)
    );
  };
}

/** PCHIP on a log2-frequency axis: the natural axis for audiograms (octaves are equally spaced). */
export function pchipLogFrequency(
  points: readonly { readonly hz: number; readonly value: number }[],
): (hz: number) => number {
  const f = pchip(points.map((p) => ({ x: Math.log2(p.hz), y: p.value })));
  return (hz: number) => f(Math.log2(hz));
}
