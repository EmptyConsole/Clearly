// 4x polyphase FIR interpolation for inter-sample (true) peak detection.
//
// Each branch phi in {1/4, 2/4, 3/4} estimates the band-limited signal at m + phi from the samples
// x[m - T/2 + 1 .. m + T/2] (T taps per branch) with a Kaiser-windowed sinc whose cutoff is the
// original Nyquist frequency. Branch 0 is the sample itself. Each branch is normalised to unit DC
// gain. Pure: no DOM, no Web Audio, safe to bundle into an AudioWorklet.

import {
  OVERSAMPLE_FACTOR,
  OVERSAMPLE_KAISER_BETA,
  OVERSAMPLE_TAPS_PER_PHASE,
} from '../constants.ts';

/** Zeroth-order modified Bessel function of the first kind (power series). */
export function besselI0(x: number): number {
  let sum = 1;
  let term = 1;
  const q = (x * x) / 4;
  for (let k = 1; k < 50; k++) {
    term *= q / (k * k);
    sum += term;
    if (term < sum * 1e-17) break;
  }
  return sum;
}

function sinc(t: number): number {
  if (t === 0) return 1;
  const a = Math.PI * t;
  return Math.sin(a) / a;
}

export interface Interpolator {
  readonly factor: number;
  readonly tapsPerPhase: number;
  /** Samples of delay between the newest input and the interval being interpolated. */
  readonly delay: number;
  /** coefficients[p - 1][j] multiplies x[m - T/2 + 1 + j] for branch p / factor. */
  readonly coefficients: readonly Float64Array[];
}

export function designInterpolator(
  factor: number = OVERSAMPLE_FACTOR,
  tapsPerPhase: number = OVERSAMPLE_TAPS_PER_PHASE,
  beta: number = OVERSAMPLE_KAISER_BETA,
): Interpolator {
  if (tapsPerPhase % 2 !== 0) throw new Error('tapsPerPhase must be even');
  const half = tapsPerPhase / 2;
  const i0b = besselI0(beta);
  const coefficients: Float64Array[] = [];
  for (let p = 1; p < factor; p++) {
    const phi = p / factor;
    const c = new Float64Array(tapsPerPhase);
    let sum = 0;
    for (let j = 0; j < tapsPerPhase; j++) {
      const offset = j - half + 1; // sample m + offset
      const t = offset - phi; // distance from the interpolation point
      const r = t / half;
      const w = Math.abs(r) >= 1 ? 0 : besselI0(beta * Math.sqrt(1 - r * r)) / i0b;
      c[j] = sinc(t) * w;
      sum += c[j] ?? 0;
    }
    for (let j = 0; j < tapsPerPhase; j++) c[j] = (c[j] ?? 0) / sum;
    coefficients.push(c);
  }
  return { factor, tapsPerPhase, delay: half, coefficients };
}

/**
 * True-peak estimate of a whole signal: max |x| over the samples and over the interpolated points
 * of every interval with full filter support. Intervals within T/2 samples of either end are
 * skipped rather than zero-padded: padding a cut-out slice with zeros creates a step whose ringing
 * is not in the signal. Used by tests and meters (the limiter has its own streaming version).
 */
export function truePeak(
  channels: readonly Float32Array[],
  interp: Interpolator = designInterpolator(),
): number {
  const T = interp.tapsPerPhase;
  const half = T / 2;
  let peak = 0;
  for (const x of channels) {
    const n = x.length;
    for (let i = 0; i < n; i++) {
      const a = Math.abs(x[i] ?? 0);
      if (a > peak) peak = a;
    }
    for (let m = half - 1; m + half < n; m++) {
      for (const c of interp.coefficients) {
        let acc = 0;
        const base = m - half + 1;
        for (let j = 0; j < T; j++) acc += (c[j] ?? 0) * (x[base + j] ?? 0);
        const a = Math.abs(acc);
        if (a > peak) peak = a;
      }
    }
  }
  return peak;
}

export function samplePeak(channels: readonly Float32Array[]): number {
  let peak = 0;
  for (const x of channels) {
    for (let i = 0; i < x.length; i++) {
      const a = Math.abs(x[i] ?? 0);
      if (a > peak) peak = a;
    }
  }
  return peak;
}
