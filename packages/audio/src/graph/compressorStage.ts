// The compressor stage is a swappable unit: buildProcessingGraph only sees `input`, `output`,
// `latencySamples`, `apply()` and `reductionDb`. M02 provides the normal compressor (RULES.md
// settings and core's preset variations). M06 adds the Night-mode rider as another implementation
// with the same latency, so the dry-path delay never changes.

import type { CompressorParams } from '@clearly/core';
import { CROSSFADE_TAU_S, NIGHT_LEVELS, SLIDER_TAU_S } from '../constants.ts';

export interface CompressorStage {
  readonly kind: 'normal' | 'slot';
  readonly input: AudioNode;
  readonly output: AudioNode;
  /** Every node inside the stage, for topology recording. */
  readonly nodes: readonly AudioNode[];
  readonly latencySamples: number;
  /** Current gain reduction in dB (0 or negative). */
  readonly reductionDb: number;
  /** Moves to new settings (setTargetAtTime, slider time constant); `initial` sets values directly. */
  apply(params: CompressorParams, initial?: boolean): void;
}

export function setCompressor(
  node: DynamicsCompressorNode,
  p: CompressorParams,
  initial: boolean,
): void {
  const ctx = node.context;
  const set = (param: AudioParam, v: number) => {
    if (initial) param.value = v;
    else param.setTargetAtTime(v, ctx.currentTime, SLIDER_TAU_S);
  };
  set(node.threshold, p.thresholdDbfs);
  set(node.knee, p.kneeDb);
  set(node.ratio, p.ratio);
  set(node.attack, p.attackMs / 1000);
  set(node.release, p.releaseMs / 1000);
}

export function createNormalCompressorStage(
  ctx: BaseAudioContext,
  latencySamples: number,
  initial: CompressorParams,
): CompressorStage {
  const node = ctx.createDynamicsCompressor();
  node.channelCount = 2;
  node.channelCountMode = 'explicit';
  setCompressor(node, initial, true);
  return {
    kind: 'normal',
    input: node,
    output: node,
    nodes: [node],
    latencySamples,
    get reductionDb() {
      return node.reduction;
    },
    apply(params, isInitial = false) {
      setCompressor(node, params, isInitial);
    },
  };
}

/**
 * The compressor slot (M06): the normal stage and the Night-mode stage (loudness rider worklet
 * followed by a tighter DynamicsCompressor) run side by side and are crossfaded with the 30 ms
 * crossfade time constant, so switching is click-free. Both branches have the same latency (the
 * rider adds none; both compressors are DynamicsCompressorNodes), so the dry path never changes.
 */
export interface CompressorSlot extends CompressorStage {
  setNight(level: NightLevelKey | null, initial?: boolean): void;
  readonly riderNode: AudioWorkletNode;
  readonly nightLevel: NightLevelKey | null;
}

export type NightLevelKey = 'low' | 'medium' | 'high';

export function createCompressorSlot(
  ctx: BaseAudioContext,
  latencySamples: number,
  initial: CompressorParams,
  rider: AudioWorkletNode,
): CompressorSlot {
  const input = ctx.createGain();
  input.channelCount = 2;
  input.channelCountMode = 'explicit';
  const normal = createNormalCompressorStage(ctx, latencySamples, initial);
  const nightComp = ctx.createDynamicsCompressor();
  nightComp.channelCount = 2;
  nightComp.channelCountMode = 'explicit';
  setCompressor(nightComp, NIGHT_LEVELS.medium.compressor, true);
  const gNormal = ctx.createGain();
  const gNight = ctx.createGain();
  gNight.gain.value = 0;
  const output = ctx.createGain();
  output.channelCount = 2;
  output.channelCountMode = 'explicit';
  input.connect(normal.input);
  normal.output.connect(gNormal).connect(output);
  input.connect(rider);
  rider.connect(nightComp).connect(gNight).connect(output);
  let level: NightLevelKey | null = null;
  const set = (param: AudioParam, v: number, isInitial: boolean) => {
    if (isInitial) param.value = v;
    else param.setTargetAtTime(v, ctx.currentTime, CROSSFADE_TAU_S);
  };
  return {
    kind: 'slot',
    input,
    output,
    nodes: [input, ...normal.nodes, rider, nightComp, gNormal, gNight, output],
    latencySamples,
    riderNode: rider,
    get nightLevel() {
      return level;
    },
    get reductionDb() {
      return level ? nightComp.reduction : normal.reductionDb;
    },
    apply(params, isInitial = false) {
      normal.apply(params, isInitial);
    },
    setNight(next, isInitial = false) {
      level = next;
      if (next) {
        const p = NIGHT_LEVELS[next];
        rider.port.postMessage({ type: 'rider-level', level: p.rider });
        setCompressor(nightComp, p.compressor, isInitial);
      }
      set(gNormal.gain, next ? 0 : 1, isInitial);
      set(gNight.gain, next ? 1 : 0, isInitial);
    },
  };
}
