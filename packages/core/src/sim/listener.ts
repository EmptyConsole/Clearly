// Seeded simulated listener for the accuracy suite (M01 section 6). Used only by tests and the
// simulation script; nothing in the app imports it.

import {
  BAND_FREQUENCIES_HZ,
  LAPSE_RATE as ESTIMATOR_LAPSE,
  PRIOR_THRESHOLD_BELOW_LC_DB,
  type BandHz,
} from '../constants.ts';
import { clamp, normalCdf } from '../math.ts';
import { normal, pick, uniform, type Rng } from '../rng.ts';
import { AGE_RANGES, STARTER_MEDIAN_LOSS_DB, normalOffsetDb, type AgeRange } from '../tables.ts';
import { EARS, type Ear, type Trial } from '../estimator/types.ts';
import { trackId } from '../estimator/session.ts';

/** True psychometric slope of the simulated listener: steeper than the estimator assumes. */
export const SIM_SIGMA_DB = 2;
export const SIM_LAPSE = ESTIMATOR_LAPSE;
export const SIM_GUESS_NORMAL = 0.02;
export const SIM_HIGH_GUESS_SHARE = 0.1;
export const SIM_HIGH_GUESS_MIN = 0.08;
export const SIM_HIGH_GUESS_MAX = 0.12;
export const SIM_LC_MIN_DBFS = -45;
export const SIM_LC_MAX_DBFS = -20;
/**
 * How far a person's real threshold sits from "Lc - 45" at 1 kHz: people set Lc by ear, so this
 * offset is individual. SD 5 dB, clamped to +/-12 dB.
 */
export const SIM_CALIBRATION_OFFSET_SD_DB = 5;
/** Headphone colouring per band (same for both ears), SD 3 dB, on top of the R(f) table. */
export const SIM_HEADPHONE_SD_DB = 3;
/** Share of listeners who skip the age question. */
export const SIM_SKIP_AGE_SHARE = 0.2;
export const SIM_MAX_LOSS_DB = 60;

export const AUDIOGRAM_SHAPES = [
  'flat-normal',
  'gently-sloping',
  'steep-high',
  'notch-4k',
  'mild-asymmetric',
] as const;
export type AudiogramShape = (typeof AUDIOGRAM_SHAPES)[number];

export interface SimListener {
  readonly lcDbfs: number;
  readonly ageRange: AgeRange | null;
  readonly guessRate: number;
  readonly highGuess: boolean;
  readonly shape: AudiogramShape;
  /** True loss in dB per ear, aligned with BAND_FREQUENCIES_HZ. */
  readonly lossDb: Readonly<Record<Ear, readonly number[]>>;
  /** True threshold in dBFS per track id (all eight bands, both ears). */
  readonly thresholdDbfs: Readonly<Record<string, number>>;
}

function octavesAbove(hz: number, refHz: number): number {
  return Math.max(0, Math.log2(hz / refHz));
}

function shapeLoss(rng: Rng, shape: AudiogramShape): number[] {
  switch (shape) {
    case 'flat-normal':
      return BAND_FREQUENCIES_HZ.map(() => uniform(rng, 0, 6));
    case 'gently-sloping': {
      const at8k = uniform(rng, 15, 40);
      return BAND_FREQUENCIES_HZ.map((hz) => (at8k * octavesAbove(hz, 1000)) / 3);
    }
    case 'steep-high': {
      const top = uniform(rng, 35, 60);
      return BAND_FREQUENCIES_HZ.map((hz) =>
        hz <= 2000 ? uniform(rng, 0, 5) : top * Math.min(1, octavesAbove(hz, 2000)),
      );
    }
    case 'notch-4k': {
      const depth = uniform(rng, 20, 45);
      const notch: Partial<Record<BandHz, number>> = { 3000: 0.5, 4000: 1, 6000: 0.6, 8000: 0.3 };
      return BAND_FREQUENCIES_HZ.map((hz) => depth * (notch[hz] ?? 0));
    }
    case 'mild-asymmetric': {
      const at8k = uniform(rng, 10, 30);
      return BAND_FREQUENCIES_HZ.map((hz) => (at8k * octavesAbove(hz, 1000)) / 3);
    }
  }
}

function nearestAgeRange(lossDb: readonly number[]): AgeRange {
  // Compare the listener's 2, 4 and 8 kHz loss (band indices 3, 5, 7) with starter-table rows.
  const own = [lossDb[3], lossDb[5], lossDb[7]] as number[];
  let best: AgeRange = '50-59';
  let bestErr = Infinity;
  for (const age of AGE_RANGES) {
    const row = STARTER_MEDIAN_LOSS_DB[age];
    const ref = [row[3], row[4], row[5]] as number[];
    const err = own.reduce((s, v, i) => s + (v - (ref[i] as number)) ** 2, 0);
    if (err < bestErr) {
      bestErr = err;
      best = age;
    }
  }
  return best;
}

export function createSimListener(rng: Rng): SimListener {
  const shape = pick(rng, AUDIOGRAM_SHAPES);
  const lcDbfs = uniform(rng, SIM_LC_MIN_DBFS, SIM_LC_MAX_DBFS);
  const highGuess = rng.next() < SIM_HIGH_GUESS_SHARE;
  const guessRate = highGuess
    ? uniform(rng, SIM_HIGH_GUESS_MIN, SIM_HIGH_GUESS_MAX)
    : SIM_GUESS_NORMAL;
  const base = shapeLoss(rng, shape);
  const worseEar: Ear = rng.next() < 0.5 ? 'left' : 'right';
  const asymmetry = shape === 'mild-asymmetric' ? uniform(rng, 10, 20) : 0;
  const lossDb = {} as Record<Ear, number[]>;
  for (const ear of EARS) {
    lossDb[ear] = BAND_FREQUENCIES_HZ.map((hz, i) => {
      const extra = ear === worseEar ? asymmetry * Math.min(1, octavesAbove(hz, 1000) / 2) : 0;
      const v = (base[i] as number) + extra + normal(rng, 0, 3);
      // 1 kHz hearing near normal in every listener (0 to 5 dB).
      return hz === 1000 ? clamp(v, 0, 5) : clamp(v, 0, SIM_MAX_LOSS_DB);
    });
  }
  const calOffset = clamp(normal(rng, 0, SIM_CALIBRATION_OFFSET_SD_DB), -12, 12);
  const headphone = BAND_FREQUENCIES_HZ.map(() => normal(rng, 0, SIM_HEADPHONE_SD_DB));
  const thresholdDbfs: Record<string, number> = {};
  for (const ear of EARS) {
    BAND_FREQUENCIES_HZ.forEach((hz, i) => {
      thresholdDbfs[trackId(ear, hz)] =
        lcDbfs -
        PRIOR_THRESHOLD_BELOW_LC_DB +
        calOffset +
        normalOffsetDb(hz) +
        (headphone[i] as number) +
        (lossDb[ear][i] as number);
    });
  }
  const meanLoss = BAND_FREQUENCIES_HZ.map(
    (_, i) => ((lossDb.left[i] as number) + (lossDb.right[i] as number)) / 2,
  );
  const ageRange = rng.next() < SIM_SKIP_AGE_SHARE ? null : nearestAgeRange(meanLoss);
  return { lcDbfs, ageRange, guessRate, highGuess, shape, lossDb, thresholdDbfs };
}

/** The simulated listener's response to one trial. */
export function simRespond(listener: SimListener, trial: Trial, rng: Rng): boolean {
  if (trial.kind === 'catch') return rng.next() < listener.guessRate;
  const theta = listener.thresholdDbfs[trial.trackId];
  if (theta === undefined) throw new Error(`no truth for ${trial.trackId}`);
  const p =
    listener.guessRate +
    (1 - listener.guessRate - SIM_LAPSE) * normalCdf((trial.levelDbfs - theta) / SIM_SIGMA_DB);
  return rng.next() < p;
}
