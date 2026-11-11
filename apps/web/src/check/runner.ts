// The Hearing Check trial loop. Timing follows packages/core's trial constants and is measured on
// the AudioContext clock from the tone onset the generator returns (onsetTime includes the Safety
// limiter's lookahead), including the early advance 300 ms after "heard".
//
// The runner owns no timers of its own: it waits through `clock.waitUntil`, so component tests can
// run a whole check instantly on a virtual clock, and real runs use the audio clock.

import {
  createRng,
  nextGapMs,
  trialTimings,
  type HearingCheckSession,
  type Pace,
  type Rng,
  type Trial,
} from '@clearly/core';
import type { CheckAudio } from '../audio/AudioEngine.ts';

export interface RunnerClock {
  /** Audio-clock time in seconds. */
  now(): number;
  /** Resolves when the audio clock reaches `time` (seconds), or rejects with AbortError. */
  waitUntil(time: number, signal: AbortSignal): Promise<void>;
}

export type RunnerPhase = 'idle' | 'running' | 'paused' | 'done';

export interface RunnerUpdate {
  readonly phase: RunnerPhase;
  /** The trial being presented (ear shown in the UI), or null between trials. */
  readonly trial: Trial | null;
  readonly heard: boolean;
  readonly finished: number;
  readonly total: number;
}

export interface RunnerOptions {
  readonly session: HearingCheckSession;
  readonly audio: CheckAudio;
  readonly clock: RunnerClock;
  readonly pace: () => Pace;
  readonly onUpdate: (u: RunnerUpdate) => void;
  /** Called with every answer, in order (for pause-and-resume storage). */
  readonly onAnswer?: (heard: boolean) => void;
  /** Called once when the session is complete. */
  readonly onDone: () => void;
  readonly onError: (e: unknown) => void;
  /** Multiplies every duration. 1 in production; test builds may shorten it. */
  readonly timeScale?: number;
  /** Test hook: decides a response for each trial, as if the person tapped just after onset. */
  readonly responder?: (trial: Trial) => boolean;
  /** Computer speakers: every tone goes to both channels (both ears are tested together). */
  readonly bothEars?: boolean;
  readonly gapRng?: Rng;
  /** Reports each tone's RMS (dBFS) and duration (s) for the safe-listening tracker. */
  readonly onTone?: (rmsDbfs: number, seconds: number) => void;
}

function abortError(): Error {
  const e = new Error('aborted');
  e.name = 'AbortError';
  return e;
}

export class CheckRunner {
  private phase: RunnerPhase = 'idle';
  private abort: AbortController | null = null;
  private tapResolve: ((time: number) => void) | null = null;
  private window: { onset: number; end: number } | null = null;
  private currentTrial: Trial | null = null;
  private heard = false;
  private readonly gapRng: Rng;
  private readonly scale: number;

  constructor(private readonly o: RunnerOptions) {
    this.gapRng = o.gapRng ?? createRng(Date.now() >>> 0);
    this.scale = o.timeScale ?? 1;
  }

  get state(): RunnerPhase {
    return this.phase;
  }

  private emit(): void {
    const p = this.o.session.progress();
    this.o.onUpdate({
      phase: this.phase,
      trial: this.currentTrial,
      heard: this.heard,
      finished: p.finished,
      total: p.total,
    });
  }

  start(): void {
    if (this.phase === 'running' || this.phase === 'done') return;
    this.phase = 'running';
    this.emit();
    void this.loop();
  }

  pause(): void {
    if (this.phase !== 'running') return;
    this.phase = 'paused';
    this.abort?.abort();
    this.currentTrial = null;
    this.emit();
  }

  resume(): void {
    if (this.phase !== 'paused') return;
    this.start();
  }

  dispose(): void {
    this.abort?.abort();
    this.phase = 'done';
  }

  /** A response at audio time `time` (defaults to now). Counts only inside the response window. */
  tap(time: number = this.o.clock.now()): boolean {
    const w = this.window;
    if (!w || !this.tapResolve) return false;
    if (time < w.onset || time > w.end) return false;
    this.tapResolve(time);
    return true;
  }

  private s(ms: number): number {
    return (ms * this.scale) / 1000;
  }

  private async loop(): Promise<void> {
    const ac = new AbortController();
    this.abort = ac;
    try {
      while (this.phase === 'running') {
        const trial = this.o.session.next();
        if (!trial) {
          this.phase = 'done';
          this.currentTrial = null;
          this.emit();
          this.o.onDone();
          return;
        }
        const heard = await this.present(trial, ac.signal);
        if (ac.signal.aborted) return;
        this.o.session.respond(heard);
        this.o.onAnswer?.(heard);
        this.currentTrial = null;
        this.heard = false;
        this.emit();
        // Random gap before the next cue.
        const gapMs = nextGapMs(this.o.pace(), this.gapRng);
        await this.o.clock.waitUntil(this.o.clock.now() + this.s(gapMs), ac.signal);
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return;
      this.phase = 'paused';
      this.emit();
      this.o.onError(e);
    }
  }

  /** Presents one trial and returns whether it was heard. */
  private async present(trial: Trial, signal: AbortSignal): Promise<boolean> {
    const timing = trialTimings(this.o.pace());
    this.currentTrial = trial;
    this.heard = false;
    this.emit();
    const startAt = this.o.clock.now() + this.s(timing.cueLeadMs);
    let onset: number;
    if (trial.kind === 'tone') {
      const tone = await this.o.audio.playWarble({
        freqHz: trial.hz,
        ear: this.o.bothEars ? 'both' : trial.ear,
        peakDbfs: trial.levelDbfs,
        startAt,
      });
      onset = tone.onsetTime;
      // Safe-listening tracker: a warble's RMS is about 3 dB under its peak.
      this.o.onTone?.(tone.peakDbfs - 3, (tone.endTime - tone.onsetTime) * 1);
    } else {
      // A catch trial: the same cue and window, no tone.
      onset = startAt + this.o.audio.toneLatencyS;
    }
    if (signal.aborted) throw abortError();
    const end = onset + this.s(timing.responseWindowMs);
    this.window = { onset, end };
    const tapped = new Promise<number>((resolve) => {
      this.tapResolve = resolve;
    });
    const scripted = this.o.responder?.(trial);
    try {
      if (scripted === true) {
        // Scripted tap shortly after onset, as a quick listener would.
        await this.o.clock.waitUntil(onset + this.s(timing.afterHeardMs), signal);
        this.tap(onset + this.s(timing.afterHeardMs));
      }
      const winner = await Promise.race([
        tapped.then((time) => ({ kind: 'tap' as const, time })),
        this.o.clock.waitUntil(end, signal).then(() => ({ kind: 'timeout' as const, time: end })),
      ]);
      if (winner.kind === 'tap') {
        this.heard = true;
        this.emit();
        // Early advance: the trial ends 300 ms after the tap.
        await this.o.clock.waitUntil(winner.time + this.s(timing.afterHeardMs), signal);
        return true;
      }
      return false;
    } finally {
      this.window = null;
      this.tapResolve = null;
    }
  }
}

/** The real clock: waits on the AudioContext clock with short timers. */
export function audioClock(audio: CheckAudio): RunnerClock {
  const override = audio.waitUntil;
  if (override) return { now: () => audio.now(), waitUntil: override };
  return {
    now: () => audio.now(),
    waitUntil(time, signal) {
      return new Promise<void>((resolve, reject) => {
        if (signal.aborted) {
          reject(abortError());
          return;
        }
        let timer = 0;
        const check = () => {
          const left = time - audio.now();
          if (left <= 0) {
            signal.removeEventListener('abort', onAbort);
            resolve();
            return;
          }
          // Re-check at most every 20 ms so the audio clock stays the reference.
          timer = window.setTimeout(check, Math.min(20, Math.max(1, left * 1000)));
        };
        const onAbort = () => {
          window.clearTimeout(timer);
          reject(abortError());
        };
        signal.addEventListener('abort', onAbort, { once: true });
        check();
      });
    },
  };
}
