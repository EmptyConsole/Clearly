// One Bayesian threshold track (one ear, one frequency) on a 1 dB grid in dBFS.

import { EDGE_FLAG_MASS, LAPSE_RATE, PSYCHOMETRIC_SIGMA_DB } from '../constants.ts';
import { clamp, logSumExp, normalCdf } from '../math.ts';
import type { LevelFrame } from './levels.ts';
import type { Ear } from './types.ts';

export interface TrackTrial {
  readonly levelDbfs: number;
  readonly heard: boolean;
}

/** P(heard | presented level, threshold) = gamma + (1 - gamma - lambda) * Phi((L - theta) / sigma). */
export function pHeard(levelDbfs: number, thresholdDbfs: number, guessRate: number): number {
  return (
    guessRate +
    (1 - guessRate - LAPSE_RATE) * normalCdf((levelDbfs - thresholdDbfs) / PSYCHOMETRIC_SIGMA_DB)
  );
}

export interface PosteriorSummary {
  readonly meanDbfs: number;
  readonly sdDb: number;
  readonly medianDbfs: number;
  /** Share of the posterior below the quietest presentable level. */
  readonly massBelowFloor: number;
  /** Share of the posterior above the loudest safe level. */
  readonly massAboveCeiling: number;
}

export class Track {
  readonly id: string;
  readonly ear: Ear;
  readonly hz: number;
  readonly grid: Float64Array;
  readonly frame: LevelFrame;
  readonly trials: TrackTrial[] = [];
  priorMeanDbfs: number;
  priorSdDb: number;
  /** Population prior mean (before information sharing or seeding); the reference for sharing. */
  readonly basePriorMeanDbfs: number;
  /** True once the prior has been fixed (information sharing happens before the first trial). */
  started = false;
  finished = false;
  private logPrior: Float64Array;
  private logPost: Float64Array;

  constructor(
    id: string,
    ear: Ear,
    hz: number,
    frame: LevelFrame,
    grid: Float64Array,
    priorMeanDbfs: number,
    priorSdDb: number,
    basePriorMeanDbfs: number = priorMeanDbfs,
  ) {
    this.id = id;
    this.ear = ear;
    this.hz = hz;
    this.frame = frame;
    this.grid = grid;
    this.priorMeanDbfs = priorMeanDbfs;
    this.priorSdDb = priorSdDb;
    this.basePriorMeanDbfs = basePriorMeanDbfs;
    this.logPrior = new Float64Array(grid.length);
    this.logPost = new Float64Array(grid.length);
    this.setPrior(priorMeanDbfs, priorSdDb);
  }

  /** Gaussian prior; the mean is clamped into the grid so it always has mass where it says. */
  setPrior(meanDbfs: number, sdDb: number): void {
    const lo = this.grid[0] as number;
    const hi = this.grid[this.grid.length - 1] as number;
    this.priorMeanDbfs = clamp(meanDbfs, lo, hi);
    this.priorSdDb = sdDb;
    for (let i = 0; i < this.grid.length; i++) {
      const z = ((this.grid[i] as number) - this.priorMeanDbfs) / sdDb;
      this.logPrior[i] = -0.5 * z * z;
    }
    this.logPost.set(this.logPrior);
  }

  /** Adds one response, updating the posterior in log space. */
  addTrial(trial: TrackTrial, guessRate: number): void {
    this.trials.push(trial);
    this.applyTrial(trial, guessRate);
  }

  /** Rebuilds the posterior from the prior and every trial with a new guess rate. */
  reweight(guessRate: number): void {
    this.logPost.set(this.logPrior);
    for (const t of this.trials) this.applyTrial(t, guessRate);
  }

  private applyTrial(trial: TrackTrial, guessRate: number): void {
    for (let i = 0; i < this.grid.length; i++) {
      const p = pHeard(trial.levelDbfs, this.grid[i] as number, guessRate);
      this.logPost[i] = (this.logPost[i] as number) + Math.log(trial.heard ? p : 1 - p);
    }
  }

  /** Normalised posterior probabilities. */
  posterior(): Float64Array {
    const z = logSumExp(this.logPost);
    const out = new Float64Array(this.grid.length);
    for (let i = 0; i < out.length; i++) out[i] = Math.exp((this.logPost[i] as number) - z);
    return out;
  }

  summary(): PosteriorSummary {
    const p = this.posterior();
    let m = 0;
    for (let i = 0; i < p.length; i++) m += (p[i] as number) * (this.grid[i] as number);
    let v = 0;
    let cum = 0;
    let median = this.grid[this.grid.length - 1] as number;
    let medianFound = false;
    let below = 0;
    let above = 0;
    for (let i = 0; i < p.length; i++) {
      const g = this.grid[i] as number;
      const pi = p[i] as number;
      v += pi * (g - m) * (g - m);
      cum += pi;
      if (!medianFound && cum >= 0.5) {
        median = g;
        medianFound = true;
      }
      if (g < this.frame.floorDbfs) below += pi;
      if (g > this.frame.ceilingDbfs) above += pi;
    }
    return {
      meanDbfs: m,
      sdDb: Math.sqrt(v),
      medianDbfs: median,
      massBelowFloor: below,
      massAboveCeiling: above,
    };
  }
}

export function edgeFlags(s: PosteriorSummary): {
  heardAtQuietest: boolean;
  noResponseAtLoudest: boolean;
} {
  return {
    heardAtQuietest: s.massBelowFloor >= EDGE_FLAG_MASS,
    noResponseAtLoudest: s.massAboveCeiling >= EDGE_FLAG_MASS,
  };
}
