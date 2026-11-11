import { type Backup } from '@clearly/core';
import { useEffect, useRef, useState } from 'react';
import { t, type MessageId } from '../copy/en.ts';
import { usePlatform } from '../platform/context.ts';
import { applyBackup, BackupFileError, parseBackup, previewBackup } from '../storage/backup.ts';
import { kv } from '../storage/repos.ts';
import { useProfileStore } from '../store/profileStore.ts';
import { Button } from '../ui/Button.tsx';
import { Dialog } from '../ui/Dialog.tsx';
import { StatusLine } from '../ui/StatusLine.tsx';
import { Switch } from '../ui/Switch.tsx';
import { Section } from './Section.tsx';
import { useBackupDownload } from './useBackup.ts';
import { formatBytes, formatDate } from './format.ts';

type Persist = 'yes' | 'no' | 'unknown';

export function StorageSection() {
  const platform = usePlatform();
  const download = useBackupDownload();
  const reloadProfiles = useProfileStore((s) => s.load);
  const [estimate, setEstimate] = useState<{ used: number; quota: number } | null>(null);
  const [persist, setPersist] = useState<Persist>('unknown');
  const [status, setStatus] = useState('');
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [reminder, setReminder] = useState(true);
  const [pending, setPending] = useState<Backup | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    const storage = navigator.storage as StorageManager | undefined;
    if (storage && typeof storage.estimate === 'function') {
      const e = await storage.estimate().catch(() => null);
      if (e?.usage !== undefined && e.quota !== undefined)
        setEstimate({ used: e.usage, quota: e.quota });
    }
    if (storage && typeof storage.persisted === 'function') {
      setPersist((await storage.persisted().catch(() => false)) ? 'yes' : 'no');
    }
    setLastBackup((await kv.get('lastBackupAt')) ?? null);
    setReminder((await kv.get('backupReminder')) ?? true);
  };

  useEffect(() => {
    // Deferred so no state is set synchronously inside the effect.
    void Promise.resolve().then(refresh);
  }, []);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      setPending(parseBackup(await file.text()));
      setStatus('');
    } catch (e) {
      const reason = e instanceof BackupFileError ? e.message : 'invalid';
      setStatus(t(`storage.restoreBad.${reason}` as MessageId));
    }
  };

  const preview = pending ? previewBackup(pending) : null;
  return (
    <Section title={t('storage.title')} id="storage">
      <div>
        <p>
          {estimate
            ? t('storage.used', {
                used: formatBytes(estimate.used),
                quota: formatBytes(estimate.quota),
              })
            : t('storage.usedUnknown')}
        </p>
        <p className="mt-1">
          {persist === 'yes'
            ? t('storage.persisted')
            : persist === 'no'
              ? t('storage.notPersisted')
              : t('storage.persistUnknown')}
        </p>
        {persist === 'no' ? (
          <Button
            variant="secondary"
            className="mt-2"
            onClick={() => {
              void platform.requestPersistentStorage().then((r) => {
                if (r !== 'granted') setStatus(t('storage.persistDenied'));
                void refresh();
              });
            }}
          >
            {t('storage.persistAsk')}
          </Button>
        ) : null}
      </div>

      <div>
        <Button
          onClick={() => {
            void download()
              .then(() => {
                setStatus(t('storage.backupDone'));
                void refresh();
              })
              .catch(() => {
                setStatus(t('error.storage.body'));
              });
          }}
        >
          {t('storage.backup')}
        </Button>
        <p className="mt-1 text-text-muted">{t('storage.backupHint')}</p>
        <p className="mt-1">
          {lastBackup
            ? t('storage.lastBackup', { date: formatDate(lastBackup) })
            : t('storage.noBackup')}
        </p>
      </div>

      <div>
        <Button
          variant="secondary"
          onClick={() => {
            fileRef.current?.click();
          }}
        >
          {t('storage.restore')}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          tabIndex={-1}
          aria-label={t('storage.restore')}
          data-testid="restore-file"
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <p className="mt-1 text-text-muted">{t('storage.restoreHint')}</p>
      </div>

      <Switch
        checked={reminder}
        onCheckedChange={(v) => {
          setReminder(v);
          void kv.set('backupReminder', v);
        }}
        label={t('storage.reminder')}
        hint={t('storage.reminderHint')}
      />
      <StatusLine>{status}</StatusLine>

      <Dialog
        open={pending !== null}
        onOpenChange={(o) => {
          if (!o) setPending(null);
        }}
        title={t('storage.restoreTitle')}
      >
        {preview ? (
          <div className="flex flex-col gap-2">
            <p>
              {t('storage.restoreSummary', {
                date: formatDate(preview.createdAt),
                profiles: preview.profiles,
                names: preview.profileNames.join(', ') || '-',
                checks: preview.hearingChecks,
                sin: preview.sinChecks,
              })}
            </p>
            {preview.exposureDays > 0 ? (
              <p>{t('storage.restoreHistory', { days: preview.exposureDays })}</p>
            ) : null}
            <p className="font-semibold">{t('storage.restoreWarning')}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  const b = pending;
                  if (!b) return;
                  void applyBackup(b)
                    .then(() => reloadProfiles())
                    .then(() => {
                      setPending(null);
                      setStatus(t('storage.restoreDone'));
                    });
                }}
              >
                {t('storage.restoreConfirm')}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setPending(null);
                }}
              >
                {t('settings.cancel')}
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </Section>
  );
}
