import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './icons.tsx';
import { cx as join, focusRing } from './cx.ts';
import { t } from '../copy/en.ts';

/**
 * Every screen's heading: sets document.title and takes focus on mount, so a route change is
 * announced and keyboard users start at the top of the new page.
 */
export function PageHeading({ children, className }: { children: string; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    document.title = `${children} - ${t('app.name')}`;
    ref.current?.focus({ preventScroll: false });
  }, [children]);
  return (
    <h1
      ref={ref}
      tabIndex={-1}
      className={join('text-3xl outline-none desktop:text-4xl', className)}
    >
      {children}
    </h1>
  );
}

export function PageBody({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div
      className={join(
        'mx-auto w-full px-2 py-6 tablet:px-4',
        wide ? 'max-w-content' : 'max-w-measure',
      )}
    >
      {children}
    </div>
  );
}

export function Loading({ label = t('state.loading') }: { label?: string }) {
  return (
    <p role="status" aria-live="polite" className="py-6 text-text-muted">
      {label}
    </p>
  );
}

/** The one Back affordance: an arrow and the parent's name, at the top of sub-pages. */
export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className={join(
        'inline-flex min-h-[var(--t-target-min)] items-center gap-0.5 font-semibold no-underline hover:underline',
        focusRing,
      )}
    >
      <Icon name="back" />
      {label}
    </Link>
  );
}
