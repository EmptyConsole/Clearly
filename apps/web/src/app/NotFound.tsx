import { t } from '../copy/en.ts';
import { ButtonLink } from '../ui/Button.tsx';
import { PageBody, PageHeading } from '../ui/Page.tsx';

export function NotFound() {
  return (
    <PageBody>
      <PageHeading>{t('notFound.title')}</PageHeading>
      <p className="mt-3 text-base">{t('notFound.body')}</p>
      <ButtonLink to="/" className="mt-4">
        {t('notFound.home')}
      </ButtonLink>
    </PageBody>
  );
}
