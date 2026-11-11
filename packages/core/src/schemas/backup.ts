// The backup document: the file "Back up my data" saves, the payload the optional server stores,
// and the shape a share link carries (profiles only). Versioned; nested records migrate too.

import { z } from 'zod';
import { PROFILE, SETTINGS, profileSchema, settingsSchema } from './base.ts';
import {
  exposureDaySchema,
  sinCheckSchema,
  captionCacheSchema,
  SIN_CHECK,
  EXPOSURE_DAY,
  CAPTION_CACHE,
} from './later.ts';
import { HEARING_CHECK, hearingCheckSchema } from './records.ts';
import { migrate, type JsonObject, type VersionedSchema } from './migrate.ts';

export const BACKUP_VERSION = 1;
export const BACKUP_KIND = 'clearly-backup';
/** Profiles per person (M04). */
export const MAX_PROFILES = 5;

export const backupSchema = z.object({
  schemaVersion: z.literal(BACKUP_VERSION),
  kind: z.literal(BACKUP_KIND),
  createdAt: z.iso.datetime({ offset: true }),
  activeProfileId: z.string().min(1).max(64).nullable(),
  profiles: z.array(profileSchema).max(MAX_PROFILES),
  hearingChecks: z.array(hearingCheckSchema).max(500),
  sinChecks: z.array(sinCheckSchema).max(500).default([]),
  settings: settingsSchema.nullable().default(null),
  /** Only when the person includes listening history. */
  exposureDays: z.array(exposureDaySchema).max(3700).optional(),
  captionCache: z.array(captionCacheSchema).max(200).optional(),
});
export type Backup = z.infer<typeof backupSchema>;

const each = <T>(def: VersionedSchema<T>, v: unknown): unknown =>
  Array.isArray(v) ? v.map((x) => migrate(def, x)) : v;

export const BACKUP: VersionedSchema<Backup> = {
  name: 'Backup',
  currentVersion: BACKUP_VERSION,
  schema: backupSchema,
  migrations: {},
  migrateNested: (doc: JsonObject): JsonObject => ({
    ...doc,
    profiles: each(PROFILE, doc['profiles']),
    hearingChecks: each(HEARING_CHECK, doc['hearingChecks']),
    sinChecks: each(SIN_CHECK, doc['sinChecks'] ?? []),
    settings: doc['settings'] == null ? null : migrate(SETTINGS, doc['settings']),
    ...(doc['exposureDays'] !== undefined
      ? { exposureDays: each(EXPOSURE_DAY, doc['exposureDays']) }
      : {}),
    ...(doc['captionCache'] !== undefined
      ? { captionCache: each(CAPTION_CACHE, doc['captionCache']) }
      : {}),
  }),
};
