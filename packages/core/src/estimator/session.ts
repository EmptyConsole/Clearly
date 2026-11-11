// The Hearing Check session: schedules tracks and catch trials, takes responses and returns
// thresholds. Deterministic given its Rng. Works in absolute dBFS; results carry both dBFS and
// values relative to Lc (suffix RelLc).

import {
  CATCH_EVERY_REAL_TRIALS,
  CATCH_MIN_EXPRESS,
  CATCH_MIN_REFINE,
  DEFAULT_AGE_RANGE,
  EXPRESS_FREQUENCIES_HZ,
  GUESS_PRIOR_ALPHA,
  GUESS_PRIOR_BETA,
  GUESS_RATE_INITIAL,
  GUESS_RATE_MAX,
  GUESS_RATE_MIN,
  GUESS_UPDATE_MIN_CATCH,
  LEVEL_ROUND_DB,
  PRIOR_THRESHOLD_BELOW_LC_DB,
  REFINE_EXTRA_FREQUENCIES_HZ,
  type BandHz,
} from '../constants.ts';
import { clamp, roundTo } from '../math.ts';
import { pick, uniform, type Rng } from '../rng.ts';
import { normalOffsetDb, starterLossDb, type AgeRange } from '../tables.ts';
import { levelFrame, thresholdGridDbfs, toDbfs, toRelLc, type LevelFrame } from './levels.ts';
import { EXPRESS_PARAMS, REFINE_PARAMS } from './params.ts';
import { Track, edgeFlags } from './track.ts';
import {
  EARS,
  type CatchHistory,
  type CheckMethod,
  type Ear,
  type EstimatorParams,
  type SessionResult,
  type TrackResult,
  type Trial,
} from './types.ts';

export interface SessionConfig {
  readonly method: CheckMethod;
  readonly lcDbfs: number;
  /** Null when the person skipped the question; 50 to 59 is then assumed. */
  readonly ageRange: AgeRange | null;
  readonly rng: Rng;
  /** Overrides for tuning and tests. */
  readonly params?: Partial<EstimatorParams>;
  /** Refine only: the Express result each track is seeded from. */
  readonly seed?: SessionResult;
  /**
   * Which ears get tracks (default both). Computer speakers reach both ears at once, so a check
   * through speakers runs one set of tracks (['left'], played to both channels) and the result is
   * copied to both ears with mirrorEars.
   */
  readonly ears?: readonly Ear[];
}

export function trackId(ear: Ear, hz: number): string {
  return `${ear}-${hz}`;
}

/** Prior mean in dBFS: Lc - 45 + R(f) + starter loss for the age range (M01 section 3). */
export function priorMeanDbfs(lcDbfs: number, ageRange: AgeRange | null, hz: BandHz): number {
  return (
    lcDbfs -
    PRIOR_THRESHOLD_BELOW_LC_DB +
    normalOffsetDb(hz) +
    starterLossDb(ageRange ?? DEFAULT_AGE_RANGE, hz)
  );
}

/** Posterior-mean guess rate under a Beta(1, 49) prior, clamped to [0.01, 0.15]. */
export function estimateGuessRate(history: CatchHistory): number {
  const a = GUESS_PRIOR_ALPHA + history.falseAlarms;
  const b = GUESS_PRIOR_BETA + history.catchTrials - history.falseAlarms;
  return clamp(a / (a + b), GUESS_RATE_MIN, GUESS_RATE_MAX);
}

export class HearingCheckSession {
  readonly method: CheckMethod;
  readonly frame: LevelFrame;
  readonly params: EstimatorParams;
  private readonly rng: Rng;
  private readonly tracks: Track[];
  private readonly minCatch: number;
  private readonly initialHistory: CatchHistory;
  private guessRate: number;
  private catchTrials = 0;
  private falseAlarms = 0;
  private toneTrials = 0;
  private heardToneTrials = 0;
  private index = 0;
  private lastTrackId: string | null = null;
  private lastWasCatch = false;
  private pending: Trial | null = null;
  private readonly seededIds: Set<string>;

  constructor(config: SessionConfig) {
    this.method = config.method;
    this.rng = config.rng;
    this.frame = levelFrame(config.lcDbfs);
    const base = config.method === 'express' ? EXPRESS_PARAMS : REFINE_PARAMS;
    this.params = { ...base, ...config.params };
    this.minCatch = config.method === 'express' ? CATCH_MIN_EXPRESS : CATCH_MIN_REFINE;
    if (config.method === 'refine' && !config.seed) {
      throw new Error('Refine needs the Express result to seed from');
    }
    this.initialHistory = config.seed?.catchHistory ?? { catchTrials: 0, falseAlarms: 0 };
    this.guessRate = this.currentGuessRate();

    const grid = thresholdGridDbfs(this.frame);
    const freqs: readonly BandHz[] =
      config.method === 'express'
        ? EXPRESS_FREQUENCIES_HZ
        : [...EXPRESS_FREQUENCIES_HZ, ...REFINE_EXTRA_FREQUENCIES_HZ].sort((a, b) => a - b);
    this.tracks = [];
    for (const ear of config.ears ?? EARS) {
      for (const hz of freqs) {
        const id = trackId(ear, hz);
        const seeded = config.seed?.tracks.find((t) => t.trackId === id);
        const populationMeanDbfs = priorMeanDbfs(config.lcDbfs, config.ageRange, hz);
        // Seeds are stored relative to Lc so a new calibration level carries them correctly.
        const meanDbfs = seeded ? toDbfs(seeded.thresholdRelLc, config.lcDbfs) : populationMeanDbfs;
        const track = new Track(
          id,
          ear,
          hz,
          this.frame,
          grid,
          meanDbfs,
          seeded ? seeded.sdDb : this.params.priorSdDb,
          populationMeanDbfs,
        );
        // A seeded track's prior is already its Express posterior: no information sharing.
        if (seeded) track.started = true;
        this.tracks.push(track);
      }
    }
    // Seeded tracks count as finished for information sharing into the new Refine tracks.
    this.seededIds = new Set(config.seed?.tracks.map((t) => t.trackId) ?? []);
  }

  private currentGuessRate(): number {
    const history = this.history();
    return history.catchTrials >= GUESS_UPDATE_MIN_CATCH
      ? estimateGuessRate(history)
      : GUESS_RATE_INITIAL;
  }

  history(): CatchHistory {
    return {
      catchTrials: this.initialHistory.catchTrials + this.catchTrials,
      falseAlarms: this.initialHistory.falseAlarms + this.falseAlarms,
    };
  }

  isDone(): boolean {
    return this.pending === null && this.nextTrialKind() === null;
  }

  /** The trial to present now, or null when the session is complete. Stable until respond(). */
  next(): Trial | null {
    if (this.pending) return this.pending;
    const kind = this.nextTrialKind();
    if (kind === null) return null;
    if (kind === 'catch') {
      this.pending = { kind: 'catch', index: this.index };
      return this.pending;
    }
    const candidates = this.tracks.filter((t) => !t.finished);
    const notRepeat = candidates.filter((t) => t.id !== this.lastTrackId);
    // Only when a single track is left can it repeat; there is nothing else to interleave.
    const track = pick(this.rng, notRepeat.length > 0 ? notRepeat : candidates);
    if (!track.started) this.startTrack(track);
    const s = track.summary();
    const jittered = s.medianDbfs + uniform(this.rng, -this.params.jitterDb, this.params.jitterDb);
    const levelDbfs = clamp(
      roundTo(jittered, LEVEL_ROUND_DB),
      this.frame.floorDbfs,
      this.frame.ceilingDbfs,
    );
    this.pending = {
      kind: 'tone',
      index: this.index,
      trackId: track.id,
      ear: track.ear,
      hz: track.hz,
      levelDbfs,
      levelRelLc: toRelLc(levelDbfs, this.frame.lcDbfs),
    };
    return this.pending;
  }

  respond(heard: boolean): void {
    const trial = this.pending;
    if (!trial) throw new Error('respond() called with no trial pending');
    this.pending = null;
    this.index++;
    if (trial.kind === 'catch') {
      this.catchTrials++;
      if (heard) this.falseAlarms++;
      this.lastWasCatch = true;
      const g = this.currentGuessRate();
      if (g !== this.guessRate) {
        this.guessRate = g;
        for (const t of this.tracks) if (t.trials.length > 0) t.reweight(g);
      }
      return;
    }
    const track = this.tracks.find((t) => t.id === trial.trackId);
    if (!track) throw new Error(`unknown track ${trial.trackId}`);
    track.addTrial({ levelDbfs: trial.levelDbfs, heard }, this.guessRate);
    this.toneTrials++;
    if (heard) this.heardToneTrials++;
    this.lastWasCatch = false;
    this.lastTrackId = track.id;
    const n = track.trials.length;
    if (
      n >= this.params.maxTrials ||
      (n >= this.params.minTrials && track.summary().sdDb <= this.params.stopSdDb)
    ) {
      track.finished = true;
    }
  }

  /** Information sharing, applied once before a track's first trial (M01 section 3). */
  private startTrack(track: Track): void {
    track.started = true;
    const done = this.tracks.filter((t) => t !== track && (t.finished || this.seededIds.has(t.id)));
    let shift = 0;
    const sameEar = done.filter((t) => t.ear === track.ear);
    if (sameEar.length > 0) {
      const dist = (t: Track): number => Math.abs(Math.log2(t.hz / track.hz));
      const nearest = Math.min(...sameEar.map(dist));
      // Equidistant neighbours (an octave below and above) are averaged.
      const near = sameEar.filter((t) => Math.abs(dist(t) - nearest) < 1e-9);
      let gap = 0;
      for (const t of near) gap += t.summary().meanDbfs - t.basePriorMeanDbfs;
      shift += this.params.shareSameEar * (gap / near.length);
    }
    const other = done.find((t) => t.ear !== track.ear && t.hz === track.hz);
    if (other)
      shift += this.params.shareOtherEar * (other.summary().meanDbfs - other.basePriorMeanDbfs);
    if (shift !== 0) track.setPrior(track.priorMeanDbfs + shift, track.priorSdDb);
  }

  private catchNeeded(): number {
    return (
      Math.max(this.minCatch, Math.floor(this.toneTrials / CATCH_EVERY_REAL_TRIALS)) -
      this.catchTrials
    );
  }

  /**
   * Decides whether the next trial is a tone, a catch trial or nothing (done).
   * Catch trials are placed at random, never first and never two in a row. When the number still
   * needed reaches the fewest tone trials that can remain, one is forced so the minimum is met.
   */
  private nextTrialKind(): 'tone' | 'catch' | null {
    const open = this.tracks.filter((t) => !t.finished);
    const need = this.catchNeeded();
    const catchAllowed = this.index > 0 && !this.lastWasCatch && need > 0;
    if (open.length === 0) return catchAllowed ? 'catch' : null;
    if (!catchAllowed) return 'tone';
    // Every open track needs at least one more trial, and at least minTrials in total.
    let fewestLeft = 0;
    let expectedLeft = 0;
    const typical = (this.params.minTrials + this.params.maxTrials) / 2;
    for (const t of open) {
      fewestLeft += Math.max(1, this.params.minTrials - t.trials.length);
      expectedLeft += Math.max(1, typical - t.trials.length);
    }
    if (need >= fewestLeft) return 'catch';
    return this.rng.next() < need / (expectedLeft + 1) ? 'catch' : 'tone';
  }

  /** Tracks finished so far and in total, for the progress bar (finished tracks over tracks). */
  progress(): { readonly finished: number; readonly total: number } {
    return { finished: this.tracks.filter((t) => t.finished).length, total: this.tracks.length };
  }

  /** Results of the tracks finished so far, for the live audiogram. */
  finishedTracks(): TrackResult[] {
    return this.tracks.filter((t) => t.finished).map((t) => this.trackResult(t));
  }

  private trackResult(t: Track): TrackResult {
    const s = t.summary();
    return {
      trackId: t.id,
      ear: t.ear,
      hz: t.hz,
      thresholdDbfs: s.meanDbfs,
      thresholdRelLc: toRelLc(s.meanDbfs, this.frame.lcDbfs),
      sdDb: s.sdDb,
      trials: t.trials.length,
      massBelowFloor: s.massBelowFloor,
      massAboveCeiling: s.massAboveCeiling,
      ...edgeFlags(s),
    };
  }

  result(): SessionResult {
    if (!this.isDone()) throw new Error('the session is not finished');
    const tracks: TrackResult[] = this.tracks.map((t) => this.trackResult(t));
    return {
      method: this.method,
      lcDbfs: this.frame.lcDbfs,
      tracks,
      catchHistory: this.history(),
      guessRate: this.guessRate,
      totalTrials: this.toneTrials + this.catchTrials,
      toneTrials: this.toneTrials,
      catchTrials: this.catchTrials,
      heardToneTrials: this.heardToneTrials,
    };
  }
}

/**
 * Rebuilds a paused session (Refine "Pause and finish later"). The session is deterministic given
 * its Rng, so replaying the same config with a fresh Rng from the same seed and the stored
 * answers, in order, reaches exactly the state it was paused in.
 */
export function restoreSession(
  config: SessionConfig,
  responses: readonly boolean[],
): HearingCheckSession {
  const session = new HearingCheckSession(config);
  for (const heard of responses) {
    if (!session.next()) throw new Error('stored answers run past the end of the session');
    session.respond(heard);
  }
  return session;
}

/**
 * A check through computer speakers measures both ears together: its tracks (run as 'left') are
 * copied to the right ear, so audiograms, loss, reliability and referral work unchanged. Both ears
 * then read the same, so no difference between the ears can be flagged (the results say so).
 */
export function mirrorEars(result: SessionResult): SessionResult {
  const left = result.tracks.filter((t) => t.ear === 'left');
  if (left.length === 0 || result.tracks.some((t) => t.ear === 'right')) return result;
  return {
    ...result,
    tracks: [
      ...left,
      ...left.map((t) => ({ ...t, ear: 'right' as const, trackId: trackId('right', t.hz) })),
    ],
  };
}
