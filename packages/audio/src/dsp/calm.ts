// Calm Sounds generators (M09), pure: no audio assets, everything is synthesised.
//
//   white     uniform white noise
//   pink      Paul Kellet's refined filter on white noise (-3 dB per octave, within about 0.5 dB
//             from 10 Hz to Nyquist)
//   brown     leaky integration of white noise (-6 dB per octave above 20 Hz), then a DC
//             blocker
//   rain      pink noise band-limited to 500 to 8000 Hz (4th-order high-pass and low-pass), plus
//             random droplets: short exponentially decaying noise bursts, about 25 per second
//   ocean     brown noise times a 0.1 Hz sine swell plus a slow random drift
//   tailored  white noise through two cascaded notch filters about one octave wide, centred on
//             the person's matched pitch
//   tone      a sine at the given pitch (the pitch match)
//
// Every generator is normalised to CALM_RMS_DBFS long-term RMS by measuring a fresh copy of itself
// for CALM_NORMALISE_S seconds at construction, so the volume cap holds in RMS terms for all of
// them. Channels use different seeds, so noise is decorrelated between the ears.

export const CALM_KINDS = ['white', 'pink', 'brown', 'rain', 'ocean', 'tailored', 'tone'] as const;
export type CalmKind = (typeof CALM_KINDS)[number];

export const CALM_RMS_DBFS = -20;
export const CALM_NORMALISE_S = 20;
export const OCEAN_SWELL_HZ = 0.1;
export const RAIN_BAND_HZ = [500, 8000] as const;
/** Notch bandwidth for Tailored noise, in octaves. */
export const TAILORED_BANDWIDTH_OCT = 1;

/** xorshift32: fast, deterministic, good enough for audio noise. */
export class Noise {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }
  /** Uniform in [-1, 1). */
  next(): number {
    let x = this.s;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.s = x >>> 0;
    return this.s / 2 ** 31 - 1;
  }
}

/** Transposed direct form II biquad with RBJ cookbook coefficients. */
export class Biquad {
  private z1 = 0;
  private z2 = 0;
  private readonly b0: number;
  private readonly b1: number;
  private readonly b2: number;
  private readonly a1: number;
  private readonly a2: number;
  private constructor(b0: number, b1: number, b2: number, a1: number, a2: number) {
    this.b0 = b0;
    this.b1 = b1;
    this.b2 = b2;
    this.a1 = a1;
    this.a2 = a2;
  }

  static make(
    type: 'lowpass' | 'highpass' | 'notch',
    hz: number,
    sampleRate: number,
    q: number,
  ): Biquad {
    const w0 = (2 * Math.PI * Math.min(hz, sampleRate * 0.49)) / sampleRate;
    const cw = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * q);
    const a0 = 1 + alpha;
    let b0: number;
    let b1: number;
    let b2: number;
    if (type === 'lowpass') {
      b0 = (1 - cw) / 2;
      b1 = 1 - cw;
      b2 = (1 - cw) / 2;
    } else if (type === 'highpass') {
      b0 = (1 + cw) / 2;
      b1 = -(1 + cw);
      b2 = (1 + cw) / 2;
    } else {
      b0 = 1;
      b1 = -2 * cw;
      b2 = 1;
    }
    return new Biquad(b0 / a0, b1 / a0, b2 / a0, (-2 * cw) / a0, (1 - alpha) / a0);
  }

  /** Q for a notch `oct` octaves wide (between its -3 dB points). */
  static qForOctaves(oct: number): number {
    const p = 2 ** oct;
    return Math.sqrt(p) / (p - 1);
  }

  process(x: number): number {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

class Pink {
  private b0 = 0;
  private b1 = 0;
  private b2 = 0;
  private b3 = 0;
  private b4 = 0;
  private b5 = 0;
  private b6 = 0;
  private readonly n: Noise;
  constructor(n: Noise) {
    this.n = n;
  }
  next(): number {
    const w = this.n.next();
    this.b0 = 0.99886 * this.b0 + w * 0.0555179;
    this.b1 = 0.99332 * this.b1 + w * 0.0750759;
    this.b2 = 0.969 * this.b2 + w * 0.153852;
    this.b3 = 0.8665 * this.b3 + w * 0.3104856;
    this.b4 = 0.55 * this.b4 + w * 0.5329522;
    this.b5 = -0.7616 * this.b5 - w * 0.016898;
    const out = this.b0 + this.b1 + this.b2 + this.b3 + this.b4 + this.b5 + this.b6 + w * 0.5362;
    this.b6 = w * 0.115926;
    return out;
  }
}

class Brown {
  private y = 0;
  private dcX = 0;
  private dcY = 0;
  private readonly leak: number;
  private readonly dcR: number;
  private readonly n: Noise;
  constructor(n: Noise, sampleRate: number) {
    this.n = n;
    // Leak corner 20 Hz (below it the level would wander slowly and make short-term RMS
    // unsteady); DC blocker corner about 5 Hz.
    this.leak = Math.exp((-2 * Math.PI * 20) / sampleRate);
    this.dcR = Math.exp((-2 * Math.PI * 5) / sampleRate);
  }
  next(): number {
    this.y = this.leak * this.y + this.n.next();
    const out = this.y - this.dcX + this.dcR * this.dcY;
    this.dcX = this.y;
    this.dcY = out;
    return out;
  }
}

/** One channel of one generator, before normalisation. */
interface Source {
  next(): number;
}

function makeSource(kind: CalmKind, sampleRate: number, seed: number, pitchHz: number): Source {
  const n = new Noise(seed);
  switch (kind) {
    case 'white':
      return n;
    case 'pink':
      return new Pink(n);
    case 'brown':
      return new Brown(n, sampleRate);
    case 'rain': {
      const pink = new Pink(n);
      // 4th-order Butterworth edges (two biquads each, Q 0.541 and 1.307).
      const hp = [0.5412, 1.3066].map((q) =>
        Biquad.make('highpass', RAIN_BAND_HZ[0], sampleRate, q),
      );
      const lp = [0.5412, 1.3066].map((q) =>
        Biquad.make('lowpass', RAIN_BAND_HZ[1], sampleRate, q),
      );
      const drops = new Noise(seed ^ 0x5bd1e995);
      const dropRate = 25 / sampleRate;
      const decay = Math.exp(-1 / (0.004 * sampleRate));
      let env = 0;
      return {
        next() {
          if (drops.next() * 0.5 + 0.5 < dropRate) env = 0.5 + 1.5 * (drops.next() * 0.5 + 0.5);
          env *= decay;
          let x = pink.next() + env * drops.next();
          for (const f of hp) x = f.process(x);
          for (const f of lp) x = f.process(x);
          return x;
        },
      };
    }
    case 'ocean': {
      const brown = new Brown(n, sampleRate);
      const walk = new Noise(seed ^ 0x27d4eb2d);
      let drift = 0;
      let t = 0;
      const step = (2 * Math.PI * OCEAN_SWELL_HZ) / sampleRate;
      // Drift: a random walk low-passed at about 0.02 Hz and held to +-0.15.
      const dLeak = Math.exp((-2 * Math.PI * 0.02) / sampleRate);
      return {
        next() {
          drift = dLeak * drift + (1 - dLeak) * walk.next() * 40;
          drift = Math.max(-0.15, Math.min(0.15, drift));
          t += step;
          if (t > 2 * Math.PI) t -= 2 * Math.PI;
          return brown.next() * (0.6 + 0.35 * Math.sin(t) + drift);
        },
      };
    }
    case 'tailored': {
      const q = Biquad.qForOctaves(TAILORED_BANDWIDTH_OCT);
      const a = Biquad.make('notch', pitchHz, sampleRate, q);
      const b = Biquad.make('notch', pitchHz, sampleRate, q);
      return { next: () => b.process(a.process(n.next())) };
    }
    case 'tone': {
      let ph = 0;
      const inc = (2 * Math.PI * pitchHz) / sampleRate;
      return {
        next() {
          ph += inc;
          if (ph > 2 * Math.PI) ph -= 2 * Math.PI;
          return Math.sin(ph);
        },
      };
    }
  }
}

const cache = new Map<string, number>();

/** The gain that brings this generator to CALM_RMS_DBFS long-term RMS. */
export function normalisingGain(kind: CalmKind, sampleRate: number, pitchHz: number): number {
  if (kind === 'tone') return 10 ** (CALM_RMS_DBFS / 20) * Math.SQRT2;
  const key = `${kind}:${sampleRate}:${kind === 'tailored' ? pitchHz.toFixed(1) : ''}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const src = makeSource(kind, sampleRate, 12345, pitchHz);
  const settle = Math.round(sampleRate * 2);
  for (let i = 0; i < settle; i++) src.next();
  const long = kind === 'ocean' || kind === 'brown';
  const n = Math.round(sampleRate * (long ? CALM_NORMALISE_S : CALM_NORMALISE_S / 4));
  let p = 0;
  for (let i = 0; i < n; i++) p += src.next() ** 2;
  const rms = Math.sqrt(p / n);
  const g = rms > 0 ? 10 ** (CALM_RMS_DBFS / 20) / rms : 0;
  cache.set(key, g);
  return g;
}

/** A stereo generator, normalised. */
export class CalmGenerator {
  private readonly l: Source;
  private readonly r: Source;
  private readonly gain: number;
  readonly kind: CalmKind;
  constructor(
    kind: CalmKind,
    sampleRate: number,
    pitchHz = 6000,
    seed = 1,
    /** Precomputed normalisingGain (the worklet gets it from the main thread: measuring takes a
     * few milliseconds, too long for the audio thread). */
    gain?: number,
  ) {
    this.kind = kind;
    this.l = makeSource(kind, sampleRate, seed * 2 + 1, pitchHz);
    this.r = kind === 'tone' ? this.l : makeSource(kind, sampleRate, seed * 2 + 2, pitchHz);
    this.gain = gain ?? normalisingGain(kind, sampleRate, pitchHz);
  }

  fill(left: Float32Array, right: Float32Array): void {
    const g = this.gain;
    if (this.l === this.r) {
      for (let i = 0; i < left.length; i++) {
        const v = this.l.next() * g;
        left[i] = v;
        right[i] = v;
      }
      return;
    }
    for (let i = 0; i < left.length; i++) {
      left[i] = this.l.next() * g;
      right[i] = this.r.next() * g;
    }
  }
}

/** Pitch match: third-octave steps between 250 Hz and 12.5 kHz. */
export const PITCH_START_HZ = 6000;
export const PITCH_MIN_HZ = 250;
export const PITCH_MAX_HZ = 12500;
export function pitchStep(hz: number, steps: number): number {
  const next = hz * 2 ** (steps / 3);
  return Math.min(PITCH_MAX_HZ, Math.max(PITCH_MIN_HZ, next));
}

/**
 * The Calm Sounds volume cap, in dBFS RMS: 10 dB below the calibration level Lc, or -24 dBFS with
 * no calibration. Lc - 10 can be above -24 dBFS for someone who calibrated loudly; that follows
 * their own comfortable level, so it is allowed.
 */
export const CALM_CAP_BELOW_LC_DB = 10;
export const CALM_CAP_UNCALIBRATED_DBFS = -24;
export function calmCapDbfs(lcDbfs: number | null): number {
  return lcDbfs === null ? CALM_CAP_UNCALIBRATED_DBFS : lcDbfs - CALM_CAP_BELOW_LC_DB;
}

/** Volume 0..1 (slider) to output gain, never above the cap whatever the slider says. */
export function calmGain(volume: number, capDbfs: number): number {
  const v = Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0;
  if (v === 0) return 0;
  // 0..1 covers 40 dB below the cap up to the cap.
  const db = capDbfs - 40 * (1 - v);
  return Math.min(10 ** ((db - CALM_RMS_DBFS) / 20), 10 ** ((capDbfs - CALM_RMS_DBFS) / 20));
}

export const SLEEP_FADE_S = 60;
