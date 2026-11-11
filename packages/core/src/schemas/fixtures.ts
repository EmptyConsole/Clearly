// One stored document per schema and per version, exactly as an older app would have written it.
// When a schema gains a version, add its fixture here; schemas.test.ts fails if any is missing.
// Fixtures are typed `unknown` on purpose: they are old data, not current types.

const audiogramV1: unknown = {
  schemaVersion: 1,
  method: 'express',
  reliability: 'Medium',
  createdAt: '2026-11-09T10:00:00.000Z',
  ears: {
    left: {
      lossDb: [0, 0, 0, 4, 9, 14, 20, 26],
      uncertaintyDb: [null, 4.1, 3.9, 4.4, null, 5.0, null, 5.2],
      thresholds: [
        null,
        { dbfs: -72, relLc: -42, sdDb: 4.1 },
        { dbfs: -75, relLc: -45, sdDb: 3.9 },
        { dbfs: -74, relLc: -44, sdDb: 4.4 },
        null,
        { dbfs: -66, relLc: -36, sdDb: 5.0 },
        null,
        { dbfs: -36, relLc: -6, sdDb: 5.2 },
      ],
    },
    right: {
      lossDb: [0, 0, 2, 6, 11, 16, 22, 30],
      uncertaintyDb: [null, 4.3, 4.0, 4.6, null, 5.1, null, 5.5],
      thresholds: [
        null,
        { dbfs: -72, relLc: -42, sdDb: 4.3 },
        { dbfs: -73, relLc: -43, sdDb: 4.0 },
        { dbfs: -72, relLc: -42, sdDb: 4.6 },
        null,
        { dbfs: -64, relLc: -34, sdDb: 5.1 },
        null,
        { dbfs: -32, relLc: -2, sdDb: 5.5 },
      ],
    },
  },
};

const calibrationV1: unknown = {
  schemaVersion: 1,
  lcDbfs: -30,
  headphoneName: 'Living-room headphones',
  date: '2026-11-09T09:58:00.000Z',
};

/** A profile written with only the required fields, so every default is exercised. */
const profileV1: unknown = {
  schemaVersion: 1,
  id: 'p-1',
  name: 'Evening TV',
  headphoneName: 'Living-room headphones',
  audiogram: audiogramV1,
  calibration: calibrationV1,
};

const settingsV1: unknown = {
  schemaVersion: 1,
  activeProfileId: 'p-1',
  preset: 'speech',
  ambientBoostDb: 2,
  loudestLimitDbfs: -12,
  pace: 'auto',
};

const sessionV1 = {
  method: 'express',
  lcDbfs: -30,
  tracks: [
    {
      trackId: 'left-1000',
      ear: 'left',
      hz: 1000,
      thresholdDbfs: -75,
      thresholdRelLc: -45,
      sdDb: 3.9,
      trials: 3,
      massBelowFloor: 0,
      massAboveCeiling: 0,
      heardAtQuietest: false,
      noResponseAtLoudest: false,
    },
  ],
  catchHistory: { catchTrials: 6, falseAlarms: 0 },
  guessRate: 0.02,
  totalTrials: 36,
  toneTrials: 30,
  catchTrials: 6,
  heardToneTrials: 15,
};

const hearingCheckV1: unknown = {
  schemaVersion: 1,
  id: 'hc-1',
  profileId: 'p-1',
  createdAt: '2026-11-09T10:00:00.000Z',
  headphoneName: 'Living-room headphones',
  ageRange: '60-69',
  lcDbfs: -30,
  audiogram: audiogramV1,
  session: sessionV1,
};

const checkProgressV1: unknown = {
  schemaVersion: 1,
  id: 'refine',
  profileId: 'p-1',
  method: 'refine',
  createdAt: '2026-11-09T10:00:00.000Z',
  expiresAt: '2026-11-10T10:00:00.000Z',
  headphoneName: 'Living-room headphones',
  ageRange: null,
  lcDbfs: -30,
  rngSeed: 12345,
  seed: sessionV1,
  responses: [true, false, true],
};

const sinCheckV1: unknown = {
  schemaVersion: 1,
  id: 'sin-1',
  profileId: 'p-1',
  createdAt: '2026-11-09T11:00:00.000Z',
  headphoneName: 'Living-room headphones',
  srtDb: -6.5,
  category: 'some',
  snrsDb: [0, -2, -4, -6, -4, -6, -8, -6, -4, -6, -8, -6],
};

/** Written without `alerted`, so its default is exercised. */
const exposureDayV1: unknown = {
  schemaVersion: 1,
  id: '2026-11-09',
  comfortableMinutes: 42,
  loudMinutes: 10,
  veryLoudMinutes: 3,
};

const captionCacheV1: unknown = {
  schemaVersion: 1,
  id: 'sha256-0123456789abcdef0123456789abcdef',
  createdAt: '2026-11-09T11:00:00.000Z',
  model: 'tiny.en',
  coveredSeconds: 12,
  durationSeconds: 60,
  segments: [{ start: 0.5, end: 2.1, text: 'Hello there.' }],
};

/** Written without sinChecks or settings, so their defaults are exercised. */
const backupV1: unknown = {
  schemaVersion: 1,
  kind: 'clearly-backup',
  createdAt: '2026-11-09T12:00:00.000Z',
  activeProfileId: 'p-1',
  profiles: [profileV1],
  hearingChecks: [hearingCheckV1],
  exposureDays: [exposureDayV1],
};

export const FIXTURES: Readonly<Record<string, Readonly<Record<number, unknown>>>> = {
  Audiogram: { 1: audiogramV1 },
  Calibration: { 1: calibrationV1 },
  Profile: { 1: profileV1 },
  Settings: { 1: settingsV1 },
  HearingCheck: { 1: hearingCheckV1 },
  CheckProgress: { 1: checkProgressV1 },
  SinCheck: { 1: sinCheckV1 },
  ExposureDay: { 1: exposureDayV1 },
  CaptionCache: { 1: captionCacheV1 },
  Backup: { 1: backupV1 },
};
