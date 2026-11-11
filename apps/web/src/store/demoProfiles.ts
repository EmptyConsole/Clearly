// Demo mode's three profiles. Built in memory, never stored in IndexedDB and never synced, and
// labelled "Demo" wherever they appear. Their ids all start with DEMO_PREFIX.

import {
  AUDIOGRAM_VERSION,
  BAND_FREQUENCIES_HZ,
  PROFILE_VERSION,
  type Profile,
} from '@clearly/core';

export const DEMO_PREFIX = 'demo-';
export const isDemoId = (id: string | null | undefined): boolean =>
  Boolean(id?.startsWith(DEMO_PREFIX));

const zeros = () => BAND_FREQUENCIES_HZ.map(() => 0);

function demo(id: string, name: string, loss: readonly number[]): Profile {
  const ear = () => ({
    lossDb: [...loss],
    uncertaintyDb: BAND_FREQUENCIES_HZ.map(() => null),
    thresholds: BAND_FREQUENCIES_HZ.map(() => null),
  });
  return {
    schemaVersion: PROFILE_VERSION,
    id: `${DEMO_PREFIX}${id}`,
    name,
    headphoneName: 'Demo',
    audiogram: {
      schemaVersion: AUDIOGRAM_VERSION,
      method: 'express',
      reliability: 'High',
      createdAt: '2026-01-01T00:00:00.000Z',
      ears: { left: ear(), right: ear() },
    },
    calibration: null,
    settingsOverrides: {},
    boostStyle: 'standard',
    capDb: 18,
    strength: 1,
    headphoneCompensation: { left: zeros(), right: zeros() },
  };
}

/** Names come from the copy file at the call site; these are the stored keys. */
export const DEMO_PROFILES: readonly Profile[] = [
  demo('normal', 'Normal hearing', [0, 0, 0, 0, 2, 3, 4, 5]),
  demo('mild-hf', 'Mild high-frequency loss', [0, 0, 5, 10, 20, 25, 30, 35]),
  demo('moderate', 'Moderate sloping loss', [15, 20, 25, 35, 40, 45, 50, 55]),
];
