// The EQ curve shown in "See what Clearly is doing", computed from the graph's own plan with
// core's biquad formulas (the same maths the clamp uses), so the chart is what the graph does.

import {
  AMBIENT_PEAK_HZ,
  AMBIENT_PEAK_Q,
  BAND_FREQUENCIES_HZ,
  EQ_PEAKING_Q,
  SPEECH_PEAK_HZ,
  SPEECH_PEAK_Q,
  VOICE_FOCUS_PEAK_HZ,
  VOICE_FOCUS_PEAK_Q,
  biquadCoefficients,
  biquadMagnitudeDbAt,
  frequencyPoint,
  type BiquadSpec,
} from '@clearly/core';
import type { FilterPlan } from '@clearly/audio';

export const CHART_FREQS: readonly number[] = Array.from(
  { length: 64 },
  (_, i) => 100 * 120 ** (i / 63),
);

function response(specs: readonly BiquadSpec[], hz: number, fs: number): number {
  const p = frequencyPoint(hz, fs);
  let sum = 0;
  for (const s of specs) sum += biquadMagnitudeDbAt(biquadCoefficients(s, fs), p);
  return sum;
}

export interface EqCurves {
  readonly left: readonly number[];
  readonly right: readonly number[];
  readonly ambient: readonly number[];
}

export function eqCurves(
  plan: FilterPlan,
  freqs: readonly number[] = CHART_FREQS,
  fs = 48000,
): EqCurves {
  const ear = (e: 'left' | 'right'): BiquadSpec[] => [
    ...plan.ears[e].eqDb.map((g, i): BiquadSpec => {
      const hz = BAND_FREQUENCIES_HZ[i] ?? 1000;
      return {
        type: hz === 8000 ? 'highshelf' : 'peaking',
        frequencyHz: hz,
        gainDb: g,
        q: EQ_PEAKING_Q,
      };
    }),
    {
      type: 'peaking',
      frequencyHz: SPEECH_PEAK_HZ,
      gainDb: plan.ears[e].speechDb,
      q: SPEECH_PEAK_Q,
    },
    {
      type: 'peaking',
      frequencyHz: AMBIENT_PEAK_HZ,
      gainDb: plan.ears[e].ambientDb,
      q: AMBIENT_PEAK_Q,
    },
    // Voice focus acts on the centre of the sound; shown here as its mid boost.
    {
      type: 'peaking',
      frequencyHz: VOICE_FOCUS_PEAK_HZ,
      gainDb: plan.voiceFocusMidDb,
      q: VOICE_FOCUS_PEAK_Q,
    },
  ];
  const L = ear('left');
  const R = ear('right');
  const amb: BiquadSpec[] = [
    {
      type: 'peaking',
      frequencyHz: AMBIENT_PEAK_HZ,
      gainDb: Math.max(plan.ears.left.ambientDb, plan.ears.right.ambientDb),
      q: AMBIENT_PEAK_Q,
    },
  ];
  return {
    left: freqs.map((f) => response(L, f, fs)),
    right: freqs.map((f) => response(R, f, fs)),
    ambient: freqs.map((f) => response(amb, f, fs)),
  };
}
