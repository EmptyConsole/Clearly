// Speech-shaped noise for the speech-in-noise check (M08).
//
// Target: ANSI S3.5-1997 (R2017), Table 3, "standard speech spectrum level" for normal vocal
// effort, one-third-octave band centres 160 Hz to 8 kHz, in dB (spectrum level, per Hz). Values
// as reproduced in the MoSQITo implementation of the standard (mosqito/sq_metrics/
// speech_intelligibility/sii_ansi/_speech_data.py, read 2026-11-09). 125 Hz is not in the table;
// it is taken as equal to 160 Hz (the spectrum is flat there), an extrapolation stated here.
//
// White noise has a flat spectrum level, so a filter whose gain follows these values (up to a
// constant) gives speech-shaped noise. The cascade below was fitted by scripts/fit-ltass.ts.

import type { BiquadSpec } from '../sound/biquad.ts';
import { biquadCoefficients, biquadMagnitudeDbAt, frequencyPoint } from '../sound/biquad.ts';

export const LTASS_FREQS_HZ: readonly number[] = [
  125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300,
  8000,
];

export const LTASS_SPECTRUM_DB: readonly number[] = [
  32.41, 32.41, 34.48, 34.75, 33.98, 34.59, 34.27, 32.06, 28.3, 25.01, 23.0, 20.15, 17.32, 13.18,
  11.55, 9.33, 5.31, 2.59, 1.13,
];

/** The fitted cascade at 48 kHz (scripts/fit-ltass.ts; largest deviation 0.72 dB). */
export const LTASS_FILTERS: readonly BiquadSpec[] = [
  { type: 'lowshelf', frequencyHz: 772.755, gainDb: 10.732, q: 0.7 },
  { type: 'peaking', frequencyHz: 468.226, gainDb: 4.66, q: 0.396 },
  { type: 'peaking', frequencyHz: 2494.605, gainDb: -3.782, q: 1.16 },
  { type: 'highshelf', frequencyHz: 4174.807, gainDb: -22.852, q: 0.7 },
  // Web Audio lowpass Q is in dB.
  { type: 'lowpass', frequencyHz: 12211.033, gainDb: 0, q: 2.378 },
];

/** Deviation of the cascade from the target at each table frequency, after removing the mean. */
export function ltassFitErrorsDb(sampleRate = 48000): number[] {
  const resp = LTASS_FREQS_HZ.map((f) => {
    const p = frequencyPoint(f, sampleRate);
    return LTASS_FILTERS.reduce(
      (s, sp) => s + biquadMagnitudeDbAt(biquadCoefficients(sp, sampleRate), p),
      0,
    );
  });
  const d = resp.map((r, i) => r - (LTASS_SPECTRUM_DB[i] ?? 0));
  const mean = d.reduce((a, b) => a + b, 0) / d.length;
  return d.map((x) => x - mean);
}
