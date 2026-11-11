import { Link } from 'react-router-dom';
import { t, type MessageId } from '../copy/en.ts';
import { Icon } from '../ui/icons.tsx';
import { PageBody, PageHeading } from '../ui/Page.tsx';
import { focusRing, cx } from '../ui/cx.ts';
import { MORE_CHILDREN } from './nav.ts';

const BLURB: Record<string, MessageId> = {
  '/more/health': 'more.health',
  '/more/settings': 'more.settings',
  '/more/everywhere': 'more.everywhere',
  '/more/privacy': 'more.privacy',
  '/more/feedback': 'more.feedback',
};

export function MorePage() {
  return (
    <PageBody>
      <PageHeading>{t('more.title')}</PageHeading>
      <p className="mt-2 text-lg">{t('more.lead')}</p>
      <ul className="mt-6 flex flex-col divide-y divide-border border-y border-border">
        {MORE_CHILDREN.map((c) => (
          <li key={c.to}>
            <Link
              to={c.to}
              className={cx(
                'flex min-h-[var(--t-target-min)] items-start gap-2 py-2 text-text no-underline hover:bg-surface-sunken',
                focusRing,
              )}
            >
              <Icon name={c.icon} className="mt-0.5 shrink-0 text-primary" />
              <span>
                <span className="block text-xl font-semibold underline-offset-4">{t(c.label)}</span>
                <span className="block text-text-muted">{t(BLURB[c.to] ?? 'more.lead')}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </PageBody>
  );
}
