// Audio test harness: runs packages/audio in real Chromium Web Audio for the Playwright tests in
// e2e/audio. Scenarios render offline (or briefly in real time), measure in the page and return
// plain numbers, so large buffers never cross into the test process.

import { BAND_FREQUENCIES_HZ, combinedPeakDb, type Profile } from '@clearly/core';
import {
  AudioBufferReader,
  buildProcessingGraph,
  createMp3Sink,
  createToneGenerator,
  createWavSink,
  detectDiscontinuities,
  getLatencyBudget,
  renderOffline,
  type ChunkedSourceReader,
  type EncoderSink,
  type GraphIo,
  type GraphSettings,
  type ProcessingGraph,
  type ProcessingMode,
  type StereoBlock,
} from '../src/index.ts';
import {
  argMaxAbs,
  clippedSweep,
  dominantFrequencyHz,
  fft,
  impulses,
  pinkNoise,
  programme,
  rms,
  samplePeak,
  sine,
  square,
  toDb,
  transferMagnitudeDb,
  truePeak,
  whiteNoise,
  zeroCrossingFrequencies,
  type Stereo,
} from '../src/testing.ts';
import { EXTREME, FLAT, HUM_50, MILD, SEVERE, profileWith, settings } from './fixtures.ts';
import {
  syntheticSpeech,
  HumTracker,
  SpectrumAverager,
  estimateHum,
  humNotches,
  lockedHumNotches,
  fixedHumNotches,
  blackmanSpectrumDb,
  HUM_FFT_SIZE,
  createCalmGraph,
  type CalmKind,
} from '../src/index.ts';

const SR = 48000;

interface RenderSpec {
  readonly input: Stereo;
  readonly profile: Profile | null;
  readonly settings: GraphSettings;
  readonly mode?: ProcessingMode;
  readonly io?: Partial<GraphIo>;
  /** Actions at audio times (seconds), run through ctx.suspend so they use the live update path. */
  readonly automation?: readonly {
    readonly t: number;
    readonly run: (g: ProcessingGraph) => void;
  }[];
}

interface Rendered {
  readonly out: Stereo;
  readonly graph: ProcessingGraph;
  readonly overloads: number;
  readonly monoEvents: boolean[];
}

function bufferFrom(ctx: BaseAudioContext, [L, R]: Stereo, length: number): AudioBuffer {
  const b = ctx.createBuffer(2, length, SR);
  b.getChannelData(0).set(L);
  b.getChannelData(1).set(R);
  return b;
}

const settle = () => new Promise((r) => setTimeout(r, 50));

/** Renders through buildProcessingGraph and returns output aligned with the input. */
async function render(spec: RenderSpec): Promise<Rendered> {
  const n = spec.input[0].length;
  const { total } = await getLatencyBudget(SR);
  const ctx = new OfflineAudioContext(2, n + total, SR);
  const src = ctx.createBufferSource();
  src.buffer = bufferFrom(ctx, spec.input, n + total);
  const graph = await buildProcessingGraph(ctx, spec.profile, spec.settings, {
    input: src,
    ...(spec.mode ? { mode: spec.mode } : {}),
    ...spec.io,
  });
  let overloads = 0;
  const monoEvents: boolean[] = [];
  graph.on('overload', () => overloads++);
  graph.on('mono', (e) => monoEvents.push(e.isMono));
  const byTime = new Map<number, ((g: ProcessingGraph) => void)[]>();
  for (const a of spec.automation ?? []) {
    const q = Math.round((a.t * SR) / 128) * 128;
    byTime.set(q, [...(byTime.get(q) ?? []), a.run]);
  }
  for (const [frame, runs] of byTime) {
    void ctx.suspend(frame / SR).then(() => {
      for (const r of runs) r(graph);
      return ctx.resume();
    });
  }
  src.start(0);
  const rendered = await ctx.startRendering();
  await settle();
  const out: Stereo = [
    rendered.getChannelData(0).slice(total, total + n),
    rendered.getChannelData(1).slice(total, total + n),
  ];
  return { out, graph, overloads, monoEvents };
}

const mono = (x: Float32Array): Stereo => [x, x.slice()];
const db = (x: number) => toDb(x);

// ---------------------------------------------------------------------------------------------
// Signals

const hostile: Record<string, (n: number) => Stereo> = {
  square: (n) => mono(square(n, SR, 997)),
  squareLow: (n) => mono(square(n, SR, 60)),
  clippedSweep: (n) => mono(clippedSweep(n, SR)),
  impulses: (n) => mono(impulses(n, 4801)),
  boostedNoise: (n) => [whiteNoise(n, 1, 11), whiteNoise(n, 1, 12)],
};

// ---------------------------------------------------------------------------------------------
// Scenarios

async function latencyInfo() {
  const budget = await getLatencyBudget(SR);
  const n = SR * 2;
  const imp = new Float32Array(n);
  imp[SR] = 0.01;
  const delays: Record<string, number> = {};
  for (const mode of ['original', 'enhanced'] as const) {
    const ctx = new OfflineAudioContext(2, n + budget.total, SR);
    const src = ctx.createBufferSource();
    src.buffer = bufferFrom(ctx, mono(imp), n);
    await buildProcessingGraph(ctx, null, FLAT, { input: src, mode });
    src.start(0);
    const out = (await ctx.startRendering()).getChannelData(0);
    delays[mode] = argMaxAbs(out) - SR;
  }
  return { budget, delays };
}

async function topology(mode: ProcessingMode) {
  const ctx = new OfflineAudioContext(2, SR, SR);
  const src = ctx.createBufferSource();
  const g = await buildProcessingGraph(ctx, MILD, settings(), { input: src, mode });
  g.setMode(mode);
  return g.topology();
}

async function buildWithoutWorklet() {
  const ctx = new OfflineAudioContext(2, SR, SR);
  const src = ctx.createBufferSource();
  try {
    await buildProcessingGraph(ctx, null, FLAT, {
      input: src,
      workletModuleUrl: '/missing-worklet.js',
    });
    return { rejected: false, message: '' };
  } catch (e) {
    return { rejected: true, message: String(e) };
  }
}

async function peaks(
  signal: string,
  mode: ProcessingMode,
  profile: 'severe' | 'mild' | 'flat',
  loudestLimitDbfs = -12,
) {
  const make = hostile[signal];
  if (!make) throw new Error(`unknown signal ${signal}`);
  const input = make(SR * 3);
  const p = profile === 'severe' ? SEVERE : profile === 'mild' ? MILD : null;
  const s = settings({ manual: { strength: profile === 'severe' ? 1.5 : 1 }, loudestLimitDbfs });
  const { out } = await render({ input, profile: p, settings: s, mode });
  return { samplePeakDb: db(samplePeak(out)), truePeakDb: db(truePeak(out)) };
}

async function boostClamp() {
  // 1. The plan, after core's clamp, for the most extreme settings, per ear.
  const ctx = new OfflineAudioContext(2, SR, SR);
  const g = await buildProcessingGraph(ctx, SEVERE, EXTREME, { input: ctx.createBufferSource() });
  const planPeaks = (['left', 'right'] as const).map((ear) => {
    const e = g.plan.ears[ear];
    return combinedPeakDb({
      eqDb: e.eqDb,
      speechDb: e.speechDb,
      voiceFocusDb: g.plan.voiceFocusMidDb,
      ambientDb: e.ambientDb,
    });
  });
  // 2. Measured in the graph: quiet noise (linear region of the compressor) through EXTREME and
  //    through FLAT; the difference is the boost the filters actually apply.
  const n = SR * 4;
  const x = whiteNoise(n, 0.0003, 21);
  const linear = {
    manual: { compressorRatio: 1, compressorThresholdDbfs: 0, compressorKneeDb: 0 },
  };
  const boosted = await render({
    input: [x, x.slice()],
    profile: SEVERE,
    settings: settings({
      ...linear,
      preset: 'speech',
      manual: { ...linear.manual, strength: 1.5, voiceFocus: 1 },
      ambientBoostDb: 6,
    }),
  });
  const flat = await render({ input: [x, x.slice()], profile: null, settings: FLAT });
  const hb = transferMagnitudeDb(x, boosted.out[0], 8192, SR, n);
  const hf = transferMagnitudeDb(x, flat.out[0], 8192, SR, n);
  let measuredPeak = -Infinity;
  for (let k = 3; k < hb.length - 10; k++)
    measuredPeak = Math.max(measuredPeak, (hb[k] ?? 0) - (hf[k] ?? 0));
  return { planPeaks, measuredPeakDb: measuredPeak };
}

async function nullTest(blend = 0.5) {
  const n = SR * 6;
  const x = whiteNoise(n, 0.03, 31);
  const { out } = await render({
    input: [x, x.slice()],
    profile: null,
    settings: FLAT,
    automation: [
      {
        t: 0.01,
        run: (g) => {
          g.setBlend(blend);
        },
      },
    ],
  });
  const h = transferMagnitudeDb(x, out[0], 8192, SR, n);
  const bins: number[] = [];
  for (let k = 0; k < h.length; k++) {
    const hz = (k * SR) / 8192;
    if (hz >= 50 && hz <= 16000) bins.push(h[k] ?? 0);
  }
  const sorted = [...bins].sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1] ?? 0;
  return {
    deepestNotchDb: median - (sorted[0] ?? 0),
    highestBumpDb: (sorted[sorted.length - 1] ?? 0) - median,
  };
}

async function overloadOffline(forced: boolean) {
  const n = SR * 3;
  const input = forced ? mono(square(n, SR, 997)) : programme(n, SR);
  // Forced: Original mode passes the full-scale square to the Safety limiter (-3 dBFS), which is
  // above a guard threshold lowered to -6 dBFS. Normal: Enhanced programme, default threshold.
  const r = await render({
    input,
    profile: MILD,
    settings: settings(),
    ...(forced ? { mode: 'original' as const, io: { overloadThresholdDbfs: -6 } } : {}),
  });
  return { overloads: r.overloads };
}

async function overloadRealtime() {
  const ctx = new AudioContext({ sampleRate: SR });
  await ctx.resume();
  const osc = new OscillatorNode(ctx, { type: 'square', frequency: 997 });
  const g = await buildProcessingGraph(ctx, MILD, settings(), {
    input: osc,
    mode: 'original',
    overloadThresholdDbfs: -6,
    reportIntervalMs: 50,
  });
  const fired = new Promise<number>((resolve) =>
    g.on('overload', () => {
      resolve(ctx.currentTime);
    }),
  );
  const t0 = ctx.currentTime;
  osc.start();
  const firedAt = await Promise.race([
    fired,
    new Promise<number>((r) =>
      setTimeout(() => {
        r(-1);
      }, 4000),
    ),
  ]);
  await new Promise((r) => setTimeout(r, 400));
  const buf = new Float32Array(g.taps.analyser.fftSize);
  g.taps.analyser.getFloatTimeDomainData(buf);
  const afterDb = db(rms(buf));
  g.resumeAfterOverload();
  await new Promise((r) => setTimeout(r, 400));
  g.taps.analyser.getFloatTimeDomainData(buf);
  const resumedDb = db(rms(buf));
  osc.stop();
  g.dispose();
  await ctx.close();
  return {
    firedAfterS: firedAt < 0 ? -1 : firedAt - t0,
    afterDb,
    resumedDb,
    overloaded: g.overloaded,
  };
}

async function normalRealtime(seconds = 3) {
  const ctx = new AudioContext({ sampleRate: SR });
  await ctx.resume();
  const [L, R] = programme(SR * seconds, SR);
  const src = ctx.createBufferSource();
  src.buffer = bufferFrom(ctx, [L, R], L.length);
  const g = await buildProcessingGraph(ctx, MILD, settings(), { input: src });
  let overloads = 0;
  let levels = 0;
  g.on('overload', () => overloads++);
  g.on('level', () => levels++);
  src.start();
  await new Promise((r) => setTimeout(r, seconds * 1000 + 200));
  const perf = await g.getPerf();
  g.dispose();
  await ctx.close();
  return { overloads, levels, perf };
}

/** 20 s programme with every control automated; returns detections on input and output. */
async function clickTest() {
  const n = SR * 20;
  const input = programme(n, SR);
  const hum = HUM_50;
  const base = settings();
  const S = (p: Parameters<typeof settings>[0], h?: typeof hum) => settings(p, h);
  const steps: { t: number; run: (g: ProcessingGraph) => void }[] = [
    {
      t: 1.0,
      run: (g) => {
        g.update(S({ preset: 'speech' }));
      },
    },
    {
      t: 2.0,
      run: (g) => {
        g.update(S({ preset: 'music' }));
      },
    },
    {
      t: 3.0,
      run: (g) => {
        g.update(S({ preset: 'movie', manual: { strength: 0 } }));
      },
    },
    {
      t: 4.0,
      run: (g) => {
        g.update(S({ preset: 'movie', manual: { strength: 1.5 } }));
      },
    },
    {
      t: 5.0,
      run: (g) => {
        g.update(S({ manual: { voiceFocus: 1 } }));
      },
    },
    {
      t: 6.0,
      run: (g) => {
        g.setMode('original');
      },
    },
    {
      t: 7.0,
      run: (g) => {
        g.setMode('enhanced');
      },
    },
    {
      t: 8.0,
      run: (g) => {
        g.setMode('simulate');
      },
    },
    {
      t: 9.0,
      run: (g) => {
        g.setMode('enhanced');
      },
    },
    {
      t: 10.0,
      run: (g) => {
        g.update(S({}, hum));
      },
    },
    {
      t: 11.0,
      run: (g) => {
        g.update(S({}, { ...hum, enabled: false }));
      },
    },
    {
      t: 12.0,
      run: (g) => {
        g.update(S({ loudestLimitDbfs: -24 }));
      },
    },
    {
      t: 13.0,
      run: (g) => {
        g.update(S({ loudestLimitDbfs: -6 }));
      },
    },
    {
      t: 14.0,
      run: (g) => {
        g.update(S({ ambientBoostDb: 6 }));
      },
    },
    {
      t: 15.0,
      run: (g) => {
        g.update(base, profileWith([0, 24, 0, 24, 0, 24, 0, 24]));
      },
    },
    {
      t: 16.0,
      run: (g) => {
        g.update(base, profileWith([24, 0, 24, 0, 24, 0, 24, 0]));
      },
    },
    {
      t: 17.0,
      run: (g) => {
        g.update(base, SEVERE);
      },
    },
    {
      t: 18.0,
      run: (g) => {
        g.update(base, profileWith([0, 0, 0, 0, 0, 0, 0, 0]));
      },
    },
    {
      t: 19.0,
      run: (g) => {
        g.setBlend(0.5);
      },
    },
  ];
  // EQ band jumps of 24 dB need a profile whose gains reach 24 dB: strong style, cap 24.
  const { out } = await render({ input, profile: MILD, settings: base, automation: steps });
  const opts = { ignoreEdges: 4800 };
  return {
    inputClicks: detectDiscontinuities(input, SR, opts),
    outputClicks: detectDiscontinuities(out, SR, opts),
    outputPeakDb: db(samplePeak(out)),
  };
}

/** Index of the largest |x| in the 10 ms after `from` (a gain step there is a real jump). */
function peakNear(x: Float32Array, from: number): number {
  return from + argMaxAbs(x.subarray(from, from + SR / 100));
}

/** Smallest injected faults the detector finds in a processed programme render. */
async function clickSensitivity() {
  const n = SR * 5;
  const { out } = await render({ input: programme(n, SR), profile: MILD, settings: settings() });
  const at = peakNear(out[0], SR * 3);
  const steps: Record<string, boolean> = {};
  for (const stepDb of [0.1, 0.25, 0.5, 1, 2, 3, 6]) {
    const L = out[0].slice();
    const R = out[1].slice();
    const g = 10 ** (stepDb / 20);
    for (let i = at; i < n; i++) {
      L[i] = (L[i] ?? 0) * g;
      R[i] = (R[i] ?? 0) * g;
    }
    steps[stepDb] = detectDiscontinuities([L, R], SR, { ignoreEdges: 4800 }).some(
      (c) => Math.abs(c.sample - at) < 4,
    );
  }
  const clicks: Record<string, boolean> = {};
  for (const dbfs of [-60, -50, -40, -34, -30, -26, -20]) {
    const L = out[0].slice();
    L[at] = (L[at] ?? 0) + 10 ** (dbfs / 20);
    clicks[dbfs] = detectDiscontinuities([L], SR, { ignoreEdges: 4800 }).some(
      (c) => Math.abs(c.sample - at) < 4,
    );
  }
  return { steps, clicks, outPeakDb: db(samplePeak(out)), outRmsDb: db(rms(out[0])) };
}

/** Severity of the worst sample in clean renders versus injected faults (for choosing the threshold). */
async function clickSeverities() {
  const n = SR * 10;
  const input = programme(n, SR);
  const cleanRuns = [
    await render({ input, profile: MILD, settings: settings() }),
    await render({ input, profile: SEVERE, settings: EXTREME }),
    await render({ input, profile: null, settings: FLAT, mode: 'original' }),
  ];
  const lenient = { ignoreEdges: 4800, thresholdSigmas: 2, absoluteFloor: 0 };
  const worst = (chs: Float32Array[]) =>
    Math.max(0, ...detectDiscontinuities(chs, SR, lenient).map((c) => c.severity));
  const clean = cleanRuns.map((r) => worst(r.out));
  const inputWorst = worst(input);
  const out = cleanRuns[0]?.out ?? input;
  const at = peakNear(out[0], SR * 3);
  const faults: Record<string, number> = {};
  for (const stepDb of [0.25, 0.5, 1, 2, 3]) {
    const L = out[0].slice();
    for (let i = at; i < n; i++) L[i] = (L[i] ?? 0) * 10 ** (stepDb / 20);
    faults[`step ${stepDb} dB`] = Math.max(
      0,
      ...detectDiscontinuities([L], SR, lenient)
        .filter((c) => Math.abs(c.sample - at) < 4)
        .map((c) => c.severity),
    );
  }
  for (const dbfs of [-50, -40, -34, -30, -20]) {
    const L = out[0].slice();
    L[at] = (L[at] ?? 0) + 10 ** (dbfs / 20);
    faults[`click ${dbfs} dBFS`] = Math.max(
      0,
      ...detectDiscontinuities([L], SR, lenient)
        .filter((c) => Math.abs(c.sample - at) < 4)
        .map((c) => c.severity),
    );
  }
  return { clean, inputWorst, faults };
}

/** The detector must also catch a click injected into a processed render. */
async function clickPositiveControl() {
  const n = SR * 5;
  const { out } = await render({ input: programme(n, SR), profile: MILD, settings: settings() });
  const before = detectDiscontinuities(out, SR, { ignoreEdges: 4800 }).length;
  out[0][SR * 3] = (out[0][SR * 3] ?? 0) + 0.02;
  const after = detectDiscontinuities(out, SR, { ignoreEdges: 4800 });
  return { before, after: after.map((c) => ({ sample: c.sample, channel: c.channel })) };
}

// ---------------------------------------------------------------------------------------------
// Tone generator

/** Cycles per second over exactly one 5 Hz FM period (the time-average of the instantaneous
 * frequency over a whole period is the carrier). */
function carrierOverOneFmPeriod(x: Float32Array, onset: number): number {
  const start = onset + 960;
  const end = start + SR / 5;
  const c: number[] = [];
  for (let i = start + 1; i < end; i++) {
    const a = x[i - 1] ?? 0;
    const b = x[i] ?? 0;
    if (a < 0 && b >= 0) c.push(i - 1 + a / (a - b));
  }
  const first = c[0] ?? 0;
  const last = c[c.length - 1] ?? 0;
  // Whole cycles between the first and last crossing; scale to the full window length.
  return ((c.length - 1) / (last - first)) * SR;
}

/** A warble for computer speakers ('both'): each channel's peak and the largest L-R difference. */
async function warbleBoth(freqHz: number, peakDbfs: number) {
  const ctx = new OfflineAudioContext(2, SR * 1, SR);
  const tg = await createToneGenerator(ctx);
  tg.playWarble({ freqHz, ear: 'both', peakDbfs, startAt: 0.1 });
  const r = await ctx.startRendering();
  const l = r.getChannelData(0);
  const rr = r.getChannelData(1);
  let pl = 0;
  let pr = 0;
  let diff = 0;
  for (let i = 0; i < l.length; i++) {
    pl = Math.max(pl, Math.abs(l[i] ?? 0));
    pr = Math.max(pr, Math.abs(rr[i] ?? 0));
    diff = Math.max(diff, Math.abs((l[i] ?? 0) - (rr[i] ?? 0)));
  }
  const db = (x: number) => 20 * Math.log10(Math.max(x, 1e-12));
  return { leftPeakDb: db(pl), rightPeakDb: db(pr), maxDiffDb: db(diff) };
}

async function warble(freqHz: number, ear: 'left' | 'right', peakDbfs: number) {
  const ctx = new OfflineAudioContext(2, SR, SR);
  const tg = await createToneGenerator(ctx);
  const tone = tg.playWarble({ freqHz, ear, peakDbfs, startAt: 0.1 });
  const r = await ctx.startRendering();
  const near = ear === 'left' ? r.getChannelData(0) : r.getChannelData(1);
  const far = ear === 'left' ? r.getChannelData(1) : r.getChannelData(0);
  const on = Math.round(tone.onsetTime * SR);
  const end = Math.round(tone.endTime * SR);
  // Instantaneous frequency over the steady part.
  const zc = zeroCrossingFrequencies(near, SR, on + 960, end - 960).map(([, f]) => f);
  // Envelope: in each carrier period of the attack ramp, the largest |x| sits near a crest, so it
  // is close to (and never above) the raised cosine at that sample's time.
  const period = Math.ceil(SR / (freqHz * 0.95));
  const rampN = Math.round(0.02 * SR);
  const peakLin = 10 ** (tone.peakDbfs / 20);
  let rampOver = 0;
  let rampUnder = 0;
  for (let i = 0; i + period <= rampN; i += period) {
    let p = 0;
    let at = 0;
    for (let k = 0; k < period; k++) {
      const v = Math.abs(near[on + i + k] ?? 0);
      if (v > p) {
        p = v;
        at = i + k;
      }
    }
    const expected = peakLin * (0.5 - 0.5 * Math.cos((Math.PI * at) / rampN));
    rampOver = Math.max(rampOver, (p - expected) / peakLin);
    rampUnder = Math.max(rampUnder, (expected - p) / peakLin);
  }
  return {
    onsetTime: tone.onsetTime,
    scheduledTime: tone.scheduledTime,
    peakDbfsUsed: tone.peakDbfs,
    dominantHz: dominantFrequencyHz(near, SR, on, end),
    fmMinRatio: Math.min(...zc) / freqHz,
    fmMaxRatio: Math.max(...zc) / freqHz,
    rampOver,
    rampUnder,
    carrierHz: carrierOverOneFmPeriod(near, on),
    samplePeakDb: db(samplePeak([near])),
    otherChannelDb: db(samplePeak([far])),
    beforeOnsetDb: db(samplePeak([near.subarray(0, on - 1)])),
    durationMs: ((end - on) / SR) * 1000,
  };
}

async function calibration() {
  const ctx = new OfflineAudioContext(2, SR * 4, SR);
  const tg = await createToneGenerator(ctx);
  const ramp = tg.calibrationRamp({ startAt: 0.1 });
  const r = await ctx.startRendering();
  const L = r.getChannelData(0);
  const Rch = r.getChannelData(1);
  const levels: { expected: number; measured: number; reported: number }[] = [];
  for (let k = 0; k <= 32; k += 4) {
    // Middle of step k, at the output.
    const t = ramp.onsetTime + k * 0.1 + 0.05;
    const i = Math.round(t * SR);
    const p = samplePeak([L.subarray(i - 960, i + 960)]);
    levels.push({ expected: -60 + 1.5 * k, measured: db(p), reported: ramp.levelAt(t) });
  }
  return {
    levels,
    topTime: ramp.topTime,
    channelsEqual: L.every((v, i) => v === Rch[i]),
    clicks: detectDiscontinuities([L], SR).map((c) => ({
      t: c.timeS,
      sev: c.severity,
      jump: c.jumpDbfs,
    })),
  };
}

// ---------------------------------------------------------------------------------------------
// Renderer

class CollectSink implements EncoderSink<Stereo> {
  private parts: StereoBlock[] = [];
  write(blocks: readonly StereoBlock[]) {
    this.parts.push(...blocks);
    return Promise.resolve();
  }
  finish(): Promise<Stereo> {
    const n = this.parts.reduce((a, b) => a + b.left.length, 0);
    const L = new Float32Array(n);
    const R = new Float32Array(n);
    let o = 0;
    for (const p of this.parts) {
      L.set(p.left, o);
      R.set(p.right, o);
      o += p.left.length;
    }
    return Promise.resolve([L, R]);
  }
  abort() {
    this.parts = [];
  }
}

class CountSink implements EncoderSink<number> {
  frames = 0;
  write(blocks: readonly StereoBlock[]) {
    for (const b of blocks) this.frames += b.left.length;
    return Promise.resolve();
  }
  finish() {
    return Promise.resolve(this.frames);
  }
  abort() {}
}

/** A long generated programme: continuous sines plus noise, computed per block from the frame index. */
class GeneratedReader implements ChunkedSourceReader {
  readonly sampleRate = SR;
  constructor(readonly durationFrames: number) {}
  async *[Symbol.asyncIterator]() {
    const block = 65536;
    for (let s = 0; s < this.durationFrames; s += block) {
      const n = Math.min(block, this.durationFrames - s);
      const L = whiteNoise(n, 0.02, s + 1);
      const R = whiteNoise(n, 0.02, s + 2);
      for (let i = 0; i < n; i++) {
        const t = (s + i) / SR;
        const v =
          0.1 * Math.sin(2 * Math.PI * 440 * t) +
          0.05 * Math.sin(2 * Math.PI * 2100 * t) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 3 * t));
        L[i] = (L[i] ?? 0) + v;
        R[i] = (R[i] ?? 0) + 0.8 * v;
      }
      yield { left: L, right: R };
      await Promise.resolve();
    }
  }
}

async function segmentVsSingle(seconds = 240, segmentSeconds = 60) {
  const n = SR * seconds;
  const input = programme(n, SR, 5);
  const ctx = new OfflineAudioContext(2, n, SR);
  const buf = bufferFrom(ctx, input, n);
  const t0 = performance.now();
  const seg = await renderOffline(new AudioBufferReader(buf), MILD, settings(), {
    sink: new CollectSink(),
    segmentSeconds,
  });
  const segMs = performance.now() - t0;
  const single = await render({ input, profile: MILD, settings: settings() });
  const [sL, sR] = seg.result;
  const [rL, rR] = single.out;
  const boundaries: { at: number; residualDb: number }[] = [];
  for (let k = 1; k < seg.segments; k++) {
    const at = k * segmentSeconds * SR;
    boundaries.push({
      at,
      residualDb: Math.max(
        residualDbOf(rL, sL, at - SR, at + SR),
        residualDbOf(rR, sR, at - SR, at + SR),
      ),
    });
  }
  const profileAround = (at: number) =>
    [-2, -1, -0.5, -0.1, 0, 0.1, 0.5, 1, 2, 4].map((t) => {
      const a = at + Math.round(t * SR);
      return [t, Math.round(residualDbOf(rL, sL, a, a + SR / 10))];
    });
  return {
    around: seg.segments > 3 ? profileAround(3 * segmentSeconds * SR) : [],
    frames: sL.length,
    expectedFrames: n,
    segments: seg.segments,
    latencySamples: seg.latencySamples,
    residualDb: Math.max(residualDbOf(rL, sL, 0, n), residualDbOf(rR, sR, 0, n)),
    boundaries,
    clicks: detectDiscontinuities([sL, sR], SR, { ignoreEdges: 4800 }).length,
    inputClicks: detectDiscontinuities(input, SR, { ignoreEdges: 4800 }).length,
    renderSpeed: seconds / (segMs / 1000),
  };
}

function residualDbOf(ref: Float32Array, y: Float32Array, a: number, b: number): number {
  let e = 0;
  let r = 0;
  for (let i = a; i < b; i++) {
    e += (ref[i] ?? 0) ** 2;
    r += ((ref[i] ?? 0) - (y[i] ?? 0)) ** 2;
  }
  return 10 * Math.log10(Math.max(r, 1e-30) / Math.max(e, 1e-30));
}

const longRender = { done: false, progress: 0, frames: 0, ms: 0, segments: 0, error: '' };
function startLongRender(minutes = 30) {
  const n = SR * 60 * minutes;
  const t0 = performance.now();
  longRender.done = false;
  void renderOffline(new GeneratedReader(n), MILD, settings(), {
    sink: new CountSink(),
    onProgress: (p) => {
      longRender.progress = p.fraction;
    },
  })
    .then((r) => {
      Object.assign(longRender, {
        frames: r.result,
        segments: r.segments,
        ms: performance.now() - t0,
        done: true,
      });
    })
    .catch((e: unknown) => {
      Object.assign(longRender, { error: String(e), done: true });
    });
}

async function cancelRender() {
  const controller = new AbortController();
  const p = renderOffline(new GeneratedReader(SR * 600), MILD, settings(), {
    sink: new CountSink(),
    signal: controller.signal,
  });
  setTimeout(() => {
    controller.abort();
  }, 300);
  try {
    await p;
    return { rejected: false, name: '' };
  } catch (e) {
    return { rejected: true, name: e instanceof Error ? e.name : String(e) };
  }
}

// ---------------------------------------------------------------------------------------------
// Encoders

async function encodeRoundTrip(
  format: 'wav' | 'mp3',
  bitrateKbps: 128 | 192 | 256 | 320 = 192,
  seconds = 10,
) {
  const n = SR * seconds;
  const [L, R] = programme(n, SR, 9);
  const ctx = new OfflineAudioContext(2, n, SR);
  const buf = bufferFrom(ctx, [L, R], n);
  const sink =
    format === 'wav' ? createWavSink({ expectedFrames: n }) : createMp3Sink({ bitrateKbps });
  // Through the real renderer, in Original mode, so the expected level is the input's.
  const r = await renderOffline(new AudioBufferReader(buf), null, FLAT, { sink, mode: 'original' });
  const blob = r.result;
  const decodeCtx = new OfflineAudioContext(2, 1, SR);
  const decoded = await decodeCtx.decodeAudioData(await blob.arrayBuffer());
  const dL = decoded.getChannelData(0);
  return {
    bytes: blob.size,
    type: blob.type,
    inputDurationS: seconds,
    decodedDurationS: decoded.duration,
    decodedRate: decoded.sampleRate,
    channels: decoded.numberOfChannels,
    inputRmsDb: db(rms(L)),
    decodedRmsDb: db(rms(dL)),
  };
}

async function wavLimit() {
  try {
    const sink = createWavSink({ expectedFrames: 2 ** 30 });
    await sink.write([{ left: new Float32Array(8), right: new Float32Array(8) }]);
    return { refused: false, name: '' };
  } catch (e) {
    return { refused: true, name: e instanceof Error ? e.name : String(e) };
  }
}

// ---------------------------------------------------------------------------------------------
// Performance

async function offlineThroughput(seconds = 60) {
  const n = SR * seconds;
  const input = programme(n, SR, 2);
  const passthrough = async () => {
    const ctx = new OfflineAudioContext(2, n, SR);
    const src = ctx.createBufferSource();
    src.buffer = bufferFrom(ctx, input, n);
    src.connect(ctx.destination);
    src.start();
    const t = performance.now();
    await ctx.startRendering();
    return performance.now() - t;
  };
  const graph = async () => {
    const ctx = new OfflineAudioContext(2, n, SR);
    const src = ctx.createBufferSource();
    src.buffer = bufferFrom(ctx, input, n);
    const g = await buildProcessingGraph(ctx, MILD, settings(), { input: src });
    src.start();
    const t = performance.now();
    await ctx.startRendering();
    const ms = performance.now() - t;
    const perf = await g.getPerf();
    return { ms, perf };
  };
  const base = await passthrough();
  const full = await graph();
  const quanta = n / 128;
  return {
    seconds,
    passthroughMs: base,
    graphMs: full.ms,
    graphMsPerQuantum: (full.ms - base) / quanta,
    realtimeFactor: seconds / (full.ms / 1000),
    perf: full.perf,
    bandHz: [...BAND_FREQUENCIES_HZ],
  };
}

async function workletScopeHasPerformance() {
  const ctx = new OfflineAudioContext(2, SR, SR);
  const src = ctx.createBufferSource();
  const g = await buildProcessingGraph(ctx, null, FLAT, { input: src });
  src.start();
  await ctx.startRendering();
  const perf = await g.getPerf();
  return {
    method: perf[0]?.report.method ?? 'none',
    renderCapacity: 'renderCapacity' in AudioContext.prototype,
  };
}

// ---------------------------------------------------------------------------------------------
// M06: Night mode and Background cleanup

function b64Module(b64: string): WebAssembly.Module {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new WebAssembly.Module(bin);
}

/** Speech-like programme alternating 8 s quiet and 8 s loud passages, 30 dB apart. */
function swings(seconds: number): Stereo {
  const [L, R] = syntheticSpeech({ sampleRate: SR, seconds });
  const seg = 8 * SR;
  for (let i = 0; i < L.length; i++) {
    const quiet = Math.floor(i / seg) % 2 === 0;
    const g = quiet ? 10 ** (-30 / 20) : 1;
    L[i] = (L[i] ?? 0) * g * 0.7;
    R[i] = (R[i] ?? 0) * g * 0.7;
  }
  return [L, R];
}

/**
 * Loudness range proxy: mean level (dB RMS) of the last 4 s of each quiet and loud passage after
 * the first pair, output minus... returned as quiet and loud levels for input and output.
 */
async function nightRange(level: 'off' | 'low' | 'medium' | 'high') {
  const input = swings(48);
  const r = await render({
    input,
    profile: null,
    settings: settings({ preset: 'movie', manual: { nightMode: level } }),
  });
  const seg = 8 * SR;
  const lvl = (x: Float32Array, k: number) => db(rms(x, k * seg + 4 * SR, (k + 1) * seg));
  const pairs = [2, 3, 4, 5];
  const inQ = pairs.filter((k) => k % 2 === 0).map((k) => lvl(input[0], k));
  const inL = pairs.filter((k) => k % 2 === 1).map((k) => lvl(input[0], k));
  const outQ = pairs.filter((k) => k % 2 === 0).map((k) => lvl(r.out[0], k));
  const outL = pairs.filter((k) => k % 2 === 1).map((k) => lvl(r.out[0], k));
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  return {
    inputRangeDb: avg(inL) - avg(inQ),
    outputRangeDb: avg(outL) - avg(outQ),
    peakDbfs: db(samplePeak(r.out)),
    truePeakDbfs: db(truePeak(r.out)),
    nightMode: r.graph.capabilities.nightMode,
  };
}

/** Programme with Night mode switched between levels and off; discontinuities in the output. */
async function nightToggleClicks() {
  const n = SR * 12;
  const input = programme(n, SR);
  const S = (nightMode: 'off' | 'low' | 'medium' | 'high') =>
    settings({ preset: 'movie', manual: { nightMode } });
  const steps = (['low', 'high', 'off', 'medium', 'off'] as const).map((lvl, i) => ({
    t: 1.5 + 2 * i,
    run: (g: ProcessingGraph) => {
      g.update(S(lvl));
    },
  }));
  const r = await render({ input, profile: MILD, settings: S('off'), automation: steps });
  return {
    output: detectDiscontinuities(r.out, SR).length,
    input: detectDiscontinuities(input, SR).length,
  };
}

/** Background cleanup inside the graph: latency, null at 0 percent, noise reduction at 100. */
async function cleanupGraph(b64: string) {
  const module = b64Module(b64);
  const budget = await getLatencyBudget(SR);
  // Impulse latency with cleanup at 0 percent (dry path inside the worklet).
  const imp = new Float32Array(SR);
  imp[1000] = 0.5;
  const flatManual = {
    strength: 0,
    compressorRatio: 1,
    compressorThresholdDbfs: 0,
    compressorKneeDb: 0,
  };
  const flat = FLAT;
  const a = await render({
    input: mono(imp),
    profile: null,
    settings: flat,
    io: { cleanupModule: module },
  });
  // Null against the M02 graph without cleanup (both at strength 0, flat profile).
  const prog = programme(SR * 4, SR);
  const withMod = await render({
    input: prog,
    profile: null,
    settings: flat,
    io: { cleanupModule: module },
  });
  const without = await render({ input: prog, profile: null, settings: flat });
  let maxErr = 0;
  for (let i = 0; i < withMod.out[0].length; i++) {
    maxErr = Math.max(maxErr, Math.abs((withMod.out[0][i] ?? 0) - (without.out[0][i] ?? 0)));
  }
  // Noise reduction in the gaps of speech plus pink noise, Enhanced, cleanup 100 percent.
  const [sp] = syntheticSpeech({ sampleRate: SR, seconds: 8 });
  const noise = pinkNoise(sp.length, 0.02, 4);
  const mix = sp.map((v, i) => v + (noise[i] ?? 0));
  const full = settings({ preset: 'movie', manual: { ...flatManual, cleanupStrength: 1 } });
  const on = await render({
    input: mono(mix),
    profile: null,
    settings: full,
    io: { cleanupModule: module },
  });
  const off = await render({ input: mono(mix), profile: null, settings: flat });
  let gapOn = 0;
  let gapOff = 0;
  let windows = 0;
  for (let s = 2 * SR; s + 4800 < sp.length; s += 4800) {
    if (db(rms(sp, s, s + 4800)) < -38) {
      gapOn += db(rms(on.out[0], s, s + 4800));
      gapOff += db(rms(off.out[0], s, s + 4800));
      windows++;
    }
  }
  return {
    impulseAt: argMaxAbs(a.out[0]),
    expectedAt: 1000,
    budgetTotal: budget.total,
    latencySamples: a.graph.latencySamples,
    nullMaxErr: maxErr,
    reductionDb: (gapOff - gapOn) / Math.max(1, windows),
    windows,
    ready: on.graph.capabilities.backgroundCleanup,
  };
}

/** Live: cleanup on, Night mode Strong, Voice focus full. Worklet time as a share of a quantum. */
async function perfAllOn(b64: string, seconds = 4) {
  const module = b64Module(b64);
  const ctx = new AudioContext({ sampleRate: SR });
  await ctx.resume();
  const [L, R] = programme(SR * seconds, SR);
  const src = ctx.createBufferSource();
  src.buffer = bufferFrom(ctx, [L, R], L.length);
  const g = await buildProcessingGraph(
    ctx,
    MILD,
    settings({ preset: 'movie', manual: { nightMode: 'high', voiceFocus: 1, cleanupStrength: 1 } }),
    { input: src },
  );
  await g.enableCleanup(module);
  let overloads = 0;
  g.on('overload', () => overloads++);
  let vad = 0;
  g.on('vad', () => vad++);
  src.start();
  await new Promise((r) => setTimeout(r, seconds * 1000 + 200));
  const perf = await g.getPerf();
  g.dispose();
  await ctx.close();
  return { overloads, vadMessages: vad, perf };
}

// ---------------------------------------------------------------------------------------------
// M09: Hum Filter

function humSignal(n: number, f0: number, level = 0.02): Float32Array {
  const h = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let k = 1; k <= 4; k++) v += (level / k) * Math.sin((2 * Math.PI * k * f0 * i) / SR);
    h[i] = v;
  }
  return h;
}

/** Detects hum from the input's spectra the way the app does (8192 FFT every 500 ms, averaged). */
function detectFromSignal(x: Float32Array): { f0: number | null; harmonics: readonly number[] } {
  const avg = new SpectrumAverager();
  const tr = new HumTracker();
  let state = { f0: null as number | null, harmonics: [] as readonly number[] };
  for (let s = 0, k = 0; s + HUM_FFT_SIZE <= x.length; s += SR / 2, k++) {
    const st = tr.update(
      estimateHum(avg.push(blackmanSpectrumDb(x.subarray(s, s + HUM_FFT_SIZE))), SR),
      k * 0.5,
    );
    state = { f0: st.f0, harmonics: st.harmonics };
  }
  return state;
}

function bandEnergyDb(x: Float32Array, lo: number, hi: number): number {
  const n = 1 << 16;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  let total = 0;
  for (let s = 0; s + n <= x.length; s += n) {
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < n; i++)
      re[i] = (x[s + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));
    fft(re, im);
    for (let b = Math.floor((lo * n) / SR); b <= Math.ceil((hi * n) / SR); b++)
      total += (re[b] ?? 0) ** 2 + (im[b] ?? 0) ** 2;
  }
  return 10 * Math.log10(total + 1e-30);
}

/** Hum at f0 (with harmonics) under speech: detection, reduction of the hum, speech band change. */
async function humRemoval(f0: number) {
  const n = SR * 12;
  const [speech] = syntheticSpeech({ sampleRate: SR, seconds: 12 });
  const hum = humSignal(n, f0);
  const mix = speech.map((v, i) => v + (hum[i] ?? 0));
  const det = detectFromSignal(mix);
  const notches = det.f0 ? lockedHumNotches(det.f0) : [];
  const on = { ...FLAT, hum: { enabled: true, notches } };
  // The graph is linear here (flat settings), so the hum's own output isolates the hum residual.
  const humOff = await render({ input: mono(hum), profile: null, settings: FLAT });
  const humOn = await render({ input: mono(hum), profile: null, settings: on });
  const speechOff = await render({ input: mono(speech), profile: null, settings: FLAT });
  const speechOn = await render({ input: mono(speech), profile: null, settings: on });
  const skip = SR; // ignore the first second
  return {
    detectedF0: det.f0,
    harmonics: det.harmonics,
    humReductionDb: db(rms(humOff.out[0], skip)) - db(rms(humOn.out[0], skip)),
    speechBandChangeDb:
      bandEnergyDb(speechOn.out[0].subarray(skip), 300, 3400) -
      bandEnergyDb(speechOff.out[0].subarray(skip), 300, 3400),
  };
}

/** Switching Hum Filter modes during programme: discontinuities on the output. */
async function humModeClicks() {
  const n = SR * 10;
  const input = programme(n, SR);
  const mk = (mode: 'off' | 50 | 60 | 'auto') =>
    mode === 'off'
      ? { ...FLAT, hum: { enabled: false, notches: [] } }
      : {
          ...FLAT,
          hum: {
            enabled: true,
            notches: mode === 'auto' ? humNotches(50.3, [1, 2, 3]) : fixedHumNotches(mode),
          },
        };
  const seq = [50, 60, 'auto', 'off', 60] as const;
  const r = await render({
    input,
    profile: null,
    settings: mk('off'),
    automation: seq.map((m, i) => ({
      t: 1.5 + 1.5 * i,
      run: (g: ProcessingGraph) => {
        g.update(mk(m));
      },
    })),
  });
  return {
    output: detectDiscontinuities(r.out, SR).length,
    input: detectDiscontinuities(input, SR).length,
  };
}

// ---------------------------------------------------------------------------------------------
// M09: Calm Sounds

/** Renders a Calm Sounds graph offline; `at` runs actions at audio times through ctx.suspend. */
async function renderCalm(
  kind: CalmKind,
  seconds: number,
  capDbfs: number,
  volume: number,
  at: { t: number; run: (g: Awaited<ReturnType<typeof createCalmGraph>>) => void }[] = [],
) {
  const ctx = new OfflineAudioContext(2, SR * seconds, SR);
  const g = await createCalmGraph(ctx, { kind, pitchHz: 1000, capDbfs, volume });
  for (const a of at)
    void ctx.suspend((Math.round((a.t * SR) / 128) * 128) / SR).then(() => {
      a.run(g);
      return ctx.resume();
    });
  const b = await ctx.startRendering();
  return { L: b.getChannelData(0), R: b.getChannelData(1), g };
}

/** Each generator at a malicious volume against a -30 dBFS cap: long-term RMS and peak. */
async function calmCap() {
  const out: Record<string, { rmsDbfs: number; peakDbfs: number; afterSetDbfs: number }> = {};
  for (const kind of ['white', 'pink', 'brown', 'rain', 'ocean', 'tailored', 'tone'] as const) {
    const secs = kind === 'ocean' ? 22 : 12;
    const r = await renderCalm(kind, secs, -30, 1e9, [
      {
        t: secs / 2,
        run: (g) => {
          g.setVolume(Number.POSITIVE_INFINITY);
        },
      },
    ]);
    const first = r.L.subarray(SR * 2, (SR * secs) / 2);
    const second = r.L.subarray((SR * secs) / 2 + SR);
    out[kind] = {
      rmsDbfs: db(rms(first)),
      peakDbfs: db(samplePeak([r.L, r.R])),
      afterSetDbfs: db(rms(second)),
    };
  }
  return out;
}

/** The 60 s sleep fade (shortened to 3 s here) and a source change: discontinuities. */
async function calmFadeClicks() {
  const r = await renderCalm('tone', 8, -30, 1, [
    {
      t: 2,
      run: (g) => {
        g.setSource('tone', 1500);
      },
    },
    {
      t: 4,
      run: (g) => {
        void g.fadeOut(3);
      },
    },
  ]);
  const tail = r.L.subarray(SR * 7.2);
  return {
    clicks: detectDiscontinuities([r.L, r.R], SR, { ignoreEdges: 4800 }).length,
    tailPeakDbfs: db(samplePeak([tail, tail])),
  };
}

const harness = {
  calmCap,
  calmFadeClicks,
  humRemoval,
  humModeClicks,
  nightRange,
  nightToggleClicks,
  cleanupGraph,
  perfAllOn,
  latencyInfo,
  topology,
  buildWithoutWorklet,
  peaks,
  boostClamp,
  nullTest,
  overloadOffline,
  overloadRealtime,
  normalRealtime,
  clickTest,
  clickPositiveControl,
  clickSensitivity,
  clickSeverities,
  warble,
  warbleBoth,
  calibration,
  segmentVsSingle,
  startLongRender,
  longRender,
  cancelRender,
  encodeRoundTrip,
  wavLimit,
  offlineThroughput,
  workletScopeHasPerformance,
  pinkNoise,
  sine,
};

declare global {
  interface Window {
    audioHarness: typeof harness;
  }
}

window.audioHarness = harness;
document.body.dataset['ready'] = 'true';
