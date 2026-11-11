// Calm Sounds graph (M09): generator -> volume (hard cap) -> sleep fade -> Safety limiter ->
// destination, with an output monitor tap for the safe-listening tracker.
//
// The volume cap is enforced here, not only in the slider: every gain change goes through
// calmGain(volume, cap), which can never exceed the cap whatever value it is given, and the cap is
// fixed when the graph is built (from Lc - 10 dB, or -24 dBFS without calibration).

import { calmGain, normalisingGain, SLEEP_FADE_S, type CalmKind } from '../dsp/calm.ts';
import { METER_REPORT_INTERVAL_MS, OVERLOAD_THRESHOLD_DBFS, SLIDER_TAU_S } from '../constants.ts';
import {
  CALM_PROCESSOR,
  isFromWorklet,
  type CalmProcessorOptions,
  type CalmSourceMessage,
} from '../worklets/protocol.ts';
import { createSafetyLimiter } from './safety.ts';
import { createMonitorNode, ensureWorklets } from './worklets.ts';
import type { LevelReading } from './buildProcessingGraph.ts';

export interface CalmGraphOptions {
  readonly kind: CalmKind;
  readonly pitchHz: number;
  readonly capDbfs: number;
  /** Slider value 0..1. */
  readonly volume: number;
  readonly output?: AudioNode;
  readonly workletModuleUrl?: string;
  readonly reportIntervalMs?: number;
}

export interface CalmGraph {
  readonly capDbfs: number;
  /** The gain the volume stage is heading for (after the cap). */
  readonly volumeGain: number;
  setSource(kind: CalmKind, pitchHz: number): void;
  setVolume(volume: number): void;
  /** Fades to silence over `seconds` (60 for the sleep timer); resolves when silent. */
  fadeOut(seconds?: number): Promise<void>;
  /** Safe-listening tracker feed, as ProcessingGraph.taps.tracker. */
  readonly tracker: { subscribe(cb: (r: LevelReading) => void): () => void };
  dispose(): void;
}

function sourceMessage(kind: CalmKind, pitchHz: number, sampleRate: number): CalmSourceMessage {
  return { kind, pitchHz, gain: normalisingGain(kind, sampleRate, pitchHz) };
}

export async function createCalmGraph(
  ctx: BaseAudioContext,
  o: CalmGraphOptions,
): Promise<CalmGraph> {
  await ensureWorklets(ctx, ...(o.workletModuleUrl ? [o.workletModuleUrl] : []));
  const processorOptions: CalmProcessorOptions = {
    source: sourceMessage(o.kind, o.pitchHz, ctx.sampleRate),
    seed: 7,
  };
  const gen = new AudioWorkletNode(ctx, CALM_PROCESSOR, {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    processorOptions,
  });
  const cap = o.capDbfs;
  let target = calmGain(o.volume, cap);
  const volume = new GainNode(ctx, { gain: target, channelCount: 2, channelCountMode: 'explicit' });
  const fade = new GainNode(ctx, { gain: 1, channelCount: 2, channelCountMode: 'explicit' });
  const safety = await createSafetyLimiter(ctx, o.output ?? ctx.destination);
  const reportIntervalMs = o.reportIntervalMs ?? METER_REPORT_INTERVAL_MS;
  const monitor = createMonitorNode(ctx, {
    mode: 'output',
    overloadThresholdDbfs: OVERLOAD_THRESHOLD_DBFS,
    reportIntervalMs,
  });
  gen.connect(volume);
  volume.connect(fade);
  fade.connect(safety);
  safety.connect(monitor);

  const listeners = new Set<(r: LevelReading) => void>();
  monitor.port.onmessage = (e: MessageEvent) => {
    const m: unknown = e.data;
    if (!isFromWorklet(m) || m.type !== 'level') return;
    const r: LevelReading = {
      momentaryLufs: m.momentaryLufs,
      peakDbfs: m.peakDbfs,
      rmsDbfs: m.rmsDbfs,
      time: m.time,
      intervalS: reportIntervalMs / 1000,
    };
    for (const cb of listeners) cb(r);
  };

  return {
    capDbfs: cap,
    get volumeGain() {
      return target;
    },
    setSource(kind, pitchHz) {
      gen.port.postMessage({
        type: 'calm-source',
        source: sourceMessage(kind, pitchHz, ctx.sampleRate),
      });
    },
    setVolume(v) {
      target = calmGain(v, cap);
      volume.gain.setTargetAtTime(target, ctx.currentTime, SLIDER_TAU_S);
    },
    fadeOut(seconds = SLEEP_FADE_S) {
      const now = ctx.currentTime;
      const g = fade.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(Math.max(g.value, 1e-4), now);
      // A linear ramp in gain sounds abrupt at the end; ramp in dB instead (exponential), from
      // the current level to -80 dB, then hold silence.
      g.exponentialRampToValueAtTime(1e-4, now + seconds);
      g.setValueAtTime(0, now + seconds + 0.01);
      return new Promise((resolve) => {
        const check = () => {
          if (ctx.currentTime >= now + seconds) resolve();
          else setTimeout(check, 250);
        };
        if ('suspend' in ctx && ctx instanceof OfflineAudioContext) resolve();
        else check();
      });
    },
    tracker: {
      subscribe(cb) {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
    },
    dispose() {
      gen.port.postMessage({ type: 'stop' });
      monitor.port.postMessage({ type: 'stop' });
      safety.port.postMessage({ type: 'stop' });
      gen.disconnect();
      volume.disconnect();
      fade.disconnect();
      safety.disconnect();
      monitor.port.onmessage = null;
      listeners.clear();
    },
  };
}
