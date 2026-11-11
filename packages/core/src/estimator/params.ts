// Estimator settings for Express and Refine. Express values are TUNED by the simulation
// (M01 section 6); the stage of the tuning ladder reached is recorded in docs/DECISIONS.txt.

import { LEVEL_JITTER_DB } from '../constants.ts';
import type { EstimatorParams } from './types.ts';

/** Every track gets at least this many trials before the SD stop rule may end it (M01 section 3). */
export const MIN_TRIALS = 2;

/**
 * TUNED at stage 1 of the ladder (maxTrials 4), chosen with scripts/tune.ts on tuning seed 777 and
 * checked on seeds 4242 and 9999 before the validation run. Among the passing settings this one
 * keeps the specified +/-2 dB jitter (it stops the next level being predictable from the last).
 */
export const EXPRESS_PARAMS: EstimatorParams = {
  priorSdDb: 13.5,
  stopSdDb: 5.5,
  minTrials: MIN_TRIALS,
  maxTrials: 4,
  jitterDb: LEVEL_JITTER_DB,
  shareSameEar: 0.6,
  shareOtherEar: 0.45,
};

/** Refine: stop at SD 3.5 dB with up to 8 trials (M01 section 3). */
export const REFINE_PARAMS: EstimatorParams = {
  ...EXPRESS_PARAMS,
  stopSdDb: 3.5,
  maxTrials: 8,
};
