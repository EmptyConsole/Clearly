// Schemas for the tables M04 creates and later milestones fill: speech-in-noise checks (M08),
// listening exposure per day (M08) and the caption cache (M07). Versioned like every other.

import { z } from 'zod';
import type { VersionedSchema } from './migrate.ts';

const isoDate = z.iso.datetime({ offset: true });

export const SIN_CHECK_VERSION = 1;
export const SIN_CATEGORIES = ['good', 'some', 'considerable'] as const;
export type SinCategory = (typeof SIN_CATEGORIES)[number];

export const sinCheckSchema = z.object({
  schemaVersion: z.literal(SIN_CHECK_VERSION),
  id: z.string().min(1).max(64),
  profileId: z.string().min(1).max(64).nullable(),
  createdAt: isoDate,
  headphoneName: z.string().trim().min(1).max(100),
  /** Speech reception threshold in dB SNR. */
  srtDb: z.number().min(-30).max(20),
  category: z.enum(SIN_CATEGORIES),
  /** The SNR of every triplet, in order. */
  snrsDb: z.array(z.number().min(-30).max(20)).max(64),
});
export type SinCheck = z.infer<typeof sinCheckSchema>;
export const SIN_CHECK: VersionedSchema<SinCheck> = {
  name: 'SinCheck',
  currentVersion: SIN_CHECK_VERSION,
  schema: sinCheckSchema,
  migrations: {},
};

export const EXPOSURE_DAY_VERSION = 1;
export const exposureDaySchema = z.object({
  schemaVersion: z.literal(EXPOSURE_DAY_VERSION),
  /** Local date, YYYY-MM-DD. */
  id: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  comfortableMinutes: z.number().min(0).max(1440),
  loudMinutes: z.number().min(0).max(1440),
  veryLoudMinutes: z.number().min(0).max(1440),
  /** True once the daily alert has fired on this day. */
  alerted: z.boolean().default(false),
});
export type ExposureDay = z.infer<typeof exposureDaySchema>;
export const EXPOSURE_DAY: VersionedSchema<ExposureDay> = {
  name: 'ExposureDay',
  currentVersion: EXPOSURE_DAY_VERSION,
  schema: exposureDaySchema,
  migrations: {},
};

export const CAPTION_CACHE_VERSION = 1;
export const captionSegmentSchema = z.object({
  start: z.number().min(0),
  end: z.number().min(0),
  text: z.string().max(2000),
});
export const captionCacheSchema = z.object({
  schemaVersion: z.literal(CAPTION_CACHE_VERSION),
  /** File hash (see apps/web src/storage/fileHash.ts). */
  id: z.string().min(16).max(128),
  createdAt: isoDate,
  model: z.string().min(1).max(64),
  /** Seconds of the file transcribed so far. */
  coveredSeconds: z.number().min(0),
  durationSeconds: z.number().min(0),
  segments: z.array(captionSegmentSchema).max(100_000),
});
export type CaptionCacheEntry = z.infer<typeof captionCacheSchema>;
export const CAPTION_CACHE: VersionedSchema<CaptionCacheEntry> = {
  name: 'CaptionCache',
  currentVersion: CAPTION_CACHE_VERSION,
  schema: captionCacheSchema,
  migrations: {},
};
