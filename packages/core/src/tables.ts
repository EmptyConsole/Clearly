// Reference tables for the hearing maths. See docs/HEARING_MATH.txt.

import { BAND_FREQUENCIES_HZ, type BandHz } from './constants.ts';
import { pchipLogFrequency } from './pchip.ts';

export const AGE_RANGES = ['under-40', '40-49', '50-59', '60-69', '70-79', '80-plus'] as const;
export type AgeRange = (typeof AGE_RANGES)[number];

/** Frequencies of the starter table, in Hz. */
export const STARTER_FREQUENCIES_HZ = [250, 500, 1000, 2000, 4000, 8000] as const;

/**
 * Starter median hearing loss in dB by age range at 250, 500, 1000, 2000, 4000 and 8000 Hz.
 * These approximate the median (50th percentile) trends of ISO 7029 (age-related hearing
 * threshold statistics), rounded and averaged across sexes. They are a starting guess for people
 * who have not done a Hearing Check, not a measurement of anyone.
 */
export const STARTER_MEDIAN_LOSS_DB: Readonly<Record<AgeRange, readonly number[]>> = {
  'under-40': [0, 0, 0, 0, 0, 0],
  '40-49': [0, 0, 1, 2, 6, 12],
  '50-59': [0, 1, 2, 5, 12, 22],
  '60-69': [1, 3, 5, 10, 20, 32],
  '70-79': [3, 6, 9, 17, 30, 44],
  '80-plus': [5, 9, 13, 25, 40, 55],
};

/**
 * Normal-hearing offset R(f) in dB relative to 1 kHz: how much more (positive) or less (negative)
 * level a normal ear needs at f than at 1 kHz. Approximates the shape of the ISO 226 threshold of
 * hearing and the ISO 389 reference thresholds for supra-aural earphones. Real headphones add
 * roughly +/-10 dB on top of this (see RULES.md, hearing-math honesty).
 */
export const NORMAL_OFFSET_DB: Readonly<Record<BandHz, number>> = {
  250: 9,
  500: 3,
  1000: 0,
  2000: -3,
  3000: -4,
  4000: -5,
  6000: 4,
  8000: 13,
};

export function normalOffsetDb(hz: BandHz): number {
  return NORMAL_OFFSET_DB[hz];
}

/** Starter loss at any band, PCHIP-interpolated on log frequency from the starter table. */
export function starterLossDb(ageRange: AgeRange, hz: number): number {
  const row = STARTER_MEDIAN_LOSS_DB[ageRange];
  const f = pchipLogFrequency(
    STARTER_FREQUENCIES_HZ.map((freq, i) => ({ hz: freq, value: row[i] as number })),
  );
  return f(hz);
}

/** Starter loss at the eight bands. */
export function starterLossBands(ageRange: AgeRange): number[] {
  return BAND_FREQUENCIES_HZ.map((hz) => starterLossDb(ageRange, hz));
}
