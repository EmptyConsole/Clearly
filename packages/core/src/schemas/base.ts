// zod schemas for everything core persists (M01 section 1). Each has schemaVersion and a
// VersionedSchema definition with migrations. Version 1 is the first version, so there are no
// migration steps yet; the harness in schemas.test.ts fails if a later version is added without
// a migration and a fixture.

import { z } from 'zod';
import {
  BAND_COUNT,
  CALIBRATION_MAX_DBFS,
  CALIBRATION_MIN_DBFS,
  CAP_DEFAULT_DB,
  CAP_MAX_DB,
  CAP_MIN_DB,
  LOUDEST_LIMIT_DEFAULT_DBFS,
  LOUDEST_LIMIT_MAX_DBFS,
  LOUDEST_LIMIT_MIN_DBFS,
  AMBIENT_BOOST_MAX_DB,
  STRENGTH_DEFAULT,
  STRENGTH_MAX,
  STRENGTH_MIN,
} from '../constants.ts';
import { RELIABILITY_LEVELS } from '../hearing/reliability.ts';
import { BOOST_STYLES } from '../sound/gain.ts';
import { NIGHT_MODE_LEVELS, PRESET_IDS } from '../sound/presets.ts';
import { migrate, type JsonObject, type VersionedSchema } from './migrate.ts';

const bands = <T extends z.ZodType>(item: T) => z.array(item).length(BAND_COUNT);
const isoDate = z.iso.datetime({ offset: true });

// ---------------------------------------------------------------------------------------------
// Audiogram

export const AUDIOGRAM_VERSION = 1;

/** A measured threshold, kept in both units so a later Refine can re-seed under a new Lc. */
export const measuredThresholdSchema = z.object({
  dbfs: z.number().min(-120).max(20),
  relLc: z.number().min(-120).max(120),
  sdDb: z.number().min(0).max(60),
});

export const earAudiogramSchema = z.object({
  /** Loss in dB at 250, 500, 1000, 2000, 3000, 4000, 6000, 8000 Hz. */
  lossDb: bands(z.number().min(0).max(120)),
  /** Per-band uncertainty in dB; null where the band was estimated between measured points. */
  uncertaintyDb: bands(z.number().min(0).max(60).nullable()),
  /** Measured thresholds per band; null where not measured. */
  thresholds: bands(measuredThresholdSchema.nullable()),
});

export const audiogramSchema = z
  .object({
    schemaVersion: z.literal(AUDIOGRAM_VERSION),
    method: z.enum(['starter', 'express', 'refine']),
    /** Null only for starter audiograms, which are not measured. */
    reliability: z.enum(RELIABILITY_LEVELS).nullable(),
    createdAt: isoDate,
    ears: z.object({ left: earAudiogramSchema, right: earAudiogramSchema }),
  })
  .refine((a) => (a.method === 'starter') === (a.reliability === null), {
    message: 'reliability is null exactly when the method is starter',
    path: ['reliability'],
  });
export type Audiogram = z.infer<typeof audiogramSchema>;
export type EarAudiogram = z.infer<typeof earAudiogramSchema>;

export const AUDIOGRAM: VersionedSchema<Audiogram> = {
  name: 'Audiogram',
  currentVersion: AUDIOGRAM_VERSION,
  schema: audiogramSchema,
  migrations: {},
};

// ---------------------------------------------------------------------------------------------
// Calibration

export const CALIBRATION_VERSION = 1;

export const calibrationSchema = z.object({
  schemaVersion: z.literal(CALIBRATION_VERSION),
  /** Calibration level Lc in dBFS. Calibration stops at -12 dBFS. */
  lcDbfs: z.number().min(CALIBRATION_MIN_DBFS).max(CALIBRATION_MAX_DBFS),
  headphoneName: z.string().trim().min(1).max(100),
  date: isoDate,
});
export type Calibration = z.infer<typeof calibrationSchema>;

export const CALIBRATION: VersionedSchema<Calibration> = {
  name: 'Calibration',
  currentVersion: CALIBRATION_VERSION,
  schema: calibrationSchema,
  migrations: {},
};

// ---------------------------------------------------------------------------------------------
// Profile

export const PROFILE_VERSION = 1;

const unit = z.number().min(0).max(1);

/** Manual changes the person made, remembered per profile (see sound/precedence.ts). */
export const settingsOverridesSchema = z.object({
  strength: z.number().min(STRENGTH_MIN).max(STRENGTH_MAX).optional(),
  compressorRatio: z.number().min(1).max(20).optional(),
  compressorThresholdDbfs: z.number().min(-60).max(0).optional(),
  compressorKneeDb: z.number().min(0).max(40).optional(),
  cleanupStrength: unit.optional(),
  voiceFocus: unit.optional(),
  nightMode: z.enum(NIGHT_MODE_LEVELS).optional(),
  /**
   * Per-ear, per-band adjustments from Clear Audio's Advanced panel, in dB, added to the personal
   * EQ before the summed-boost clamp. Optional and additive, so version 1 documents stay valid.
   */
  bandAdjustDb: z
    .object({
      left: bands(z.number().min(-12).max(12)),
      right: bands(z.number().min(-12).max(12)),
    })
    .optional(),
});
export type SettingsOverrides = z.infer<typeof settingsOverridesSchema>;

const compensationRow = bands(z.number().min(-30).max(30));
const zeroRow = (): number[] => Array.from({ length: BAND_COUNT }, () => 0);

export const profileSchema = z.object({
  schemaVersion: z.literal(PROFILE_VERSION),
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(60),
  headphoneName: z.string().trim().min(1).max(100),
  audiogram: audiogramSchema,
  /** Null for a starter profile made without calibration. */
  calibration: calibrationSchema.nullable(),
  settingsOverrides: settingsOverridesSchema.default({}),
  boostStyle: z.enum(BOOST_STYLES).default('standard'),
  capDb: z.number().min(CAP_MIN_DB).max(CAP_MAX_DB).default(CAP_DEFAULT_DB),
  strength: z.number().min(STRENGTH_MIN).max(STRENGTH_MAX).default(STRENGTH_DEFAULT),
  /** Per-ear, per-band headphone correction in dB. Zeros until a correction table exists. */
  headphoneCompensation: z
    .object({ left: compensationRow, right: compensationRow })
    .default(() => ({ left: zeroRow(), right: zeroRow() })),
  /** Pitch matched to the person's ringing (tinnitus), if they chose to match it. */
  ringingPitchHz: z.number().min(125).max(16000).optional(),
});
export type Profile = z.infer<typeof profileSchema>;

export const PROFILE: VersionedSchema<Profile> = {
  name: 'Profile',
  currentVersion: PROFILE_VERSION,
  schema: profileSchema,
  migrations: {},
  migrateNested: (doc: JsonObject): JsonObject => ({
    ...doc,
    audiogram: migrate(AUDIOGRAM, doc['audiogram']),
    calibration: doc['calibration'] == null ? null : migrate(CALIBRATION, doc['calibration']),
  }),
};

// ---------------------------------------------------------------------------------------------
// Settings (app-wide)

export const SETTINGS_VERSION = 1;

export const settingsSchema = z.object({
  schemaVersion: z.literal(SETTINGS_VERSION),
  activeProfileId: z.string().min(1).max(64).nullable().default(null),
  preset: z.enum(PRESET_IDS).default('movie'),
  ambientBoostDb: z.number().min(0).max(AMBIENT_BOOST_MAX_DB).default(0),
  loudestLimitDbfs: z
    .number()
    .min(LOUDEST_LIMIT_MIN_DBFS)
    .max(LOUDEST_LIMIT_MAX_DBFS)
    .default(LOUDEST_LIMIT_DEFAULT_DBFS),
  /** Hearing Check pace. "auto" turns Slower pace on for the 70-79 and 80-plus age ranges. */
  pace: z.enum(['auto', 'normal', 'slower']).default('auto'),
});
export type Settings = z.infer<typeof settingsSchema>;

export const SETTINGS: VersionedSchema<Settings> = {
  name: 'Settings',
  currentVersion: SETTINGS_VERSION,
  schema: settingsSchema,
  migrations: {},
};
