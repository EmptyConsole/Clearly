// Measurement helpers for tests and development tools: FFT, RMS, transfer functions, frequency
// estimates. Pure; exported from '@clearly/audio/testing', never from the main entry.

export function rms(x: Float32Array, start = 0, end = x.length): number {
  let s = 0;
  for (let i = start; i < end; i++) s += (x[i] ?? 0) ** 2;
  return Math.sqrt(s / Math.max(1, end - start));
}

export function toDb(x: number): number {
  return 20 * Math.log10(Math.max(x, 1e-15));
}

/** In-place radix-2 complex FFT. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i] ?? 0;
      re[i] = re[j] ?? 0;
      re[j] = tr;
      const ti = im[i] ?? 0;
      im[i] = im[j] ?? 0;
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const xr = (re[b] ?? 0) * cr - (im[b] ?? 0) * ci;
        const xi = (re[b] ?? 0) * ci + (im[b] ?? 0) * cr;
        re[b] = (re[a] ?? 0) - xr;
        im[b] = (im[a] ?? 0) - xi;
        re[a] = (re[a] ?? 0) + xr;
        im[a] = (im[a] ?? 0) + xi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/**
 * Transfer-function magnitude |Y/X| in dB per FFT bin (Welch: Hann windows, 50 percent overlap,
 * H = Sxy / Sxx). Robust to uncorrelated noise in y.
 */
export function transferMagnitudeDb(
  x: Float32Array,
  y: Float32Array,
  fftSize = 8192,
  start = 0,
  end = Math.min(x.length, y.length),
): Float64Array {
  const half = fftSize / 2;
  const sxxRe = new Float64Array(half + 1);
  const sxyRe = new Float64Array(half + 1);
  const sxyIm = new Float64Array(half + 1);
  const win = new Float64Array(fftSize);
  for (let i = 0; i < fftSize; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / fftSize);
  const xr = new Float64Array(fftSize);
  const xi = new Float64Array(fftSize);
  const yr = new Float64Array(fftSize);
  const yi = new Float64Array(fftSize);
  for (let s = start; s + fftSize <= end; s += half) {
    for (let i = 0; i < fftSize; i++) {
      const w = win[i] ?? 0;
      xr[i] = (x[s + i] ?? 0) * w;
      yr[i] = (y[s + i] ?? 0) * w;
      xi[i] = 0;
      yi[i] = 0;
    }
    fft(xr, xi);
    fft(yr, yi);
    for (let k = 0; k <= half; k++) {
      const ar = xr[k] ?? 0;
      const ai = xi[k] ?? 0;
      const br = yr[k] ?? 0;
      const bi = yi[k] ?? 0;
      sxxRe[k] = (sxxRe[k] ?? 0) + ar * ar + ai * ai;
      // conj(X) * Y
      sxyRe[k] = (sxyRe[k] ?? 0) + ar * br + ai * bi;
      sxyIm[k] = (sxyIm[k] ?? 0) + ar * bi - ai * br;
    }
  }
  const out = new Float64Array(half + 1);
  for (let k = 0; k <= half; k++) {
    const mag = Math.hypot(sxyRe[k] ?? 0, sxyIm[k] ?? 0) / Math.max(sxxRe[k] ?? 0, 1e-30);
    out[k] = toDb(mag);
  }
  return out;
}

/** Magnitude spectrum peak frequency (Hann window, parabolic interpolation). */
export function dominantFrequencyHz(
  x: Float32Array,
  sampleRate: number,
  start = 0,
  end = x.length,
): number {
  let n = 1;
  while (n * 2 <= end - start) n *= 2;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    re[i] = (x[start + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));
  }
  fft(re, im);
  let best = 1;
  let bestMag = 0;
  const mags = new Float64Array(n / 2);
  for (let k = 1; k < n / 2; k++) {
    mags[k] = Math.hypot(re[k] ?? 0, im[k] ?? 0);
    if ((mags[k] ?? 0) > bestMag) {
      bestMag = mags[k] ?? 0;
      best = k;
    }
  }
  const a = Math.log((mags[best - 1] ?? 0) + 1e-30);
  const b = Math.log((mags[best] ?? 0) + 1e-30);
  const c = Math.log((mags[best + 1] ?? 0) + 1e-30);
  const p = (0.5 * (a - c)) / (a - 2 * b + c);
  return ((best + (Number.isFinite(p) ? p : 0)) * sampleRate) / n;
}

/**
 * Instantaneous frequency from upward zero crossings (linear interpolation between samples).
 * Returns [time in s, frequency in Hz] for each full cycle.
 */
export function zeroCrossingFrequencies(
  x: Float32Array,
  sampleRate: number,
  start = 0,
  end = x.length,
): [number, number][] {
  const crossings: number[] = [];
  for (let i = Math.max(1, start); i < end; i++) {
    const a = x[i - 1] ?? 0;
    const b = x[i] ?? 0;
    if (a < 0 && b >= 0) crossings.push(i - 1 + a / (a - b));
  }
  const out: [number, number][] = [];
  for (let k = 1; k < crossings.length; k++) {
    const t0 = crossings[k - 1] ?? 0;
    const t1 = crossings[k] ?? 0;
    out.push([(t0 + t1) / 2 / sampleRate, sampleRate / (t1 - t0)]);
  }
  return out;
}

/** Residual of y against x (same length region) in dB relative to x's energy. */
export function residualDb(
  x: Float32Array,
  y: Float32Array,
  start = 0,
  end = Math.min(x.length, y.length),
): number {
  let e = 0;
  let r = 0;
  for (let i = start; i < end; i++) {
    const a = x[i] ?? 0;
    e += a * a;
    r += (a - (y[i] ?? 0)) ** 2;
  }
  return 10 * Math.log10(Math.max(r, 1e-30) / Math.max(e, 1e-30));
}

/** Index of the largest |x| (first one). */
export function argMaxAbs(x: Float32Array): number {
  let best = 0;
  let bestAbs = -1;
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i] ?? 0);
    if (a > bestAbs) {
      bestAbs = a;
      best = i;
    }
  }
  return best;
}
