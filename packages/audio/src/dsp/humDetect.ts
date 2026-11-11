// Hum Filter auto detection (M09), pure. Input: one AnalyserNode-style magnitude spectrum in dB
// (8192-point FFT, Blackman window) every 500 ms from Tap A.
//   - Look for a fundamental within +-2 Hz of 50 or 60 Hz and harmonics up to 6 x f0.
//   - A peak counts only when it is at least 12 dB above the median of the bins around it.
//   - Peak frequencies are refined by parabolic interpolation on the dB magnitudes; f0 is the
//     harmonic-number-weighted mean of f_k / k (higher harmonics pin f0 more precisely).
//   - Lock only when the estimate stays within 0.5 Hz for 3 s; then follow slowly; never retune
//     during a 2 s hold after a change.

export const HUM_FFT_SIZE = 8192;
export const HUM_INTERVAL_MS = 500;
export const HUM_SEARCH_HZ = 2;
export const HUM_MAX_HARMONIC = 6;
export const HUM_PROMINENCE_DB = 12;
export const HUM_STEADY_HZ = 0.5;
export const HUM_STEADY_S = 3;
export const HUM_HOLD_S = 2;
export const HUM_Q = 30;
/** Each update moves the locked f0 this share of the way to the new estimate. */
export const HUM_FOLLOW = 0.3;

export interface HumEstimate {
  readonly base: 50 | 60;
  readonly f0: number;
  /** Harmonic numbers (1 = fundamental) whose peaks were found. */
  readonly harmonics: readonly number[];
}

export interface HumState {
  readonly locked: boolean;
  readonly f0: number | null;
  readonly harmonics: readonly number[];
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] ?? 0) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2;
}

/** Finds the strongest bin near `hz`, refines it, and checks prominence. Null if not a hum peak. */
export function findPeak(
  db: Float32Array,
  binHz: number,
  hz: number,
  searchHz: number,
): number | null {
  const lo = Math.max(1, Math.floor((hz - searchHz) / binHz));
  const hi = Math.min(db.length - 2, Math.ceil((hz + searchHz) / binHz));
  let best = -1;
  for (let i = lo; i <= hi; i++)
    if (best < 0 || (db[i] ?? -Infinity) > (db[best] ?? -Infinity)) best = i;
  if (best < 0) return null;
  const a = db[best - 1] ?? -200;
  const b = db[best] ?? -200;
  const c = db[best + 1] ?? -200;
  if (b < a || b < c) return null;
  // Local median: 24 bins each side, skipping the peak's own 3 bins either side.
  const around: number[] = [];
  for (let i = best - 24; i <= best + 24; i++) {
    if (i < 1 || i >= db.length || Math.abs(i - best) <= 3) continue;
    around.push(db[i] ?? -200);
  }
  if (around.length === 0 || b - median(around) < HUM_PROMINENCE_DB) return null;
  const denom = a - 2 * b + c;
  const delta = denom === 0 ? 0 : (0.5 * (a - c)) / denom;
  const f = (best + delta) * binHz;
  return Math.abs(f - hz) <= searchHz ? f : null;
}

/** One frame's estimate, or null when there is no mains hum. */
export function estimateHum(
  db: Float32Array,
  sampleRate: number,
  fftSize = HUM_FFT_SIZE,
): HumEstimate | null {
  const binHz = sampleRate / fftSize;
  let bestEst: HumEstimate | null = null;
  for (const base of [50, 60] as const) {
    const f1 = findPeak(db, binHz, base, HUM_SEARCH_HZ);
    if (f1 === null) continue;
    const found: { k: number; f: number }[] = [{ k: 1, f: f1 }];
    for (let k = 2; k <= HUM_MAX_HARMONIC; k++) {
      // A harmonic of mains hum sits at k x f0 almost exactly; a tight tolerance keeps nearby
      // speech or music partials out.
      const tol = 0.2 + 0.15 * k;
      const fk = findPeak(db, binHz, k * f1, Math.max(tol, binHz * 1.01));
      if (fk !== null && Math.abs(fk - k * f1) <= tol) found.push({ k, f: fk });
    }
    // Robust combination: the median of the implied fundamentals, then a k-weighted mean of the
    // harmonics that agree with it (a speech or music partial that slipped in does not).
    const implied = found.map((p) => p.f / p.k);
    const mid = median(implied);
    const agree = found.filter((p) => Math.abs(p.f / p.k - mid) <= 0.08);
    let wsum = 0;
    let fsum = 0;
    for (const p of agree) {
      wsum += p.k;
      fsum += p.f;
    }
    const est: HumEstimate = {
      base,
      f0: wsum > 0 ? fsum / wsum : mid,
      harmonics: agree.map((p) => p.k),
    };
    if (!bestEst || est.harmonics.length > bestEst.harmonics.length) bestEst = est;
  }
  return bestEst;
}

/** Steadiness, slow following and the hold after a change. Feed one estimate per frame. */
/** With no hum found for this long, the lock is released and the notches go. */
export const HUM_RELEASE_S = 6;

export class HumTracker {
  private history: { t: number; f0: number }[] = [];
  private recent: number[] = [];
  private lockedF0: number | null = null;
  private harmonics: readonly number[] = [];
  private holdUntil = -Infinity;
  private lastSeen = -Infinity;

  update(est: HumEstimate | null, t: number): HumState {
    // A frame where speech or music hides the hum is not evidence against it: keep the history.
    if (est) {
      this.history.push({ t, f0: est.f0 });
      this.lastSeen = t;
    }
    this.history = this.history.filter((h) => t - h.t <= HUM_STEADY_S + 1e-6);
    if (t - this.lastSeen > HUM_RELEASE_S) {
      this.lockedF0 = null;
      this.harmonics = [];
      this.recent = [];
    }
    const fs = this.history.map((h) => h.f0);
    const span = fs.length > 1 ? (this.history.at(-1)?.t ?? t) - (this.history[0]?.t ?? t) : 0;
    const steady =
      fs.length >= 4 &&
      span >= HUM_STEADY_S - 0.5 - 1e-6 &&
      Math.max(...fs) - Math.min(...fs) <= HUM_STEADY_HZ;
    if (t >= this.holdUntil && est) {
      this.recent = [...this.recent, est.f0].slice(-8);
      if (this.lockedF0 === null && steady) {
        // Lock on the median of the steady window (robust to one noisy frame).
        this.lockedF0 = median(fs);
        this.harmonics = est.harmonics;
        this.holdUntil = t + HUM_HOLD_S;
      } else if (this.lockedF0 !== null) {
        // Follow the median of recent frames slowly; never retune inside the hold.
        const next = this.lockedF0 + HUM_FOLLOW * (median(this.recent) - this.lockedF0);
        const changed = Math.abs(next - this.lockedF0) > 0.01;
        this.lockedF0 = next;
        if (est.harmonics.length >= this.harmonics.length) this.harmonics = est.harmonics;
        if (changed) this.holdUntil = t + HUM_HOLD_S;
      }
    }
    return { locked: this.lockedF0 !== null, f0: this.lockedF0, harmonics: this.harmonics };
  }

  reset(): void {
    this.history = [];
    this.recent = [];
    this.lockedF0 = null;
    this.harmonics = [];
    this.holdUntil = -Infinity;
    this.lastSeen = -Infinity;
  }
}

/** Relative spacing of the two notches either side of each hum frequency. */
export const HUM_STAGGER = 0.0012;

/**
 * Notch settings for the graph: a stagger-tuned pair (Q 30 each) at the fundamental and at each
 * found harmonic, up to 6 frequencies (12 stages).
 */
export function humNotches(
  f0: number,
  harmonics: readonly number[],
): { frequencyHz: number; q: number }[] {
  const ks = harmonics.length > 0 ? [...new Set([1, ...harmonics])].sort((a, b) => a - b) : [1];
  return ks.slice(0, HUM_MAX_HARMONIC).flatMap((k) => [
    { frequencyHz: k * f0 * (1 - HUM_STAGGER), q: HUM_Q },
    { frequencyHz: k * f0 * (1 + HUM_STAGGER), q: HUM_Q },
  ]);
}

/**
 * Once the fundamental is locked, notch it and all five harmonics: harmonics that speech or music
 * hide in the spectrum are still there in the hum, and narrow notches cost almost nothing in the
 * speech band (measured under 1 dB, 300 to 3400 Hz).
 */
export function lockedHumNotches(f0: number): { frequencyHz: number; q: number }[] {
  return humNotches(f0, [1, 2, 3, 4, 5, 6]);
}

/** Fixed 50 Hz or 60 Hz modes: the same pairs at the nominal frequency and 5 harmonics. */
export function fixedHumNotches(base: 50 | 60): { frequencyHz: number; q: number }[] {
  return humNotches(base, [1, 2, 3, 4, 5, 6]);
}

/** An AnalyserNode-style spectrum (Blackman window, dB) for tests and offline use. */
export function blackmanSpectrumDb(x: Float32Array, fftSize = HUM_FFT_SIZE): Float32Array {
  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);
  for (let i = 0; i < fftSize; i++) {
    const w =
      0.42 -
      0.5 * Math.cos((2 * Math.PI * i) / fftSize) +
      0.08 * Math.cos((4 * Math.PI * i) / fftSize);
    re[i] = (x[i] ?? 0) * w;
  }
  fftInPlace(re, im);
  const out = new Float32Array(fftSize / 2);
  for (let i = 0; i < out.length; i++) {
    const m = Math.hypot(re[i] ?? 0, im[i] ?? 0) / fftSize;
    out[i] = 20 * Math.log10(m + 1e-12);
  }
  return out;
}

function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j] ?? 0, re[i] ?? 0];
      [im[i], im[j]] = [im[j] ?? 0, im[i] ?? 0];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const cr = Math.cos(ang * k);
        const ci = Math.sin(ang * k);
        const a = i + k;
        const b = a + len / 2;
        const xr = (re[b] ?? 0) * cr - (im[b] ?? 0) * ci;
        const xi = (re[b] ?? 0) * ci + (im[b] ?? 0) * cr;
        re[b] = (re[a] ?? 0) - xr;
        im[b] = (im[a] ?? 0) - xi;
        re[a] = (re[a] ?? 0) + xr;
        im[a] = (im[a] ?? 0) + xi;
      }
    }
  }
}

/**
 * Averages spectra over the last few frames in linear power. Mains hum is steady, while speech
 * and music move, so averaging sharpens the hum peaks against them before peak-finding.
 */
export class SpectrumAverager {
  private frames: Float32Array[] = [];
  private readonly count: number;
  constructor(count = HUM_STEADY_S * (1000 / HUM_INTERVAL_MS)) {
    this.count = count;
  }
  push(db: Float32Array): Float32Array {
    this.frames = [...this.frames, Float32Array.from(db, (d) => 10 ** (d / 10))].slice(-this.count);
    const out = new Float32Array(db.length);
    for (const f of this.frames)
      for (let i = 0; i < out.length; i++) out[i] = (out[i] ?? 0) + (f[i] ?? 0);
    for (let i = 0; i < out.length; i++)
      out[i] = 10 * Math.log10((out[i] ?? 0) / this.frames.length + 1e-30);
    return out;
  }
  reset(): void {
    this.frames = [];
  }
}
