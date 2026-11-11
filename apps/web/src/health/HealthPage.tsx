import { DIN_TRIPLETS, type SinCheck } from '@clearly/core';
import { useEffect, useState } from 'react';
import { t, type MessageId } from '../copy/en.ts';
import { formatDate } from '../settings/format.ts';
import { sinChecks } from '../storage/repos.ts';
import { useProfilesLoaded } from '../store/useProfiles.ts';
import { ButtonLink } from '../ui/Button.tsx';
import { Card } from '../ui/Card.tsx';
import { Loading, BackLink, PageBody, PageHeading } from '../ui/Page.tsx';
import { HistoryCard } from './HistoryCard.tsx';
import { TrackerCard } from './TrackerCard.tsx';

/** About 90 seconds: 12 triplets of roughly 7.5 s each (listen and answer). */
const SIN_SECONDS = Math.round((DIN_TRIPLETS * 7.5) / 10) * 10;

export function HealthPage() {
  const loaded = useProfilesLoaded();
  const [last, setLast] = useState<SinCheck | null | undefined>(undefined);
  useEffect(() => {
    void sinChecks.list().then((l) => {
      setLast([...l].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null);
    });
  }, []);
  if (!loaded || last === undefined) return <Loading />;
  return (
    <PageBody wide>
      <BackLink to="/more" label={t('nav.more')} />
      <PageHeading className="mt-2">{t('health.title')}</PageHeading>
      <p className="mt-2 max-w-measure text-lg">{t('health.lead')}</p>
      <div className="mt-6 grid gap-4 desktop:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="flex flex-col gap-4">
          <Card>
            <h2 className="text-2xl">{t('health.sin.title')}</h2>
            <p className="mt-1 text-text-muted">{t('health.sin.purpose')}</p>
            <p className="mt-2">
              {last
                ? t('health.sin.last', {
                    result: t(`sin.category.${last.category}` as MessageId),
                    date: formatDate(last.createdAt),
                  })
                : t('health.sin.none')}
            </p>
            <ButtonLink to="/more/health/speech" className="mt-3">
              {t('health.sin.start', { n: SIN_SECONDS })}
            </ButtonLink>
          </Card>
          <HistoryCard />
        </div>
        <TrackerCard />
      </div>
    </PageBody>
  );
}
