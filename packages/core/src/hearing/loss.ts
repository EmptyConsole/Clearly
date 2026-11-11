// From thresholds to loss per band (M01 section 4).

import { BAND_FREQUENCIES_HZ, REFERENCE_FREQUENCY_HZ, type BandHz } from '../constants.ts';
import { pchipLogFrequency } from '../pchip.ts';
import { NORMAL_OFFSET_DB } from '../tables.ts';
import { EARS, type Ear, type TrackResult } from '../estimator/types.ts';

export type PerEar<T> = Readonly<Record<Ear, T>>;

/** Per-ear, per-band headphone compensation in dB, aligned with BAND_FREQUENCIES_HZ. */
export type HeadphoneCompensation = PerEar<readonly number[]>;

export const ZERO_COMPENSATION: HeadphoneCompensation = {
  left: BAND_FREQUENCIES_HZ.map(() => 0),
  right: BAND_FREQUENCIES_HZ.map(() => 0),
};

export interface EarLoss {
  /** Loss in dB at each of the eight bands. */
  readonly lossDb: readonly number[];
  /** Posterior SD in dB at measured bands; null at bands estimated between measured points. */
  readonly uncertaintyDb: readonly (number | null)[];
}

function compensationAt(comp: HeadphoneCompensation, ear: Ear, hz: number): number {
  const i = BAND_FREQUENCIES_HZ.indexOf(hz as BandHz);
  return i < 0 ? 0 : (comp[ear][i] ?? 0);
}

/**
 * loss(f) = max(0, (theta_f - R(f)) - (theta_ref - R(1000))), all thresholds in dBFS, where
 * theta_ref is the better (lower) of the two ears' 1 kHz thresholds.
 *
 * ASSUMPTION: this treats the better ear's 1 kHz hearing as near normal. That is typical of mild
 * age-related loss, but not universal: someone with loss at 1 kHz in both ears will see smaller
 * numbers here than their true loss. The UI states this (copy id hearingCheck.results.refNote).
 *
 * Headphone compensation (dB, per ear and band) is subtracted from each threshold first.
 * Unmeasured bands are filled by PCHIP on log frequency and carry null uncertainty.
 */
export function computeLoss(
  tracks: readonly TrackResult[],
  compensation: HeadphoneCompensation = ZERO_COMPENSATION,
): PerEar<EarLoss> {
  const corrected = tracks.map((t) => ({
    ...t,
    correctedDbfs: t.thresholdDbfs - compensationAt(compensation, t.ear, t.hz),
  }));
  const refs = corrected.filter((t) => t.hz === REFERENCE_FREQUENCY_HZ);
  if (refs.length === 0) throw new Error('loss needs at least one 1 kHz threshold');
  const thetaRefDbfs = Math.min(...refs.map((t) => t.correctedDbfs));
  const refLevel = thetaRefDbfs - NORMAL_OFFSET_DB[REFERENCE_FREQUENCY_HZ];
  const out = {} as Record<Ear, EarLoss>;
  for (const ear of EARS) {
    const measured = corrected
      .filter((t) => t.ear === ear)
      .sort((a, b) => a.hz - b.hz)
      .map((t) => ({
        hz: t.hz,
        loss: Math.max(0, t.correctedDbfs - NORMAL_OFFSET_DB[t.hz as BandHz] - refLevel),
        sd: t.sdDb,
      }));
    if (measured.length === 0) throw new Error(`no thresholds for the ${ear} ear`);
    const interp = pchipLogFrequency(measured.map((m) => ({ hz: m.hz, value: m.loss })));
    out[ear] = {
      lossDb: BAND_FREQUENCIES_HZ.map((hz) => {
        const m = measured.find((x) => x.hz === hz);
        return m ? m.loss : Math.max(0, interp(hz));
      }),
      uncertaintyDb: BAND_FREQUENCIES_HZ.map((hz) => measured.find((x) => x.hz === hz)?.sd ?? null),
    };
  }
  return out;
}
