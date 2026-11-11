// Messages between the main thread and the Clearly AudioWorklet processors. Shared by both sides,
// so it has no imports and no DOM types.

export const LIMITER_PROCESSOR = 'clearly-limiter';
export const MONITOR_PROCESSOR = 'clearly-monitor';
export const RIDER_PROCESSOR = 'clearly-rider';
export const CLEANUP_PROCESSOR = 'clearly-cleanup';
export const CAPTURE_PROCESSOR = 'clearly-capture';
export const CALM_PROCESSOR = 'clearly-calm';

/** One Calm Sounds generator (kinds as in dsp/calm.ts; kept as a string here: no imports). */
export interface CalmSourceMessage {
  readonly kind: string;
  readonly pitchHz: number;
  /** Normalising gain measured on the main thread. */
  readonly gain: number;
}

export interface CalmProcessorOptions {
  readonly source: CalmSourceMessage;
  readonly seed: number;
}

export interface CaptureProcessorOptions {
  /** Output rate (16000 for captions). */
  readonly targetRate: number;
  /** Seconds of audio per posted chunk. */
  readonly chunkSeconds: number;
}

export interface RiderLevelMessage {
  readonly targetLufs: number;
  readonly maxBoostDb: number;
  readonly maxCutDb: number;
}

export interface RiderProcessorOptions {
  readonly level: RiderLevelMessage;
  readonly reportIntervalMs: number;
}

export interface CleanupProcessorOptions {
  readonly latencySamples: number;
  readonly reportIntervalMs: number;
}

export interface LimiterProcessorOptions {
  /** Starting ceiling for an adjustable limiter (the ceilingDbfs AudioParam then drives it). */
  readonly ceilingDbfs: number;
  /** When set, the ceiling is fixed and the AudioParam is ignored (the Safety limiter). */
  readonly fixedCeilingDbfs?: number;
  readonly lookaheadMs: number;
  readonly reportIntervalMs: number;
}

export interface MonitorProcessorOptions {
  /** 'input' watches Tap A for mono; 'output' meters loudness and runs the overload guard. */
  readonly mode: 'input' | 'output';
  readonly overloadThresholdDbfs: number;
  readonly reportIntervalMs: number;
}

/**
 * Process-time statistics. In Chromium, AudioWorkletGlobalScope has no `performance` (checked
 * 2026-11-09, Chromium 158), only Date.now() with 1 ms resolution. A single quantum takes far less
 * than 1 ms, but the mean of many quantised (end - start) differences is an unbiased estimate of
 * the mean duration when start times are not locked to the clock's ticks (render quanta every
 * 2.667 ms are not), so meanMs is still meaningful; maxMs is not (it is 0 or a whole number).
 */
export interface PerfReport {
  readonly method: 'performance.now' | 'date-now-mean';
  readonly calls: number;
  readonly meanMs: number;
  readonly maxMs: number;
  /** Duration of one render quantum in ms at this context's rate and quantum size. */
  readonly quantumMs: number;
}

export type ToWorklet =
  | { readonly type: 'perf' }
  | { readonly type: 'perf-reset' }
  | { readonly type: 'rearm' }
  | { readonly type: 'stop' }
  | { readonly type: 'rider-level'; readonly level: RiderLevelMessage }
  | { readonly type: 'rnnoise-module'; readonly module: WebAssembly.Module }
  | { readonly type: 'calm-source'; readonly source: CalmSourceMessage };

export type FromWorklet =
  | { readonly type: 'reduction'; readonly db: number; readonly time: number }
  | { readonly type: 'mono'; readonly isMono: boolean; readonly time: number }
  | {
      readonly type: 'level';
      readonly momentaryLufs: number;
      readonly peakDbfs: number;
      readonly rmsDbfs: number;
      readonly time: number;
    }
  | { readonly type: 'overload'; readonly time: number }
  | { readonly type: 'vad'; readonly probability: number; readonly time: number }
  | {
      readonly type: 'rider';
      readonly gainDb: number;
      readonly lufs: number;
      readonly time: number;
    }
  | { readonly type: 'cleanup-ready' }
  | { readonly type: 'capture'; readonly samples: Float32Array; readonly time: number }
  | { readonly type: 'cleanup-failed'; readonly message: string }
  | ({ readonly type: 'perf' } & PerfReport);

export function isFromWorklet(x: unknown): x is FromWorklet {
  return typeof x === 'object' && x !== null && typeof (x as { type?: unknown }).type === 'string';
}
