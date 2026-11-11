// Stored Hearing Check records and paused-check progress (M03). Same rules as index.ts: every
// document has schemaVersion and a VersionedSchema with migrations and a fixture per version.

import { z } from 'zod';
import { AGE_RANGES } from '../tables.ts';
import { audiogramSchema, AUDIOGRAM } from './base.ts';
import { migrate, type JsonObject, type VersionedSchema } from './migrate.ts';
import type { SessionResult } from '../estimator/types.ts';

const isoDate = z.iso.datetime({ offset: true });
const ear = z.enum(['left', 'right']);

/** zod mirror of SessionResult, stored so a later Refine can seed from an Express result. */
export const trackResultSchema = z.object({
  trackId: z.string().min(1).max(32),
  ear,
  hz: z.number().int().min(125).max(16000),
  thresholdDbfs: z.number().min(-200).max(50),
  thresholdRelLc: z.number().min(-200).max(200),
  sdDb: z.number().min(0).max(100),
  trials: z.number().int().min(0).max(1000),
  massBelowFloor: z.number().min(0).max(1),
  massAboveCeiling: z.number().min(0).max(1),
  heardAtQuietest: z.boolean(),
  noResponseAtLoudest: z.boolean(),
});

export const sessionResultSchema = z.object({
  method: z.enum(['express', 'refine']),
  lcDbfs: z.number().min(-120).max(0),
  tracks: z.array(trackResultSchema).max(32).readonly(),
  catchHistory: z.object({
    catchTrials: z.number().int().min(0),
    falseAlarms: z.number().int().min(0),
  }),
  guessRate: z.number().min(0).max(1),
  totalTrials: z.number().int().min(0),
  toneTrials: z.number().int().min(0),
  catchTrials: z.number().int().min(0),
  heardToneTrials: z.number().int().min(0),
}) satisfies z.ZodType<SessionResult>;

export const HEARING_CHECK_VERSION = 1;

/**
 * What the check was played through. Absent on older records, which were all headphones.
 * 'speakers': both ears together, so the two ears read the same (mirrorEars).
 */
export const CHECK_OUTPUTS = ['headphones', 'speakers'] as const;
export type CheckOutput = (typeof CHECK_OUTPUTS)[number];

export const hearingCheckSchema = z.object({
  schemaVersion: z.literal(HEARING_CHECK_VERSION),
  id: z.string().min(1).max(64),
  profileId: z.string().min(1).max(64),
  createdAt: isoDate,
  headphoneName: z.string().trim().min(1).max(100),
  ageRange: z.enum(AGE_RANGES).nullable(),
  /** Null for a Starter check (no calibration). */
  lcDbfs: z.number().min(-120).max(0).nullable(),
  audiogram: audiogramSchema,
  /** The estimator's output, kept so Refine can seed from it. Null for Starter. */
  session: sessionResultSchema.nullable(),
  output: z.enum(CHECK_OUTPUTS).optional(),
});
export type HearingCheckRecord = z.infer<typeof hearingCheckSchema>;

export const HEARING_CHECK: VersionedSchema<HearingCheckRecord> = {
  name: 'HearingCheck',
  currentVersion: HEARING_CHECK_VERSION,
  schema: hearingCheckSchema,
  migrations: {},
  migrateNested: (doc: JsonObject): JsonObject => ({
    ...doc,
    audiogram: migrate(AUDIOGRAM, doc['audiogram']),
  }),
};

export const CHECK_PROGRESS_VERSION = 1;
/** Paused Refine progress expires after 24 hours. */
export const CHECK_PROGRESS_TTL_MS = 24 * 60 * 60 * 1000;

export const checkProgressSchema = z.object({
  schemaVersion: z.literal(CHECK_PROGRESS_VERSION),
  id: z.string().min(1).max(64),
  profileId: z.string().min(1).max(64),
  method: z.literal('refine'),
  createdAt: isoDate,
  expiresAt: isoDate,
  headphoneName: z.string().trim().min(1).max(100),
  ageRange: z.enum(AGE_RANGES).nullable(),
  lcDbfs: z.number().min(-120).max(0),
  rngSeed: z.number().int().min(0).max(0xffffffff),
  /** The Express result this Refine was seeded from. */
  seed: sessionResultSchema,
  /** Every answer so far, in order; replayed with restoreSession. */
  responses: z.array(z.boolean()).max(2000),
  output: z.enum(CHECK_OUTPUTS).optional(),
});
export type CheckProgress = z.infer<typeof checkProgressSchema>;

export const CHECK_PROGRESS: VersionedSchema<CheckProgress> = {
  name: 'CheckProgress',
  currentVersion: CHECK_PROGRESS_VERSION,
  schema: checkProgressSchema,
  migrations: {},
};

/** True when paused progress is past its 24-hour expiry at `now`. */
export function isProgressExpired(p: Pick<CheckProgress, 'expiresAt'>, now: Date): boolean {
  return Date.parse(p.expiresAt) <= now.getTime();
}
