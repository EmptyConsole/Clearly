// From a profile and resolved settings to the numbers the graph's nodes take. Enhancement gains
// come only from packages/core (earGainsDb, then clampSummedBoost per ear); this file composes
// them and never computes a boost itself. Simulate my hearing builds its cuts here.

import {
  AMBIENT_PEAK_HZ,
  AMBIENT_PEAK_Q,
  BAND_FREQUENCIES_HZ,
  biquadCoefficients,
  biquadMagnitudeDbAt,
  CLAMP_GRID_HZ,
  clampSummedBoost,
  COMPRESSOR_DEFAULT,
  earGainsDb,
  EQ_PEAKING_Q,
  frequencyPoint,
  SPEECH_PEAK_HZ,
  SPEECH_PEAK_Q,
  type BiquadSpec,
  type CompressorParams,
  type PerEar,
  type Profile,
  type ResolvedSettings,
} from '@clearly/core';
import {
  COMPRESSOR_OFF,
  HUM_MAX_NOTCHES,
  SIMULATE_FILTER_MIN_DB,
  SIMULATE_MAX_CUT_DB,
  VOICE_FOCUS_MID_MAX_DB,
  VOICE_FOCUS_SIDE_MIN_DB,
} from '../constants.ts';

export type ProcessingMode = 'original' | 'enhanced' | 'simulate';

export interface HumNotch {
  readonly frequencyHz: number;
  readonly q: number;
}

/** Hum filter slot. M09 fills `notches` from detection; up to six are used. */
export interface HumSettings {
  readonly enabled: boolean;
  readonly notches: readonly HumNotch[];
}

/** Everything buildProcessingGraph and update() take: core's resolved settings plus the slots. */
export interface GraphSettings extends ResolvedSettings {
  readonly hum?: HumSettings;
}

export interface EarPlan {
  /** Gains for the eight EQ filters (peaking Q 1.0, highshelf at 8000 Hz). */
  readonly eqDb: readonly number[];
  readonly speechDb: number;
  readonly ambientDb: number;
}

export interface FilterPlan {
  readonly ears: PerEar<EarPlan>;
  /** Voice focus mid peak (0 to +4 dB) and side peak (0 to -6 dB) at 2000 Hz, Q 0.7. */
  readonly voiceFocusMidDb: number;
  readonly voiceFocusSideDb: number;
  readonly compressor: CompressorParams;
  readonly loudestLimitDbfs: number;
  readonly hum: readonly (HumNotch & { readonly on: boolean })[];
  /** Night mode is requested (the Night stage replaces the normal compressor). */
  readonly nightModeRequested: boolean;
  /** Night-mode level, or null for the normal compressor. Original and Simulate use null. */
  readonly nightLevel: 'low' | 'medium' | 'high' | null;
  /** Background cleanup wet share, 0 to 1 (0 in Simulate). */
  readonly cleanupStrength: number;
}

const FLAT_EAR: EarPlan = { eqDb: BAND_FREQUENCIES_HZ.map(() => 0), speechDb: 0, ambientDb: 0 };

function lossOf(profile: Profile | null): PerEar<readonly number[]> {
  if (!profile) return { left: FLAT_EAR.eqDb, right: FLAT_EAR.eqDb };
  return { left: profile.audiogram.ears.left.lossDb, right: profile.audiogram.ears.right.lossDb };
}

function compressorFor(s: ResolvedSettings): CompressorParams {
  if (s.compressor.kind === 'normal') {
    const { thresholdDbfs, kneeDb, ratio, attackMs, releaseMs } = s.compressor;
    return { thresholdDbfs, kneeDb, ratio, attackMs, releaseMs };
  }
  return COMPRESSOR_DEFAULT;
}

function humPlan(h: HumSettings | undefined): FilterPlan['hum'] {
  return Array.from({ length: HUM_MAX_NOTCHES }, (_, i) => {
    const n = h?.notches[i];
    return {
      frequencyHz: n?.frequencyHz ?? 50 * (i + 1),
      q: n?.q ?? 30,
      on: Boolean(h?.enabled && n),
    };
  });
}

/**
 * Simulate my hearing: each band filter cuts by the loss, at most 24 dB per filter, and the total
 * response is held to at most 40 dB of cut (all cuts scaled together if neighbours overlap past
 * it). Biquad peaking and shelf filters only approximate the inverse of a loss curve: between band
 * centres the cascade can cut more or less than the interpolated loss, and the 8000 Hz shelf keeps
 * cutting above 8 kHz.
 */
export function simulateCutsDb(lossDb: readonly number[]): number[] {
  const base = lossDb.map((l) =>
    Math.max(SIMULATE_FILTER_MIN_DB, -Math.min(Math.max(0, l), SIMULATE_MAX_CUT_DB)),
  );
  const points = CLAMP_GRID_HZ.map((hz) => frequencyPoint(hz, 48000));
  const deepest = (scale: number) => {
    const coeffs = base.map((g, i) => biquadCoefficients(eqSpec(i, g * scale), 48000));
    let min = 0;
    for (const p of points) {
      let sum = 0;
      for (const c of coeffs) sum += biquadMagnitudeDbAt(c, p);
      if (sum < min) min = sum;
    }
    return min;
  };
  if (deepest(1) >= -SIMULATE_MAX_CUT_DB) return base;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (deepest(mid) >= -SIMULATE_MAX_CUT_DB) lo = mid;
    else hi = mid;
  }
  return base.map((g) => g * lo);
}

export function eqSpec(band: number, gainDb: number): BiquadSpec {
  const hz = BAND_FREQUENCIES_HZ[band] ?? 1000;
  return { type: hz === 8000 ? 'highshelf' : 'peaking', frequencyHz: hz, gainDb, q: EQ_PEAKING_Q };
}

export function planFilters(
  profile: Profile | null,
  s: GraphSettings,
  mode: ProcessingMode,
): FilterPlan {
  const loss = lossOf(profile);
  const common = {
    loudestLimitDbfs: s.loudestLimitDbfs,
    hum: humPlan(s.hum),
    nightModeRequested: s.compressor.kind === 'night',
    nightLevel: s.compressor.kind === 'night' && mode !== 'simulate' ? s.compressor.level : null,
    cleanupStrength: mode === 'simulate' ? 0 : s.cleanupStrength,
  };
  if (mode === 'simulate') {
    return {
      ...common,
      ears: {
        left: { eqDb: simulateCutsDb(loss.left), speechDb: 0, ambientDb: 0 },
        right: { eqDb: simulateCutsDb(loss.right), speechDb: 0, ambientDb: 0 },
      },
      voiceFocusMidDb: 0,
      voiceFocusSideDb: 0,
      compressor: COMPRESSOR_OFF,
    };
  }
  // Original keeps the Enhanced plan on the (silent) wet path, so switching back is a crossfade.
  const gains = profile
    ? earGainsDb(loss, {
        boostStyle: profile.boostStyle,
        capDb: profile.capDb,
        strength: s.strength,
        starter: profile.audiogram.method === 'starter',
      })
    : { left: [...FLAT_EAR.eqDb], right: [...FLAT_EAR.eqDb] };
  const vfMid = VOICE_FOCUS_MID_MAX_DB * s.voiceFocus;
  const clamp = (eq: readonly number[], adjust: readonly number[] | undefined) =>
    clampSummedBoost({
      eqDb: eq.map((g, i) => g * s.eqScale + (adjust?.[i] ?? 0)),
      speechDb: s.speechPeakDb,
      voiceFocusDb: vfMid,
      ambientDb: s.ambientBoostDb,
    });
  // bandAdjustDb is optional so graphs built from older settings objects keep working.
  const adj = (s as Partial<GraphSettings>).bandAdjustDb;
  const L = clamp(gains.left, adj?.left);
  const R = clamp(gains.right, adj?.right);
  // Voice focus is one mid/side stage shared by both ears: use the stricter ear's scale.
  const vfScale = Math.min(L.extrasScale, R.extrasScale);
  return {
    ...common,
    ears: {
      left: { eqDb: L.eqDb, speechDb: L.speechDb, ambientDb: L.ambientDb },
      right: { eqDb: R.eqDb, speechDb: R.speechDb, ambientDb: R.ambientDb },
    },
    voiceFocusMidDb: vfMid * vfScale,
    voiceFocusSideDb: VOICE_FOCUS_SIDE_MIN_DB * s.voiceFocus * vfScale,
    compressor: compressorFor(s),
  };
}

export const SPEECH_FILTER = { frequencyHz: SPEECH_PEAK_HZ, q: SPEECH_PEAK_Q } as const;
export const AMBIENT_FILTER = { frequencyHz: AMBIENT_PEAK_HZ, q: AMBIENT_PEAK_Q } as const;
