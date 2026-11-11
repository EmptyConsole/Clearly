// Reliability rating of a Hearing Check, from counts (M01 section 4). Counts, not rates, so a
// single slip with only six catch trials does not sink the rating.

import {
  RELIABILITY_HIGH_FA_MIN,
  RELIABILITY_HIGH_FA_SHARE,
  RELIABILITY_HIGH_MAX_SD_DB,
  RELIABILITY_MEDIUM_FA_MIN,
  RELIABILITY_MEDIUM_FA_SHARE,
  RELIABILITY_MEDIUM_MAX_WIDE_TRACKS,
  RELIABILITY_MEDIUM_WIDE_SD_DB,
} from '../constants.ts';

export const RELIABILITY_LEVELS = ['High', 'Medium', 'Low'] as const;
export type Reliability = (typeof RELIABILITY_LEVELS)[number];

export interface ReliabilityInput {
  /** n: catch trials. */
  readonly catchTrials: number;
  /** fa: "heard" taps during catch trials. */
  readonly falseAlarms: number;
  /** Posterior SD of every measured track, in dB. */
  readonly trackSdsDb: readonly number[];
}

export function rateReliability(input: ReliabilityInput): Reliability {
  const { catchTrials: n, falseAlarms: fa, trackSdsDb } = input;
  const highFa = Math.max(RELIABILITY_HIGH_FA_MIN, Math.floor(RELIABILITY_HIGH_FA_SHARE * n));
  if (fa <= highFa && trackSdsDb.every((sd) => sd <= RELIABILITY_HIGH_MAX_SD_DB)) return 'High';
  const mediumFa = Math.max(RELIABILITY_MEDIUM_FA_MIN, Math.floor(RELIABILITY_MEDIUM_FA_SHARE * n));
  const wide = trackSdsDb.filter((sd) => sd > RELIABILITY_MEDIUM_WIDE_SD_DB).length;
  if (fa <= mediumFa && wide <= RELIABILITY_MEDIUM_MAX_WIDE_TRACKS) return 'Medium';
  return 'Low';
}
