import { describe, expect, it } from 'vitest';
import { DIGIT_RMS_DBFS, prepareDigit, rmsDbfsOf } from './digits.ts';

function fakeDigit(level: number, silenceBefore: number, n = 12000, seed = 1): Float32Array {
  const x = new Float32Array(silenceBefore + n + 4000);
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const env = Math.sin((Math.PI * i) / n);
    x[silenceBefore + i] = level * env * (Math.sin(i / 7) + 0.3 * ((s / 2 ** 32) * 2 - 1));
  }
  return x;
}

describe('digit preparation', () => {
  it('trims to the onset and equalises every digit to the same RMS within 0.5 dB', () => {
    const digits = [0.05, 0.3, 0.9, 0.12].map((lvl, i) =>
      prepareDigit(fakeDigit(lvl, 3000 + i * 500, 12000, i + 1), 48000),
    );
    for (const d of digits) {
      expect(Math.abs(rmsDbfsOf(d) - DIGIT_RMS_DBFS)).toBeLessThan(0.5);
      // At most 10 ms of lead-in remains before the sound starts.
      expect(Math.abs(d[0] ?? 0)).toBeLessThan(0.01);
      expect(d.length).toBeLessThan(12000 + 2 * 480 + 10);
    }
  });
});
