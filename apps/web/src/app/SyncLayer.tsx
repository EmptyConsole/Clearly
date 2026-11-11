import { useEffect } from 'react';
import { t } from '../copy/en.ts';
import { formatDateTime } from '../settings/format.ts';
import { useSyncStore } from '../sync/syncStore.ts';
import { Button } from '../ui/Button.tsx';
import { Dialog } from '../ui/Dialog.tsx';
import { ToastHost } from '../ui/ToastHost.tsx';
import { notifyIfDue } from '../health/reminders.ts';

/**
 * Loaded lazily by the layout: the calm "Not backed up yet" banner when the server cannot be
 * reached, and the conflict dialog. Never blocks the app.
 */
export default function SyncLayer() {
  const sync = useSyncStore();
  useEffect(() => {
    if (!sync.loaded) void sync.load();
  }, [sync]);
  useEffect(() => {
    void notifyIfDue().catch(() => undefined);
  }, []);
  if (!sync.state) return <ToastHost />;
  const c = sync.conflict;
  return (
    <>
      <ToastHost />
      {sync.status === 'offline' || sync.status === 'error' ? (
        <div role="status" className="border-b border-border bg-surface-sunken">
          <div className="mx-auto flex w-full max-w-content flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1 tablet:px-4">
            <p className="font-semibold">{t('sync.offline')}</p>
            <p className="text-text-muted">{t('sync.offlineBody')}</p>
            <Button variant="quiet" onClick={() => void sync.syncNow()}>
              {t('sync.retry')}
            </Button>
          </div>
        </div>
      ) : null}
      <Dialog
        open={c !== null}
        onOpenChange={() => undefined}
        title={t('sync.conflictTitle')}
        description={t('sync.conflictBody')}
      >
        {c ? (
          <div className="flex flex-col gap-3">
            <div>
              <Button onClick={() => void sync.resolve('local')}>{t('sync.conflictLocal')}</Button>
              <p className="mt-1 text-sm text-text-muted">
                {t('sync.conflictLocalDate', { date: formatDateTime(c.local.createdAt) })}
              </p>
            </div>
            <div>
              <Button variant="secondary" onClick={() => void sync.resolve('remote')}>
                {t('sync.conflictRemote')}
              </Button>
              <p className="mt-1 text-sm text-text-muted">
                {t('sync.conflictRemoteDate', { date: formatDateTime(c.remoteUpdatedAt) })}
              </p>
            </div>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
