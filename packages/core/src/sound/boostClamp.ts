// Summed-boost clamp (RULES.md safety rules, M01 section 5). Estimates the combined response of
// the personal EQ, the Speech preset peak, Voice focus and Ambient boost on a dense log-frequency
// grid, then scales the extras, and then if needed the EQ, until the peak is at most +24 dB.

import {
  AMBIENT_PEAK_HZ,
  AMBIENT_PEAK_Q,
  BAND_FREQUENCIES_HZ,
  CLAMP_BISECTION_STEPS,
  CLAMP_GRID_MAX_HZ,
  CLAMP_GRID_MIN_HZ,
  CLAMP_GRID_POINTS_PER_OCTAVE,
  EQ_PEAKING_Q,
  MAX_BAND_BOOST_DB,
  SAMPLE_RATE_HZ,
  SPEECH_PEAK_HZ,
  SPEECH_PEAK_Q,
  VOICE_FOCUS_PEAK_HZ,
  VOICE_FOCUS_PEAK_Q,
} from '../constants.ts';
import {
  biquadCoefficients,
  biquadMagnitudeDbAt,
  frequencyPoint,
  type BiquadSpec,
  type FrequencyPoint,
} from './biquad.ts';

export interface BoostContributions {
  /** Personal EQ gains in dB for one ear, aligned with BAND_FREQUENCIES_HZ. */
  readonly eqDb: readonly number[];
  /** Speech preset peak at 2500 Hz, Q 1.0. */
  readonly speechDb: number;
  /** Voice focus mid boost at 2000 Hz, Q 0.7. */
  readonly voiceFocusDb: number;
  /** Ambient boost at 2500 Hz, Q 0.8. */
  readonly ambientDb: number;
}

export interface ClampResult extends BoostContributions {
  /** Factor applied to the extras (speech, voice focus, ambient), 0 to 1. */
  readonly extrasScale: number;
  /** Factor applied to the EQ, 0 to 1. */
  readonly eqScale: number;
  /** Peak of the combined response after clamping, in dB. */
  readonly peakDb: number;
}

/** Log-spaced frequencies from 20 Hz to 20 kHz, 48 per octave (about 480 points). */
export const CLAMP_GRID_HZ: readonly number[] = (() => {
  const octaves = Math.log2(CLAMP_GRID_MAX_HZ / CLAMP_GRID_MIN_HZ);
  const n = Math.ceil(octaves * CLAMP_GRID_POINTS_PER_OCTAVE) + 1;
  return Array.from({ length: n }, (_, i) => CLAMP_GRID_MIN_HZ * 2 ** ((i * octaves) / (n - 1)));
})();

const CLAMP_GRID_POINTS: readonly FrequencyPoint[] = CLAMP_GRID_HZ.map((hz) =>
  frequencyPoint(hz, SAMPLE_RATE_HZ),
);

/** The filters the graph builds for these contributions (RULES.md signal chain). */
export function boostFilters(c: BoostContributions): BiquadSpec[] {
  const eq = BAND_FREQUENCIES_HZ.map((hz, i): BiquadSpec => ({
    type: hz === 8000 ? 'highshelf' : 'peaking',
    frequencyHz: hz,
    gainDb: c.eqDb[i] ?? 0,
    q: EQ_PEAKING_Q,
  }));
  return [
    ...eq,
    { type: 'peaking', frequencyHz: SPEECH_PEAK_HZ, gainDb: c.speechDb, q: SPEECH_PEAK_Q },
    {
      type: 'peaking',
      frequencyHz: VOICE_FOCUS_PEAK_HZ,
      gainDb: c.voiceFocusDb,
      q: VOICE_FOCUS_PEAK_Q,
    },
    { type: 'peaking', frequencyHz: AMBIENT_PEAK_HZ, gainDb: c.ambientDb, q: AMBIENT_PEAK_Q },
  ];
}

/** Peak of the summed (cascaded) magnitude response in dB over the dense grid. */
export function combinedPeakDb(c: BoostContributions): number {
  const coeffs = boostFilters(c)
    .filter((f) => f.gainDb !== 0)
    .map((f) => biquadCoefficients(f, SAMPLE_RATE_HZ));
  let peak = 0;
  for (const p of CLAMP_GRID_POINTS) {
    let sum = 0;
    for (const k of coeffs) sum += biquadMagnitudeDbAt(k, p);
    if (sum > peak) peak = sum;
  }
  return peak;
}

function scaled(c: BoostContributions, eqScale: number, extrasScale: number): BoostContributions {
  return {
    eqDb: c.eqDb.map((g) => g * eqScale),
    speechDb: c.speechDb * extrasScale,
    voiceFocusDb: c.voiceFocusDb * extrasScale,
    ambientDb: c.ambientDb * extrasScale,
  };
}

/** Largest s in [0, 1] with peak(s) <= limit, by bisection (peak is monotone in s for boosts). */
function largestScale(peakAt: (s: number) => number, limitDb: number): number {
  if (peakAt(1) <= limitDb) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < CLAMP_BISECTION_STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (peakAt(mid) <= limitDb) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Clamps one ear's boosts so the combined peak is at most +24 dB. Cuts (negative gains) are not
 * expected here; they are passed through scaled like any other gain. The extras are reduced
 * first because the personal EQ is the part fitted to the person's hearing.
 */
export function clampSummedBoost(
  c: BoostContributions,
  limitDb: number = MAX_BAND_BOOST_DB,
): ClampResult {
  const extrasScale = largestScale((s) => combinedPeakDb(scaled(c, 1, s)), limitDb);
  const eqScale =
    extrasScale > 0 ? 1 : largestScale((s) => combinedPeakDb(scaled(c, s, 0)), limitDb);
  const out = scaled(c, eqScale, extrasScale);
  return { ...out, extrasScale, eqScale, peakDb: combinedPeakDb(out) };
}
