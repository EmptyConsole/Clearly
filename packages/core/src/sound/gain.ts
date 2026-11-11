// Personal EQ gain per ear and band (M01 section 5).

import {
  BOOST_RATIO,
  CAP_DEFAULT_DB,
  CAP_MAX_DB,
  CAP_MIN_DB,
  GAIN_KNEE_END_DB,
  GAIN_KNEE_START_DB,
  MAX_BAND_BOOST_DB,
  STARTER_BOOST_STYLE,
  STARTER_CAP_DB,
  STRENGTH_DEFAULT,
  STRENGTH_MAX,
  STRENGTH_MIN,
} from '../constants.ts';
import { clamp, smoothstep } from '../math.ts';
import type { PerEar } from '../hearing/loss.ts';

export const BOOST_STYLES = ['gentle', 'standard', 'strong'] as const;
export type BoostStyle = (typeof BOOST_STYLES)[number];

export interface GainOptions {
  readonly boostStyle: BoostStyle;
  /** Per-band cap in dB, 12 to 24 (default 18). */
  readonly capDb: number;
  /** Strength multiplier, 0 to 1.5 (default 1). */
  readonly strength: number;
  /** Starter profiles are forced to Gentle with a 12 dB cap. */
  readonly starter?: boolean;
}

export const DEFAULT_GAIN_OPTIONS: GainOptions = {
  boostStyle: 'standard',
  capDb: CAP_DEFAULT_DB,
  strength: STRENGTH_DEFAULT,
};

/** Soft knee: 0 at or below 2 dB loss, 1 at or above 8 dB, smoothstep in between. */
export function kneeWeight(lossDb: number): number {
  return smoothstep(GAIN_KNEE_START_DB, GAIN_KNEE_END_DB, lossDb);
}

/** gain = k(loss) * min(cap, ratio * loss), times strength, re-capped at 24 dB. */
export function bandGainDb(lossDb: number, options: GainOptions): number {
  const style = options.starter ? STARTER_BOOST_STYLE : options.boostStyle;
  const cap = options.starter ? STARTER_CAP_DB : clamp(options.capDb, CAP_MIN_DB, CAP_MAX_DB);
  const strength = clamp(options.strength, STRENGTH_MIN, STRENGTH_MAX);
  const loss = Math.max(0, lossDb);
  const base = kneeWeight(loss) * Math.min(cap, BOOST_RATIO[style] * loss);
  return Math.min(MAX_BAND_BOOST_DB, base * strength);
}

export function earGainsDb(
  lossDb: PerEar<readonly number[]>,
  options: GainOptions,
): PerEar<number[]> {
  return {
    left: lossDb.left.map((l) => bandGainDb(l, options)),
    right: lossDb.right.map((l) => bandGainDb(l, options)),
  };
}
