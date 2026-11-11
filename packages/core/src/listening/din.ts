// Digits-in-noise speech-in-noise check (M08), pure.
// 12 triplets, adaptive 1-up/1-down in 2 dB steps from 0 dB SNR, clamped to [-20, +10] dB. The
// speech reception threshold (SRT) is the mean SNR of triplets 5 to 12 plus the SNR a 13th would
// have had. Categories are indicative approximations that need validation (HEARING_MATH.txt).

import type { Rng } from '../rng.ts';

export const DIN_TRIPLETS = 12;
export const DIN_DISCARD = 4;
export const DIN_START_SNR_DB = 0;
export const DIN_STEP_DB = 2;
export const DIN_MIN_SNR_DB = -20;
export const DIN_MAX_SNR_DB = 10;
/** Noise RMS relative to the calibration level Lc, and its absolute ceiling. */
export const DIN_NOISE_BELOW_LC_DB = 15;
export const DIN_NOISE_MAX_DBFS = -12;
export const DIN_GAP_MS = 300;
export const DIN_GOOD_MAX_DB = -8;
export const DIN_SOME_MAX_DB = -4;

export type Triplet = readonly [number, number, number];
export type DinCategory = 'good' | 'some' | 'considerable';

/** Three different digits 0 to 9 (never repeated within a triplet). */
export function makeTriplet(rng: Rng): Triplet {
  const pool = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const pick = () => pool.splice(Math.floor(rng.next() * pool.length), 1)[0] ?? 0;
  return [pick(), pick(), pick()];
}

export const clampSnr = (snr: number): number =>
  Math.max(DIN_MIN_SNR_DB, Math.min(DIN_MAX_SNR_DB, snr));

/** All three digits right makes the next triplet 2 dB harder; anything else 2 dB easier. */
export function nextSnr(snr: number, allCorrect: boolean): number {
  return clampSnr(snr + (allCorrect ? -DIN_STEP_DB : DIN_STEP_DB));
}

/** "Not sure" answers are null and count as wrong. */
export function tripletCorrect(played: Triplet, answer: readonly (number | null)[]): boolean {
  return played.every((d, i) => answer[i] === d);
}

/**
 * The SRT from the SNRs played (12) and whether each triplet was fully correct: the mean of
 * triplets 5 to 12 together with the SNR the 13th would have had.
 */
export function scoreDin(snrs: readonly number[], correct: readonly boolean[]): number {
  if (snrs.length < DIN_TRIPLETS || correct.length < DIN_TRIPLETS) {
    throw new Error('a full check is 12 triplets');
  }
  const last = snrs[DIN_TRIPLETS - 1] ?? 0;
  const thirteenth = nextSnr(last, correct[DIN_TRIPLETS - 1] ?? false);
  const used = [...snrs.slice(DIN_DISCARD, DIN_TRIPLETS), thirteenth];
  return used.reduce((a, b) => a + b, 0) / used.length;
}

export function dinCategory(srtDb: number): DinCategory {
  if (srtDb <= DIN_GOOD_MAX_DB) return 'good';
  if (srtDb <= DIN_SOME_MAX_DB) return 'some';
  return 'considerable';
}

/** Noise RMS in dBFS for a calibration level: Lc - 15, never above -12 dBFS. */
export function dinNoiseDbfs(lcDbfs: number): number {
  return Math.min(DIN_NOISE_MAX_DBFS, lcDbfs - DIN_NOISE_BELOW_LC_DB);
}
