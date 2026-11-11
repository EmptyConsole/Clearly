// Settings precedence (M01 section 5): one pure function from preset, remembered manual changes
// and this session's changes to a fully resolved settings object.
//
// Order, lowest to highest:
//   1. Preset values (Movie is the defaults).
//   2. The person's manual changes, remembered per profile.
//   3. Music only: cleanup and Voice focus forced to 0 ...
//   4. ... unless turned on again in this session (session overrides).
//   5. Night mode (from preset or a manual change) replaces the compressor stage.
//   6. Ambient boost adds its own 2500 Hz peak.
//   7. Auto Boost (M09) lowers the normal compressor's threshold by 0 to 6 dB. Night mode keeps
//      its own fixed stage.

import {
  BAND_FREQUENCIES_HZ,
  AMBIENT_BOOST_MAX_DB,
  LOUDEST_LIMIT_DEFAULT_DBFS,
  LOUDEST_LIMIT_MAX_DBFS,
  LOUDEST_LIMIT_MIN_DBFS,
  STRENGTH_MAX,
  STRENGTH_MIN,
} from '../constants.ts';
import { clamp } from '../math.ts';
import { AUTO_BOOST_THRESHOLD_DROP_MAX_DB } from '../listening/autoBoost.ts';
import { PRESETS, type CompressorParams, type NightModeLevel, type PresetId } from './presets.ts';

/** Manual changes remembered per profile. Every field is optional. */
export interface ManualOverrides {
  readonly strength?: number | undefined;
  readonly compressorRatio?: number | undefined;
  readonly compressorThresholdDbfs?: number | undefined;
  readonly compressorKneeDb?: number | undefined;
  readonly cleanupStrength?: number | undefined;
  readonly voiceFocus?: number | undefined;
  readonly nightMode?: NightModeLevel | undefined;
  readonly bandAdjustDb?:
    { readonly left: readonly number[]; readonly right: readonly number[] } | undefined;
}

/** Changes made in this listening session only (not remembered). */
export interface SessionOverrides {
  readonly cleanupStrength?: number | undefined;
  readonly voiceFocus?: number | undefined;
}

export interface PrecedenceInput {
  readonly preset: PresetId;
  readonly manual?: ManualOverrides;
  readonly session?: SessionOverrides;
  readonly ambientBoostDb?: number;
  /** Auto Boost: lower the normal compressor threshold by this much (0 to 6 dB). */
  readonly thresholdDropDb?: number;
  readonly loudestLimitDbfs?: number;
}

export type CompressorStage =
  | ({ readonly kind: 'normal' } & CompressorParams)
  | { readonly kind: 'night'; readonly level: Exclude<NightModeLevel, 'off'> };

export interface ResolvedSettings {
  readonly preset: PresetId;
  readonly strength: number;
  readonly eqScale: number;
  readonly compressor: CompressorStage;
  readonly cleanupStrength: number;
  readonly voiceFocus: number;
  readonly speechPeakDb: number;
  readonly ambientBoostDb: number;
  readonly loudestLimitDbfs: number;
  /** Per-ear, per-band adjustments (dB) added to the personal EQ before the clamp. */
  readonly bandAdjustDb: { readonly left: readonly number[]; readonly right: readonly number[] };
}

const unit = (x: number): number => clamp(x, 0, 1);
const BAND_ZERO: readonly number[] = BAND_FREQUENCIES_HZ.map(() => 0);

export function resolveSettings(input: PrecedenceInput): ResolvedSettings {
  const p = PRESETS[input.preset];
  const m = input.manual ?? {};
  const s = input.session ?? {};

  let cleanup = m.cleanupStrength ?? p.cleanupStrength;
  let voiceFocus = m.voiceFocus ?? p.voiceFocus;
  if (input.preset === 'music') {
    cleanup = 0;
    voiceFocus = 0;
  }
  cleanup = s.cleanupStrength ?? cleanup;
  voiceFocus = s.voiceFocus ?? voiceFocus;

  const nightMode = m.nightMode ?? p.nightMode;
  const compressor: CompressorStage =
    nightMode === 'off'
      ? {
          kind: 'normal',
          ...p.compressor,
          ratio: m.compressorRatio ?? p.compressor.ratio,
          thresholdDbfs:
            (m.compressorThresholdDbfs ?? p.compressor.thresholdDbfs) -
            clamp(input.thresholdDropDb ?? 0, 0, AUTO_BOOST_THRESHOLD_DROP_MAX_DB),
          kneeDb: m.compressorKneeDb ?? p.compressor.kneeDb,
        }
      : { kind: 'night', level: nightMode };

  return {
    preset: input.preset,
    strength: clamp(m.strength ?? p.strength, STRENGTH_MIN, STRENGTH_MAX),
    eqScale: p.eqScale,
    compressor,
    cleanupStrength: unit(cleanup),
    voiceFocus: unit(voiceFocus),
    speechPeakDb: p.speechPeakDb,
    ambientBoostDb: clamp(input.ambientBoostDb ?? 0, 0, AMBIENT_BOOST_MAX_DB),
    bandAdjustDb: {
      left: BAND_ZERO.map((_, i) => clamp(m.bandAdjustDb?.left[i] ?? 0, -12, 12)),
      right: BAND_ZERO.map((_, i) => clamp(m.bandAdjustDb?.right[i] ?? 0, -12, 12)),
    },
    loudestLimitDbfs: clamp(
      input.loudestLimitDbfs ?? LOUDEST_LIMIT_DEFAULT_DBFS,
      LOUDEST_LIMIT_MIN_DBFS,
      LOUDEST_LIMIT_MAX_DBFS,
    ),
  };
}
