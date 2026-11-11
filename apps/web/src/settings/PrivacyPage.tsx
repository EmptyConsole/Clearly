import { t } from '../copy/en.ts';
import { useRetentionMonths } from '../sync/useRetention.ts';
import { BackLink, PageBody, PageHeading } from '../ui/Page.tsx';

/** The same facts as docs/PRIVACY.txt, in plain words. */
export function PrivacyPage() {
  const months = useRetentionMonths();
  return (
    <PageBody>
      <BackLink to="/more" label={t('nav.more')} />
      <PageHeading className="mt-2">{t('privacy.title')}</PageHeading>
      <p className="mt-4 text-xl font-semibold">{t('privacy.audio')}</p>
      <p className="mt-3">{t('privacy.local')}</p>
      <h2 className="mt-6 text-2xl">{t('privacy.syncTitle')}</h2>
      <p className="mt-2">{t('privacy.syncWhat')}</p>
      <p className="mt-2">{t('privacy.syncHow')}</p>
      <p className="mt-2">{t('privacy.syncNot')}</p>
      <p className="mt-2">{t('privacy.syncLong', { months })}</p>
      <p className="mt-2">{t('privacy.syncDelete')}</p>
      <h2 className="mt-6 text-2xl">{t('privacy.healthTitle')}</h2>
      <p className="mt-2">{t('privacy.health')}</p>
      <h2 className="mt-6 text-2xl">{t('privacy.feedbackTitle')}</h2>
      <p className="mt-2">{t('privacy.feedback')}</p>
    </PageBody>
  );
}
