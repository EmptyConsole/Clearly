// Runs simulated Hearing Checks and summarises accuracy (M01 section 6).

import { mean, percentile } from '../math.ts';
import { createRng } from '../rng.ts';
import { rateReliability, type Reliability } from '../hearing/reliability.ts';
import { HearingCheckSession } from '../estimator/session.ts';
import type { CheckMethod, EstimatorParams, SessionResult } from '../estimator/types.ts';
import { createSimListener, simRespond, type SimListener } from './listener.ts';

export const EXPRESS_TOLERANCE_DB = 8;
export const REFINE_TOLERANCE_DB = 5;
/** Fixed seeds so the suite and docs/sim-results.txt are reproducible. */
export const SIM_SEED_EXPRESS = 20261109;
export const SIM_SEED_REFINE = 20261110;
export const SIM_RUNS = 1000;

export interface SimOptions {
  readonly method: CheckMethod;
  readonly runs: number;
  readonly seed: number;
  readonly expressParams?: Partial<EstimatorParams>;
  readonly refineParams?: Partial<EstimatorParams>;
}

export interface TrackOutcome {
  readonly errorDb: number;
  /** True threshold lies inside the presentable range [floor, ceiling]. */
  readonly measurable: boolean;
  readonly truthAboveCeiling: boolean;
  readonly truthBelowFloor: boolean;
  readonly flaggedAbove: boolean;
  readonly flaggedBelow: boolean;
  readonly sdDb: number;
}

export interface RunOutcome {
  readonly listener: SimListener;
  readonly result: SessionResult;
  readonly reliability: Reliability;
  readonly tracks: readonly TrackOutcome[];
}

export function runSession(
  method: CheckMethod,
  listener: SimListener,
  seed: number,
  params: Partial<EstimatorParams> | undefined,
  express?: SessionResult,
): SessionResult {
  const rng = createRng(seed);
  const responder = createRng(seed ^ 0x5bd1e995);
  const session = new HearingCheckSession({
    method,
    lcDbfs: listener.lcDbfs,
    ageRange: listener.ageRange,
    rng,
    ...(params ? { params } : {}),
    ...(express ? { seed: express } : {}),
  });
  for (let trial = session.next(); trial; trial = session.next()) {
    session.respond(simRespond(listener, trial, responder));
  }
  return session.result();
}

function outcome(listener: SimListener, result: SessionResult): RunOutcome {
  const tracks = result.tracks.map((t): TrackOutcome => {
    const truth = listener.thresholdDbfs[t.trackId] as number;
    const ceiling = Math.min(result.lcDbfs + 12, -6);
    return {
      errorDb: t.thresholdDbfs - truth,
      measurable: truth >= -90 && truth <= ceiling,
      truthAboveCeiling: truth > ceiling,
      truthBelowFloor: truth < -90,
      flaggedAbove: t.noResponseAtLoudest,
      flaggedBelow: t.heardAtQuietest,
      sdDb: t.sdDb,
    };
  });
  const reliability = rateReliability({
    catchTrials: result.catchHistory.catchTrials,
    falseAlarms: result.catchHistory.falseAlarms,
    trackSdsDb: result.tracks.map((t) => t.sdDb),
  });
  return { listener, result, reliability, tracks };
}

export function simulate(options: SimOptions): RunOutcome[] {
  const master = createRng(options.seed);
  const out: RunOutcome[] = [];
  for (let i = 0; i < options.runs; i++) {
    const listenerSeed = Math.floor(master.next() * 2 ** 32);
    const sessionSeed = Math.floor(master.next() * 2 ** 32);
    const listener = createSimListener(createRng(listenerSeed));
    const express = runSession('express', listener, sessionSeed, options.expressParams);
    if (options.method === 'express') {
      out.push(outcome(listener, express));
    } else {
      const refine = runSession(
        'refine',
        listener,
        (sessionSeed + 1) >>> 0,
        options.refineParams,
        express,
      );
      out.push(outcome(listener, refine));
    }
  }
  return out;
}

export interface SimSummary {
  readonly method: CheckMethod;
  readonly runs: number;
  readonly toleranceDb: number;
  readonly measurableTracks: number;
  readonly withinTolerance: number;
  readonly absErrorP50: number;
  readonly absErrorP90: number;
  readonly absErrorP95: number;
  readonly absErrorP99: number;
  readonly meanSignedErrorDb: number;
  readonly censoredTracks: number;
  readonly censoredFlagged: number;
  readonly trialsMean: number;
  readonly trialsP50: number;
  readonly trialsP95: number;
  readonly trialsMax: number;
  readonly toneTrialsMean: number;
  readonly catchTrialsMean: number;
  readonly catchTrialsMin: number;
  readonly heardShare: number;
  readonly highGuessListeners: number;
  readonly highGuessLow: number;
  readonly normalListeners: number;
  readonly normalLow: number;
  readonly reliabilityCounts: Readonly<Record<Reliability, number>>;
  readonly trialHistogram: Readonly<Record<number, number>>;
}

export function summarise(method: CheckMethod, runs: readonly RunOutcome[]): SimSummary {
  const toleranceDb = method === 'express' ? EXPRESS_TOLERANCE_DB : REFINE_TOLERANCE_DB;
  const measurable = runs.flatMap((r) => r.tracks.filter((t) => t.measurable));
  const abs = measurable.map((t) => Math.abs(t.errorDb));
  const censored = runs.flatMap((r) => r.tracks.filter((t) => !t.measurable));
  const trials = runs.map((r) => r.result.totalTrials);
  const histogram: Record<number, number> = {};
  for (const n of trials) histogram[n] = (histogram[n] ?? 0) + 1;
  const high = runs.filter((r) => r.listener.highGuess);
  const normalRuns = runs.filter((r) => !r.listener.highGuess);
  const counts: Record<Reliability, number> = { High: 0, Medium: 0, Low: 0 };
  for (const r of runs) counts[r.reliability]++;
  const tone = runs.reduce((s, r) => s + r.result.toneTrials, 0);
  const heard = runs.reduce((s, r) => s + r.result.heardToneTrials, 0);
  return {
    method,
    runs: runs.length,
    toleranceDb,
    measurableTracks: measurable.length,
    withinTolerance: abs.filter((e) => e <= toleranceDb).length / Math.max(1, abs.length),
    absErrorP50: percentile(abs, 50),
    absErrorP90: percentile(abs, 90),
    absErrorP95: percentile(abs, 95),
    absErrorP99: percentile(abs, 99),
    meanSignedErrorDb: mean(measurable.map((t) => t.errorDb)),
    censoredTracks: censored.length,
    censoredFlagged: censored.filter(
      (t) => (t.truthAboveCeiling && t.flaggedAbove) || (t.truthBelowFloor && t.flaggedBelow),
    ).length,
    trialsMean: mean(trials),
    trialsP50: percentile(trials, 50),
    trialsP95: percentile(trials, 95),
    trialsMax: Math.max(...trials),
    toneTrialsMean: mean(runs.map((r) => r.result.toneTrials)),
    catchTrialsMean: mean(runs.map((r) => r.result.catchTrials)),
    catchTrialsMin: Math.min(...runs.map((r) => r.result.catchTrials)),
    heardShare: heard / Math.max(1, tone),
    highGuessListeners: high.length,
    highGuessLow: high.filter((r) => r.reliability === 'Low').length,
    normalListeners: normalRuns.length,
    normalLow: normalRuns.filter((r) => r.reliability === 'Low').length,
    reliabilityCounts: counts,
    trialHistogram: histogram,
  };
}
