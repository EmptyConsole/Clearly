import { MAX_PROFILES, type Profile } from '@clearly/core';
import { useState } from 'react';
import { t } from '../copy/en.ts';
import { demoName } from './demoName.ts';
import { DEMO_PROFILES, isDemoId } from '../store/demoProfiles.ts';
import { ProfileLimitError, useProfileStore } from '../store/profileStore.ts';
import { Button, ButtonLink } from '../ui/Button.tsx';
import { Card } from '../ui/Card.tsx';
import { Dialog } from '../ui/Dialog.tsx';
import { EstimatedBadge } from '../ui/EstimatedBadge.tsx';
import { StatusLine } from '../ui/StatusLine.tsx';
import { TextField } from '../ui/TextField.tsx';
import { Section } from './Section.tsx';
import { useBackupDownload } from './useBackup.ts';

type Edit =
  | { kind: 'rename'; profile: Profile }
  | { kind: 'headphones'; profile: Profile }
  | { kind: 'duplicate'; profile: Profile }
  | { kind: 'delete'; profile: Profile };

export function ProfilesSection() {
  const s = useProfileStore();
  const download = useBackupDownload();
  const [edit, setEdit] = useState<Edit | null>(null);
  const [value, setValue] = useState('');
  const [status, setStatus] = useState('');
  const [calibrateFor, setCalibrateFor] = useState<string | null>(null);

  const open = (e: Edit, initial: string) => {
    setEdit(e);
    setValue(initial);
  };
  const close = () => {
    setEdit(null);
  };

  const submit = async () => {
    if (!edit) return;
    try {
      if (edit.kind === 'rename') await s.rename(edit.profile.id, value);
      if (edit.kind === 'headphones') await s.setProfileHeadphones(edit.profile.id, value);
      if (edit.kind === 'duplicate') {
        const copy = await s.duplicate(edit.profile.id, value);
        setStatus(t('settings.profile.duplicateDone'));
        setCalibrateFor(copy.id);
      }
      if (edit.kind === 'delete') await s.remove(edit.profile.id);
      close();
    } catch (e) {
      setStatus(
        e instanceof ProfileLimitError
          ? t('settings.profile.limit', { n: MAX_PROFILES })
          : t('error.storage.body'),
      );
      close();
    }
  };

  const list: Profile[] = [...s.profiles, ...(s.demoMode ? DEMO_PROFILES : [])];
  return (
    <Section
      title={t('settings.profile.title')}
      lead={t('settings.profile.lead', { n: MAX_PROFILES })}
    >
      {list.length === 0 ? (
        <div>
          <p>{t('settings.profile.none')}</p>
          <ButtonLink to="/check" className="mt-2">
            {t('home.start')}
          </ButtonLink>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((p) => {
            const demo = isDemoId(p.id);
            const active = s.active?.id === p.id;
            return (
              <li key={p.id}>
                <Card className={active ? 'border-control border-primary' : undefined}>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xl">{demo ? demoName(p) : p.name}</h3>
                    {demo ? (
                      <span className="rounded-pill border-control border-border-control px-2 text-sm font-semibold">
                        {t('settings.profile.demo')}
                      </span>
                    ) : null}
                    {p.audiogram.method === 'starter' ? <EstimatedBadge /> : null}
                    {active ? (
                      <span className="text-sm font-semibold text-primary">
                        {t('settings.profile.active')}
                      </span>
                    ) : null}
                  </div>
                  {!demo ? (
                    <>
                      <p className="mt-1 text-text-muted">
                        {t('settings.profile.headphones', { name: p.headphoneName })}
                      </p>
                      {p.calibration ? null : (
                        <p className="text-text-muted">{t('settings.profile.notCalibrated')}</p>
                      )}
                    </>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                    {!active ? (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          void s.select(p.id);
                        }}
                      >
                        {t('settings.profile.use')}
                      </Button>
                    ) : null}
                    {!demo ? (
                      <>
                        <Button
                          variant="quiet"
                          onClick={() => {
                            open({ kind: 'rename', profile: p }, p.name);
                          }}
                        >
                          {t('settings.profile.rename')}
                        </Button>
                        <Button
                          variant="quiet"
                          onClick={() => {
                            open({ kind: 'headphones', profile: p }, p.headphoneName);
                          }}
                        >
                          {t('settings.profile.changeHeadphones')}
                        </Button>
                        <Button
                          variant="quiet"
                          onClick={() => {
                            if (s.profiles.length >= MAX_PROFILES) {
                              setStatus(t('settings.profile.limit', { n: MAX_PROFILES }));
                              return;
                            }
                            open({ kind: 'duplicate', profile: p }, '');
                          }}
                        >
                          {t('settings.profile.duplicate')}
                        </Button>
                        <Button
                          variant="quiet"
                          onClick={() => {
                            open({ kind: 'delete', profile: p }, '');
                          }}
                        >
                          {t('settings.profile.delete')}
                        </Button>
                      </>
                    ) : null}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <StatusLine>{status}</StatusLine>
      {calibrateFor ? (
        <ButtonLink
          to="/check/before"
          onClick={() => {
            void s.select(calibrateFor);
          }}
        >
          {t('settings.profile.calibrateNow')}
        </ButtonLink>
      ) : null}

      <Dialog
        open={edit !== null && edit.kind !== 'delete'}
        onOpenChange={(o) => {
          if (!o) close();
        }}
        title={
          edit?.kind === 'rename'
            ? t('settings.profile.rename')
            : edit?.kind === 'headphones'
              ? t('settings.profile.changeHeadphones')
              : t('settings.profile.duplicate')
        }
        {...(edit?.kind === 'headphones'
          ? { description: t('settings.profile.headphonesNote') }
          : edit?.kind === 'duplicate'
            ? { description: t('settings.profile.duplicateNote') }
            : {})}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <TextField
            label={
              edit?.kind === 'rename'
                ? t('settings.profile.renameLabel')
                : edit?.kind === 'headphones'
                  ? t('settings.profile.headphonesLabel')
                  : t('settings.profile.duplicateLabel')
            }
            value={value}
            maxLength={edit?.kind === 'rename' ? 60 : 100}
            onChange={(e) => {
              setValue(e.target.value);
            }}
            required
            autoFocus
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="submit" disabled={value.trim().length === 0}>
              {t('settings.save')}
            </Button>
            <Button variant="secondary" onClick={close}>
              {t('settings.cancel')}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={edit?.kind === 'delete'}
        onOpenChange={(o) => {
          if (!o) close();
        }}
        title={t('settings.profile.deleteTitle', { name: edit?.profile.name ?? '' })}
        description={t('settings.profile.deleteBody')}
      >
        <div className="flex flex-col items-start gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              void download();
            }}
          >
            {t('settings.profile.deleteBackup')}
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button
              className="border-danger bg-danger"
              onClick={() => {
                void submit();
              }}
            >
              {t('settings.profile.deleteConfirm')}
            </Button>
            <Button variant="secondary" onClick={close}>
              {t('settings.cancel')}
            </Button>
          </div>
        </div>
      </Dialog>
    </Section>
  );
}
