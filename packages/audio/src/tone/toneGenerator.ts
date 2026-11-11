// Tone generator for the Hearing Check.
//
// Warble: a sine whose frequency is modulated at 5 Hz by +-5 percent, with 20 ms raised-cosine
// ramps, hard-panned with a StereoPannerNode (pan -1 or +1 puts all of a mono input in one channel
// and exact zeros in the other), or for computer speakers ('both') sent at full level into both
// channels, exactly as the calibration ramp is, so levels stay relative to Lc. Calibration ramp: a 1 kHz warble in both ears from -60 dBFS,
// rising 1.5 dB every 100 ms in short linear steps scheduled ahead, up to -12 dBFS.
//
// Both play through their own Safety limiter (ceiling -3 dBFS), so even tones obey the rule that
// the Safety limiter is the last node on every path. Tones peak at -6 dBFS at most, so it never
// acts on them; it only adds its 2 ms lookahead, which the returned onset times include.

import {
  CALIBRATION_MAX_DBFS,
  TONE_DURATION_MS,
  TONE_FM_DEPTH,
  TONE_FM_RATE_HZ,
  TONE_PEAK_MAX_DBFS,
  TONE_PEAK_MIN_DBFS,
  TONE_RAMP_MS,
} from '@clearly/core';
import {
  CALIBRATION_FREQ_HZ,
  CALIBRATION_START_DBFS,
  CALIBRATION_STEP_DB,
  CALIBRATION_STEP_MS,
  CALIBRATION_STEP_RAMP_MS,
  LIMITER_LOOKAHEAD_MS_DEFAULT,
  RAMP_CURVE_POINTS,
  SAFETY_CEILING_DBFS,
  TONE_SCHEDULE_LEAD_S,
} from '../constants.ts';
import { dbToGain } from '../dsp/level.ts';
import { lookaheadSamples } from '../dsp/limiterCore.ts';
import { createLimiterNode, ensureWorklets } from '../graph/worklets.ts';

/** 'both': computer speakers, where each ear hears both speakers anyway. */
export type Ear = 'left' | 'right' | 'both';

export interface WarbleOptions {
  readonly freqHz: number;
  readonly ear: Ear;
  readonly peakDbfs: number;
  readonly durationMs?: number;
  /** Audio-clock start time; defaults to just after ctx.currentTime. */
  readonly startAt?: number;
}

export interface ScheduledTone {
  /** When the tone starts in the graph (ctx.currentTime units). */
  readonly scheduledTime: number;
  /** When it reaches the output, after the Safety limiter's lookahead. Time responses from this. */
  readonly onsetTime: number;
  readonly endTime: number;
  /** The peak actually used, after clamping to [-90, -6] dBFS. */
  readonly peakDbfs: number;
}

export interface CalibrationRamp {
  readonly onsetTime: number;
  /** When the level reaches -12 dBFS (at the output). */
  readonly topTime: number;
  /** Level in dBFS heard at audio time t (default now). */
  levelAt(t?: number): number;
  /** Fades out now and returns the level that was playing. */
  stop(): number;
  readonly ended: Promise<void>;
}

export interface ToneGenerator {
  readonly latencySamples: number;
  playWarble(o: WarbleOptions): ScheduledTone;
  calibrationRamp(o?: { readonly startAt?: number }): CalibrationRamp;
  dispose(): void;
}

export function clampTonePeakDbfs(db: number): number {
  return Math.min(TONE_PEAK_MAX_DBFS, Math.max(TONE_PEAK_MIN_DBFS, db));
}

/** Raised-cosine curve from `from` to `to` (linear gain values). */
export function raisedCosine(from: number, to: number, points = RAMP_CURVE_POINTS): Float32Array {
  const c = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    const w = 0.5 - 0.5 * Math.cos((Math.PI * i) / (points - 1));
    c[i] = from + (to - from) * w;
  }
  return c;
}

export async function createToneGenerator(
  ctx: BaseAudioContext,
  options: { readonly output?: AudioNode; readonly workletModuleUrl?: string } = {},
): Promise<ToneGenerator> {
  await ensureWorklets(ctx, options.workletModuleUrl);
  const safety = createLimiterNode(ctx, { ceilingDbfs: SAFETY_CEILING_DBFS, fixed: true });
  safety.connect(options.output ?? ctx.destination);
  const latencySamples = lookaheadSamples(ctx.sampleRate, LIMITER_LOOKAHEAD_MS_DEFAULT);
  const latencyS = latencySamples / ctx.sampleRate;
  const ramp = TONE_RAMP_MS / 1000;

  /** A warble voice: carrier with 5 Hz FM into an envelope gain. */
  function voice(freqHz: number, start: number, stopAt: number) {
    const osc = ctx.createOscillator();
    osc.frequency.value = freqHz;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = TONE_FM_RATE_HZ;
    const depth = ctx.createGain();
    depth.gain.value = freqHz * TONE_FM_DEPTH;
    lfo.connect(depth).connect(osc.frequency);
    const env = ctx.createGain();
    env.gain.value = 0;
    osc.connect(env);
    osc.start(start);
    lfo.start(start);
    osc.stop(stopAt);
    lfo.stop(stopAt);
    osc.onended = () => {
      osc.disconnect();
      lfo.disconnect();
      depth.disconnect();
      env.disconnect();
    };
    return { osc, env };
  }

  return {
    latencySamples,

    playWarble(o) {
      const peakDbfs = clampTonePeakDbfs(o.peakDbfs);
      const peak = dbToGain(peakDbfs);
      const duration = (o.durationMs ?? TONE_DURATION_MS) / 1000;
      const t0 = o.startAt ?? ctx.currentTime + TONE_SCHEDULE_LEAD_S;
      const end = t0 + duration;
      const { env } = voice(o.freqHz, t0, end + 0.01);
      env.gain.setValueCurveAtTime(raisedCosine(0, peak), t0, ramp);
      env.gain.setValueCurveAtTime(raisedCosine(peak, 0), end - ramp, ramp);
      if (o.ear === 'both') {
        const merger = new ChannelMergerNode(ctx, { numberOfInputs: 2 });
        env.connect(merger, 0, 0);
        env.connect(merger, 0, 1);
        merger.connect(safety);
      } else {
        const pan = new StereoPannerNode(ctx, { pan: o.ear === 'left' ? -1 : 1 });
        env.connect(pan).connect(safety);
      }
      return { scheduledTime: t0, onsetTime: t0 + latencyS, endTime: end + latencyS, peakDbfs };
    },

    calibrationRamp(o = {}) {
      const t0 = o.startAt ?? ctx.currentTime + TONE_SCHEDULE_LEAD_S;
      const steps = Math.round(
        (CALIBRATION_MAX_DBFS - CALIBRATION_START_DBFS) / CALIBRATION_STEP_DB,
      );
      const stepS = CALIBRATION_STEP_MS / 1000;
      const stepRamp = CALIBRATION_STEP_RAMP_MS / 1000;
      const topAt = t0 + steps * stepS;
      const end = topAt + stepS; // hold the top level for one step, then fade out
      const { osc, env } = voice(CALIBRATION_FREQ_HZ, t0, end + ramp + 0.01);
      const g = env.gain;
      g.setValueCurveAtTime(raisedCosine(0, dbToGain(CALIBRATION_START_DBFS)), t0, ramp);
      for (let k = 1; k <= steps; k++) {
        const t = t0 + k * stepS;
        g.setValueAtTime(dbToGain(CALIBRATION_START_DBFS + (k - 1) * CALIBRATION_STEP_DB), t);
        g.linearRampToValueAtTime(
          dbToGain(CALIBRATION_START_DBFS + k * CALIBRATION_STEP_DB),
          t + stepRamp,
        );
      }
      g.setValueCurveAtTime(raisedCosine(dbToGain(CALIBRATION_MAX_DBFS), 0), end, ramp);
      const merger = ctx.createChannelMerger(2);
      env.connect(merger, 0, 0);
      env.connect(merger, 0, 1);
      merger.connect(safety);
      const levelAt = (t: number = ctx.currentTime) => {
        const k = Math.floor((t - latencyS - t0) / stepS);
        return CALIBRATION_START_DBFS + Math.max(0, Math.min(steps, k)) * CALIBRATION_STEP_DB;
      };
      const ended = new Promise<void>((resolve) => {
        osc.addEventListener('ended', () => {
          merger.disconnect();
          resolve();
        });
      });
      return {
        onsetTime: t0 + latencyS,
        topTime: topAt + latencyS,
        levelAt,
        stop() {
          const now = ctx.currentTime;
          const level = levelAt(now);
          g.cancelScheduledValues(now);
          g.setValueAtTime(dbToGain(level), now);
          g.linearRampToValueAtTime(0, now + ramp);
          osc.stop(now + ramp + 0.01);
          return level;
        },
        ended,
      };
    },

    dispose() {
      safety.port.postMessage({ type: 'stop' });
      safety.port.close();
      safety.disconnect();
    },
  };
}
