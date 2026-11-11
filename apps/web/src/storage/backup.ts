// "Back up my data" and "Restore from file": a versioned JSON document (core BACKUP schema).
// The same document is the payload the optional server stores.

import { BACKUP, BACKUP_KIND, BACKUP_VERSION, migrate, type Backup } from '@clearly/core';
import { getDb } from './db.ts';
import { emitDataChanged } from './events.ts';
import {
  appSettings,
  captionCache,
  exposureDays,
  hearingChecks,
  kv,
  profiles,
  sinChecks,
} from './repos.ts';

export interface BuildOptions {
  /** Listening exposure and the caption cache are included only when the person asks. */
  readonly includeHistory: boolean;
  readonly now?: Date;
}

export async function buildBackup(o: BuildOptions): Promise<Backup> {
  const [ps, checks, sins, settings, active] = await Promise.all([
    profiles.list(),
    hearingChecks.list(),
    sinChecks.list(),
    appSettings.get(),
    kv.get('activeProfileId'),
  ]);
  const doc: Backup = {
    schemaVersion: BACKUP_VERSION,
    kind: BACKUP_KIND,
    createdAt: (o.now ?? new Date()).toISOString(),
    activeProfileId: active ?? null,
    profiles: ps,
    hearingChecks: checks,
    sinChecks: sins,
    settings,
    ...(o.includeHistory
      ? { exposureDays: await exposureDays.list(), captionCache: await captionCache.list() }
      : {}),
  };
  return BACKUP.schema.parse(doc);
}

export class BackupFileError extends Error {
  override readonly name = 'BackupFileError';
}

/** Parses, migrates and validates a backup from text. Throws BackupFileError with a reason. */
export function parseBackup(text: string): Backup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupFileError('not-json');
  }
  if (!raw || typeof raw !== 'object' || (raw as { kind?: unknown }).kind !== BACKUP_KIND) {
    throw new BackupFileError('not-clearly');
  }
  try {
    return migrate(BACKUP, raw);
  } catch {
    throw new BackupFileError('invalid');
  }
}

export interface BackupPreview {
  readonly profiles: number;
  readonly hearingChecks: number;
  readonly sinChecks: number;
  readonly exposureDays: number;
  readonly createdAt: string;
  readonly profileNames: readonly string[];
}

export function previewBackup(b: Backup): BackupPreview {
  return {
    profiles: b.profiles.length,
    hearingChecks: b.hearingChecks.length,
    sinChecks: b.sinChecks.length,
    exposureDays: b.exposureDays?.length ?? 0,
    createdAt: b.createdAt,
    profileNames: b.profiles.map((p) => p.name),
  };
}

/**
 * Replaces local profiles, checks and settings with the backup's (after the person confirms).
 * Exposure days and captions are replaced only when the backup carries them.
 */
export async function applyBackup(b: Backup): Promise<void> {
  const db = getDb();
  await db.transaction(
    'rw',
    [db.profiles, db.hearingChecks, db.sinChecks, db.exposureDays, db.captionCache, db.kv],
    async () => {
      await db.profiles.clear();
      await db.hearingChecks.clear();
      await db.sinChecks.clear();
      for (const p of b.profiles) await db.profiles.put({ ...p });
      for (const c of b.hearingChecks) await db.hearingChecks.put({ ...c });
      for (const s of b.sinChecks) await db.sinChecks.put({ ...s });
      if (b.exposureDays) {
        await db.exposureDays.clear();
        for (const d of b.exposureDays) await db.exposureDays.put({ ...d });
      }
      if (b.captionCache) {
        await db.captionCache.clear();
        for (const c of b.captionCache) await db.captionCache.put({ ...c });
      }
      if (b.settings) await db.kv.put({ key: 'settings', value: b.settings });
      const active = b.activeProfileId ?? b.profiles[0]?.id ?? null;
      if (active) await db.kv.put({ key: 'activeProfileId', value: active });
      else await db.kv.delete('activeProfileId');
    },
  );
  emitDataChanged('profiles');
}

export function backupFileName(now: Date = new Date()): string {
  return `Clearly backup ${now.toISOString().slice(0, 10)}.json`;
}

export function backupBlob(b: Backup): Blob {
  return new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' });
}
