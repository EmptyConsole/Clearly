// Repositories: the only code that touches Dexie. Each read is migrated and validated with zod;
// a row that fails validation is reported and skipped, never passed on.

import {
  CAPTION_CACHE,
  EXPOSURE_DAY,
  SETTINGS,
  SIN_CHECK,
  type CaptionCacheEntry,
  type ExposureDay,
  type Settings,
  type SinCheck,
  CHECK_PROGRESS,
  CHECK_PROGRESS_TTL_MS,
  HEARING_CHECK,
  PROFILE,
  isProgressExpired,
  migrate,
  type CheckProgress,
  type HearingCheckRecord,
  type Profile,
  type VersionedSchema,
} from '@clearly/core';
import { z } from 'zod';
import { getDb, type Row } from './db.ts';
import { emitDataChanged } from './events.ts';

export class StorageError extends Error {
  override readonly name = 'StorageError';
}

function read<T>(def: VersionedSchema<T>, row: unknown): T | null {
  try {
    return migrate(def, row);
  } catch (e) {
    console.warn(`Skipped an unreadable ${def.name} record`, e);
    return null;
  }
}

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof StorageError) throw e;
    throw new StorageError(e instanceof Error ? e.message : String(e));
  }
}

const asRow = (doc: Row): Row => doc;

// Profiles ------------------------------------------------------------------------------------

export const profiles = {
  async get(id: string): Promise<Profile | null> {
    return guard(async () => {
      const row = await getDb().profiles.get(id);
      return row ? read(PROFILE, row) : null;
    });
  },
  async list(): Promise<Profile[]> {
    return guard(async () => {
      const rows = await getDb().profiles.toArray();
      return rows.map((r) => read(PROFILE, r)).filter((p): p is Profile => p !== null);
    });
  },
  async put(profile: Profile): Promise<void> {
    const valid = PROFILE.schema.parse(profile);
    await guard(() => getDb().profiles.put(asRow(valid)));
    emitDataChanged('profiles');
  },
  async delete(id: string): Promise<void> {
    await guard(() => getDb().profiles.delete(id));
    emitDataChanged('profiles');
  },
  async clear(): Promise<void> {
    await guard(() => getDb().profiles.clear());
  },
};

// Hearing checks ------------------------------------------------------------------------------

export const hearingChecks = {
  async get(id: string): Promise<HearingCheckRecord | null> {
    return guard(async () => {
      const row = await getDb().hearingChecks.get(id);
      return row ? read(HEARING_CHECK, row) : null;
    });
  },
  async list(): Promise<HearingCheckRecord[]> {
    return guard(async () => {
      const rows = await getDb().hearingChecks.orderBy('createdAt').toArray();
      return rows
        .map((r) => read(HEARING_CHECK, r))
        .filter((c): c is HearingCheckRecord => c !== null);
    });
  },
  async count(): Promise<number> {
    return guard(() => getDb().hearingChecks.count());
  },
  async put(record: HearingCheckRecord): Promise<void> {
    const valid = HEARING_CHECK.schema.parse(record);
    await guard(() => getDb().hearingChecks.put(asRow(valid)));
    emitDataChanged('hearingChecks');
  },
  async clear(): Promise<void> {
    await guard(() => getDb().hearingChecks.clear());
  },
};

// Paused check progress -----------------------------------------------------------------------

export const checkProgress = {
  /** The paused Refine, or null. Expired progress is deleted when read. */
  async get(id: string, now: Date = new Date()): Promise<CheckProgress | null> {
    return guard(async () => {
      const row = await getDb().checkProgress.get(id);
      if (!row) return null;
      const p = read(CHECK_PROGRESS, row);
      if (!p || isProgressExpired(p, now)) {
        await getDb().checkProgress.delete(id);
        return null;
      }
      return p;
    });
  },
  async put(p: CheckProgress): Promise<void> {
    const valid = CHECK_PROGRESS.schema.parse(p);
    await guard(() => getDb().checkProgress.put(asRow(valid)));
  },
  async delete(id: string): Promise<void> {
    await guard(() => getDb().checkProgress.delete(id));
  },
  /** Removes every expired entry. */
  async purgeExpired(now: Date = new Date()): Promise<void> {
    await guard(() =>
      getDb().checkProgress.where('expiresAt').belowOrEqual(now.toISOString()).delete(),
    );
  },
  expiryFrom(now: Date): string {
    return new Date(now.getTime() + CHECK_PROGRESS_TTL_MS).toISOString();
  },
};

// Speech-in-noise checks, exposure days, caption cache (M04 tables; filled by M07 and M08) -------

function table<T extends { readonly id: string }>(
  name: 'sinChecks' | 'exposureDays' | 'captionCache',
  def: VersionedSchema<T>,
) {
  return {
    async get(id: string): Promise<T | null> {
      return guard(async () => {
        const row = await getDb()[name].get(id);
        return row ? read(def, row) : null;
      });
    },
    async list(): Promise<T[]> {
      return guard(async () => {
        const rows = await getDb()[name].toArray();
        return rows.map((r) => read(def, r)).filter((x): x is T => x !== null);
      });
    },
    async put(doc: T): Promise<void> {
      const valid = def.schema.parse(doc);
      await guard(() => getDb()[name].put(asRow(valid)));
      emitDataChanged(name);
    },
    async delete(id: string): Promise<void> {
      await guard(() => getDb()[name].delete(id));
      emitDataChanged(name);
    },
    async clear(): Promise<void> {
      await guard(() => getDb()[name].clear());
      emitDataChanged(name);
    },
  };
}

export const sinChecks = table<SinCheck>('sinChecks', SIN_CHECK);
export const exposureDays = table<ExposureDay>('exposureDays', EXPOSURE_DAY);
export const captionCache = table<CaptionCacheEntry>('captionCache', CAPTION_CACHE);

// App settings (core's versioned Settings document, kept under one kv key) --------------------

export const appSettings = {
  async get(): Promise<Settings> {
    return guard(async () => {
      const row = await getDb().kv.get('settings');
      if (row) {
        const s = read(SETTINGS, row.value);
        if (s) return s;
      }
      return SETTINGS.schema.parse({ schemaVersion: SETTINGS.currentVersion });
    });
  },
  async put(s: Settings): Promise<void> {
    const valid = SETTINGS.schema.parse(s);
    await guard(() => getDb().kv.put({ key: 'settings', value: valid }));
    emitDataChanged('settings');
  },
};

// Key-value -----------------------------------------------------------------------------------

/** Known kv keys and their value schemas. Unknown or invalid values read as undefined. */
export const syncStateSchema = z.object({
  id: z.string().min(1).max(64),
  token: z.string().min(1).max(64),
  /** Server version this device last wrote or read. */
  version: z.number().int().min(1),
  includeHistory: z.boolean(),
  lastSyncedAt: z.string().nullable(),
  consentVersion: z.string().min(1).max(32),
  /** Local changes not yet accepted by the server. */
  dirty: z.boolean().default(false),
});
export type SyncState = z.infer<typeof syncStateSchema>;

export const KV = {
  activeProfileId: z.string().min(1).max(64),
  headphoneName: z.string().trim().min(1).max(100),
  persistRequested: z.boolean(),
  demoMode: z.boolean(),
  lastBackupAt: z.string(),
  backupReminder: z.boolean(),
  backupReminderSnoozedAt: z.string(),
  persistTipDismissed: z.boolean(),
  sync: syncStateSchema,
  /** Output-device label to the profile last used with it. */
  deviceProfiles: z.record(z.string().max(200), z.string().max(64)),
  /** Has the person been shown the share-link warning and accepted it this session. */
  shareWarningSeen: z.boolean(),
  /** "Don't show this again" on the tab-capture coach. */
  tabCoachHidden: z.boolean(),
  /** The person's answer to "does it work with the original tab muted?". */
  tabMuteWorks: z.boolean(),
  /** Chosen output device id (Clear Audio, Advanced). */
  outputDeviceId: z.string().max(200),
  /** Night mode schedule (works only while Clearly is open). */
  nightSchedule: z.object({ enabled: z.boolean(), time: z.string().regex(/^\d{2}:\d{2}$/) }),
  /** The one-time "Try Background cleanup" chip was dismissed. */
  cleanupHintDismissed: z.boolean(),
  /** Captions "Always on". */
  captionsAlways: z.boolean(),
  captionModel: z.enum(['standard', 'accurate']),
  captionsFirst: z.boolean(),
  trackerPaused: z.boolean(),
  veryLoudAlertMinutes: z.number().int().min(5).max(240),
  reminderMonths: z.number().int().min(0).max(24),
  reminderNotify: z.boolean(),
  lastRemindedAt: z.string(),
  captionDisplay: z.object({
    size: z.number().int().min(18).max(64),
    lines: z.number().int().min(1).max(3),
    scheme: z.enum(['white', 'yellow', 'dark']),
  }),
  /** Hum Filter mode (M09). */
  humMode: z.enum(['off', 'auto', '50', '60']),
  autoBoostSensitivity: z.enum(['low', 'medium', 'high']),
  calmKind: z.enum(['white', 'pink', 'brown', 'rain', 'ocean', 'tailored']),
  calmVolume: z.number().min(0).max(1),
  /** M10: the one-time install offer was shown (or dismissed). */
  installOfferShown: z.boolean(),
  /** M10: first-run flow progress. */
  onboarding: z.object({
    step: z.number().int().min(0).max(3),
    done: z.boolean(),
  }),
  /** M10: the last Clear Audio source kind, so Home can resume it. */
  lastSource: z.enum(['demo', 'file', 'tab']),
  /** M12 desktop app: the global shortcut (an Electron accelerator), or null when turned off. */
  desktopShortcut: z.string().max(100).nullable(),
} as const;
export type KvKey = keyof typeof KV;

export const kv = {
  async get<K extends KvKey>(key: K): Promise<z.infer<(typeof KV)[K]> | undefined> {
    return guard(async () => {
      const row = await getDb().kv.get(key);
      if (!row) return undefined;
      const parsed = KV[key].safeParse(row.value);
      return parsed.success ? (parsed.data as z.infer<(typeof KV)[K]>) : undefined;
    });
  },
  async set<K extends KvKey>(key: K, value: z.infer<(typeof KV)[K]>): Promise<void> {
    const valid: unknown = KV[key].parse(value);
    await guard(() => getDb().kv.put({ key, value: valid }));
  },
  async delete(key: KvKey): Promise<void> {
    await guard(() => getDb().kv.delete(key));
  },
};
