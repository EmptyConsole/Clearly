import { describe, expect, it } from 'vitest';
import { syntheticSpeech } from '../demo/syntheticSpeech.ts';
import {
  HumTracker,
  blackmanSpectrumDb,
  estimateHum,
  humNotches,
  HUM_FFT_SIZE,
} from './humDetect.ts';

const SR = 48000;

function withHum(
  seconds: number,
  f0: number,
  opts: { level?: number; harmonics?: number } = {},
): Float32Array {
  const [speech] = syntheticSpeech({ sampleRate: SR, seconds });
  const level = opts.level ?? 0.02;
  const H = opts.harmonics ?? 4;
  return speech.map((v, i) => {
    let h = 0;
    for (let k = 1; k <= H; k++) h += (level / k) * Math.sin((2 * Math.PI * k * f0 * i) / SR);
    return v + h;
  });
}

function framesOf(x: Float32Array): Float32Array[] {
  const out: Float32Array[] = [];
  for (let s = 0; s + HUM_FFT_SIZE <= x.length; s += SR / 2)
    out.push(blackmanSpectrumDb(x.subarray(s, s + HUM_FFT_SIZE)));
  return out;
}

describe('hum detection', () => {
  for (const f0 of [50.4, 59.6, 60]) {
    it(`locks onto ${f0} Hz hum within 0.2 Hz under speech`, () => {
      const frames = framesOf(withHum(10, f0));
      const est = estimateHum(frames[6] ?? new Float32Array(0), SR);
      expect(est).not.toBeNull();
      expect(Math.abs((est?.f0 ?? 0) - f0)).toBeLessThan(0.3);
      const tr = new HumTracker();
      const last = frames.map((f, i) => tr.update(estimateHum(f, SR), i * 0.5)).at(-1);
      expect(last?.locked).toBe(true);
      expect(Math.abs((last?.f0 ?? 0) - f0)).toBeLessThan(0.2);
    });
  }

  it('locks only after 3 s of steady hum, then holds', () => {
    const frames = framesOf(withHum(8, 50));
    const tr = new HumTracker();
    const states = frames.map((f, i) => tr.update(estimateHum(f, SR), i * 0.5));
    expect(states[4]?.locked).toBe(false); // 2 s
    expect(states.at(-1)?.locked).toBe(true);
    const n = humNotches(states.at(-1)?.f0 ?? 0, states.at(-1)?.harmonics ?? []);
    expect(n[0]?.q).toBe(30);
    expect(n.length).toBeGreaterThanOrEqual(2);
    expect(n.length).toBeLessThanOrEqual(12);
  });

  it('does not lock onto a sustained cello note at 110 Hz', () => {
    const [speech] = syntheticSpeech({ sampleRate: SR, seconds: 6 });
    const cello = speech.map((v, i) => {
      let s = 0;
      for (let k = 1; k <= 8; k++) s += (0.05 / k) * Math.sin((2 * Math.PI * 110 * k * i) / SR);
      return v + s;
    });
    const tr = new HumTracker();
    const frames = framesOf(cello);
    const states = frames.map((f, i) => tr.update(estimateHum(f, SR), i * 0.5));
    expect(states.every((s) => !s.locked)).toBe(true);
  });
});
