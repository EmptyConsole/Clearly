// Fits the speech-shaped noise filter (M08) to the ANSI S3.5-1997 standard speech spectrum
// (Table 3, normal vocal effort). Prints the biquad cascade for src/listening/ltass.ts.
// Run: node packages/core/scripts/fit-ltass.ts
import {
  biquadCoefficients,
  biquadMagnitudeDbAt,
  frequencyPoint,
  type BiquadSpec,
} from '../src/index.ts';
import { LTASS_FREQS_HZ, LTASS_SPECTRUM_DB } from '../src/listening/ltass.ts';

const SR = 48000;
type P = number[];
// Cascade: lowshelf, peaking x2, highshelf, lowpass (12 params; lowpass Q in dB as Web Audio).
function specs(p: P): BiquadSpec[] {
  const g = (i: number) => p[i] ?? 0;
  return [
    { type: 'lowshelf', frequencyHz: g(0), gainDb: g(1), q: 0.7 },
    { type: 'peaking', frequencyHz: g(2), gainDb: g(3), q: g(4) },
    { type: 'peaking', frequencyHz: g(5), gainDb: g(6), q: g(7) },
    { type: 'highshelf', frequencyHz: g(8), gainDb: g(9), q: 0.7 },
    { type: 'lowpass', frequencyHz: g(10), gainDb: 0, q: g(11) },
  ];
}
function response(p: P, hz: number): number {
  const pt = frequencyPoint(hz, SR);
  return specs(p).reduce((s, sp) => s + biquadMagnitudeDbAt(biquadCoefficients(sp, SR), pt), 0);
}
function err(p: P): number {
  const d = LTASS_FREQS_HZ.map((f, i) => response(p, f) - (LTASS_SPECTRUM_DB[i] ?? 0));
  const mean = d.reduce((a, b) => a + b, 0) / d.length;
  return Math.max(...d.map((x) => Math.abs(x - mean)));
}
const lo = [50, -20, 200, -12, 0.3, 1000, -12, 0.3, 1000, -30, 2000, -6];
const hi = [800, 20, 2000, 12, 4, 8000, 12, 4, 8000, 0, 20000, 6];
let best: P = [200, 3, 500, 2, 1, 3000, -3, 1, 2000, -15, 9000, 0];
let bestE = err(best);
let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
for (let it = 0; it < 60000; it++) {
  const scale = 0.3 * (1 - it / 60000) + 0.01;
  const cand = best.map((v, i) => {
    const span = (hi[i] ?? 1) - (lo[i] ?? 0);
    return Math.min(hi[i] ?? v, Math.max(lo[i] ?? v, v + (rnd() - 0.5) * span * scale));
  });
  const e = err(cand);
  if (e < bestE) {
    best = cand;
    bestE = e;
  }
}
console.log('max deviation dB', bestE.toFixed(3));
console.log(JSON.stringify(specs(best.map((v) => Math.round(v * 1000) / 1000)), null, 2));
