// Referral flags (M01 section 4): patterns that are worth a check by a hearing professional.
// This is not a diagnosis. The function only returns reasons; the UI words them calmly.

import {
  BAND_FREQUENCIES_HZ,
  REFERRAL_AVERAGE_ASYMMETRY_DB,
  REFERRAL_AVERAGE_LOSS_DB,
  REFERRAL_BAND_ASYMMETRY_DB,
} from '../constants.ts';
import { mean } from '../math.ts';
import { EARS, type Ear } from '../estimator/types.ts';
import type { PerEar } from './loss.ts';

export type ReferralReason =
  | { readonly code: 'average-asymmetry'; readonly differenceDb: number }
  | { readonly code: 'band-asymmetry'; readonly hz: number; readonly differenceDb: number }
  | { readonly code: 'average-loss'; readonly ear: Ear; readonly averageDb: number };

/** Average loss is the mean over the eight bands. */
export function referralReasons(lossDb: PerEar<readonly number[]>): ReferralReason[] {
  const reasons: ReferralReason[] = [];
  const avg = { left: mean(lossDb.left), right: mean(lossDb.right) };
  const avgDiff = Math.abs(avg.left - avg.right);
  if (avgDiff > REFERRAL_AVERAGE_ASYMMETRY_DB) {
    reasons.push({ code: 'average-asymmetry', differenceDb: avgDiff });
  }
  BAND_FREQUENCIES_HZ.forEach((hz, i) => {
    const d = Math.abs((lossDb.left[i] ?? 0) - (lossDb.right[i] ?? 0));
    if (d > REFERRAL_BAND_ASYMMETRY_DB)
      reasons.push({ code: 'band-asymmetry', hz, differenceDb: d });
  });
  for (const ear of EARS) {
    if (avg[ear] > REFERRAL_AVERAGE_LOSS_DB) {
      reasons.push({ code: 'average-loss', ear, averageDb: avg[ear] });
    }
  }
  return reasons;
}
