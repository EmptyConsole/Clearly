import { describe, expect, it } from 'vitest';
import { argMaxAbs, toDb } from '../analysis/measure.ts';
import {
  clippedSweep,
  impulses,
  pinkNoise,
  programme,
  sine,
  square,
  whiteNoise,
} from '../analysis/signals.ts';
import { detectDiscontinuities } from './discontinuity.ts';
import { dbToGain } from './level.ts';
import { LimiterCore, lookaheadSamples } from './limiterCore.ts';
import { kWeightingCoefficients, LoudnessMeter, MonoDetector, OverloadGuard } from './monitors.ts';
import { besselI0, designInterpolator, samplePeak, truePeak } from './oversample.ts';
import { WavEncoder, WavLimitError, wavHeader, XorShift32 } from './wav.ts';

const SR = 48000;

function runLimiter(
  core: LimiterCore,
  L: Float32Array,
  R: Float32Array = L,
  block = 128,
): [Float32Array, Float32Array] {
  const n = L.length;
  const oL = new Float32Array(n);
  const oR = new Float32Array(n);
  for (let s = 0; s < n; s += block) {
    const e = Math.min(n, s + block);
    core.process(L.subarray(s, e), R.subarray(s, e), oL.subarray(s, e), oR.subarray(s, e), e - s);
  }
  return [oL, oR];
}

describe('oversampling interpolator', () => {
  it('computes I0 correctly', () => {
    expect(besselI0(0)).toBe(1);
    expect(besselI0(1)).toBeCloseTo(1.2660658777520082, 12);
    expect(besselI0(8)).toBeCloseTo(427.56411572180474, 8);
  });

  it('has unit DC gain per branch and 3 branches of 16 taps', () => {
    const it4 = designInterpolator();
    expect(it4.coefficients).toHaveLength(3);
    for (const c of it4.coefficients) {
      expect(c).toHaveLength(16);
      expect(c.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    }
    expect(it4.delay).toBe(8);
  });

  it('interpolates the quarter-sample points of sines within 0.1 dB up to 18 kHz (0.07 dB at 18 kHz)', () => {
    for (const hz of [997, 5000, 11025, 12000, 16000, 18000]) {
      const phase = Math.PI / 4 + 0.3;
      const x = sine(4800, SR, hz, 0.5, phase);
      const tp = truePeak([x.subarray(200, 4600)]);
      // Exact maximum over the same 4x grid, from the analytic signal.
      let exact = 0;
      for (let i = 200 * 4; i < 4599 * 4; i++) {
        exact = Math.max(
          exact,
          Math.abs(0.5 * Math.sin((2 * Math.PI * hz * i) / (4 * SR) + phase)),
        );
      }
      expect(Math.abs(toDb(tp / exact))).toBeLessThan(0.1);
    }
  });

  it('a 12 kHz sine sampled at 45 degrees reads low on samples but right on true peak', () => {
    const x = sine(4800, SR, 12000, 1, Math.PI / 4);
    expect(toDb(samplePeak([x]))).toBeLessThan(-2.9);
    expect(toDb(truePeak([x.subarray(100, 4700)]))).toBeGreaterThan(-0.1);
  });
});

describe('LimiterCore', () => {
  it('declares 96 samples of latency at 48 kHz and delays the signal by exactly that', () => {
    expect(lookaheadSamples(SR)).toBe(96);
    const core = new LimiterCore({ sampleRate: SR, ceilingDbfs: -3 });
    expect(core.latencySamples).toBe(96);
    const x = new Float32Array(1024);
    x[100] = 0.1;
    const [y] = runLimiter(core, x);
    expect(argMaxAbs(y)).toBe(196);
    expect(y[196]).toBeCloseTo(0.1, 7);
  });

  const ceilings = [-24, -12, -6, -3];
  const hostile: [string, Float32Array][] = [
    ['full-scale square 100 Hz', square(SR, SR, 100)],
    ['full-scale square 3 kHz', square(SR, SR, 3000)],
    ['clipped sweep', clippedSweep(SR * 2, SR)],
    ['impulses', impulses(SR, 4801)],
    ['+24 dB boosted noise', whiteNoise(SR, dbToGain(24) * 0.25)],
  ];
  for (const ceiling of ceilings) {
    for (const [name, x] of hostile) {
      it(`holds ${name} under ${ceiling} dBFS (sample and 4x peak)`, () => {
        const core = new LimiterCore({ sampleRate: SR, ceilingDbfs: ceiling });
        const [L, R] = runLimiter(core, x, x);
        const body = [L.subarray(200), R.subarray(200)];
        expect(toDb(samplePeak(body))).toBeLessThanOrEqual(ceiling + 0.01);
        expect(toDb(truePeak(body))).toBeLessThanOrEqual(ceiling + 0.5);
      });
    }
  }

  it('is stereo-linked: a loud left channel turns the quiet right channel down equally', () => {
    const core = new LimiterCore({ sampleRate: SR, ceilingDbfs: -6 });
    const loud = sine(SR, SR, 500, 1);
    const quiet = sine(SR, SR, 500, 0.1);
    const [L, R] = runLimiter(core, loud, quiet);
    for (let i = 24000; i < 24200; i++) {
      if (Math.abs(loud[i - 96] ?? 0) > 0.5) {
        expect((R[i] ?? 0) / (quiet[i - 96] ?? 1)).toBeCloseTo(
          (L[i] ?? 0) / (loud[i - 96] ?? 1),
          6,
        );
      }
    }
  });

  it('reports gain reduction and releases over about 100 ms', () => {
    const core = new LimiterCore({ sampleRate: SR, ceilingDbfs: -12 });
    const burst = new Float32Array(SR);
    const s = sine(SR, SR, 1000, 1);
    for (let i = 0; i < SR / 4; i++) burst[i] = s[i] ?? 0;
    for (let i = SR / 4; i < SR; i++) burst[i] = (s[i] ?? 0) * 0.05; // -26 dBFS, below ceiling
    let reduction = 0;
    const out = new Float32Array(SR);
    const outR = new Float32Array(SR);
    for (let st = 0; st < SR; st += 128) {
      core.process(
        burst.subarray(st, st + 128),
        burst.subarray(st, st + 128),
        out.subarray(st, st + 128),
        outR.subarray(st, st + 128),
        128,
      );
      if (st === 4864) reduction = core.reductionDb;
    }
    expect(reduction).toBeCloseTo(-12, 0);
    // Gain at t: input is 0.05 * sine; measure the gain by peak over one cycle.
    const gainAt = (ms: number) => {
      const i0 = SR / 4 + 96 + Math.round((ms * SR) / 1000);
      let p = 0;
      for (let i = i0; i < i0 + 48; i++) p = Math.max(p, Math.abs(out[i] ?? 0));
      return p / 0.05;
    };
    // One-pole release from 0.25 towards 1 with tau 100 ms, then a 2 ms boxcar.
    const expected = (ms: number) => 1 - 0.75 * Math.exp(-ms / 100);
    for (const ms of [50, 100, 200, 400]) expect(gainAt(ms)).toBeCloseTo(expected(ms), 1);
  });

  it('glides to a new ceiling without a step', () => {
    const core = new LimiterCore({ sampleRate: SR, ceilingDbfs: -6 });
    const x = sine(SR, SR, 200, 1);
    const out = new Float32Array(SR);
    const outR = new Float32Array(SR);
    for (let st = 0; st < SR; st += 128) {
      if (st === 24064) core.setCeilingDbfs(-18);
      core.process(
        x.subarray(st, st + 128),
        x.subarray(st, st + 128),
        out.subarray(st, st + 128),
        outR.subarray(st, st + 128),
        128,
      );
    }
    expect(detectDiscontinuities([out], SR, { ignoreEdges: 512 })).toEqual([]);
    expect(toDb(samplePeak([out.subarray(SR - 4800)]))).toBeCloseTo(-18, 0);
  });

  it('gives identical output for any block size', () => {
    const x = pinkNoise(20000, 0.5, 9);
    const a = runLimiter(new LimiterCore({ sampleRate: SR, ceilingDbfs: -12 }), x, x, 128)[0];
    const b = runLimiter(new LimiterCore({ sampleRate: SR, ceilingDbfs: -12 }), x, x, 1000)[0];
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('refuses a lookahead shorter than the detector delay', () => {
    expect(() => new LimiterCore({ sampleRate: SR, ceilingDbfs: -3, lookaheadMs: 0.1 })).toThrow();
  });
});

describe('MonoDetector', () => {
  it('becomes mono after 2 s of identical channels, and stereo at once when they differ', () => {
    const det = new MonoDetector(SR);
    const x = pinkNoise(SR * 3, 0.1, 2);
    let changedAt = -1;
    for (let s = 0; s < x.length; s += 128) {
      const b = x.subarray(s, s + 128);
      if (det.process(b, b, b.length)) changedAt = s;
    }
    expect(det.isMono).toBe(true);
    expect(changedAt / SR).toBeGreaterThanOrEqual(1.9);
    expect(changedAt / SR).toBeLessThanOrEqual(2.1);
    const y = pinkNoise(4800, 0.1, 5);
    det.process(x.subarray(0, 4800), y, 4800);
    expect(det.isMono).toBe(false);
  });

  it('treats a -60 dB side signal as the boundary', () => {
    const mid = pinkNoise(SR * 3, 0.1, 2);
    const side = pinkNoise(SR * 3, 1, 8);
    const run = (sideDb: number) => {
      const det = new MonoDetector(SR);
      // RMS(L-R) = 2 * side, RMS(L+R) = 2 * mid: the ratio is sideRms / midRms.
      const g = 0.1 * dbToGain(sideDb);
      const L = mid.map((m, i) => m + g * (side[i] ?? 0));
      const R = mid.map((m, i) => m - g * (side[i] ?? 0));
      det.process(L, R, L.length);
      return det.isMono;
    };
    expect(run(-66)).toBe(true);
    expect(run(-54)).toBe(false);
  });

  it('ignores silence', () => {
    const det = new MonoDetector(SR);
    const z = new Float32Array(SR * 3);
    det.process(z, z, z.length);
    expect(det.isMono).toBe(false);
  });
});

describe('OverloadGuard', () => {
  it('trips after 200 ms above -1 dBFS, not before', () => {
    const g = new OverloadGuard(SR);
    const x = sine(SR, SR, 50, 1);
    let trippedAt = -1;
    for (let s = 0; s < x.length; s += 128) {
      if (g.process(x.subarray(s, s + 128), x.subarray(s, s + 128), 128)) trippedAt = s;
    }
    expect(trippedAt / SR).toBeGreaterThan(0.19);
    expect(trippedAt / SR).toBeLessThan(0.23);
  });

  it('does not trip on short peaks or on output held at -3 dBFS', () => {
    const g = new OverloadGuard(SR);
    const x = sine(SR * 5, SR, 1000, dbToGain(-3));
    for (let i = 0; i < x.length; i += SR) for (let k = 0; k < 4800; k++) x[i + k] = 0.99; // 100 ms
    expect(g.process(x, x, x.length)).toBe(false);
  });

  it('can be re-armed', () => {
    const g = new OverloadGuard(SR);
    const x = new Float32Array(SR).fill(1);
    expect(g.process(x, x, x.length)).toBe(true);
    expect(g.tripped).toBe(true);
    g.reset();
    expect(g.tripped).toBe(false);
  });
});

describe('Loudness meter', () => {
  it('matches the BS.1770 K-weighting coefficients at 48 kHz', () => {
    const [shelf, hp] = kWeightingCoefficients(48000);
    expect(shelf.b0).toBeCloseTo(1.53512485958697, 10);
    expect(shelf.b1).toBeCloseTo(-2.69169618940638, 10);
    expect(shelf.b2).toBeCloseTo(1.19839281085285, 10);
    expect(shelf.a1).toBeCloseTo(-1.69065929318241, 10);
    expect(shelf.a2).toBeCloseTo(0.73248077421585, 10);
    expect(hp.a1).toBeCloseTo(-1.99004745483398, 10);
    expect(hp.a2).toBeCloseTo(0.99007225036621, 10);
  });

  it('reads -3.01 LUFS for a full-scale 997 Hz sine in one channel', () => {
    const m = new LoudnessMeter(SR);
    const x = sine(SR, SR, 997, 1);
    m.process(x, new Float32Array(SR), SR);
    const r = m.read();
    expect(r.momentaryLufs).toBeCloseTo(-3.01, 1);
    expect(r.peakDbfs).toBeCloseTo(0, 2);
  });
});

describe('WAV encoder', () => {
  it('writes a correct 44-byte header', () => {
    const h = wavHeader(48000, 2, 1000);
    const v = new DataView(h.buffer);
    const s = (o: number) => String.fromCharCode(...h.subarray(o, o + 4));
    expect([s(0), s(8), s(12), s(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
    expect(v.getUint32(4, true)).toBe(1036);
    expect(v.getUint16(22, true)).toBe(2);
    expect(v.getUint32(24, true)).toBe(48000);
    expect(v.getUint32(28, true)).toBe(192000);
    expect(v.getUint16(32, true)).toBe(4);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(1000);
  });

  it('interleaves little-endian 16-bit samples with TPDF dither of at most 1 LSB', () => {
    const enc = new WavEncoder({ sampleRate: 48000, channels: 2 });
    const L = new Float32Array(10000).fill(0.5);
    const R = new Float32Array(10000).fill(-0.25);
    const bytes = enc.encode([L, R]);
    const pcm = new Int16Array(bytes.buffer);
    expect(new Uint8Array(new Int16Array([1]).buffer)[0]).toBe(1); // little-endian host
    let meanL = 0;
    for (let i = 0; i < 10000; i++) {
      const l = pcm[2 * i] ?? 0;
      const r = pcm[2 * i + 1] ?? 0;
      expect(Math.abs(l - 0.5 * 32767)).toBeLessThanOrEqual(1.5);
      expect(Math.abs(r + 0.25 * 32767)).toBeLessThanOrEqual(1.5);
      meanL += l;
    }
    expect(meanL / 10000).toBeCloseTo(0.5 * 32767, 0);
    expect(enc.dataBytes).toBe(40000);
  });

  it('dithers silence to a triangular spread of -1, 0 and 1', () => {
    const enc = new WavEncoder({ sampleRate: 48000, channels: 1 });
    const pcm = new Int16Array(enc.encode([new Float32Array(100000)]).buffer);
    const counts = new Map<number, number>();
    for (const v of pcm) counts.set(v, (counts.get(v) ?? 0) + 1);
    expect([...counts.keys()].sort()).toEqual([-1, 0, 1]);
    // Triangular on (-1, 1) rounded: P(0) = 3/4, P(+-1) = 1/8 each.
    expect((counts.get(0) ?? 0) / 100000).toBeCloseTo(0.75, 1);
  });

  it('clips at full scale instead of wrapping', () => {
    const enc = new WavEncoder({ sampleRate: 48000, channels: 1 });
    const pcm = new Int16Array(enc.encode([new Float32Array([1.5, -1.5, 1, -1])]).buffer);
    expect(pcm[0]).toBe(32767);
    expect(pcm[1]).toBe(-32768);
  });

  it('accepts 3 hours of 48 kHz stereo and refuses anything over the 4 GB RIFF limit', () => {
    expect(
      () => new WavEncoder({ sampleRate: 48000, channels: 2, expectedFrames: 3 * 3600 * 48000 }),
    ).not.toThrow();
    expect(
      () => new WavEncoder({ sampleRate: 48000, channels: 2, expectedFrames: 2 ** 30 }),
    ).toThrow(WavLimitError);
    const enc = new WavEncoder({ sampleRate: 48000, channels: 1, maxDataBytes: 100 });
    enc.encode([new Float32Array(40)]);
    expect(() => enc.encode([new Float32Array(20)])).toThrow(WavLimitError);
  });

  it('has a deterministic seeded RNG in [0, 1)', () => {
    const a = new XorShift32(5);
    const b = new XorShift32(5);
    for (let i = 0; i < 1000; i++) {
      const v = a.next();
      expect(v).toBe(b.next());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('discontinuity detector', () => {
  it('finds a synthetic click and reports its time and severity', () => {
    const x = sine(SR, SR, 440, 0.3);
    x[30000] = (x[30000] ?? 0) + 0.02; // -34 dBFS spike
    const found = detectDiscontinuities([x], SR);
    expect(found).toHaveLength(1);
    expect(found[0]?.sample).toBeGreaterThanOrEqual(30000);
    expect(found[0]?.sample).toBeLessThanOrEqual(30002);
    expect(found[0]?.timeS).toBeCloseTo(30000 / SR, 3);
    expect(found[0]?.severity).toBeGreaterThan(12);
  });

  it('finds a small step (a sample-domain jump of -40 dBFS) on a 200 Hz tone', () => {
    const x = sine(SR, SR, 200, 0.3);
    for (let i = 24000; i < SR; i++) x[i] = (x[i] ?? 0) + 0.01;
    const found = detectDiscontinuities([x], SR);
    expect(found).toHaveLength(1);
    expect(Math.abs((found[0]?.sample ?? 0) - 24000)).toBeLessThanOrEqual(2);
  });

  it('finds a click in the second channel only', () => {
    const a = sine(SR, SR, 300, 0.2);
    const b = sine(SR, SR, 300, 0.2);
    b[12345] = (b[12345] ?? 0) - 0.01;
    const found = detectDiscontinuities([a, b], SR);
    expect(found.map((f) => f.channel)).toEqual([1]);
  });

  it('does not flag a tone fading into digital silence, but flags a spike in silence', () => {
    const x = sine(SR, SR, 1000, 0.25);
    const fade = Math.round(0.02 * SR);
    for (let i = 0; i < SR; i++) {
      const k = i - 24000;
      x[i] =
        k < 0
          ? (x[i] ?? 0)
          : k < fade
            ? (x[i] ?? 0) * (0.5 + 0.5 * Math.cos((Math.PI * k) / fade))
            : 0;
    }
    expect(detectDiscontinuities([x], SR)).toEqual([]);
    x[40000] = 0.001;
    const found = detectDiscontinuities([x], SR);
    expect(found).toHaveLength(1);
    expect(found[0]?.sample).toBeGreaterThanOrEqual(40000);
  });

  it('does not flag smooth gain ramps, frequency sweeps or the programme signal', () => {
    const ramp = sine(SR * 2, SR, 1000, 1).map((v, i) => v * (0.05 + 0.9 * Math.min(1, i / SR)));
    const tau = 0.03 * SR;
    const target = sine(SR * 2, SR, 700, 0.5).map(
      (v, i) => v * (i < SR ? 1 : 0.1 + 0.9 * Math.exp(-(i - SR) / tau)),
    );
    const sweep = clippedSweep(SR * 2, SR, 50, 15000, -6);
    const [pL, pR] = programme(SR * 5, SR);
    expect(detectDiscontinuities([ramp], SR)).toEqual([]);
    expect(detectDiscontinuities([target], SR)).toEqual([]);
    expect(detectDiscontinuities([sweep], SR)).toEqual([]);
    expect(detectDiscontinuities([pL, pR], SR)).toEqual([]);
  });
});
