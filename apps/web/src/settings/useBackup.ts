import { useCallback } from 'react';
import { usePlatform } from '../platform/context.ts';
import { backupBlob, backupFileName, buildBackup } from '../storage/backup.ts';
import { kv } from '../storage/repos.ts';

/** Builds a backup file and saves it through the platform adapter. Records the date. */
export function useBackupDownload(): (includeHistory?: boolean) => Promise<void> {
  const platform = usePlatform();
  return useCallback(
    async (includeHistory = true) => {
      const doc = await buildBackup({ includeHistory });
      await platform.saveFile(backupBlob(doc), {
        suggestedName: backupFileName(),
        mimeType: 'application/json',
      });
      await kv.set('lastBackupAt', new Date().toISOString());
    },
    [platform],
  );
}
