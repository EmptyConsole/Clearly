import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CLEANUP_LATENCY_SAMPLES } from '../constants.ts';
import { pinkNoise } from '../analysis/signals.ts';
import { syntheticSpeech } from '../demo/syntheticSpeech.ts';
import { CleanupCore, instantiateRnnoise, RNNOISE_ALGORITHM_DELAY } from './cleanupCore.ts';
import { RiderCore, RIDER_FALL_DB_PER_S, RIDER_RISE_DB_PER_S } from './rider.ts';

const SR = 48000;
const wasmPath = fileURLToPath(
  new URL('../../../../apps/web/public/heavy/rnnoise/rnnoise.wasm', import.meta.url),
);
// The RNNoise module is a heavy asset: run `pnpm fetch:heavy` first (CI does).
const haveWasm = existsSync(wasmPath);
const module = haveWasm ? new WebAssembly.Module(readFileSync(wasmPath)) : null;

function runCleanup(
  input: Float32Array,
  strength: number,
  block = 128,
  withModule = true,
): Float32Array {
  const core = new CleanupCore(
    SR,
    CLEANUP_LATENCY_SAMPLES,
    withModule && module ? instantiateRnnoise(module) : null,
    1,
  );
  core.setStrength(strength);
  // Strength smoothing starts from 0; settle it first.
  const warm = new Float32Array(SR);
  for (let s = 0; s < warm.length; s += block) {
    const n = Math.min(block, warm.length - s);
    core.process([warm.subarray(s, s + n)], [new Float32Array(n)], n);
  }
  const out = new Float32Array(input.length);
  for (let s = 0; s < input.length; s += block) {
    const n = Math.min(block, input.length - s);
    const o = new Float32Array(n);
    core.process([input.subarray(s, s + n)], [o], n);
    out.set(o, s);
  }
  core.dispose();
  return out;
}

const rmsDb = (x: Float32Array, a = 0, b = x.length) => {
  let s = 0;
  for (let i = a; i < b; i++) s += (x[i] ?? 0) ** 2;
  return 10 * Math.log10(s / Math.max(1, b - a) + 1e-30);
};

describe.skipIf(!haveWasm)('Background cleanup (RNNoise)', () => {
  it('has the declared total latency (cross-correlation with the input)', () => {
    const [speech] = syntheticSpeech({ sampleRate: SR, seconds: 4 });
    const out = runCleanup(speech, 1);
    let best = 0;
    let bestLag = 0;
    for (let lag = 0; lag < 2000; lag++) {
      let c = 0;
      for (let i = SR; i < 3 * SR; i++) c += (out[i + lag] ?? 0) * (speech[i] ?? 0);
      if (c > best) {
        best = c;
        bestLag = lag;
      }
    }
    expect(Math.abs(bestLag - CLEANUP_LATENCY_SAMPLES)).toBeLessThanOrEqual(2);
    expect(RNNOISE_ALGORITHM_DELAY).toBe(480);
  });

  it('at 0 percent passes the input delayed by exactly the latency (null against bypass)', () => {
    const x = pinkNoise(SR, 0.1, 5);
    for (const withModule of [true, false]) {
      const out = runCleanup(x, 0, 128, withModule);
      let maxErr = 0;
      for (let i = CLEANUP_LATENCY_SAMPLES; i < x.length; i++) {
        maxErr = Math.max(maxErr, Math.abs((out[i] ?? 0) - (x[i - CLEANUP_LATENCY_SAMPLES] ?? 0)));
      }
      expect(maxErr).toBeLessThan(1e-6);
    }
  });

  it('reduces stationary pink noise under speech by at least 10 dB in the gaps', () => {
    const [speech] = syntheticSpeech({ sampleRate: SR, seconds: 8 });
    const noise = pinkNoise(speech.length, 0.02, 9);
    const mix = speech.map((v, i) => v + (noise[i] ?? 0));
    const out = runCleanup(mix, 1);
    // Gaps: 100 ms windows where the clean speech is near silent.
    let before = 0;
    let after = 0;
    let windows = 0;
    const w = 4800;
    for (let s = 2 * SR; s + w < speech.length - CLEANUP_LATENCY_SAMPLES; s += w) {
      // The clip's own background bed sits at about -42 dBFS; gaps are windows with only the bed.
      if (rmsDb(speech, s, s + w) < -38) {
        before += rmsDb(mix, s, s + w);
        after += rmsDb(out, s + CLEANUP_LATENCY_SAMPLES, s + w + CLEANUP_LATENCY_SAMPLES);
        windows++;
      }
    }
    expect(windows).toBeGreaterThan(3);
    expect(before / windows - after / windows).toBeGreaterThanOrEqual(10);
  });

  it('works the same with any block size', () => {
    const x = pinkNoise(SR / 2, 0.1, 3);
    const a = runCleanup(x, 0.7, 128);
    const b = runCleanup(x, 0.7, 333);
    let maxDiff = 0;
    for (let i = 0; i < a.length; i++)
      maxDiff = Math.max(maxDiff, Math.abs((a[i] ?? 0) - (b[i] ?? 0)));
    expect(maxDiff).toBeLessThan(1e-4);
  });
});

describe('Night-mode rider', () => {
  const level = { targetLufs: -26, maxBoostDb: 9, maxCutDb: 12 };

  function ride(x: Float32Array, lvl = level) {
    const core = new RiderCore(SR, lvl);
    const out = new Float32Array(x.length);
    const gains: number[] = [];
    for (let s = 0; s < x.length; s += 128) {
      const n = Math.min(128, x.length - s);
      const o = new Float32Array(n);
      core.process(x.subarray(s, s + n), x.subarray(s, s + n), o, new Float32Array(n), n);
      out.set(o, s);
      gains.push(core.gainDb);
    }
    return { out, gains };
  }

  it('limits the rise to 3 dB/s and the fall to 6 dB/s', () => {
    const quiet = pinkNoise(10 * SR, 0.003, 1); // far below target: wants the full boost
    const { gains } = ride(quiet);
    const perBlock = 128 / SR;
    for (let i = 1; i < gains.length; i++) {
      const d = (gains[i] ?? 0) - (gains[i - 1] ?? 0);
      expect(d).toBeLessThanOrEqual(RIDER_RISE_DB_PER_S * perBlock + 1e-9);
      expect(d).toBeGreaterThanOrEqual(-RIDER_FALL_DB_PER_S * perBlock - 1e-9);
    }
    expect(gains.at(-1)).toBeCloseTo(9, 1);
  });

  it('holds the gain in silence (gate at -60 LUFS)', () => {
    const loud = pinkNoise(5 * SR, 0.2, 2);
    const silence = new Float32Array(10 * SR);
    const x = new Float32Array(loud.length + silence.length);
    x.set(loud);
    const { gains } = ride(x);
    const atEnd = gains.at(-1) ?? 0;
    const afterLoud = gains[Math.floor((loud.length + 4 * SR) / 128)] ?? 0;
    // After the window has filled with silence the gain no longer moves.
    expect(Math.abs(atEnd - afterLoud)).toBeLessThan(0.05);
  });
});
