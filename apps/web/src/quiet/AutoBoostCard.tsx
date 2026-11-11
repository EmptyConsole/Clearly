import { t } from '../copy/en.ts';
import { Card } from '../ui/Card.tsx';
import { AutoBoostControls } from './AutoBoostControls.tsx';

/** Auto Boost inside Clear Audio, so it can be set up without stopping playback. */
export function AutoBoostCard() {
  return (
    <Card>
      <h3 className="text-xl font-semibold">{t('auto.title')}</h3>
      <p className="mb-3 mt-1 text-text-muted">{t('auto.card.body')}</p>
      <AutoBoostControls headingLevel={3} />
    </Card>
  );
}
