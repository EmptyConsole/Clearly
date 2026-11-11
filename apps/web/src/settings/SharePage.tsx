import { MAX_PROFILES, type Profile } from '@clearly/core';
import { useEffect, useState } from 'react';
import { t } from '../copy/en.ts';
import { profiles as profileRepo } from '../storage/repos.ts';
import { decodeShareFragment } from '../storage/shareLink.ts';
import { useProfileStore } from '../store/profileStore.ts';
import { useProfilesLoaded } from '../store/useProfiles.ts';
import { Audiogram } from '../ui/Audiogram.tsx';
import { seriesFromAudiogram } from '../ui/audiogramData.ts';
import { Button, ButtonLink } from '../ui/Button.tsx';
import { Loading, PageBody, PageHeading } from '../ui/Page.tsx';
import { StatusLine } from '../ui/StatusLine.tsx';
import { formatDate } from './format.ts';

/** Receives a "Share my profile link". The fragment never reaches a server. */
export function SharePage() {
  const loaded = useProfilesLoaded();
  const [profile] = useState<Profile | null>(() => decodeShareFragment(window.location.hash));
  const [status, setStatus] = useState<'idle' | 'imported' | 'limit'>('idle');

  // Remove the profile from the address bar (and so from history) as soon as it is read.
  useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(window.history.state, '', window.location.pathname);
    }
  }, []);

  if (!loaded) return <Loading />;
  return (
    <PageBody>
      <PageHeading>{t('share.title')}</PageHeading>
      {!profile ? (
        <p className="mt-3">{t('share.invalid')}</p>
      ) : (
        <>
          <p className="mt-2 text-lg">{t('share.lead')}</p>
          <p className="mt-2 font-semibold">
            {t('share.preview', {
              name: profile.name,
              headphones: profile.headphoneName,
              date: formatDate(profile.audiogram.createdAt),
            })}
          </p>
          <div className="mt-4">
            <Audiogram series={seriesFromAudiogram(profile.audiogram)} />
          </div>
          {status === 'imported' ? (
            <ButtonLink to="/more/settings" className="mt-4">
              {t('settings.title')}
            </ButtonLink>
          ) : (
            <Button
              className="mt-4"
              onClick={() => {
                const store = useProfileStore.getState();
                if (store.profiles.length >= MAX_PROFILES) {
                  setStatus('limit');
                  return;
                }
                // A new id, so an import never overwrites a profile already here.
                void profileRepo
                  .put({ ...profile, id: crypto.randomUUID() })
                  .then(() => store.load())
                  .then(() => {
                    setStatus('imported');
                  });
              }}
            >
              {t('share.import')}
            </Button>
          )}
          <StatusLine>
            {status === 'imported'
              ? t('share.imported')
              : status === 'limit'
                ? t('share.limit')
                : ''}
          </StatusLine>
        </>
      )}
    </PageBody>
  );
}
