// Test helpers for other packages' tests and the web app's test-build hook. Never imported by
// production code paths: apps/web loads it only behind import.meta.env test flags.

import { NORMAL_OFFSET_DB } from './tables.ts';
import { BAND_FREQUENCIES_HZ, PRIOR_THRESHOLD_BELOW_LC_DB, type BandHz } from './constants.ts';
import type { Ear, Trial } from './estimator/types.ts';

export { createSimListener, simRespond, type SimListener } from './sim/listener.ts';
export { FIXTURES } from './schemas/fixtures.ts';

export interface DeterministicListenerOptions {
  /** Loss in dB per ear, aligned with BAND_FREQUENCIES_HZ. Defaults to zeros. */
  readonly lossDb?: Readonly<Record<Ear, readonly number[]>>;
  /** Taps "heard" on every catch trial (a listener who guesses). */
  readonly tapsOnCatch?: boolean;
  /** Never hears anything (for edge cases). */
  readonly deaf?: boolean;
}

/**
 * A listener with a hard threshold relative to Lc: hears a tone exactly when its level is at or
 * above Lc - 45 + R(f) + loss. Deterministic, so component and e2e tests are repeatable.
 */
export function deterministicListener(o: DeterministicListenerOptions = {}) {
  const thresholdRelLc = (ear: Ear, hz: number): number => {
    const i = BAND_FREQUENCIES_HZ.indexOf(hz as BandHz);
    const loss = o.lossDb?.[ear][i] ?? 0;
    const offsets: Readonly<Record<number, number | undefined>> = NORMAL_OFFSET_DB;
    return -PRIOR_THRESHOLD_BELOW_LC_DB + (offsets[hz] ?? 0) + loss;
  };
  return {
    thresholdRelLc,
    hears(trial: Trial): boolean {
      if (o.deaf) return false;
      if (trial.kind === 'catch') return Boolean(o.tapsOnCatch);
      return trial.levelRelLc >= thresholdRelLc(trial.ear, trial.hz);
    },
  };
}
