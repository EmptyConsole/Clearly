// Night-mode loudness rider (M06). Measures short-term loudness (ITU-R BS.1770, K-weighted, 3 s
// sliding window built from 100 ms blocks) and moves a gain toward the target loudness, rising at
// most 3 dB/s and falling at most 6 dB/s, within the level's boost and cut limits. Below -60 LUFS
// the gain holds, so silence and room tone are not pumped up. Pure, Node-testable; the
// `clearly-rider` worklet wraps it.

import type { BiquadCoefs } from './monitors.ts';
import { kWeightingCoefficients } from './monitors.ts';

/**
 * ITU-R BS.1770-5, Table 1 and Table 2: the K-weighting pre-filter (high shelf) and RLB filter
 * (high-pass) coefficients at 48 kHz. At other rates the analogue-prototype formulas in
 * monitors.ts are used (they reproduce these values at 48 kHz).
 */
export const BS1770_48K: readonly [BiquadCoefs, BiquadCoefs] = [
  {
    b0: 1.53512485958697,
    b1: -2.69169618940638,
    b2: 1.19839281085285,
    a1: -1.69065929318241,
    a2: 0.73248077421585,
  },
  { b0: 1.0, b1: -2.0, b2: 1.0, a1: -1.99004745483398, a2: 0.99007225036621 },
];

export const RIDER_WINDOW_S = 3;
export const RIDER_BLOCK_MS = 100;
export const RIDER_RISE_DB_PER_S = 3;
export const RIDER_FALL_DB_PER_S = 6;
export const RIDER_GATE_LUFS = -60;

export interface RiderLevel {
  readonly targetLufs: number;
  readonly maxBoostDb: number;
  readonly maxCutDb: number;
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

export class RiderCore {
  private readonly kL: [Biquad, Biquad];
  private readonly kR: [Biquad, Biquad];
  private readonly blockFrames: number;
  private readonly blocks: Float64Array;
  private blockIndex = 0;
  private blocksFilled = 0;
  private acc = 0;
  private accFrames = 0;
  private gainDbNow = 0;
  private targetGainDb = 0;
  private readonly rise: number;
  private readonly fall: number;
  private lufs = -Infinity;
  level: RiderLevel;

  constructor(
    readonly sampleRate: number,
    level: RiderLevel,
  ) {
    const coefs = sampleRate === 48000 ? BS1770_48K : kWeightingCoefficients(sampleRate);
    this.kL = [new Biquad(coefs[0]), new Biquad(coefs[1])];
    this.kR = [new Biquad(coefs[0]), new Biquad(coefs[1])];
    this.blockFrames = Math.round((RIDER_BLOCK_MS * sampleRate) / 1000);
    this.blocks = new Float64Array(Math.round((RIDER_WINDOW_S * 1000) / RIDER_BLOCK_MS));
    this.rise = RIDER_RISE_DB_PER_S / sampleRate;
    this.fall = RIDER_FALL_DB_PER_S / sampleRate;
    this.level = level;
  }

  get gainDb(): number {
    return this.gainDbNow;
  }
  /** Short-term loudness (LUFS) over the last 3 s, or -Infinity before the first block. */
  get shortTermLufs(): number {
    return this.lufs;
  }

  private closeBlock(): void {
    this.blocks[this.blockIndex] = this.acc / this.accFrames;
    this.blockIndex = (this.blockIndex + 1) % this.blocks.length;
    this.blocksFilled = Math.min(this.blocks.length, this.blocksFilled + 1);
    this.acc = 0;
    this.accFrames = 0;
    let sum = 0;
    for (let i = 0; i < this.blocksFilled; i++) sum += this.blocks[i] ?? 0;
    const ms = sum / this.blocksFilled;
    this.lufs = ms > 0 ? -0.691 + 10 * Math.log10(ms) : -Infinity;
    // The gate holds the gain in quiet passages (it neither rises nor falls).
    if (this.lufs >= RIDER_GATE_LUFS) {
      const want = this.level.targetLufs - this.lufs;
      this.targetGainDb = Math.max(-this.level.maxCutDb, Math.min(this.level.maxBoostDb, want));
    } else {
      this.targetGainDb = this.gainDbNow;
    }
  }

  /** Processes one block in place-safe fashion (outputs may alias inputs). */
  process(
    inL: Float32Array,
    inR: Float32Array,
    outL: Float32Array,
    outR: Float32Array,
    frames: number,
  ): void {
    for (let i = 0; i < frames; i++) {
      const l = inL[i] ?? 0;
      const r = inR[i] ?? 0;
      const kl = this.kL[1].step(this.kL[0].step(l));
      const kr = this.kR[1].step(this.kR[0].step(r));
      // BS.1770 sums the mean square of each channel (weights 1 for L and R).
      this.acc += kl * kl + kr * kr;
      if (++this.accFrames === this.blockFrames) this.closeBlock();
      const d = this.targetGainDb - this.gainDbNow;
      if (d > 0) this.gainDbNow += Math.min(d, this.rise);
      else if (d < 0) this.gainDbNow += Math.max(d, -this.fall);
      const g = Math.pow(10, this.gainDbNow / 20);
      outL[i] = l * g;
      outR[i] = r * g;
    }
  }
}
