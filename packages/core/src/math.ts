// Small numeric helpers shared by the hearing maths.

export function clamp(x: number, min: number, max: number): number {
  return x < min ? min : x > max ? max : x;
}

/** Hermite smoothstep: 0 at or below edge0, 1 at or above edge1, C1-continuous between. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function roundTo(x: number, step: number): number {
  return Math.round(x / step) * step;
}

/**
 * Complementary error function: the Chebyshev-fitted erfcc of Numerical Recipes (2nd ed.,
 * section 6.2), fractional error below 1.2e-7 everywhere. Ample for a psychometric function.
 */
export function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t *
                          (0.27886807 +
                            t *
                              (-1.13520398 +
                                t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? r : 2 - r;
}

/** Standard normal cumulative distribution function. */
export function normalCdf(z: number): number {
  return 0.5 * erfc(-z / Math.SQRT2);
}

export function logSumExp(values: ArrayLike<number>): number {
  let max = -Infinity;
  for (let i = 0; i < values.length; i++) max = Math.max(max, values[i] as number);
  if (max === -Infinity) return -Infinity;
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += Math.exp((values[i] as number) - max);
  return max + Math.log(sum);
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

/** Percentile by linear interpolation between order statistics (p in [0, 100]). */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sorted[lo] as number;
  const b = sorted[hi] as number;
  return a + (b - a) * (pos - lo);
}

export function dbToGain(db: number): number {
  return 10 ** (db / 20);
}
