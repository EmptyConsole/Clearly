import { describe, expect, it } from 'vitest';
import { StreamResampler } from './resampler.ts';

function sine(n: number, rate: number, hz: number): Float32Array {
  return Float32Array.from({ length: n }, (_, i) => 0.5 * Math.sin((2 * Math.PI * hz * i) / rate));
}
const concat = (parts: Float32Array[]) => {
  const out = new Float32Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

function run(input: Float32Array, inRate: number, outRate: number, chunk: number): Float32Array {
  const r = new StreamResampler(inRate, outRate, 1);
  const parts: Float32Array[] = [];
  for (let s = 0; s < input.length; s += chunk)
    parts.push(r.push([input.slice(s, s + chunk)])[0] ?? new Float32Array(0));
  parts.push(r.flush()[0] ?? new Float32Array(0));
  return concat(parts);
}

describe('StreamResampler', () => {
  it('converts 44.1 kHz to 48 kHz with the right length and an accurate sine', () => {
    const x = sine(44100, 44100, 1000);
    const y = run(x, 44100, 48000, 4096);
    expect(y.length).toBe(48000);
    // Compare the middle against the ideal 48 kHz sine.
    const ideal = sine(48000, 48000, 1000);
    let err = 0;
    let ref = 0;
    for (let i = 1000; i < 47000; i++) {
      err += ((y[i] ?? 0) - (ideal[i] ?? 0)) ** 2;
      ref += (ideal[i] ?? 0) ** 2;
    }
    expect(10 * Math.log10(err / ref)).toBeLessThan(-60);
  });

  it('gives the same output whatever the chunk size', () => {
    const x = sine(30000, 44100, 3000);
    const a = run(x, 44100, 48000, 30000);
    const b = run(x, 44100, 48000, 777);
    expect(b.length).toBe(a.length);
    let maxDiff = 0;
    for (let i = 0; i < a.length; i++)
      maxDiff = Math.max(maxDiff, Math.abs((a[i] ?? 0) - (b[i] ?? 0)));
    expect(maxDiff).toBeLessThan(1e-6);
  });

  it('downsamples 96 kHz without aliasing a 40 kHz tone into the band', () => {
    const x = sine(96000, 96000, 40000);
    const y = run(x, 96000, 48000, 8192);
    let rms = 0;
    for (let i = 1000; i < y.length - 1000; i++) rms += (y[i] ?? 0) ** 2;
    rms = Math.sqrt(rms / (y.length - 2000));
    expect(20 * Math.log10(rms / (0.5 / Math.SQRT2))).toBeLessThan(-60);
  });
});
