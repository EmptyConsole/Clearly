import { t } from '../copy/en.ts';
import { usePlayerStore } from '../player/playerStore.ts';
import { ButtonLink } from '../ui/Button.tsx';
import { Card } from '../ui/Card.tsx';
import { BackLink, PageBody, PageHeading } from '../ui/Page.tsx';
import { AutoBoostControls } from './AutoBoostControls.tsx';

export function AutoBoostPage() {
  const hasSource = usePlayerStore((s) => s.source !== null);
  return (
    <PageBody>
      <BackLink to="/quiet" label={t('nav.quiet')} />
      <PageHeading className="mt-2">{t('auto.title')}</PageHeading>
      <p className="mt-2 max-w-measure text-lg">{t('auto.lead')}</p>
      <Card className="mt-4 border-control border-primary">
        <p className="font-semibold">{t('auto.onlyPlaying')}</p>
        <ButtonLink to={hasSource ? '/audio/player' : '/audio'} className="mt-2">
          {t('auto.openPlayer')}
        </ButtonLink>
      </Card>
      <div className="mt-6 max-w-measure">
        <AutoBoostControls />
      </div>
    </PageBody>
  );
}
