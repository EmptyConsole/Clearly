// Builds stored audiograms from a finished Hearing Check or from the starter table.

import { BAND_FREQUENCIES_HZ } from '../constants.ts';
import { EARS, type Ear, type SessionResult } from '../estimator/types.ts';
import type { AgeRange } from '../tables.ts';
import { starterLossBands } from '../tables.ts';
import { AUDIOGRAM_VERSION, type Audiogram, type EarAudiogram } from '../schemas/base.ts';
import { computeLoss, ZERO_COMPENSATION, type HeadphoneCompensation } from './loss.ts';
import { rateReliability } from './reliability.ts';

export function audiogramFromSession(
  result: SessionResult,
  createdAt: string,
  compensation: HeadphoneCompensation = ZERO_COMPENSATION,
): Audiogram {
  const loss = computeLoss(result.tracks, compensation);
  const ears = {} as Record<Ear, EarAudiogram>;
  for (const ear of EARS) {
    ears[ear] = {
      lossDb: [...loss[ear].lossDb],
      uncertaintyDb: [...loss[ear].uncertaintyDb],
      thresholds: BAND_FREQUENCIES_HZ.map((hz) => {
        const t = result.tracks.find((x) => x.ear === ear && x.hz === hz);
        return t ? { dbfs: t.thresholdDbfs, relLc: t.thresholdRelLc, sdDb: t.sdDb } : null;
      }),
    };
  }
  return {
    schemaVersion: AUDIOGRAM_VERSION,
    method: result.method,
    reliability: rateReliability({
      catchTrials: result.catchHistory.catchTrials,
      falseAlarms: result.catchHistory.falseAlarms,
      trackSdsDb: result.tracks.map((t) => t.sdDb),
    }),
    createdAt,
    ears,
  };
}

/** Starter audiogram: the median for the age range, the same in both ears, nothing measured. */
export function starterAudiogram(ageRange: AgeRange, createdAt: string): Audiogram {
  const ear = (): EarAudiogram => ({
    lossDb: starterLossBands(ageRange),
    uncertaintyDb: BAND_FREQUENCIES_HZ.map(() => null),
    thresholds: BAND_FREQUENCIES_HZ.map(() => null),
  });
  return {
    schemaVersion: AUDIOGRAM_VERSION,
    method: 'starter',
    reliability: null,
    createdAt,
    ears: { left: ear(), right: ear() },
  };
}
