// Profiles and settings used by the audio harness scenarios.

import {
  AUDIOGRAM_VERSION,
  BAND_COUNT,
  PROFILE_VERSION,
  profileSchema,
  resolveSettings,
  type PrecedenceInput,
  type Profile,
} from '@clearly/core';
import type { GraphSettings, HumSettings } from '../src/index.ts';

export function profileWith(lossLeft: number[], lossRight: number[] = lossLeft): Profile {
  const ear = (lossDb: number[]) => ({
    lossDb,
    uncertaintyDb: Array.from({ length: BAND_COUNT }, () => null),
    thresholds: Array.from({ length: BAND_COUNT }, () => null),
  });
  return profileSchema.parse({
    schemaVersion: PROFILE_VERSION,
    id: 'harness',
    name: 'Harness',
    headphoneName: 'Test headphones',
    audiogram: {
      schemaVersion: AUDIOGRAM_VERSION,
      method: 'express',
      reliability: 'High',
      createdAt: '2026-11-09T12:00:00.000Z',
      ears: { left: ear(lossLeft), right: ear(lossRight) },
    },
    calibration: null,
    boostStyle: 'strong',
    capDb: 24,
    strength: 1,
  });
}

/** A typical mild sloping loss. */
export const MILD = profileWith([10, 10, 15, 25, 30, 35, 40, 45], [5, 10, 15, 20, 30, 40, 45, 50]);
/** Losses that drive every band to the 24 dB cap at strength 1.5. */
export const SEVERE = profileWith(Array.from({ length: BAND_COUNT }, () => 80));

export function settings(input: Partial<PrecedenceInput> = {}, hum?: HumSettings): GraphSettings {
  const s = resolveSettings({ preset: 'movie', ...input });
  return hum ? { ...s, hum } : s;
}

/**
 * Flat: no EQ (strength 0) and a compressor at ratio 1 (no compression, no makeup gain). The
 * program limiter's fixed +1.7 dB makeup and the -3 dB pre-attenuation remain.
 */
export const FLAT = settings({
  manual: { strength: 0, compressorRatio: 1, compressorThresholdDbfs: 0, compressorKneeDb: 0 },
});

/** Everything at maximum: the summed-boost clamp must act. */
export const EXTREME = settings({
  preset: 'speech',
  manual: { strength: 1.5, voiceFocus: 1 },
  ambientBoostDb: 6,
  loudestLimitDbfs: -6,
});

export const HUM_50: HumSettings = {
  enabled: true,
  notches: [50, 100, 150, 200, 250, 300].map((frequencyHz) => ({ frequencyHz, q: 30 })),
};
