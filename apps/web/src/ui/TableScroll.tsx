import type { ReactNode } from 'react';
import { t } from '../copy/en.ts';
import { cx, focusRing } from './cx.ts';

/**
 * Wraps a data table so a wide table scrolls inside itself instead of making the page scroll
 * sideways (200 percent text). Focusable, so the scroll can be reached by keyboard.
 */
export function TableScroll({
  children,
  className,
  id,
  hidden,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  hidden?: boolean;
}) {
  return (
    <div
      id={id}
      hidden={hidden}
      role="region"
      aria-label={t('table.region')}
      tabIndex={0}
      className={cx('overflow-x-auto', focusRing, className)}
    >
      {children}
    </div>
  );
}
