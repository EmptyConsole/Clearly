import { useEffect, useState } from 'react';
import { t } from '../copy/en.ts';
import { useBackupDownload } from '../settings/useBackup.ts';
import { hearingChecks, kv } from '../storage/repos.ts';
import { Button, ButtonLink } from '../ui/Button.tsx';
import { checkReminderDue, markReminded } from '../health/reminders.ts';
import { Card } from '../ui/Card.tsx';
import { backupReminderDue, isStandalone, persistTipDue } from './homeCards.ts';

/** The backup reminder (every 30 days) and the one-time storage tip. At most one shows. */
export function HomeNotices({ hasProfile }: { hasProfile: boolean }) {
  const download = useBackupDownload();
  const [show, setShow] = useState<'reminder' | 'tip' | 'check' | null>(null);

  useEffect(() => {
    const state = { live: true };
    void (async () => {
      const [enabled, last, snoozed, dismissed, checks] = await Promise.all([
        kv.get('backupReminder'),
        kv.get('lastBackupAt'),
        kv.get('backupReminderSnoozedAt'),
        kv.get('persistTipDismissed'),
        hearingChecks.list(),
      ]);
      const storage = navigator.storage as StorageManager | undefined;
      const persisted =
        storage && typeof storage.persisted === 'function'
          ? await storage.persisted().catch(() => null)
          : null;
      if (!state.live) return;
      const reminder = backupReminderDue({
        enabled: enabled ?? true,
        hasProfile,
        lastBackupAt: last ?? null,
        snoozedAt: snoozed ?? null,
        firstDataAt: checks[0]?.createdAt ?? null,
        now: new Date(),
      });
      if (hasProfile && (await checkReminderDue())) setShow('check');
      else if (reminder) setShow('reminder');
      else if (
        hasProfile &&
        persistTipDue({ persisted, standalone: isStandalone(), dismissed: dismissed ?? false })
      )
        setShow('tip');
    })().catch(() => undefined);
    return () => {
      state.live = false;
    };
  }, [hasProfile]);

  if (show === 'check') {
    return (
      <Card className="mt-4">
        <h2 className="text-xl">{t('reminder.check.title')}</h2>
        <p className="mt-1">{t('reminder.check.body')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <ButtonLink to="/check/before" onClick={() => void markReminded()}>
            {t('reminder.check.action')}
          </ButtonLink>
          <Button
            variant="secondary"
            onClick={() => {
              void markReminded();
              setShow(null);
            }}
          >
            {t('reminder.later')}
          </Button>
        </div>
      </Card>
    );
  }
  if (show === 'reminder') {
    return (
      <Card className="mt-4">
        <h2 className="text-xl">{t('reminder.title')}</h2>
        <p className="mt-1">{t('reminder.body')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            onClick={() => {
              void download().then(() => {
                setShow(null);
              });
            }}
          >
            {t('reminder.action')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              void kv.set('backupReminderSnoozedAt', new Date().toISOString());
              setShow(null);
            }}
          >
            {t('reminder.later')}
          </Button>
        </div>
      </Card>
    );
  }
  if (show === 'tip') {
    return (
      <Card className="mt-4">
        <p>{t('tip.persist')}</p>
        <Button
          variant="secondary"
          className="mt-2"
          onClick={() => {
            void kv.set('persistTipDismissed', true);
            setShow(null);
          }}
        >
          {t('tip.dismiss')}
        </Button>
      </Card>
    );
  }
  return null;
}
