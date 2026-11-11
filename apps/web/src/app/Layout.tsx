import { lazy, Suspense } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { t } from '../copy/en.ts';
import { Icon } from '../ui/icons.tsx';
import { DESTINATIONS, MORE_CHILDREN } from './nav.ts';
import { Loading } from '../ui/Page.tsx';
import { cx, focusRing } from '../ui/cx.ts';
import { OfflineBanner } from '../pwa/OfflineBanner.tsx';
import { SuspendedBanner } from '../audio/SuspendedBanner.tsx';
import { usePlatform } from '../platform/context.ts';

// Navigation (M10): five destinations. At 1024 px and wider a left sidebar shows every
// destination with More's children; from 768 to 1023 px a rail of icons whose labels show as
// tooltips on hover and focus (and are the links' accessible names); under 768 px a bottom tab
// bar that respects the safe-area insets.

const SyncLayer = lazy(() => import('./SyncLayer.tsx'));
const PwaLayer = lazy(() => import('../pwa/PwaLayer.tsx'));
// The desktop app has no service worker (its files are local) and adds its own layer instead.
const DesktopLayer = lazy(() => import('./DesktopLayer.tsx'));

const linkBase = cx(
  'flex min-h-[var(--t-target-min)] items-center gap-1 rounded-control font-semibold no-underline',
  focusRing,
);

function Sidebar() {
  const { pathname } = useLocation();
  const inMore = pathname.startsWith('/more');
  return (
    <nav
      aria-label={t('nav.label')}
      className="sticky top-0 hidden h-dvh w-[calc(var(--t-space-16)*2)] shrink-0 flex-col gap-1 overflow-y-auto border-r border-border p-2 desktop:flex"
    >
      <NavLink
        to="/"
        className={cx('mb-2 px-1 text-2xl font-bold text-text no-underline', focusRing)}
      >
        {t('app.name')}
      </NavLink>
      <ul className="flex flex-col gap-0.5">
        {DESTINATIONS.map((d) => (
          <li key={d.to}>
            <NavLink
              to={d.to}
              end={d.end ?? false}
              className={({ isActive }) =>
                cx(
                  linkBase,
                  'px-1',
                  isActive || (d.to === '/more' && inMore)
                    ? 'bg-surface-sunken text-text'
                    : 'text-text-muted hover:text-text',
                )
              }
            >
              <Icon name={d.icon} />
              {t(d.label)}
            </NavLink>
            {d.to === '/more' ? (
              <ul className="ml-4 mt-0.5 flex flex-col gap-0.5 border-l border-border pl-1">
                {MORE_CHILDREN.map((c) => (
                  <li key={c.to}>
                    <NavLink
                      to={c.to}
                      className={({ isActive }) =>
                        cx(
                          linkBase,
                          'min-h-[var(--t-space-6)] px-1 py-0.5 text-base leading-tight',
                          isActive ? 'text-text underline' : 'text-text-muted hover:text-text',
                        )
                      }
                    >
                      {t(c.label)}
                    </NavLink>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Rail() {
  const { pathname } = useLocation();
  return (
    <nav
      aria-label={t('nav.label')}
      className="sticky top-0 hidden h-dvh w-[var(--t-space-12)] shrink-0 flex-col items-center gap-1 border-r border-border py-2 tablet:flex desktop:hidden"
    >
      <ul className="flex flex-col items-center gap-1">
        {DESTINATIONS.map((d) => (
          <li key={d.to}>
            <NavLink
              to={d.to}
              end={d.end ?? false}
              className={({ isActive }) =>
                cx(
                  'group relative flex size-[var(--t-space-8)] items-center justify-center rounded-control',
                  focusRing,
                  isActive || (d.to === '/more' && pathname.startsWith('/more'))
                    ? 'bg-surface-sunken text-text'
                    : 'text-text-muted hover:text-text',
                )
              }
            >
              <Icon name={d.icon} />
              {/* The tooltip is the link's text: screen readers read it, sighted people see it on
                  hover or keyboard focus. */}
              <span className="pointer-events-none absolute left-full top-1/2 z-[var(--t-z-overlay)] ml-1 -translate-y-1/2 whitespace-nowrap rounded-control bg-text px-1 py-0.5 text-base font-semibold text-surface opacity-0 transition-opacity duration-[var(--t-motion-duration-fast)] group-hover:opacity-100 group-focus-visible:opacity-100">
                {t(d.label)}
              </span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function TabBar() {
  const { pathname } = useLocation();
  return (
    <nav
      aria-label={t('nav.label')}
      className="fixed inset-x-0 bottom-0 z-[var(--t-z-sticky)] border-t border-border bg-surface-raised pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] tablet:hidden"
    >
      <ul className="grid grid-cols-5">
        {DESTINATIONS.map((d) => (
          <li key={d.to}>
            <NavLink
              to={d.to}
              end={d.end ?? false}
              className={({ isActive }) =>
                cx(
                  'flex min-h-[var(--t-space-8)] flex-col items-center justify-center gap-0.5 px-0.5 text-center text-sm font-semibold leading-tight no-underline',
                  focusRing,
                  isActive || (d.to === '/more' && pathname.startsWith('/more'))
                    ? 'text-primary'
                    : 'text-text-muted',
                )
              }
            >
              <Icon name={d.icon} />
              {t(d.label)}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function Layout() {
  const desktop = usePlatform().kind === 'desktop';
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[var(--t-z-skip-link)] focus:rounded-control focus:bg-surface-raised focus:p-2"
      >
        {t('app.skipLink')}
      </a>
      <div className="flex min-h-dvh">
        <Sidebar />
        <Rail />
        <div className="min-w-0 flex-1">
          <header className="border-b border-border px-2 py-1 desktop:hidden">
            <NavLink to="/" className={cx('text-xl font-bold text-text no-underline', focusRing)}>
              {t('app.name')}
            </NavLink>
          </header>
          <OfflineBanner />
          <SuspendedBanner />
          <Suspense fallback={null}>
            <SyncLayer />
            {desktop ? <DesktopLayer /> : <PwaLayer />}
          </Suspense>
          <main
            id="main"
            className="pb-[calc(var(--t-space-8)+var(--t-space-2)+env(safe-area-inset-bottom))] tablet:pb-0"
          >
            <Suspense fallback={<Loading />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>
      <TabBar />
    </>
  );
}
