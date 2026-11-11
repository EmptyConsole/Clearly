// Stereo-linked lookahead limiter with 4x-oversampled (inter-sample) peak detection. This is the
// DSP inside the `clearly-limiter` AudioWorklet; it is pure so it can be unit-tested in Node.
//
// Per input sample n:
//   1. Detection. The polyphase interpolator gives the three interpolated points of the interval
//      (m, m+1), m = n - D (D = taps/2, the detector delay). The detected peak of sample m is
//      e[m] = max(|x[m]|, interval (m-1, m), interval (m, m+1)) over both channels (stereo link).
//   2. Required gain g[m] = min(1, ceiling / e[m]).
//   3. Hold: h = minimum of g over the last H entries (sliding-window minimum, monotonic deque).
//   4. Release: r follows h down instantly and up with a one-pole of time constant releaseMs.
//   5. Attack: s = mean of r over the last B values (a boxcar), so gain falls as a smooth ramp.
//   6. Output y[n] = x[n - L] * s[n], L = lookahead in samples.
// Window lengths: B = L - D - M + 1 and H = L - D + M + 1, with M = D (the interpolator's
// half-support). For a peak at p, h(t) includes g[p] for t in [p+D, p+D+H-1], and r <= h. The
// boxcar that multiplies sample q (output time q + L) reads r over [q+L-B+1, q+L]; for every q in
// [p-M, p+M] that range lies inside [p+D, p+D+H-1]. So every sample within M of a peak is scaled
// by at most g[p]: the sample peak never exceeds the ceiling, and the gain is held flat across the
// interpolator's support, which keeps the 4x-oversampled peak at the ceiling too (a gain ramp
// inside the support would let negative sinc taps push an interpolated point over).
// The ceiling is smoothed with a one-pole (time constant LIMITER_CEILING_TAU_MS), in the spirit of
// setTargetAtTime; the worklet drives it from a k-rate AudioParam the host automates with
// setTargetAtTime. The attack time is set by the lookahead.

import {
  LIMITER_CEILING_TAU_MS,
  LIMITER_LOOKAHEAD_MS_DEFAULT,
  LIMITER_RELEASE_MS,
} from '../constants.ts';
import { dbToGain, gainToDb, nextPowerOfTwo } from './level.ts';
import { designInterpolator, type Interpolator } from './oversample.ts';

export interface LimiterOptions {
  readonly sampleRate: number;
  readonly ceilingDbfs: number;
  readonly lookaheadMs?: number;
  readonly releaseMs?: number;
  readonly ceilingTauMs?: number;
}

/** Lookahead in samples for a sample rate (shared by the worklet and the graph's latency sum). */
export function lookaheadSamples(
  sampleRate: number,
  lookaheadMs: number = LIMITER_LOOKAHEAD_MS_DEFAULT,
): number {
  return Math.round((lookaheadMs * sampleRate) / 1000);
}

const RESUM_INTERVAL = 1 << 16;
/** REBASE_BY is a multiple of every ring size, so ring positions are unchanged by a rebase. */
const REBASE_AT = 2 ** 30;
const REBASE_BY = 2 ** 29;

export class LimiterCore {
  readonly latencySamples: number;
  private readonly interp: Interpolator;
  private readonly taps: number;
  private readonly detectorDelay: number;
  /** Hold (sliding-minimum) length H. */
  private readonly hold: number;
  /** Boxcar (attack) length B. */
  private readonly attack: number;

  private readonly mask: number;
  private readonly histL: Float32Array;
  private readonly histR: Float32Array;

  private readonly dqMask: number;
  private readonly dqVal: Float64Array;
  private readonly dqIdx: Float64Array;
  private dqHead = 0;
  private dqTail = 0;

  private readonly box: Float64Array;
  private boxPos = 0;
  private boxSum: number;
  private sinceResum = 0;

  private readonly releaseCoef: number;
  private readonly ceilingCoef: number;
  private ceiling: number;
  private ceilingTarget: number;

  private n = 0;
  private prevInterval = 0;
  private release = 1;
  private blockMinGain = 1;

  constructor(options: LimiterOptions) {
    const sr = options.sampleRate;
    this.interp = designInterpolator();
    this.taps = this.interp.tapsPerPhase;
    this.detectorDelay = this.interp.delay;
    this.latencySamples = lookaheadSamples(sr, options.lookaheadMs);
    // M = D: hold the gain flat across the interpolator's half-support on each side of a peak.
    const margin = this.detectorDelay;
    this.attack = this.latencySamples - this.detectorDelay - margin + 1;
    this.hold = this.latencySamples - this.detectorDelay + margin + 1;
    if (this.attack < 1) {
      throw new Error(
        `lookahead must be at least ${this.detectorDelay + margin} samples (detector delay and margin)`,
      );
    }

    const size = nextPowerOfTwo(this.latencySamples + this.taps + 2);
    this.mask = size - 1;
    this.histL = new Float32Array(size);
    this.histR = new Float32Array(size);

    const dq = nextPowerOfTwo(this.hold + 2);
    this.dqMask = dq - 1;
    this.dqVal = new Float64Array(dq);
    this.dqIdx = new Float64Array(dq);

    this.box = new Float64Array(this.attack).fill(1);
    this.boxSum = this.attack;

    const releaseSamples = ((options.releaseMs ?? LIMITER_RELEASE_MS) * sr) / 1000;
    this.releaseCoef = 1 - Math.exp(-1 / releaseSamples);
    const ceilingSamples = ((options.ceilingTauMs ?? LIMITER_CEILING_TAU_MS) * sr) / 1000;
    this.ceilingCoef = 1 - Math.exp(-1 / ceilingSamples);
    this.ceiling = dbToGain(options.ceilingDbfs);
    this.ceilingTarget = this.ceiling;
  }

  /** New ceiling target; the limiter glides to it (one-pole smoothing). */
  setCeilingDbfs(db: number): void {
    this.ceilingTarget = dbToGain(db);
  }

  get ceilingDbfs(): number {
    return gainToDb(this.ceiling);
  }

  /** Lowest gain applied during the last process() call, in dB (0 or negative). */
  get reductionDb(): number {
    return gainToDb(this.blockMinGain);
  }

  /**
   * Processes `frames` samples. `inR` may be the same array as `inL` (mono). Outputs may not alias
   * inputs.
   */
  process(
    inL: Float32Array,
    inR: Float32Array,
    outL: Float32Array,
    outR: Float32Array,
    frames: number,
  ): void {
    const { histL, histR, mask, taps, detectorDelay, hold, attack, latencySamples } = this;
    const coeffs = this.interp.coefficients;
    let minGain = 1;
    for (let i = 0; i < frames; i++) {
      const n = this.n;
      const wi = n & mask;
      histL[wi] = inL[i] ?? 0;
      histR[wi] = inR[i] ?? 0;

      // 1. Interpolated points of interval (m, m+1), m = n - D, from x[n - T + 1 .. n].
      const base = n - taps + 1;
      let interval = 0;
      for (const c of coeffs) {
        let accL = 0;
        let accR = 0;
        for (let j = 0; j < taps; j++) {
          const k = (base + j) & mask;
          const cj = c[j] ?? 0;
          accL += cj * (histL[k] ?? 0);
          accR += cj * (histR[k] ?? 0);
        }
        const a = Math.max(Math.abs(accL), Math.abs(accR));
        if (a > interval) interval = a;
      }
      const m = n - detectorDelay;
      const mi = m & mask;
      const sampleAbs = Math.max(Math.abs(histL[mi] ?? 0), Math.abs(histR[mi] ?? 0));
      const e = Math.max(sampleAbs, interval, this.prevInterval);
      this.prevInterval = interval;

      // 2. Required gain against the smoothed ceiling.
      this.ceiling += (this.ceilingTarget - this.ceiling) * this.ceilingCoef;
      const g = e > this.ceiling ? this.ceiling / e : 1;

      // 3. Sliding-window minimum over the last H entries.
      while (this.dqTail > this.dqHead && (this.dqVal[(this.dqTail - 1) & this.dqMask] ?? 0) >= g) {
        this.dqTail--;
      }
      this.dqVal[this.dqTail & this.dqMask] = g;
      this.dqIdx[this.dqTail & this.dqMask] = m;
      this.dqTail++;
      while ((this.dqIdx[this.dqHead & this.dqMask] ?? 0) <= m - hold) this.dqHead++;
      const h = this.dqVal[this.dqHead & this.dqMask] ?? 1;

      // 4. Release: instant down, one-pole up.
      this.release = h < this.release ? h : this.release + (h - this.release) * this.releaseCoef;

      // 5. Boxcar attack over B values.
      this.boxSum += this.release - (this.box[this.boxPos] ?? 0);
      this.box[this.boxPos] = this.release;
      this.boxPos = this.boxPos + 1 === attack ? 0 : this.boxPos + 1;
      if (++this.sinceResum === RESUM_INTERVAL) this.resum();
      const s = Math.min(1, this.boxSum / attack);
      if (s < minGain) minGain = s;

      // 6. Delayed output.
      const di = (n - latencySamples) & mask;
      outL[i] = (histL[di] ?? 0) * s;
      outR[i] = (histR[di] ?? 0) * s;
      this.n = n + 1;
      if (this.n >= REBASE_AT) this.rebase();
    }
    this.blockMinGain = minGain;
  }

  /** Keeps the sample counter inside 32-bit range (bitwise ring indexing) on long live sessions. */
  private rebase(): void {
    this.n -= REBASE_BY;
    for (let i = this.dqHead; i < this.dqTail; i++) {
      const k = i & this.dqMask;
      this.dqIdx[k] = (this.dqIdx[k] ?? 0) - REBASE_BY;
    }
  }

  private resum(): void {
    let sum = 0;
    for (const v of this.box) sum += v;
    this.boxSum = sum;
    this.sinceResum = 0;
  }
}
