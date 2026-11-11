// Streaming detectors used by the `clearly-monitor` AudioWorklet: mono detection on Tap A, and the
// overload guard and loudness meter on the final output. Pure, Node-testable.

import {
  LOUDNESS_BLOCK_MS,
  LOUDNESS_MOMENTARY_MS,
  MONO_HOLD_S,
  MONO_SILENCE_DBFS,
  MONO_THRESHOLD_DB,
  MONO_WINDOW_MS,
  OVERLOAD_GAP_MS,
  OVERLOAD_HOLD_MS,
  OVERLOAD_THRESHOLD_DBFS,
} from '../constants.ts';
import { dbToGain } from './level.ts';

// ---------------------------------------------------------------------------------------------
// Mono detection

/**
 * isMono becomes true once the RMS of L - R has stayed below -60 dB relative to the RMS of L + R
 * for 2 s, and false as soon as one window with sound is above it. Silent windows (L + R below
 * -80 dBFS) neither confirm nor break mono, so a pause does not flip the state.
 */
export class MonoDetector {
  private readonly windowFrames: number;
  private readonly windowsNeeded: number;
  private readonly ratio: number;
  private readonly silence: number;
  private diff = 0;
  private sum = 0;
  private filled = 0;
  private monoRun = 0;
  private state = false;

  constructor(sampleRate: number) {
    this.windowFrames = Math.round((MONO_WINDOW_MS * sampleRate) / 1000);
    this.windowsNeeded = Math.ceil((MONO_HOLD_S * 1000) / MONO_WINDOW_MS);
    this.ratio = dbToGain(MONO_THRESHOLD_DB) ** 2; // energy ratio
    // L + R of a signal at -80 dBFS per channel is about -74 dBFS; compare energies per sample.
    this.silence = (2 * dbToGain(MONO_SILENCE_DBFS)) ** 2;
  }

  get isMono(): boolean {
    return this.state;
  }

  /** Feeds a block; returns true when isMono changed. `right` may equal `left`. */
  process(left: Float32Array, right: Float32Array, frames: number): boolean {
    const before = this.state;
    for (let i = 0; i < frames; i++) {
      const l = left[i] ?? 0;
      const r = right[i] ?? 0;
      const d = l - r;
      const s = l + r;
      this.diff += d * d;
      this.sum += s * s;
      if (++this.filled === this.windowFrames) this.closeWindow();
    }
    return this.state !== before;
  }

  private closeWindow(): void {
    const meanSum = this.sum / this.windowFrames;
    if (meanSum >= this.silence) {
      if (this.diff <= this.sum * this.ratio) {
        this.monoRun++;
        if (this.monoRun >= this.windowsNeeded) this.state = true;
      } else {
        this.monoRun = 0;
        this.state = false;
      }
    }
    this.diff = 0;
    this.sum = 0;
    this.filled = 0;
  }
}

// ---------------------------------------------------------------------------------------------
// Overload guard

/**
 * Trips once the output has been above -1 dBFS for more than 200 ms. A run of over-threshold
 * samples continues across gaps shorter than OVERLOAD_GAP_MS (a waveform dips below the threshold
 * twice per cycle). After tripping it stays tripped until reset() (the Resume button).
 */
export class OverloadGuard {
  private readonly threshold: number;
  private readonly holdFrames: number;
  private readonly gapFrames: number;
  private n = 0;
  private runStart = -1;
  private lastOver = -Infinity;
  private trippedFlag = false;

  constructor(sampleRate: number, thresholdDbfs: number = OVERLOAD_THRESHOLD_DBFS) {
    this.threshold = dbToGain(thresholdDbfs);
    this.holdFrames = Math.round((OVERLOAD_HOLD_MS * sampleRate) / 1000);
    this.gapFrames = Math.round((OVERLOAD_GAP_MS * sampleRate) / 1000);
  }

  get tripped(): boolean {
    return this.trippedFlag;
  }

  reset(): void {
    this.runStart = -1;
    this.lastOver = -Infinity;
    this.trippedFlag = false;
  }

  /** Feeds a block; returns true on the block where the guard trips. */
  process(left: Float32Array, right: Float32Array, frames: number): boolean {
    if (this.trippedFlag) {
      this.n += frames;
      return false;
    }
    for (let i = 0; i < frames; i++) {
      const n = this.n + i;
      const a = Math.max(Math.abs(left[i] ?? 0), Math.abs(right[i] ?? 0));
      if (a > this.threshold) {
        if (n - this.lastOver > this.gapFrames) this.runStart = n;
        this.lastOver = n;
        if (n - this.runStart > this.holdFrames) {
          this.trippedFlag = true;
          this.n += frames;
          return true;
        }
      }
    }
    this.n += frames;
    return false;
  }
}

// ---------------------------------------------------------------------------------------------
// Loudness (ITU-R BS.1770-5 K-weighting; momentary loudness over 400 ms)

export interface BiquadCoefs {
  readonly b0: number;
  readonly b1: number;
  readonly b2: number;
  readonly a1: number;
  readonly a2: number;
}

/**
 * K-weighting filter coefficients for any sample rate, from the analogue prototypes used by
 * libebur128 (shelf f0 1681.97 Hz, G 4.0 dB, Q 0.7072; high-pass f0 38.135 Hz, Q 0.5003). At 48 kHz
 * these reproduce the BS.1770 table (checked in monitors.test.ts).
 */
export function kWeightingCoefficients(sampleRate: number): [BiquadCoefs, BiquadCoefs] {
  return [kShelf(sampleRate), kHighpass(sampleRate)];
}

function kShelf(sampleRate: number): BiquadCoefs {
  const f0 = 1681.974450955533;
  const G = 3.999843853973347;
  const Q = 0.7071752369554196;
  const K = Math.tan((Math.PI * f0) / sampleRate);
  const Vh = 10 ** (G / 20);
  const Vb = Vh ** 0.4996667741545416;
  const a0 = 1 + K / Q + K * K;
  return {
    b0: (Vh + (Vb * K) / Q + K * K) / a0,
    b1: (2 * (K * K - Vh)) / a0,
    b2: (Vh - (Vb * K) / Q + K * K) / a0,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / Q + K * K) / a0,
  };
}

function kHighpass(sampleRate: number): BiquadCoefs {
  const f0 = 38.13547087602444;
  const Q = 0.5003270373238773;
  const K = Math.tan((Math.PI * f0) / sampleRate);
  const d = 1 + K / Q + K * K;
  return {
    b0: 1,
    b1: -2,
    b2: 1,
    a1: (2 * (K * K - 1)) / d,
    a2: (1 - K / Q + K * K) / d,
  };
}

class Biquad {
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  constructor(private readonly c: BiquadCoefs) {}
  step(x: number): number {
    const { b0, b1, b2, a1, a2 } = this.c;
    const y = b0 * x + b1 * this.x1 + b2 * this.x2 - a1 * this.y1 - a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

export interface LoudnessReading {
  /** Momentary loudness (400 ms) in LUFS; -Infinity in silence. */
  readonly momentaryLufs: number;
  /** Highest sample magnitude since the previous reading, in dBFS. */
  readonly peakDbfs: number;
  /** Stereo power mean since the previous reading, unweighted, in dBFS. */
  readonly rmsDbfs: number;
}

/**
 * Momentary loudness: mean square of the K-weighted channels over 400 ms (four 100 ms blocks),
 * L = -0.691 + 10 log10(sum over channels). Left and right have weight 1.
 */
export class LoudnessMeter {
  private readonly filters: [Biquad, Biquad][];
  private readonly blockFrames: number;
  private readonly blocks: Float64Array;
  private blockIndex = 0;
  private blocksFilled = 0;
  private acc = 0;
  private filled = 0;
  private peak = 0;
  /** Unweighted stereo power since the last read (safe-listening tracker). */
  private power = 0;
  private powerFrames = 0;

  constructor(sampleRate: number) {
    const [shelf, hp] = kWeightingCoefficients(sampleRate);
    this.filters = [
      [new Biquad(shelf), new Biquad(hp)],
      [new Biquad(shelf), new Biquad(hp)],
    ];
    this.blockFrames = Math.round((LOUDNESS_BLOCK_MS * sampleRate) / 1000);
    this.blocks = new Float64Array(Math.round(LOUDNESS_MOMENTARY_MS / LOUDNESS_BLOCK_MS));
  }

  process(left: Float32Array, right: Float32Array, frames: number): void {
    const [fl, fr] = this.filters as [[Biquad, Biquad], [Biquad, Biquad]];
    for (let i = 0; i < frames; i++) {
      const l = left[i] ?? 0;
      const r = right[i] ?? 0;
      const al = Math.abs(l);
      const ar = Math.abs(r);
      if (al > this.peak) this.peak = al;
      if (ar > this.peak) this.peak = ar;
      this.power += l * l + r * r;
      this.powerFrames++;
      const kl = fl[1].step(fl[0].step(l));
      const kr = fr[1].step(fr[0].step(r));
      this.acc += kl * kl + kr * kr;
      if (++this.filled === this.blockFrames) {
        this.blocks[this.blockIndex] = this.acc / this.blockFrames;
        this.blockIndex = (this.blockIndex + 1) % this.blocks.length;
        this.blocksFilled = Math.min(this.blocksFilled + 1, this.blocks.length);
        this.acc = 0;
        this.filled = 0;
      }
    }
  }

  /** Returns the current reading and starts a new peak interval. */
  read(): LoudnessReading {
    let ms = 0;
    for (let i = 0; i < this.blocksFilled; i++) ms += this.blocks[i] ?? 0;
    ms = this.blocksFilled > 0 ? ms / this.blocksFilled : 0;
    const peakDbfs = this.peak > 0 ? 20 * Math.log10(this.peak) : -Infinity;
    this.peak = 0;
    const meanSquare = this.powerFrames > 0 ? this.power / (2 * this.powerFrames) : 0;
    this.power = 0;
    this.powerFrames = 0;
    return {
      momentaryLufs: ms > 0 ? -0.691 + 10 * Math.log10(ms) : -Infinity,
      peakDbfs,
      rmsDbfs: meanSquare > 0 ? 10 * Math.log10(meanSquare) : -Infinity,
    };
  }
}
