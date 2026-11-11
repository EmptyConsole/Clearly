/*
 * buildProcessingGraph: the one function that builds both the live graph (AudioContext) and the
 * offline export graph (OfflineAudioContext), so what people hear and what they export are the
 * same by construction.
 *
 * SIGNAL CHAIN (RULES.md is the specification; docs/PLAN.txt has the diagram and latency budget)
 *
 *  1. io.input -> Upmix gain: 2 channels, channelCountMode explicit, interpretation speakers, so a
 *     mono source feeds both ears. TAP A is the upmix output: it feeds the dry path, the caption
 *     transcriber (captions always hear the original sound) and the mono detector.
 *  2. Wet path:
 *       Hum filter: 6 notch stages; each stage crossfades its notch with a bypass, so a stage that is
 *         off is exactly the bypass (flat). Detection arrives in M09.
 *    -> Background cleanup slot: DelayNode of CLEANUP_LATENCY_SAMPLES (RNNoise worklet in M06, same
 *         latency).
 *    -> Voice focus: mid = (L+R)/2 and side = (L-R)/2 from gain nodes; mid peaking 2000 Hz Q 0.7
 *         0..+4 dB, side peaking 2000 Hz Q 0.7 0..-6 dB, one 0-1 amount; L = mid+side,
 *         R = mid-side. On mono sources only the mid boost applies.
 *    -> Personal EQ, one chain per ear: 250 500 1000 2000 3000 4000 6000 Hz peaking Q 1.0 and an
 *         8000 Hz highshelf, then the Speech-preset peak (2500 Hz, Q 1.0), then the Ambient-boost
 *         peak (2500 Hz, Q 0.8). Gains come from core (gain calculator and summed-boost clamp).
 *    -> Merge the ears -> -3 dB pre-attenuation
 *    -> Compressor stage (swappable unit; normal: -24 dBFS, knee 12, 4:1, 10 ms, 250 ms)
 *    -> Program limiter (DynamicsCompressorNode: -3 dBFS, knee 0, 20:1, 3 ms, 100 ms)
 *    -> Loudest-sound limiter (clearly-limiter worklet; ceiling -24..-6 dBFS, default -12)
 *    -> Wet gain.
 *  3. Dry path: Tap A -> DelayNode equal to the wet path's total latency -> Dry gain.
 *     Original | Enhanced crossfades the wet and dry gains (setTargetAtTime, 30 ms).
 *  4. Wet + dry -> Sum -> Master gain (the overload guard fades this) -> Safety limiter
 *     (clearly-limiter worklet, ceiling fixed at -3 dBFS, 2 ms lookahead, 4x-oversampled peak
 *     detection) -> destination (io.output or ctx.destination). The Safety limiter is always built
 *     and is the only node connected to the destination.
 *  5. Taps on the Safety limiter's output (they never alter audio): analyser, output monitor
 *     (loudness, safe-listening tracker, overload guard). Compression meters read the compressor
 *     stage, the program limiter and both worklet limiters.
 *
 * Every parameter change after construction uses setTargetAtTime: 30 ms for crossfades, 50 ms for
 * sliders. Construction sets initial values directly (nothing is playing yet).
 */

import type { Profile } from '@clearly/core';
import {
  CLEANUP_LATENCY_SAMPLES,
  CROSSFADE_TAU_S,
  LIMITER_LOOKAHEAD_MS_DEFAULT,
  METER_REPORT_INTERVAL_MS,
  NIGHT_LEVELS,
  OVERLOAD_FADE_MS,
  OVERLOAD_THRESHOLD_DBFS,
  PRE_ATTENUATION_DB,
  PROGRAM_LIMITER,
  SAFETY_CEILING_DBFS,
  SLIDER_TAU_S,
} from '../constants.ts';
import { lookaheadSamples } from '../dsp/limiterCore.ts';
import { dbToGain } from '../dsp/level.ts';
import { isFromWorklet, type FromWorklet, type PerfReport } from '../worklets/protocol.ts';
import { createCompressorSlot, setCompressor } from './compressorStage.ts';
import { createExactDelay, measureCompressorLatency } from './latency.ts';
import {
  AMBIENT_FILTER,
  eqSpec,
  planFilters,
  SPEECH_FILTER,
  type FilterPlan,
  type GraphSettings,
  type ProcessingMode,
} from './params.ts';
import { VOICE_FOCUS_PEAK_HZ, VOICE_FOCUS_PEAK_Q, BAND_FREQUENCIES_HZ } from '@clearly/core';
import { Wiring, type Topology } from './wiring.ts';
import {
  createCleanupNode,
  createLimiterNode,
  createMonitorNode,
  createRiderNode,
  ensureWorklets,
} from './worklets.ts';

export interface GraphIo {
  /** The source node (media element, stream, buffer source...). */
  readonly input: AudioNode;
  /** Where the Safety limiter connects. Defaults to ctx.destination. */
  readonly output?: AudioNode;
  readonly mode?: ProcessingMode;
  /** Worklet module URL, for hosts that do not bundle with Vite. */
  readonly workletModuleUrl?: string;
  /**
   * Test hook: overload guard threshold. It can only be made more sensitive (it is clamped to at
   * most -1 dBFS), so a test can force the guard to fire through the -3 dBFS Safety limiter.
   */
  readonly overloadThresholdDbfs?: number;
  /** How often meters report, in ms of audio time. */
  readonly reportIntervalMs?: number;
  /**
   * The compiled RNNoise module (M06). When given, Background cleanup is ready from the first
   * sample (offline export). Live graphs can also add it later with enableCleanup().
   */
  readonly cleanupModule?: WebAssembly.Module;
}

export interface LatencyBudget {
  readonly cleanup: number;
  readonly compressorStage: number;
  readonly programLimiter: number;
  readonly loudestLimiter: number;
  /** Everything before the wet/dry sum: the dry-path delay. */
  readonly wet: number;
  readonly safetyLimiter: number;
  /** Input to output, in samples. */
  readonly total: number;
}

export interface ReductionReadings {
  readonly compressorDb: number;
  readonly programLimiterDb: number;
  readonly loudestLimiterDb: number;
  readonly safetyLimiterDb: number;
}

export interface LevelReading {
  readonly momentaryLufs: number;
  readonly peakDbfs: number;
  /** Stereo power mean over this reading's interval, unweighted (safe-listening tracker). */
  readonly rmsDbfs: number;
  /** Audio-clock time of the reading. */
  readonly time: number;
  /** Seconds of audio this reading covers (for the safe-listening tracker). */
  readonly intervalS: number;
}

export interface GraphEvents {
  overload: { readonly time: number };
  mono: { readonly isMono: boolean; readonly time: number };
  level: LevelReading;
  /** Background cleanup's voice-activity probability, smoothed, at most 10 times a second. */
  vad: { readonly probability: number; readonly time: number };
  /** Night mode rider readings. */
  rider: { readonly gainDb: number; readonly lufs: number; readonly time: number };
  /** Background cleanup became ready (true) or failed to start (false). */
  cleanup: { readonly ready: boolean; readonly message?: string };
}

type Listener<T> = (e: T) => void;

export interface GraphTaps {
  readonly analyser: AnalyserNode;
  /** Tap A: the upmixed original, for the caption transcriber. */
  readonly captionsTapA: AudioNode;
  readonly loudness: {
    readonly latest: LevelReading | null;
    subscribe(cb: Listener<LevelReading>): () => void;
  };
  /** Safe-listening tracker feed: one reading per report interval with its duration. */
  readonly tracker: { subscribe(cb: Listener<LevelReading>): () => void };
  readonly compressionReduction: () => ReductionReadings;
}

export interface ProcessingGraph {
  /** Input-to-output latency in samples (the cleanup slot, both compressors, both limiters). */
  readonly latencySamples: number;
  readonly latency: LatencyBudget;
  readonly taps: GraphTaps;
  readonly mode: ProcessingMode;
  readonly isMono: boolean;
  readonly overloaded: boolean;
  /** What is not available yet, so the UI can say so plainly. */
  readonly capabilities: { readonly backgroundCleanup: boolean; readonly nightMode: boolean };
  /**
   * Adds Background cleanup with this compiled RNNoise module. Same latency as the delay it
   * replaces, crossfaded in, so playback is not interrupted. Resolves when it is processing.
   */
  enableCleanup(module: WebAssembly.Module): Promise<void>;
  /** The current plan (after core's clamp), for meters and tests. */
  readonly plan: FilterPlan;
  topology(): Topology;
  update(settings: GraphSettings, profile?: Profile | null): void;
  setMode(mode: ProcessingMode): void;
  /**
   * Crossfade position between Original (0) and Enhanced (1) without changing mode; setMode sets 0
   * or 1. Wet and dry gains are amplitude-complementary (they sum to 1): the paths are
   * time-aligned, so the sum has no comb filtering.
   */
  setBlend(enhanced: number): void;
  on<K extends keyof GraphEvents>(event: K, cb: Listener<GraphEvents[K]>): () => void;
  /** After an overload: fade back in and re-arm the guard (the UI's Resume button). */
  resumeAfterOverload(): void;
  /** Process-time statistics from every worklet (development probe). */
  getPerf(): Promise<{ readonly node: string; readonly report: PerfReport }[]>;
  dispose(): void;
}

/** The latency of every stage, given the measured compressor-stage and program-limiter delays. */
export function latencyBudget(
  sampleRate: number,
  compressorStage: number,
  programLimiter: number,
): LatencyBudget {
  const loudestLimiter = lookaheadSamples(sampleRate, LIMITER_LOOKAHEAD_MS_DEFAULT);
  const safetyLimiter = lookaheadSamples(sampleRate, LIMITER_LOOKAHEAD_MS_DEFAULT);
  const wet = CLEANUP_LATENCY_SAMPLES + compressorStage + programLimiter + loudestLimiter;
  return {
    cleanup: CLEANUP_LATENCY_SAMPLES,
    compressorStage,
    programLimiter,
    loudestLimiter,
    wet,
    safetyLimiter,
    total: wet + safetyLimiter,
  };
}

/**
 * The latency budget a graph at this sample rate will have, without building one. The normal
 * compressor stage and the program limiter are both DynamicsCompressorNodes, so both take the
 * measured compressor delay (M06's Night-mode stage must match it).
 */
export async function getLatencyBudget(sampleRate: number): Promise<LatencyBudget> {
  const c = await measureCompressorLatency(sampleRate);
  return latencyBudget(sampleRate, c, c);
}

function gainNode(ctx: BaseAudioContext, value: number, channels?: 1 | 2): GainNode {
  const g = ctx.createGain();
  g.gain.value = value;
  if (channels) {
    g.channelCount = channels;
    g.channelCountMode = 'explicit';
    g.channelInterpretation = 'speakers';
  }
  return g;
}

function biquad(
  ctx: BaseAudioContext,
  type: BiquadFilterType,
  frequencyHz: number,
  q: number,
  gainDb = 0,
): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequencyHz;
  f.Q.value = q;
  f.gain.value = gainDb;
  return f;
}

class Emitter {
  private readonly listeners = new Map<string, Set<Listener<never>>>();
  on<K extends keyof GraphEvents>(event: K, cb: Listener<GraphEvents[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(cb);
    return () => set.delete(cb);
  }
  emit<K extends keyof GraphEvents>(event: K, e: GraphEvents[K]): void {
    for (const cb of this.listeners.get(event) ?? []) (cb as Listener<GraphEvents[K]>)(e);
  }
  clear(): void {
    this.listeners.clear();
  }
}

export async function buildProcessingGraph(
  ctx: BaseAudioContext,
  profile: Profile | null,
  settings: GraphSettings,
  io: GraphIo,
): Promise<ProcessingGraph> {
  // Everything asynchronous happens first. If the worklet module (which holds the Safety limiter)
  // cannot load, this rejects before a single node exists, so there is no graph without it.
  const [, compressorLatency] = await Promise.all([
    ensureWorklets(ctx, io.workletModuleUrl),
    measureCompressorLatency(ctx.sampleRate),
  ]);

  const sr = ctx.sampleRate;
  const reportIntervalMs = io.reportIntervalMs ?? METER_REPORT_INTERVAL_MS;
  const w = new Wiring();
  const emitter = new Emitter();
  let mode: ProcessingMode = io.mode ?? 'enhanced';
  /** Share of the wet path in the Original | Enhanced crossfade (wet = blend, dry = 1 - blend). */
  let blend = mode === 'original' ? 0 : 1;
  let currentProfile = profile;
  let currentSettings = settings;
  let plan = planFilters(profile, settings, mode);
  let isMono = false;
  let overloaded = false;
  let latestLevel: LevelReading | null = null;
  const reductions = { loudest: 0, safety: 0 };

  const destination = io.output ?? ctx.destination;
  w.add(io.input, 'source', 'input');
  w.add(destination, 'destination');

  // 1. Upmix and Tap A.
  const upmix = w.add(gainNode(ctx, 1, 2), 'upmix');
  w.connect(io.input, upmix);
  const inputMonitor = w.add(
    createMonitorNode(ctx, {
      mode: 'input',
      overloadThresholdDbfs: OVERLOAD_THRESHOLD_DBFS,
      reportIntervalMs,
    }),
    'inputMonitor',
  );
  w.connect(upmix, inputMonitor);

  // 2a. Hum filter: notch stages, each crossfaded with its own bypass.
  let prev: AudioNode = upmix;
  const hum = plan.hum.map((n, i) => {
    const notch = w.add(biquad(ctx, 'notch', n.frequencyHz, n.q), 'hum', `hum${i}.notch`);
    const on = w.add(gainNode(ctx, n.on ? 1 : 0), 'hum', `hum${i}.on`);
    const off = w.add(gainNode(ctx, n.on ? 0 : 1), 'hum', `hum${i}.bypass`);
    const sum = w.add(gainNode(ctx, 1, 2), 'hum', `hum${i}.sum`);
    w.chain(prev, notch, on, sum);
    w.chain(prev, off, sum);
    prev = sum;
    return { notch, on, off };
  });

  // 2b. Background cleanup slot: a DelayNode of CLEANUP_LATENCY_SAMPLES until the RNNoise worklet
  // (same latency) is added, then crossfaded to it.
  const cleanupIn = w.add(gainNode(ctx, 1, 2), 'cleanup', 'cleanup.in');
  const cleanupDelay = w.add(createExactDelay(ctx, CLEANUP_LATENCY_SAMPLES), 'cleanup');
  const cleanupDelayGain = w.add(gainNode(ctx, 1, 2), 'cleanup', 'cleanup.delayGain');
  const cleanup = w.add(gainNode(ctx, 1, 2), 'cleanup', 'cleanup.out');
  w.chain(prev, cleanupIn, cleanupDelay, cleanupDelayGain, cleanup);
  let cleanupNode: AudioWorkletNode | null = null;
  let cleanupReady = false;
  let cleanupPending: Promise<void> | null = null;

  // 2c. Voice focus (mid/side from gain nodes).
  const vfSplit = w.add(ctx.createChannelSplitter(2), 'voiceFocus', 'vf.split');
  w.connect(cleanup, vfSplit);
  const mid = w.add(gainNode(ctx, 0.5, 1), 'voiceFocus', 'vf.mid');
  const side = w.add(gainNode(ctx, 0.5, 1), 'voiceFocus', 'vf.side');
  const negR = w.add(gainNode(ctx, -1, 1), 'voiceFocus', 'vf.negR');
  w.connect(vfSplit, mid, 0);
  w.connect(vfSplit, mid, 1);
  w.connect(vfSplit, side, 0);
  w.connect(vfSplit, negR, 1);
  w.connect(negR, side);
  const midPeak = w.add(
    biquad(ctx, 'peaking', VOICE_FOCUS_PEAK_HZ, VOICE_FOCUS_PEAK_Q, plan.voiceFocusMidDb),
    'voiceFocus',
    'vf.midPeak',
  );
  const sidePeak = w.add(
    biquad(ctx, 'peaking', VOICE_FOCUS_PEAK_HZ, VOICE_FOCUS_PEAK_Q, plan.voiceFocusSideDb),
    'voiceFocus',
    'vf.sidePeak',
  );
  w.connect(mid, midPeak);
  w.connect(side, sidePeak);
  const vfL = w.add(gainNode(ctx, 1, 1), 'voiceFocus', 'vf.L');
  const vfR = w.add(gainNode(ctx, 1, 1), 'voiceFocus', 'vf.R');
  const sideNeg = w.add(gainNode(ctx, -1, 1), 'voiceFocus', 'vf.sideNeg');
  w.connect(midPeak, vfL);
  w.connect(sidePeak, vfL);
  w.connect(midPeak, vfR);
  w.connect(sidePeak, sideNeg);
  w.connect(sideNeg, vfR);

  // 2d. Personal EQ per ear, Speech peak, Ambient peak; then merge.
  const merge = w.add(ctx.createChannelMerger(2), 'merge');
  const ears = (['left', 'right'] as const).map((ear, idx) => {
    const p = plan.ears[ear];
    const bands = BAND_FREQUENCIES_HZ.map((_, b) => {
      const spec = eqSpec(b, p.eqDb[b] ?? 0);
      return w.add(
        biquad(ctx, spec.type, spec.frequencyHz, spec.q, spec.gainDb),
        'eq',
        `eq.${ear}.${spec.frequencyHz}`,
      );
    });
    const speech = w.add(
      biquad(ctx, 'peaking', SPEECH_FILTER.frequencyHz, SPEECH_FILTER.q, p.speechDb),
      'eq',
      `eq.${ear}.speech`,
    );
    const ambient = w.add(
      biquad(ctx, 'peaking', AMBIENT_FILTER.frequencyHz, AMBIENT_FILTER.q, p.ambientDb),
      'eq',
      `eq.${ear}.ambient`,
    );
    w.chain(idx === 0 ? vfL : vfR, ...bands, speech, ambient);
    w.connect(ambient, merge, 0, idx);
    return { bands, speech, ambient };
  });

  // 2e. Pre-attenuation, compressor stage, program limiter, Loudest-sound limiter, wet gain.
  const preAtt = w.add(gainNode(ctx, dbToGain(PRE_ATTENUATION_DB), 2), 'preAttenuation');
  const rider = createRiderNode(ctx, {
    level: NIGHT_LEVELS.medium.rider,
    reportIntervalMs: Math.max(reportIntervalMs, 250),
  });
  const compressor = createCompressorSlot(ctx, compressorLatency, plan.compressor, rider);
  for (const n of compressor.nodes) w.add(n, 'compressor');
  const programLimiter = w.add(ctx.createDynamicsCompressor(), 'programLimiter');
  programLimiter.channelCount = 2;
  programLimiter.channelCountMode = 'explicit';
  setCompressor(programLimiter, PROGRAM_LIMITER, true);
  const loudest = w.add(
    createLimiterNode(ctx, {
      ceilingDbfs: plan.loudestLimitDbfs,
      lookaheadMs: LIMITER_LOOKAHEAD_MS_DEFAULT,
      reportIntervalMs,
    }),
    'loudestLimiter',
  );
  const wetGain = w.add(gainNode(ctx, blend, 2), 'wetGain');
  w.chain(merge, preAtt, compressor.input);
  w.chain(compressor.output, programLimiter, loudest, wetGain);

  const latency = latencyBudget(sr, compressor.latencySamples, compressorLatency);
  const wetLatency = latency.wet;

  // 3. Dry path.
  const dryDelay = w.add(createExactDelay(ctx, wetLatency), 'dryDelay');
  const dryGain = w.add(gainNode(ctx, 1 - blend, 2), 'dryGain');
  w.chain(upmix, dryDelay, dryGain);

  // 4. Sum, master, Safety limiter, destination.
  const sum = w.add(gainNode(ctx, 1, 2), 'sum');
  const master = w.add(gainNode(ctx, 1, 2), 'master');
  const safety = w.add(
    createLimiterNode(ctx, {
      ceilingDbfs: SAFETY_CEILING_DBFS,
      fixed: true,
      lookaheadMs: LIMITER_LOOKAHEAD_MS_DEFAULT,
      reportIntervalMs,
    }),
    'safetyLimiter',
  );
  w.connect(wetGain, sum);
  w.connect(dryGain, sum);
  w.chain(sum, master, safety);
  w.connect(safety, destination);

  // 5. Taps.
  const analyser = w.add(ctx.createAnalyser(), 'analyser');
  analyser.fftSize = 2048;
  const outputMonitor = w.add(
    createMonitorNode(ctx, {
      mode: 'output',
      overloadThresholdDbfs: Math.min(
        OVERLOAD_THRESHOLD_DBFS,
        io.overloadThresholdDbfs ?? OVERLOAD_THRESHOLD_DBFS,
      ),
      reportIntervalMs,
    }),
    'outputMonitor',
  );
  w.connect(safety, analyser);
  w.connect(safety, outputMonitor);

  // Parameter application.
  const setParam = (param: AudioParam, v: number, initial: boolean, tau = SLIDER_TAU_S) => {
    if (initial) param.value = v;
    else param.setTargetAtTime(v, ctx.currentTime, tau);
  };

  function applyPlan(p: FilterPlan, initial: boolean): void {
    (['left', 'right'] as const).forEach((ear, idx) => {
      const nodes = ears[idx];
      if (!nodes) return;
      nodes.bands.forEach((f, b) => {
        setParam(f.gain, p.ears[ear].eqDb[b] ?? 0, initial);
      });
      setParam(nodes.speech.gain, p.ears[ear].speechDb, initial);
      setParam(nodes.ambient.gain, p.ears[ear].ambientDb, initial);
    });
    setParam(midPeak.gain, p.voiceFocusMidDb, initial);
    setParam(sidePeak.gain, isMono ? 0 : p.voiceFocusSideDb, initial);
    compressor.apply(p.compressor, initial);
    compressor.setNight(p.nightLevel, initial);
    const strength = cleanupNode?.parameters.get('strength');
    if (strength) setParam(strength, p.cleanupStrength, initial);
    const ceiling = loudest.parameters.get('ceilingDbfs');
    if (ceiling) setParam(ceiling, p.loudestLimitDbfs, initial);
    p.hum.forEach((n, i) => {
      const s = hum[i];
      if (!s) return;
      setParam(s.notch.frequency, n.frequencyHz, initial);
      setParam(s.notch.Q, n.q, initial);
      setParam(s.on.gain, n.on ? 1 : 0, initial, CROSSFADE_TAU_S);
      setParam(s.off.gain, n.on ? 0 : 1, initial, CROSSFADE_TAU_S);
    });
  }

  function applyBlend(initial: boolean): void {
    setParam(wetGain.gain, blend, initial, CROSSFADE_TAU_S);
    setParam(dryGain.gain, 1 - blend, initial, CROSSFADE_TAU_S);
  }

  applyPlan(plan, true);
  applyBlend(true);

  // Messages from the worklets.
  const listen = (node: AudioWorkletNode, handle: (m: FromWorklet) => void) => {
    node.port.onmessage = (e: MessageEvent) => {
      if (isFromWorklet(e.data)) handle(e.data);
    };
  };
  listen(loudest, (m) => {
    if (m.type === 'reduction') reductions.loudest = m.db;
  });
  listen(safety, (m) => {
    if (m.type === 'reduction') reductions.safety = m.db;
  });
  listen(inputMonitor, (m) => {
    if (m.type !== 'mono') return;
    isMono = m.isMono;
    // In mono only the mid boost applies.
    setParam(sidePeak.gain, isMono ? 0 : plan.voiceFocusSideDb, false);
    emitter.emit('mono', { isMono, time: m.time });
  });
  listen(outputMonitor, (m) => {
    if (m.type === 'level') {
      latestLevel = {
        momentaryLufs: m.momentaryLufs,
        peakDbfs: m.peakDbfs,
        rmsDbfs: m.rmsDbfs,
        time: m.time,
        intervalS: reportIntervalMs / 1000,
      };
      emitter.emit('level', latestLevel);
    } else if (m.type === 'overload' && !overloaded) {
      overloaded = true;
      fadeMasterTo(0, OVERLOAD_FADE_MS / 1000);
      emitter.emit('overload', { time: m.time });
    }
  });

  function fadeMasterTo(value: number, seconds: number): void {
    const g = master.gain;
    const now = ctx.currentTime;
    if (typeof g.cancelAndHoldAtTime === 'function') {
      g.cancelAndHoldAtTime(now);
    } else {
      const v = g.value;
      g.cancelScheduledValues(now);
      g.setValueAtTime(v, now);
    }
    g.linearRampToValueAtTime(value, now + seconds);
  }

  listen(rider, (m) => {
    if (m.type === 'rider') emitter.emit('rider', { gainDb: m.gainDb, lufs: m.lufs, time: m.time });
  });

  function attachCleanup(module: WebAssembly.Module, initial: boolean): Promise<void> {
    if (cleanupPending) return cleanupPending;
    const node = createCleanupNode(
      ctx,
      {
        latencySamples: CLEANUP_LATENCY_SAMPLES,
        reportIntervalMs: Math.max(100, reportIntervalMs),
      },
      module,
    );
    const g = gainNode(ctx, 0, 2);
    w.add(node, 'cleanup', 'cleanup.rnnoise');
    w.add(g, 'cleanup', 'cleanup.rnnoiseGain');
    w.chain(cleanupIn, node, g, cleanup);
    cleanupNode = node;
    const strength = node.parameters.get('strength');
    if (strength) strength.value = plan.cleanupStrength;
    workletNodes.push(['cleanup', node]);
    cleanupPending = new Promise<void>((resolve, reject) => {
      listen(node, (m) => {
        if (m.type === 'cleanup-ready') {
          cleanupReady = true;
          // Both paths have the same latency, so the crossfade is click-free.
          setParam(g.gain, 1, initial, CROSSFADE_TAU_S);
          setParam(cleanupDelayGain.gain, 0, initial, CROSSFADE_TAU_S);
          emitter.emit('cleanup', { ready: true });
          resolve();
        } else if (m.type === 'cleanup-failed') {
          emitter.emit('cleanup', { ready: false, message: m.message });
          reject(new Error(m.message));
        } else if (m.type === 'vad') {
          emitter.emit('vad', { probability: m.probability, time: m.time });
        }
      });
    });
    return cleanupPending;
  }

  const workletNodes: [string, AudioWorkletNode][] = [
    ['rider', rider],
    ['loudestLimiter', loudest],
    ['safetyLimiter', safety],
    ['inputMonitor', inputMonitor],
    ['outputMonitor', outputMonitor],
  ];

  const graph: ProcessingGraph = {
    latencySamples: latency.total,
    latency,
    get mode() {
      return mode;
    },
    get isMono() {
      return isMono;
    },
    get overloaded() {
      return overloaded;
    },
    get plan() {
      return plan;
    },
    get capabilities() {
      return { backgroundCleanup: cleanupReady, nightMode: true };
    },
    enableCleanup: (module) => attachCleanup(module, false),
    taps: {
      analyser,
      captionsTapA: upmix,
      loudness: {
        get latest() {
          return latestLevel;
        },
        subscribe: (cb) => emitter.on('level', cb),
      },
      tracker: { subscribe: (cb) => emitter.on('level', cb) },
      compressionReduction: () => ({
        compressorDb: compressor.reductionDb,
        programLimiterDb: programLimiter.reduction,
        loudestLimiterDb: reductions.loudest,
        safetyLimiterDb: reductions.safety,
      }),
    },
    topology: () => w.topology(),
    update(next, nextProfile) {
      currentSettings = next;
      if (nextProfile !== undefined) currentProfile = nextProfile;
      plan = planFilters(currentProfile, currentSettings, mode);
      applyPlan(plan, false);
    },
    setMode(next) {
      if (next === mode) return;
      mode = next;
      blend = mode === 'original' ? 0 : 1;
      plan = planFilters(currentProfile, currentSettings, mode);
      applyPlan(plan, false);
      applyBlend(false);
    },
    setBlend(enhanced) {
      blend = Math.min(1, Math.max(0, enhanced));
      applyBlend(false);
    },
    on: (event, cb) => emitter.on(event, cb),
    resumeAfterOverload() {
      if (!overloaded) return;
      overloaded = false;
      outputMonitor.port.postMessage({ type: 'rearm' });
      fadeMasterTo(1, OVERLOAD_FADE_MS / 1000);
    },
    getPerf() {
      return Promise.all(
        workletNodes.map(
          ([name, node]) =>
            new Promise<{ node: string; report: PerfReport }>((resolve, reject) => {
              const timer = setTimeout(() => {
                reject(new Error(`no perf reply from ${name}`));
              }, 2000);
              const prevHandler = node.port.onmessage;
              node.port.onmessage = (e: MessageEvent) => {
                if (isFromWorklet(e.data) && e.data.type === 'perf') {
                  clearTimeout(timer);
                  node.port.onmessage = prevHandler;
                  const { method, calls, meanMs, maxMs, quantumMs } = e.data;
                  resolve({ node: name, report: { method, calls, meanMs, maxMs, quantumMs } });
                } else {
                  prevHandler?.call(node.port, e);
                }
              };
              node.port.postMessage({ type: 'perf' });
            }),
        ),
      );
    },
    dispose() {
      // A MessagePort with a handler stays reachable while it is entangled, and its handler
      // closes over this graph, its context and every buffer in it. Close the ports so a finished
      // graph (one per offline segment) can be collected.
      for (const [, node] of workletNodes) {
        node.port.postMessage({ type: 'stop' });
        node.port.onmessage = null;
        node.port.close();
      }
      w.disconnectAll();
      emitter.clear();
    },
  };
  // Offline export: cleanup must process from the first sample, so wait until it is ready.
  if (io.cleanupModule) await attachCleanup(io.cleanupModule, true);
  return graph;
}
