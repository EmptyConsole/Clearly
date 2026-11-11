// Accuracy suite (M01 section 6): 1000 fixed-seed Express runs and 1000 Refine runs against the
// simulated listener. Tagged slow by file name; it still runs in `pnpm test` and in CI.

import { describe, expect, it } from 'vitest';
import { SIM_TRIAL_STATS } from '../generated/simStats.ts';
import { trialStats } from './report.ts';
import {
  SIM_RUNS,
  SIM_SEED_EXPRESS,
  SIM_SEED_REFINE,
  simulate,
  summarise,
  type SimSummary,
} from './run.ts';

const express: SimSummary = summarise(
  'express',
  simulate({ method: 'express', runs: SIM_RUNS, seed: SIM_SEED_EXPRESS }),
);
const refine: SimSummary = summarise(
  'refine',
  simulate({ method: 'refine', runs: SIM_RUNS, seed: SIM_SEED_REFINE }),
);

describe('Express accuracy (1000 runs)', () => {
  it('at least 95% of track thresholds are within 8 dB of truth', () => {
    expect(express.withinTolerance).toBeGreaterThanOrEqual(0.95);
  });
  it('mean trials, including catch trials, is at most 36', () => {
    expect(express.trialsMean).toBeLessThanOrEqual(36);
  });
  it('the 95th percentile of trials is at most 44', () => {
    expect(express.trialsP95).toBeLessThanOrEqual(44);
  });
  it('every run has at least 6 catch trials', () => {
    expect(express.catchTrialsMin).toBeGreaterThanOrEqual(6);
  });
});

describe('Refine accuracy (1000 runs)', () => {
  it('at least 95% of track thresholds are within 5 dB of truth', () => {
    expect(refine.withinTolerance).toBeGreaterThanOrEqual(0.95);
  });
  it('every run has at least 8 catch trials', () => {
    expect(refine.catchTrialsMin).toBeGreaterThanOrEqual(8);
  });
});

describe('reliability targets', () => {
  it('no more than 5% of normal listeners are rated Low', () => {
    expect(express.normalLow / express.normalListeners).toBeLessThanOrEqual(0.05);
    expect(refine.normalLow / refine.normalListeners).toBeLessThanOrEqual(0.05);
  });

  // OPEN QUESTION (docs/STATUS.txt): this M01 target cannot be met under the M01 section 4
  // reliability rule. Low needs fa > max(2, floor(0.30 n)), but a listener who guesses 8 to 12%
  // of the time expects about 0.1 n false alarms, so with n = 6 the chance of 3 or more is about
  // 2%, and for any n the expected count stays below 0.30 n. Marked `fails` so the suite stays
  // honest: it passes while the target is unmet and turns red (asking for this marker to be
  // removed) the moment a change makes the target pass.
  it.fails('at least 80% of high-guess listeners are rated Low (unmet, see STATUS.txt)', () => {
    expect(express.highGuessLow / express.highGuessListeners).toBeGreaterThanOrEqual(0.8);
  });
});

describe('generated constants', () => {
  it('src/generated/simStats.ts matches a fresh run (regenerate with pnpm --filter core sim)', () => {
    expect(SIM_TRIAL_STATS).toEqual({ express: trialStats(express), refine: trialStats(refine) });
  });
});
