// The one plain sentence on the results screen comes from these shape rules. Core returns a code;
// the web app's copy file words it (apps/web/src/copy/en.ts, results.shape.*), and every sentence
// is listed in docs/REGULATORY_REVIEW.txt. Describes how the person heard these sounds with these
// headphones; never a diagnosis.

import { BAND_FREQUENCIES_HZ, type BandHz } from '../constants.ts';
import { mean } from '../math.ts';
import type { PerEar } from './loss.ts';

export const SHAPE_CODES = [
  'typical',
  'high-pitch',
  'high-pitch-notch',
  'low-pitch',
  'flat',
  'mixed',
] as const;
export type ShapeCode = (typeof SHAPE_CODES)[number];

/** Below this everywhere, results are described as close to typical for these headphones. */
export const SHAPE_TYPICAL_MAX_DB = 15;
/** A difference of at least this much between ranges counts as a slope. */
export const SHAPE_SLOPE_DB = 15;
/** The high range must reach at least this loss to be called harder to hear. */
export const SHAPE_HIGH_MIN_DB = 20;
/** Flat: every band at least this, and the spread below SHAPE_SLOPE_DB. */
export const SHAPE_FLAT_MIN_DB = 20;
/** A notch: 4 or 6 kHz at least this far above both 2 kHz and 8 kHz. */
export const SHAPE_NOTCH_DB = 15;

const at = (loss: readonly number[], hz: BandHz): number =>
  loss[BAND_FREQUENCIES_HZ.indexOf(hz)] ?? 0;

/**
 * Uses the mean of the two ears band by band (ear differences are handled by referral flags).
 * Order: typical, notch, high-pitch slope, low-pitch slope, flat, otherwise mixed.
 */
export function describeShape(lossDb: PerEar<readonly number[]>): ShapeCode {
  const loss = BAND_FREQUENCIES_HZ.map(
    (_, i) => ((lossDb.left[i] ?? 0) + (lossDb.right[i] ?? 0)) / 2,
  );
  if (Math.max(...loss) < SHAPE_TYPICAL_MAX_DB) return 'typical';
  const low = mean([at(loss, 250), at(loss, 500), at(loss, 1000)]);
  const high = mean([at(loss, 4000), at(loss, 6000), at(loss, 8000)]);
  const notchPeak = Math.max(at(loss, 4000), at(loss, 6000));
  if (
    notchPeak - at(loss, 2000) >= SHAPE_NOTCH_DB &&
    notchPeak - at(loss, 8000) >= SHAPE_NOTCH_DB
  ) {
    return 'high-pitch-notch';
  }
  if (high - low >= SHAPE_SLOPE_DB && high >= SHAPE_HIGH_MIN_DB) return 'high-pitch';
  if (low - high >= SHAPE_SLOPE_DB) return 'low-pitch';
  if (
    Math.min(...loss) >= SHAPE_FLAT_MIN_DB &&
    Math.max(...loss) - Math.min(...loss) < SHAPE_SLOPE_DB
  ) {
    return 'flat';
  }
  return 'mixed';
}
