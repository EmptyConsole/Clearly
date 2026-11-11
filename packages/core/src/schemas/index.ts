// zod schemas for everything core persists, each with schemaVersion and migrations.
// base.ts: Audiogram, Calibration, Profile, Settings (M01). records.ts: Hearing Check records and
// paused-check progress (M03).

import { AUDIOGRAM, CALIBRATION, PROFILE, SETTINGS } from './base.ts';
import { CHECK_PROGRESS, HEARING_CHECK } from './records.ts';
import { CAPTION_CACHE, EXPOSURE_DAY, SIN_CHECK } from './later.ts';
import { BACKUP } from './backup.ts';

export * from './base.ts';
export * from './records.ts';
export * from './later.ts';
export * from './backup.ts';
export { migrate, missingMigrations, MigrationError } from './migrate.ts';
export type { JsonObject, VersionedSchema } from './migrate.ts';

export const VERSIONED_SCHEMAS = [
  AUDIOGRAM,
  CALIBRATION,
  PROFILE,
  SETTINGS,
  HEARING_CHECK,
  CHECK_PROGRESS,
  SIN_CHECK,
  EXPOSURE_DAY,
  CAPTION_CACHE,
  BACKUP,
] as const;
