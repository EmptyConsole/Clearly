import { describe, expect, it } from 'vitest';
import { erfc, normalCdf, percentile, smoothstep } from './math.ts';
import { pchip, pchipLogFrequency } from './pchip.ts';
import { createRng, normal, shuffle } from './rng.ts';
import { BAND_FREQUENCIES_HZ } from './constants.ts';
import {
  AGE_RANGES,
  NORMAL_OFFSET_DB,
  STARTER_MEDIAN_LOSS_DB,
  starterLossBands,
} from './tables.ts';

describe('seeded rng', () => {
  it('is reproducible from its seed and differs between seeds', () => {
    const a = createRng(42);
    const b = createRng(42);
    const c = createRng(43);
    const sa = Array.from({ length: 5 }, () => a.next());
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(sa);
    expect(Array.from({ length: 5 }, () => c.next())).not.toEqual(sa);
  });

  it('is roughly uniform and normal', () => {
    const rng = createRng(1);
    const u = Array.from({ length: 20000 }, () => rng.next());
    expect(Math.min(...u)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...u)).toBeLessThan(1);
    expect(percentile(u, 50)).toBeCloseTo(0.5, 1);
    const n = Array.from({ length: 20000 }, () => normal(rng));
    const m = n.reduce((s, x) => s + x, 0) / n.length;
    const sd = Math.sqrt(n.reduce((s, x) => s + (x - m) ** 2, 0) / n.length);
    expect(m).toBeCloseTo(0, 1);
    expect(sd).toBeCloseTo(1, 1);
  });

  it('shuffles without losing items', () => {
    expect(shuffle(createRng(3), [1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('maths', () => {
  it('erfc and Phi match reference values', () => {
    // Abramowitz and Stegun table 7.1 / standard normal table.
    expect(erfc(0)).toBeCloseTo(1, 7);
    expect(erfc(0.5)).toBeCloseTo(0.4795001222, 6);
    expect(erfc(1)).toBeCloseTo(0.1572992071, 6);
    expect(erfc(-1)).toBeCloseTo(1.8427007929, 6);
    expect(normalCdf(1.959964)).toBeCloseTo(0.975, 6);
    expect(normalCdf(-3)).toBeCloseTo(0.0013499, 6);
  });

  it('smoothstep is 0 and 1 at its edges and C1 between', () => {
    expect(smoothstep(2, 8, 2)).toBe(0);
    expect(smoothstep(2, 8, 8)).toBe(1);
    expect(smoothstep(2, 8, 5)).toBeCloseTo(0.5, 12);
    expect(smoothstep(2, 8, -5)).toBe(0);
  });
});

/** Samples the interpolant densely and checks it stays between neighbouring data values. */
function expectNoOvershoot(xs: number[], ys: number[]): void {
  const f = pchip(xs.map((x, i) => ({ x, y: ys[i] as number })));
  for (let k = 0; k < xs.length - 1; k++) {
    const lo = Math.min(ys[k] as number, ys[k + 1] as number);
    const hi = Math.max(ys[k] as number, ys[k + 1] as number);
    let prev = f(xs[k] as number);
    const rising = (ys[k + 1] as number) >= (ys[k] as number);
    for (let j = 0; j <= 200; j++) {
      const x = (xs[k] as number) + (((xs[k + 1] as number) - (xs[k] as number)) * j) / 200;
      const y = f(x);
      expect(y).toBeGreaterThanOrEqual(lo - 1e-9);
      expect(y).toBeLessThanOrEqual(hi + 1e-9);
      // Monotone on each interval.
      if (rising) expect(y).toBeGreaterThanOrEqual(prev - 1e-9);
      else expect(y).toBeLessThanOrEqual(prev + 1e-9);
      prev = y;
    }
  }
}

describe('PCHIP (Fritsch-Carlson) on log frequency', () => {
  const xs = [250, 500, 1000, 2000, 4000, 8000].map(Math.log2);

  it('passes through the data points', () => {
    const ys = [0, 1, 2, 5, 12, 22];
    const f = pchip(xs.map((x, i) => ({ x, y: ys[i] as number })));
    xs.forEach((x, i) => {
      expect(f(x)).toBeCloseTo(ys[i] as number, 12);
    });
  });

  it('keeps a flat shape exactly flat', () => {
    expectNoOvershoot(xs, [5, 5, 5, 5, 5, 5]);
    const f = pchip(xs.map((x) => ({ x, y: 5 })));
    expect(f(Math.log2(3000))).toBe(5);
  });

  it('does not overshoot a flat-then-steep shape', () => {
    expectNoOvershoot(xs, [0, 0, 0, 0, 40, 60]);
    expectNoOvershoot(xs, [0, 0, 0, 50, 55, 55]);
  });

  it('does not ring around a notch', () => {
    expectNoOvershoot(xs, [0, 0, 0, 5, 40, 10]);
    const f = pchip(xs.map((x, i) => ({ x, y: [0, 0, 0, 5, 40, 10][i] as number })));
    // Between the two flat zeros the curve stays at zero (no dip below or bump above).
    expect(f(Math.log2(700))).toBe(0);
  });

  it('does not overshoot random shapes', () => {
    const rng = createRng(7);
    for (let n = 0; n < 200; n++) {
      expectNoOvershoot(
        xs,
        xs.map(() => Math.round(rng.next() * 60)),
      );
    }
  });

  it('holds the end values outside the range', () => {
    const f = pchipLogFrequency([
      { hz: 500, value: 3 },
      { hz: 8000, value: 30 },
    ]);
    expect(f(250)).toBe(3);
    expect(f(16000)).toBe(30);
  });

  it('rejects unsorted x', () => {
    expect(() =>
      pchip([
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ]),
    ).toThrow();
  });
});

describe('tables', () => {
  it('starter table has six values per age range and grows with age', () => {
    for (const age of AGE_RANGES) expect(STARTER_MEDIAN_LOSS_DB[age]).toHaveLength(6);
    for (let i = 1; i < AGE_RANGES.length; i++) {
      const prev = starterLossBands(AGE_RANGES[i - 1] as (typeof AGE_RANGES)[number]);
      const cur = starterLossBands(AGE_RANGES[i] as (typeof AGE_RANGES)[number]);
      cur.forEach((v, j) => {
        expect(v).toBeGreaterThanOrEqual(prev[j] as number);
      });
    }
  });

  it('interpolates 3 kHz and 6 kHz between their neighbours', () => {
    const b = starterLossBands('70-79');
    const at = (hz: number): number => b[BAND_FREQUENCIES_HZ.indexOf(hz as 3000)] as number;
    expect(at(3000)).toBeGreaterThan(17);
    expect(at(3000)).toBeLessThan(30);
    expect(at(6000)).toBeGreaterThan(30);
    expect(at(6000)).toBeLessThan(44);
  });

  it('R(f) is zero at 1 kHz', () => {
    expect(NORMAL_OFFSET_DB[1000]).toBe(0);
  });
});
