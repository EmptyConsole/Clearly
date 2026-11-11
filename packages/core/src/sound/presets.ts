// Preset definitions as data (M01 section 5).

import { COMPRESSOR_DEFAULT, SPEECH_PEAK_DB, STRENGTH_DEFAULT } from '../constants.ts';

export const PRESET_IDS = ['movie', 'speech', 'music', 'night'] as const;
export type PresetId = (typeof PRESET_IDS)[number];

export const NIGHT_MODE_LEVELS = ['off', 'low', 'medium', 'high'] as const;
export type NightModeLevel = (typeof NIGHT_MODE_LEVELS)[number];

export interface CompressorParams {
  readonly thresholdDbfs: number;
  readonly kneeDb: number;
  readonly ratio: number;
  readonly attackMs: number;
  readonly releaseMs: number;
}

export interface PresetValues {
  readonly strength: number;
  /** Multiplies every personal-EQ gain (Music uses 0.8). */
  readonly eqScale: number;
  readonly compressor: CompressorParams;
  /** Background cleanup wet share, 0 to 1. */
  readonly cleanupStrength: number;
  /** Voice focus amount, 0 to 1. */
  readonly voiceFocus: number;
  /** Speech-preset peaking filter at 2500 Hz, Q 1.0, in dB. */
  readonly speechPeakDb: number;
  readonly nightMode: NightModeLevel;
}

/**
 * Movie is the defaults. Cleanup and Voice focus start at 0 because Background cleanup needs a
 * download the person must start themselves (RULES.md heavy-asset rule).
 */
const MOVIE: PresetValues = {
  strength: STRENGTH_DEFAULT,
  eqScale: 1,
  compressor: COMPRESSOR_DEFAULT,
  cleanupStrength: 0,
  voiceFocus: 0,
  speechPeakDb: 0,
  nightMode: 'off',
};

export const PRESETS: Readonly<Record<PresetId, PresetValues>> = {
  movie: MOVIE,
  speech: {
    ...MOVIE,
    speechPeakDb: SPEECH_PEAK_DB,
    compressor: { ...COMPRESSOR_DEFAULT, ratio: 3 },
    voiceFocus: 0.5,
    cleanupStrength: 0.4,
  },
  music: {
    ...MOVIE,
    eqScale: 0.8,
    compressor: { ...COMPRESSOR_DEFAULT, ratio: 2, thresholdDbfs: -18, kneeDb: 20 },
    cleanupStrength: 0,
    voiceFocus: 0,
  },
  night: {
    ...MOVIE,
    nightMode: 'medium',
    strength: 0.8,
  },
};
