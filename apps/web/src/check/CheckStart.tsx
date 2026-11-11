import { expectedDurationSeconds, type CheckProgress } from '@clearly/core';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { t } from '../copy/en.ts';
import { checkProgress } from '../storage/repos.ts';
import { Button, ButtonLink } from '../ui/Button.tsx';
import { Card } from '../ui/Card.tsx';
import { ProfileSelector } from '../ui/ProfileSelector.tsx';
import { Loading, PageBody, PageHeading } from '../ui/Page.tsx';
import { useProfilesLoaded } from '../store/useProfiles.ts';
import { useFlowStore } from './flowStore.ts';

export const REFINE_PROGRESS_ID = 'refine';

export function CheckStart() {
  const loaded = useProfilesLoaded();
  const navigate = useNavigate();
  const setFlow = useFlowStore((s) => s.set);
  const [paused, setPaused] = useState<CheckProgress | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    checkProgress
      .get(REFINE_PROGRESS_ID)
      .then((p) => {
        if (live) setPaused(p);
      })
      .catch(() => {
        if (live) setPaused(null);
      });
    return () => {
      live = false;
    };
  }, []);

  if (!loaded || paused === undefined) return <Loading />;

  const express = expectedDurationSeconds('express', 'normal');
  const starter = expectedDurationSeconds('starter', 'normal');

  return (
    <PageBody wide>
      <PageHeading>{t('check.title')}</PageHeading>
      <p className="mt-2 text-lg">{t('check.lead')}</p>
      <div className="mt-4">
        <ProfileSelector />
      </div>
      {paused ? (
        <Card className="mt-6 border-control border-primary">
          <h2 className="text-xl">{t('check.resume.title')}</h2>
          <p className="mt-1">
            {t('check.resume.body', {
              time: new Date(paused.expiresAt).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              }),
            })}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              onClick={() => {
                setFlow({
                  lcDbfs: paused.lcDbfs,
                  ageRange: paused.ageRange,
                  refine: {
                    seed: paused.seed,
                    lcDbfs: paused.lcDbfs,
                    ageRange: paused.ageRange,
                    headphoneName: paused.headphoneName,
                    responses: paused.responses,
                    rngSeed: paused.rngSeed,
                    output: paused.output ?? 'headphones',
                  },
                });
                navigate('/check/test');
              }}
            >
              {t('check.resume.action')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                void checkProgress.delete(REFINE_PROGRESS_ID).then(() => {
                  setPaused(null);
                });
              }}
            >
              {t('check.resume.discard')}
            </Button>
          </div>
        </Card>
      ) : null}
      <div className="mt-6 grid gap-3 desktop:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <h2 className="text-2xl">{t('check.measure.title')}</h2>
          <p className="mt-1">{t('check.measure.body', { n: express })}</p>
          <ButtonLink
            to="/check/before"
            className="mt-3"
            onClick={() => {
              setFlow({ refine: null });
            }}
          >
            {t('check.measure.action')}
          </ButtonLink>
        </Card>
        <Card className="bg-surface">
          <h2 className="text-xl">{t('check.starter.title')}</h2>
          <p className="mt-1">{t('check.starter.body', { n: starter })}</p>
          <ButtonLink to="/check/starter" variant="secondary" className="mt-3">
            {t('check.starter.action')}
          </ButtonLink>
        </Card>
      </div>
    </PageBody>
  );
}
