import { formatRestoreCode } from '@clearly/core';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { t } from '../copy/en.ts';
import { isDemoId } from '../store/demoProfiles.ts';
import { useProfileStore } from '../store/profileStore.ts';
import { shareUrl } from '../storage/shareLink.ts';
import { ApiError } from '../sync/api.ts';
import { useRetentionMonths } from '../sync/useRetention.ts';
import { useSyncStore } from '../sync/syncStore.ts';
import { Button } from '../ui/Button.tsx';
import { Card } from '../ui/Card.tsx';
import { Checkbox } from '../ui/Checkbox.tsx';
import { Dialog } from '../ui/Dialog.tsx';
import { StatusLine } from '../ui/StatusLine.tsx';
import { Switch } from '../ui/Switch.tsx';
import { Section } from './Section.tsx';
import { formatDateTime } from './format.ts';

function useCountdown(until: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(id);
    };
  }, [until]);
  return until ? Math.max(0, Date.parse(until) - now) : 0;
}

function hms(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0
    ? `${h} h ${String(m).padStart(2, '0')} min`
    : `${m} min ${String(s % 60).padStart(2, '0')} s`;
}

export function SyncSection() {
  const sync = useSyncStore();
  const active = useProfileStore((s) => s.active);
  const months = useRetentionMonths();
  const [consent, setConsent] = useState(false);
  const [tried, setTried] = useState(false);
  const [status, setStatus] = useState('');
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const left = useCountdown(code?.expiresAt ?? null);

  useEffect(() => {
    if (!sync.loaded) void sync.load();
  }, [sync]);

  const fail = (e: unknown) => {
    setStatus(
      e instanceof ApiError && e.kind === 'offline' ? t('sync.unreachable') : t('sync.error'),
    );
  };

  const getCode = () => {
    sync
      .restoreCode()
      .then((c) => {
        setCode(c);
        setStatus('');
      })
      .catch(fail);
  };

  return (
    <Section title={t('sync.title')} id="sync">
      <p>{t('sync.body', { months })}</p>
      {!sync.state ? (
        <div className="flex flex-col items-start gap-3">
          <Checkbox checked={consent} onCheckedChange={setConsent} required>
            {t('sync.consent')}
          </Checkbox>
          {tried && !consent ? (
            <p className="font-semibold text-danger">{t('sync.consentNeeded')}</p>
          ) : null}
          <Button
            onClick={() => {
              setTried(true);
              if (!consent) return;
              sync
                .enable(false)
                .then(() => {
                  setStatus(t('sync.on'));
                })
                .catch(fail);
            }}
          >
            {t('sync.turnOn')}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-4">
          <p className="font-semibold">{t('sync.on')}</p>
          <p className="text-text-muted">
            {sync.status === 'pending'
              ? t('sync.pending')
              : sync.status === 'syncing'
                ? t('sync.syncing')
                : sync.state.lastSyncedAt
                  ? t('sync.lastSynced', { date: formatDateTime(sync.state.lastSyncedAt) })
                  : ''}
          </p>
          <Switch
            checked={sync.state.includeHistory}
            onCheckedChange={(v) => void sync.setIncludeHistory(v)}
            label={t('sync.history')}
            hint={t('sync.historyHint')}
          />
          {code ? (
            <Card className="w-full">
              <h3 className="text-xl">{t('sync.codeTitle')}</h3>
              <p
                className="mt-2 font-mono text-3xl font-bold tracking-heading"
                data-testid="restore-code"
                aria-label={formatRestoreCode(code.code).split('').join(' ')}
              >
                {formatRestoreCode(code.code)}
              </p>
              <p className="mt-2">{t('sync.codeHelp')}</p>
              <p className="mt-1 text-text-muted" aria-live="off">
                {left > 0 ? t('sync.codeExpires', { time: hms(left) }) : t('sync.codeExpired')}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(formatRestoreCode(code.code))
                      .then(() => {
                        setStatus(t('sync.copied'));
                      })
                      .catch(() => undefined);
                  }}
                >
                  {t('sync.copy')}
                </Button>
                <Button variant="secondary" onClick={getCode}>
                  {t('sync.newCode')}
                </Button>
              </div>
            </Card>
          ) : (
            <Button onClick={getCode}>{t('sync.getCode')}</Button>
          )}
          <div>
            <Button
              variant="secondary"
              onClick={() => {
                sync
                  .signOutOthers()
                  .then(() => {
                    setStatus(t('sync.signOutDone'));
                  })
                  .catch(fail);
              }}
            >
              {t('sync.signOut')}
            </Button>
            <p className="mt-1 text-sm text-text-muted">{t('sync.signOutHint')}</p>
          </div>
          <Button
            variant="quiet"
            onClick={() => {
              setConfirmDelete(true);
            }}
          >
            {t('sync.delete')}
          </Button>
        </div>
      )}
      <p>
        <Link to="/restore">{t('restore.link')}</Link>
      </p>
      {active && !isDemoId(active.id) ? (
        <div>
          <Button
            variant="secondary"
            onClick={() => {
              setShareOpen(true);
            }}
          >
            {t('sync.share')}
          </Button>
        </div>
      ) : null}
      <StatusLine>{status}</StatusLine>

      <Dialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('sync.deleteTitle')}
        description={t('sync.deleteBody')}
      >
        <div className="flex flex-wrap gap-2">
          <Button
            className="border-danger bg-danger"
            onClick={() => {
              sync
                .deleteCloud()
                .then(() => {
                  setCode(null);
                  setConfirmDelete(false);
                  setStatus(t('sync.deleted'));
                })
                .catch((e: unknown) => {
                  setConfirmDelete(false);
                  fail(e);
                });
            }}
          >
            {t('sync.deleteConfirm')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setConfirmDelete(false);
            }}
          >
            {t('settings.cancel')}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={shareOpen}
        onOpenChange={(o) => {
          setShareOpen(o);
          if (!o) setLink(null);
        }}
        title={t('sync.share')}
        description={t('sync.shareWarning')}
      >
        {link ? (
          <div className="flex flex-col gap-2">
            <label className="font-semibold" htmlFor="share-link">
              {t('sync.shareLabel')}
            </label>
            <textarea
              id="share-link"
              readOnly
              value={link}
              rows={4}
              className="w-full rounded-control border-control border-border-control bg-surface-sunken p-2 font-mono text-sm"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  void navigator.clipboard.writeText(link).catch(() => undefined);
                }}
              >
                {t('sync.shareCopy')}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setShareOpen(false);
                }}
              >
                {t('settings.close')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                if (active) setLink(shareUrl(window.location.origin, active));
              }}
            >
              {t('sync.shareMake')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setShareOpen(false);
              }}
            >
              {t('settings.cancel')}
            </Button>
          </div>
        )}
      </Dialog>
    </Section>
  );
}
