import { normaliseRestoreCode } from '@clearly/core';
import { useState } from 'react';
import { t } from '../copy/en.ts';
import { previewBackup } from '../storage/backup.ts';
import { ApiError } from '../sync/api.ts';
import { useSyncStore, type PendingRestore } from '../sync/syncStore.ts';
import { Button, ButtonLink } from '../ui/Button.tsx';
import { Card } from '../ui/Card.tsx';
import { PageBody, PageHeading } from '../ui/Page.tsx';
import { StatusLine } from '../ui/StatusLine.tsx';
import { TextField } from '../ui/TextField.tsx';
import { formatDate } from './format.ts';

export function RestorePage() {
  const redeem = useSyncStore((s) => s.redeem);
  const confirm = useSyncStore((s) => s.confirmRestore);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingRestore | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const find = () => {
    if (!normaliseRestoreCode(code)) {
      setError(t('restore.invalid'));
      return;
    }
    setError(null);
    setBusy(true);
    redeem(code)
      .then(setPending)
      .catch((e: unknown) => {
        const kind = e instanceof ApiError ? e.kind : 'server';
        setError(
          kind === 'not-found'
            ? t('restore.notFound')
            : kind === 'rate-limited'
              ? t('restore.limited')
              : kind === 'offline'
                ? t('sync.unreachable')
                : t('sync.error'),
        );
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const preview = pending ? previewBackup(pending.backup) : null;
  return (
    <PageBody>
      <PageHeading>{t('restore.title')}</PageHeading>
      <p className="mt-2 text-lg">{t('restore.lead')}</p>
      {done ? (
        <div className="mt-4">
          <StatusLine className="font-semibold">{t('restore.done')}</StatusLine>
          <ButtonLink to="/" className="mt-2">
            {t('nav.home')}
          </ButtonLink>
        </div>
      ) : preview && pending ? (
        <Card className="mt-4">
          <h2 className="text-2xl">{t('restore.previewTitle')}</h2>
          <p className="mt-2">
            {t('storage.restoreSummary', {
              date: formatDate(preview.createdAt),
              profiles: preview.profiles,
              names: preview.profileNames.join(', ') || '-',
              checks: preview.hearingChecks,
              sin: preview.sinChecks,
            })}
          </p>
          <p className="mt-2 font-semibold">{t('storage.restoreWarning')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              onClick={() => {
                void confirm(pending).then(() => {
                  setDone(true);
                });
              }}
            >
              {t('restore.confirm')}
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
        </Card>
      ) : (
        <form
          className="mt-4 flex flex-col items-start gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            find();
          }}
        >
          <TextField
            label={t('restore.label')}
            hint={t('restore.hint')}
            error={error}
            value={code}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={20}
            onChange={(e) => {
              setCode(e.target.value);
            }}
            className="w-full"
          />
          <Button type="submit" disabled={busy}>
            {t('restore.find')}
          </Button>
        </form>
      )}
    </PageBody>
  );
}
