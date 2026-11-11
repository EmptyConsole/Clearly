// Hearing Check timing model and honest durations (M01 section 7). Every "about N seconds" in the
// UI must come from expectedDurationSeconds; nothing hard-codes a duration.

import {
  AFTER_HEARD_MS,
  CALIBRATION_SECONDS,
  CUE_LEAD_MS,
  DURATION_ROUND_TO_S,
  GAP_MAX_MS,
  GAP_MIN_MS,
  MEAN_REACTION_MS,
  RESPONSE_WINDOW_MS,
  SLOWER_PACE_FACTOR,
  STARTER_SECONDS,
} from './constants.ts';
import { uniform, type Rng } from './rng.ts';
import type { AgeRange } from './tables.ts';
import { SIM_TRIAL_STATS } from './generated/simStats.ts';

export type Pace = 'normal' | 'slower';
export type PaceSetting = 'auto' | Pace;

/** Slower pace turns on automatically for the 70-79 and 80-plus age ranges. */
export function effectivePace(setting: PaceSetting, ageRange: AgeRange | null): Pace {
  if (setting !== 'auto') return setting;
  return ageRange === '70-79' || ageRange === '80-plus' ? 'slower' : 'normal';
}

export interface TrialTimings {
  readonly cueLeadMs: number;
  readonly responseWindowMs: number;
  readonly afterHeardMs: number;
  readonly gapMinMs: number;
  readonly gapMaxMs: number;
}

/** Slower pace multiplies the response window and the gaps by 1.5. */
export function trialTimings(pace: Pace): TrialTimings {
  const k = pace === 'slower' ? SLOWER_PACE_FACTOR : 1;
  return {
    cueLeadMs: CUE_LEAD_MS,
    responseWindowMs: RESPONSE_WINDOW_MS * k,
    afterHeardMs: AFTER_HEARD_MS * k,
    gapMinMs: GAP_MIN_MS * k,
    gapMaxMs: GAP_MAX_MS * k,
  };
}

/** Random gap before the next trial, uniform in [250, 450] ms (times 1.5 at slower pace). */
export function nextGapMs(pace: Pace, rng: Rng): number {
  const t = trialTimings(pace);
  return uniform(rng, t.gapMinMs, t.gapMaxMs);
}

/**
 * When the next trial may start, measured from this trial's tone onset. After "heard" it is the
 * tap plus 300 ms; after "not heard" (or a silent catch trial) it is the end of the window.
 * The random gap and the next cue come after this.
 */
export function trialEndAfterOnsetMs(pace: Pace, tapAfterOnsetMs: number | null): number {
  const t = trialTimings(pace);
  return tapAfterOnsetMs === null ? t.responseWindowMs : tapAfterOnsetMs + t.afterHeardMs;
}

/** Mean duration of one trial, cue to next cue, in ms. */
export function meanTrialMs(pace: Pace, heard: boolean): number {
  const t = trialTimings(pace);
  const gap = (t.gapMinMs + t.gapMaxMs) / 2;
  return t.cueLeadMs + trialEndAfterOnsetMs(pace, heard ? MEAN_REACTION_MS : null) + gap;
}

export type DurationMethod = 'starter' | 'express' | 'refine';

export interface TrialCountStats {
  readonly toneTrialsMean: number;
  readonly catchTrialsMean: number;
  /** Share of tone trials answered "heard". */
  readonly heardShare: number;
}

/** Unrounded expected duration in seconds for given trial-count statistics. */
export function durationFromStatsSeconds(s: TrialCountStats, pace: Pace): number {
  const toneMs =
    s.toneTrialsMean *
    (s.heardShare * meanTrialMs(pace, true) + (1 - s.heardShare) * meanTrialMs(pace, false));
  // Catch trials are silent; almost all end with no tap, so they last the full window.
  const catchMs = s.catchTrialsMean * meanTrialMs(pace, false);
  return CALIBRATION_SECONDS + (toneMs + catchMs) / 1000;
}

/**
 * Expected duration in seconds, rounded up to the nearest 10 s. Combines the timing constants
 * with the mean trial counts and heard share measured by the simulation (generated/simStats.ts),
 * plus 4 s for calibration. Starter is a fixed 5 seconds (one question, no tones).
 */
export function expectedDurationSeconds(
  method: DurationMethod,
  pace: Pace,
  /** 1 for computer speakers (both ears together: half the tone trials). */
  ears: 1 | 2 = 2,
): number {
  if (method === 'starter') return STARTER_SECONDS;
  const stats = SIM_TRIAL_STATS[method];
  const seconds = durationFromStatsSeconds(
    { ...stats, toneTrialsMean: (stats.toneTrialsMean * ears) / 2 },
    pace,
  );
  return Math.ceil(seconds / DURATION_ROUND_TO_S) * DURATION_ROUND_TO_S;
}
