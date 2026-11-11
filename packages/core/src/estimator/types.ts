export const EARS = ['left', 'right'] as const;
export type Ear = (typeof EARS)[number];

export type CheckMethod = 'express' | 'refine';

/** Tunable estimator settings. Defaults live in ESTIMATOR_DEFAULTS (estimator/params.ts). */
export interface EstimatorParams {
  readonly priorSdDb: number;
  readonly stopSdDb: number;
  readonly minTrials: number;
  readonly maxTrials: number;
  readonly jitterDb: number;
  /** Weight of the nearest finished frequency in the same ear. */
  readonly shareSameEar: number;
  /** Weight of the finished track at the same frequency in the other ear. */
  readonly shareOtherEar: number;
}

export interface ToneTrial {
  readonly kind: 'tone';
  readonly index: number;
  readonly trackId: string;
  readonly ear: Ear;
  readonly hz: number;
  readonly levelDbfs: number;
  readonly levelRelLc: number;
}

/** A silent trial: the cue shows, no tone plays. A "heard" tap is a false alarm. */
export interface CatchTrial {
  readonly kind: 'catch';
  readonly index: number;
}

export type Trial = ToneTrial | CatchTrial;

export interface TrackResult {
  readonly trackId: string;
  readonly ear: Ear;
  readonly hz: number;
  readonly thresholdDbfs: number;
  readonly thresholdRelLc: number;
  readonly sdDb: number;
  readonly trials: number;
  readonly massBelowFloor: number;
  readonly massAboveCeiling: number;
  /** Heard even at the quietest level we can play: the true threshold may be lower. */
  readonly heardAtQuietest: boolean;
  /** No response at the loudest safe level: the true threshold may be higher. */
  readonly noResponseAtLoudest: boolean;
}

export interface CatchHistory {
  readonly catchTrials: number;
  readonly falseAlarms: number;
}

export interface SessionResult {
  readonly method: CheckMethod;
  readonly lcDbfs: number;
  readonly tracks: readonly TrackResult[];
  readonly catchHistory: CatchHistory;
  readonly guessRate: number;
  /** Real (tone) trials plus catch trials in this run. */
  readonly totalTrials: number;
  readonly toneTrials: number;
  readonly catchTrials: number;
  readonly heardToneTrials: number;
}
