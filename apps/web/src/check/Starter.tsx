import { AGE_RANGES, expectedDurationSeconds, type AgeRange } from '@clearly/core';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { t } from '../copy/en.ts';
import { ageLabel } from './ageLabel.ts';
import { useProfileStore } from '../store/profileStore.ts';
import { useProfilesLoaded } from '../store/useProfiles.ts';
import { Button, ButtonLink } from '../ui/Button.tsx';
import { ErrorPanel } from '../ui/ErrorPanel.tsx';
import { EstimatedBadge } from '../ui/EstimatedBadge.tsx';
import { Loading, PageBody, PageHeading } from '../ui/Page.tsx';

export function Starter() {
  const loaded = useProfilesLoaded();
  const createStarter = useProfileStore((s) => s.createStarter);
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<AgeRange | null>(null);

  const choose = (a: AgeRange) => {
    setSaving(true);
    setFailed(null);
    createStarter(a)
      .then(() => {
        navigate('/check/starter/done');
      })
      .catch(() => {
        setSaving(false);
        setFailed(a);
      });
  };

  if (!loaded) return <Loading />;
  return (
    <PageBody>
      <PageHeading>{t('starter.title')}</PageHeading>
      <p className="mt-2 text-lg">{t('starter.lead')}</p>
      {failed ? (
        <div className="mt-4">
          <ErrorPanel
            title={t('error.storage.title')}
            what={t('error.storage.body')}
            tryThis={t('error.storage.try')}
            onRetry={() => {
              choose(failed);
            }}
          />
        </div>
      ) : null}
      <ul className="mt-6 grid grid-cols-1 gap-2 tablet:grid-cols-2">
        {AGE_RANGES.map((a) => (
          <li key={a}>
            <Button
              variant="secondary"
              disabled={saving}
              className="min-h-[calc(var(--t-target-min)*1.5)] w-full text-xl"
              onClick={() => {
                choose(a);
              }}
            >
              {ageLabel(a)}
            </Button>
          </li>
        ))}
      </ul>
      {saving ? <Loading label={t('starter.saving')} /> : null}
    </PageBody>
  );
}

export function StarterDone() {
  const loaded = useProfilesLoaded();
  if (!loaded) return <Loading />;
  return (
    <PageBody>
      <p>
        <EstimatedBadge />
      </p>
      <PageHeading className="mt-2">{t('starter.done.title')}</PageHeading>
      <p className="mt-2 text-lg">{t('starter.done.body')}</p>
      <div className="mt-6 flex flex-col items-start gap-2">
        <ButtonLink to="/audio" className="text-lg">
          {t('starter.done.listen')}
        </ButtonLink>
        <ButtonLink to="/check/before" variant="secondary">
          {t('profile.moreAccurate', { n: expectedDurationSeconds('express', 'normal') })}
        </ButtonLink>
      </div>
    </PageBody>
  );
}
