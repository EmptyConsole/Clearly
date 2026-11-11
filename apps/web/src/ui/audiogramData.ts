import { BAND_FREQUENCIES_HZ, type Audiogram, type TrackResult } from '@clearly/core';

export interface AudiogramPoint {
  readonly hz: number;
  /** Extra loudness needed in dB (loss), or null when not available. */
  readonly lossDb: number | null;
  /** True when the value was estimated between measured points. */
  readonly estimated: boolean;
}

export interface AudiogramSeries {
  readonly left: readonly AudiogramPoint[];
  readonly right: readonly AudiogramPoint[];
}

export function seriesFromAudiogram(a: Audiogram): AudiogramSeries {
  const ear = (e: Audiogram['ears']['left']): AudiogramPoint[] =>
    BAND_FREQUENCIES_HZ.map((hz, i) => ({
      hz,
      lossDb: e.lossDb[i] ?? null,
      // A starter audiogram is estimated everywhere; otherwise bands without a measured threshold.
      estimated: a.method === 'starter' || e.thresholds[i] === null,
    }));
  return { left: ear(a.ears.left), right: ear(a.ears.right) };
}

/**
 * Provisional points while a check runs: the distance of each finished threshold from typical
 * hearing at this calibration level (Lc - 45 + R(f)). The final chart uses core's computeLoss.
 */
export function seriesFromTracks(
  tracks: readonly TrackResult[],
  typicalRelLc: (hz: number) => number,
): AudiogramSeries {
  const ear = (e: 'left' | 'right'): AudiogramPoint[] =>
    BAND_FREQUENCIES_HZ.map((hz) => {
      const tr = tracks.find((x) => x.ear === e && x.hz === hz);
      return {
        hz,
        lossDb: tr ? Math.max(0, tr.thresholdRelLc - typicalRelLc(hz)) : null,
        estimated: false,
      };
    });
  return { left: ear('left'), right: ear('right') };
}
