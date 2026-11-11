// The Clearly AudioWorklet module: `clearly-limiter` and `clearly-monitor`. Compiled from
// TypeScript to one self-contained worklet module by the bundler (see graph/worklets.ts).

import { CalmGenerator, type CalmKind } from '../dsp/calm.ts';
import { CleanupCore, instantiateRnnoise } from '../dsp/cleanupCore.ts';
import { LimiterCore } from '../dsp/limiterCore.ts';
import { RiderCore } from '../dsp/rider.ts';
import { StreamResampler } from '../dsp/resampler.ts';
import { LoudnessMeter, MonoDetector, OverloadGuard } from '../dsp/monitors.ts';
import {
  CALM_PROCESSOR,
  type CalmProcessorOptions,
  type CalmSourceMessage,
  CAPTURE_PROCESSOR,
  CLEANUP_PROCESSOR,
  type CaptureProcessorOptions,
  LIMITER_PROCESSOR,
  MONITOR_PROCESSOR,
  RIDER_PROCESSOR,
  type CleanupProcessorOptions,
  type RiderProcessorOptions,
  type FromWorklet,
  type LimiterProcessorOptions,
  type MonitorProcessorOptions,
  type PerfReport,
  type ToWorklet,
} from './protocol.ts';

/** Inside the worklet the ceiling AudioParam (setTargetAtTime) does the smoothing; the core only
 * removes the per-quantum steps. */
const WORKLET_CEILING_TAU_MS = 5;

type Clock = () => number;

function pickClock(): { now: Clock; method: PerfReport['method'] } {
  const perf = (globalThis as { performance?: { now?: () => number } }).performance;
  if (perf && typeof perf.now === 'function') {
    const now = perf.now.bind(perf);
    return { now, method: 'performance.now' };
  }
  return { now: () => Date.now(), method: 'date-now-mean' };
}

class PerfProbe {
  private readonly clock = pickClock();
  private calls = 0;
  private total = 0;
  private max = 0;
  private t0 = 0;
  start(): void {
    this.t0 = this.clock.now();
  }
  end(): void {
    const d = this.clock.now() - this.t0;
    this.calls++;
    this.total += d;
    if (d > this.max) this.max = d;
  }
  report(frames: number): PerfReport {
    return {
      method: this.clock.method,
      calls: this.calls,
      meanMs: this.calls > 0 ? this.total / this.calls : 0,
      maxMs: this.max,
      quantumMs: (frames / sampleRate) * 1000,
    };
  }
  reset(): void {
    this.calls = 0;
    this.total = 0;
    this.max = 0;
  }
}

abstract class ClearlyProcessor extends AudioWorkletProcessor {
  protected readonly probe = new PerfProbe();
  protected alive = true;
  protected lastFrames = 128;
  private silence = new Float32Array(128);

  constructor(options: AudioWorkletNodeOptionsInScope) {
    super(options);
    this.port.onmessage = (e) => {
      this.onMessage(e.data as ToWorklet);
    };
  }

  protected send(m: FromWorklet): void {
    this.port.postMessage(m);
  }

  protected onMessage(m: ToWorklet): void {
    switch (m.type) {
      case 'perf':
        this.send({ type: 'perf', ...this.probe.report(this.lastFrames) });
        break;
      case 'perf-reset':
        this.probe.reset();
        break;
      case 'stop':
        this.alive = false;
        break;
      case 'rearm':
      case 'rider-level':
      case 'rnnoise-module':
      case 'calm-source':
        break;
    }
  }

  protected zeros(frames: number): Float32Array {
    if (this.silence.length !== frames) this.silence = new Float32Array(frames);
    return this.silence;
  }

  /** Left and right input channels; a mono input feeds both; no input reads as silence. */
  protected stereoIn(inputs: Float32Array[][], frames: number): [Float32Array, Float32Array] {
    const input = inputs[0] ?? [];
    const left = input[0] ?? this.zeros(frames);
    return [left, input[1] ?? left];
  }
}

class LimiterProcessor extends ClearlyProcessor {
  static get parameterDescriptors(): AudioParamDescriptor[] {
    return [
      {
        name: 'ceilingDbfs',
        defaultValue: -12,
        minValue: -60,
        maxValue: 0,
        automationRate: 'k-rate',
      },
    ];
  }

  private readonly core: LimiterCore;
  private readonly fixed: number | undefined;
  private readonly reportFrames: number;
  private sinceReport = 0;
  private intervalMin = 0;
  private lastCeiling = Number.NaN;

  constructor(options: AudioWorkletNodeOptionsInScope) {
    super(options);
    const o = options.processorOptions as LimiterProcessorOptions;
    this.fixed = o.fixedCeilingDbfs;
    this.core = new LimiterCore({
      sampleRate,
      ceilingDbfs: this.fixed ?? o.ceilingDbfs,
      lookaheadMs: o.lookaheadMs,
      ceilingTauMs: WORKLET_CEILING_TAU_MS,
    });
    this.reportFrames = Math.max(1, Math.round((o.reportIntervalMs * sampleRate) / 1000));
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean {
    this.probe.start();
    const out = outputs[0] ?? [];
    const outL = out[0];
    const outR = out[1] ?? out[0];
    if (!outL || !outR) return this.alive;
    const frames = outL.length;
    this.lastFrames = frames;
    if (this.fixed === undefined) {
      const c = parameters['ceilingDbfs']?.[0];
      if (c !== undefined && c !== this.lastCeiling) {
        this.lastCeiling = c;
        this.core.setCeilingDbfs(c);
      }
    }
    const [inL, inR] = this.stereoIn(inputs, frames);
    this.core.process(inL, inR, outL, outR, frames);
    this.intervalMin = Math.min(this.intervalMin, this.core.reductionDb);
    this.sinceReport += frames;
    if (this.sinceReport >= this.reportFrames) {
      this.send({ type: 'reduction', db: this.intervalMin, time: currentTime });
      this.sinceReport = 0;
      this.intervalMin = 0;
    }
    this.probe.end();
    return this.alive;
  }
}

class MonitorProcessor extends ClearlyProcessor {
  private readonly mode: MonitorProcessorOptions['mode'];
  private readonly mono: MonoDetector | null;
  private readonly loudness: LoudnessMeter | null;
  private readonly guard: OverloadGuard | null;
  private readonly reportFrames: number;
  private sinceReport = 0;

  constructor(options: AudioWorkletNodeOptionsInScope) {
    super(options);
    const o = options.processorOptions as MonitorProcessorOptions;
    this.mode = o.mode;
    this.mono = o.mode === 'input' ? new MonoDetector(sampleRate) : null;
    this.loudness = o.mode === 'output' ? new LoudnessMeter(sampleRate) : null;
    this.guard =
      o.mode === 'output' ? new OverloadGuard(sampleRate, o.overloadThresholdDbfs) : null;
    this.reportFrames = Math.max(1, Math.round((o.reportIntervalMs * sampleRate) / 1000));
  }

  protected override onMessage(m: ToWorklet): void {
    if (m.type === 'rearm') this.guard?.reset();
    super.onMessage(m);
  }

  process(inputs: Float32Array[][]): boolean {
    this.probe.start();
    const frames = inputs[0]?.[0]?.length ?? this.lastFrames;
    this.lastFrames = frames;
    const [L, R] = this.stereoIn(inputs, frames);
    if (this.mode === 'input' && this.mono) {
      if (this.mono.process(L, R, frames)) {
        this.send({ type: 'mono', isMono: this.mono.isMono, time: currentTime });
      }
    } else if (this.loudness && this.guard) {
      this.loudness.process(L, R, frames);
      if (this.guard.process(L, R, frames)) this.send({ type: 'overload', time: currentTime });
      this.sinceReport += frames;
      if (this.sinceReport >= this.reportFrames) {
        this.sinceReport = 0;
        const r = this.loudness.read();
        this.send({ type: 'level', ...r, time: currentTime });
      }
    }
    this.probe.end();
    return this.alive;
  }
}

/** Night mode: the loudness rider (RiderCore), stereo, zero latency. */
class RiderProcessor extends ClearlyProcessor {
  private readonly core: RiderCore;
  private readonly reportFrames: number;
  private sinceReport = 0;
  constructor(options: AudioWorkletNodeOptionsInScope) {
    super(options);
    const o = options.processorOptions as RiderProcessorOptions;
    this.core = new RiderCore(sampleRate, o.level);
    this.reportFrames = Math.round((o.reportIntervalMs * sampleRate) / 1000);
  }
  protected override onMessage(m: ToWorklet): void {
    if (m.type === 'rider-level') this.core.level = m.level;
    else super.onMessage(m);
  }
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    this.probe.start();
    const out = outputs[0] ?? [];
    const frames = out[0]?.length ?? 128;
    this.lastFrames = frames;
    const [l, r] = this.stereoIn(inputs, frames);
    const oL = out[0] ?? new Float32Array(frames);
    const oR = out[1] ?? new Float32Array(frames);
    this.core.process(l, r, oL, oR, frames);
    this.sinceReport += frames;
    if (this.sinceReport >= this.reportFrames) {
      this.sinceReport = 0;
      this.send({
        type: 'rider',
        gainDb: this.core.gainDb,
        lufs: this.core.shortTermLufs,
        time: currentTime,
      });
    }
    this.probe.end();
    return this.alive;
  }
}

/**
 * Background cleanup: RNNoise per channel with a fixed delay (CleanupCore). Until the compiled
 * module arrives by message (never fetched here) it passes the dry signal at the same delay.
 * Voice activity is posted at most 10 times a second.
 */
class CleanupProcessor extends ClearlyProcessor {
  static get parameterDescriptors(): AudioParamDescriptor[] {
    return [
      { name: 'strength', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }
  private core: CleanupCore;
  private readonly latency: number;
  private readonly reportFrames: number;
  private sinceReport = 0;
  private vadSmooth = 0;
  constructor(options: AudioWorkletNodeOptionsInScope) {
    super(options);
    const o = options.processorOptions as CleanupProcessorOptions;
    this.latency = o.latencySamples;
    this.core = new CleanupCore(sampleRate, this.latency, null, 2);
    this.reportFrames = Math.max(
      Math.round((Math.max(100, o.reportIntervalMs) * sampleRate) / 1000),
      1,
    );
  }
  protected override onMessage(m: ToWorklet): void {
    if (m.type === 'rnnoise-module') {
      try {
        const next = new CleanupCore(sampleRate, this.latency, instantiateRnnoise(m.module), 2);
        this.core.dispose();
        this.core = next;
        this.send({ type: 'cleanup-ready' });
      } catch (e) {
        this.send({ type: 'cleanup-failed', message: e instanceof Error ? e.message : String(e) });
      }
    } else super.onMessage(m);
  }
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean {
    this.probe.start();
    const out = outputs[0] ?? [];
    const frames = out[0]?.length ?? 128;
    this.lastFrames = frames;
    const [l, r] = this.stereoIn(inputs, frames);
    this.core.setStrength(parameters['strength']?.[0] ?? 0);
    this.core.process([l, r], out, frames);
    this.sinceReport += frames;
    if (this.sinceReport >= this.reportFrames) {
      this.sinceReport = 0;
      const v = this.core.takeVad();
      this.vadSmooth += 0.5 * (v - this.vadSmooth);
      this.send({ type: 'vad', probability: this.vadSmooth, time: currentTime });
    }
    this.probe.end();
    return this.alive;
  }
}

/**
 * Caption capture: Tap A downmixed to mono, resampled to 16 kHz, posted in chunks (the buffer is
 * transferred). No output; it never changes what anyone hears.
 */
class CaptureProcessor extends ClearlyProcessor {
  private readonly rs: StreamResampler;
  private readonly chunk: Float32Array;
  private filled = 0;
  private readonly mono = new Float32Array(4096);
  constructor(options: AudioWorkletNodeOptionsInScope) {
    super(options);
    const o = options.processorOptions as CaptureProcessorOptions;
    this.rs = new StreamResampler(sampleRate, o.targetRate, 1, { halfTaps: 12 });
    this.chunk = new Float32Array(Math.round(o.chunkSeconds * o.targetRate));
  }
  process(inputs: Float32Array[][]): boolean {
    this.probe.start();
    const input = inputs[0] ?? [];
    const frames = input[0]?.length ?? 128;
    this.lastFrames = frames;
    const [l, r] = this.stereoIn(inputs, frames);
    const m = this.mono.subarray(0, frames);
    for (let i = 0; i < frames; i++) m[i] = 0.5 * ((l[i] ?? 0) + (r[i] ?? 0));
    const out = this.rs.push([m])[0];
    if (out) {
      for (let i = 0; i < out.length; i++) {
        this.chunk[this.filled++] = out[i] ?? 0;
        if (this.filled === this.chunk.length) {
          const send = this.chunk.slice();
          this.port.postMessage({ type: 'capture', samples: send, time: currentTime }, [
            send.buffer,
          ]);
          this.filled = 0;
        }
      }
    }
    this.probe.end();
    return this.alive;
  }
}

/** Calm Sounds: a generator with no input. A new source crossfades in over 50 ms. */
class CalmProcessor extends ClearlyProcessor {
  private gen: CalmGenerator;
  private old: CalmGenerator | null = null;
  private fade = 1;
  private readonly fadeStep = 1 / (0.05 * sampleRate);
  private readonly seed: number;
  private a = new Float32Array(128);
  private b = new Float32Array(128);

  constructor(options: AudioWorkletNodeOptionsInScope) {
    super(options);
    const o = options.processorOptions as CalmProcessorOptions;
    this.seed = o.seed;
    this.gen = this.make(o.source);
  }

  private make(m: CalmSourceMessage): CalmGenerator {
    return new CalmGenerator(m.kind as CalmKind, sampleRate, m.pitchHz, this.seed, m.gain);
  }

  protected override onMessage(m: ToWorklet): void {
    if (m.type === 'calm-source') {
      this.old = this.gen;
      this.gen = this.make(m.source);
      this.fade = 0;
      return;
    }
    super.onMessage(m);
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    this.probe.start();
    const out = outputs[0] ?? [];
    const outL = out[0];
    const outR = out[1] ?? out[0];
    if (!outL || !outR) return this.alive;
    const frames = outL.length;
    this.lastFrames = frames;
    this.gen.fill(outL, outR);
    if (this.old) {
      if (this.a.length !== frames) {
        this.a = new Float32Array(frames);
        this.b = new Float32Array(frames);
      }
      this.old.fill(this.a, this.b);
      for (let i = 0; i < frames; i++) {
        this.fade = Math.min(1, this.fade + this.fadeStep);
        // Equal-power crossfade between uncorrelated sources.
        const gi = Math.sin((this.fade * Math.PI) / 2);
        const go = Math.cos((this.fade * Math.PI) / 2);
        outL[i] = (outL[i] ?? 0) * gi + (this.a[i] ?? 0) * go;
        outR[i] = (outR[i] ?? 0) * gi + (this.b[i] ?? 0) * go;
      }
      if (this.fade >= 1) this.old = null;
    }
    this.probe.end();
    return this.alive;
  }
}

registerProcessor(CALM_PROCESSOR, CalmProcessor);
registerProcessor(CAPTURE_PROCESSOR, CaptureProcessor);
registerProcessor(RIDER_PROCESSOR, RiderProcessor);
registerProcessor(CLEANUP_PROCESSOR, CleanupProcessor);
registerProcessor(LIMITER_PROCESSOR, LimiterProcessor);
registerProcessor(MONITOR_PROCESSOR, MonitorProcessor);
