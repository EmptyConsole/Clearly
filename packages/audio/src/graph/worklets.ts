// Loads the Clearly worklet module once per context and creates the processor nodes.
//
// `?worker&url` makes the bundler (Vite, used by apps/web and the test
// harness) compile processors.worklet.ts and its imports into one ES module and return its URL.
// AudioWorklet.addModule takes that URL. Hosts with another bundler can pass their own URL.

import defaultWorkletUrl from '../worklets/processors.worklet.ts?worker&url';
import { LIMITER_LOOKAHEAD_MS_DEFAULT, METER_REPORT_INTERVAL_MS } from '../constants.ts';
import {
  CAPTURE_PROCESSOR,
  CLEANUP_PROCESSOR,
  type CaptureProcessorOptions,
  LIMITER_PROCESSOR,
  MONITOR_PROCESSOR,
  RIDER_PROCESSOR,
  type CleanupProcessorOptions,
  type RiderProcessorOptions,
  type LimiterProcessorOptions,
  type MonitorProcessorOptions,
} from '../worklets/protocol.ts';

const loaded = new WeakMap<BaseAudioContext, Map<string, Promise<void>>>();

/** Adds the worklet module to this context (once per URL). Rejects if it cannot be loaded. */
export function ensureWorklets(
  ctx: BaseAudioContext,
  moduleUrl: string = defaultWorkletUrl,
): Promise<void> {
  let perCtx = loaded.get(ctx);
  if (!perCtx) {
    perCtx = new Map();
    loaded.set(ctx, perCtx);
  }
  let p = perCtx.get(moduleUrl);
  if (!p) {
    p = ctx.audioWorklet.addModule(moduleUrl);
    perCtx.set(moduleUrl, p);
    p.catch(() => perCtx.delete(moduleUrl));
  }
  return p;
}

export interface LimiterNodeOptions {
  readonly ceilingDbfs: number;
  /** Fixed ceiling (Safety limiter): the AudioParam is ignored. */
  readonly fixed?: boolean;
  readonly lookaheadMs?: number;
  readonly reportIntervalMs?: number;
}

export function createLimiterNode(ctx: BaseAudioContext, o: LimiterNodeOptions): AudioWorkletNode {
  const processorOptions: LimiterProcessorOptions = {
    ceilingDbfs: o.ceilingDbfs,
    lookaheadMs: o.lookaheadMs ?? LIMITER_LOOKAHEAD_MS_DEFAULT,
    reportIntervalMs: o.reportIntervalMs ?? METER_REPORT_INTERVAL_MS,
    ...(o.fixed ? { fixedCeilingDbfs: o.ceilingDbfs } : {}),
  };
  const node = new AudioWorkletNode(ctx, LIMITER_PROCESSOR, {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    channelCount: 2,
    channelCountMode: 'explicit',
    channelInterpretation: 'speakers',
    parameterData: { ceilingDbfs: o.ceilingDbfs },
    processorOptions,
  });
  return node;
}

export function createMonitorNode(
  ctx: BaseAudioContext,
  o: MonitorProcessorOptions,
): AudioWorkletNode {
  return new AudioWorkletNode(ctx, MONITOR_PROCESSOR, {
    numberOfInputs: 1,
    numberOfOutputs: 0,
    channelCount: 2,
    channelCountMode: 'explicit',
    channelInterpretation: 'speakers',
    processorOptions: o,
  });
}

const stereo = {
  numberOfInputs: 1,
  numberOfOutputs: 1,
  outputChannelCount: [2],
  channelCount: 2,
  channelCountMode: 'explicit' as const,
  channelInterpretation: 'speakers' as const,
};

export function createRiderNode(ctx: BaseAudioContext, o: RiderProcessorOptions): AudioWorkletNode {
  return new AudioWorkletNode(ctx, RIDER_PROCESSOR, { ...stereo, processorOptions: o });
}

export function createCleanupNode(
  ctx: BaseAudioContext,
  o: CleanupProcessorOptions,
  module: WebAssembly.Module,
): AudioWorkletNode {
  const node = new AudioWorkletNode(ctx, CLEANUP_PROCESSOR, { ...stereo, processorOptions: o });
  // The compiled module is sent once; the worklet instantiates it and never fetches.
  node.port.postMessage({ type: 'rnnoise-module', module });
  return node;
}

/** Caption capture node (16 kHz mono chunks over its port). Connect Tap A to it. */
export function createCaptureNode(
  ctx: BaseAudioContext,
  o: CaptureProcessorOptions = { targetRate: 16000, chunkSeconds: 0.5 },
): AudioWorkletNode {
  return new AudioWorkletNode(ctx, CAPTURE_PROCESSOR, {
    numberOfInputs: 1,
    numberOfOutputs: 0,
    channelCount: 2,
    channelCountMode: 'explicit',
    channelInterpretation: 'speakers',
    processorOptions: o,
  });
}
