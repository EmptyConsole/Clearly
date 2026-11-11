import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { Layout } from './Layout.tsx';
import { NotFound } from './NotFound.tsx';
import { RouteError } from './RouteError.tsx';

// Route-level lazy loading: each screen (and everything it pulls in: Dexie, core, the audio
// engine) loads on first visit, so the app shell stays small (check:size).

// The /design token page exists only in development. import.meta.env.DEV is replaced with
// `false` in production builds, so the branch and its dynamic import are removed entirely.
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: '/design',
        lazy: async () => {
          const { DesignPage } = await import('../design/DesignPage.tsx');
          return { Component: DesignPage };
        },
      },
    ]
  : [];

export const appRoutes: RouteObject[] = [
  {
    index: true,
    lazy: async () => ({ Component: (await import('../routes/Home.tsx')).Home }),
  },
  {
    path: 'check',
    children: [
      {
        index: true,
        lazy: async () => ({ Component: (await import('../check/CheckStart.tsx')).CheckStart }),
      },
      {
        path: 'starter',
        lazy: async () => ({ Component: (await import('../check/Starter.tsx')).Starter }),
      },
      {
        path: 'starter/done',
        lazy: async () => ({ Component: (await import('../check/Starter.tsx')).StarterDone }),
      },
      {
        path: 'before',
        lazy: async () => ({ Component: (await import('../check/PreCheck.tsx')).PreCheck }),
      },
      {
        path: 'calibrate',
        lazy: async () => ({ Component: (await import('../check/Calibration.tsx')).Calibration }),
      },
      {
        path: 'test',
        lazy: async () => ({ Component: (await import('../check/Stage.tsx')).Stage }),
      },
      {
        path: 'results/:id',
        lazy: async () => ({ Component: (await import('../check/Results.tsx')).Results }),
      },
    ],
  },
  {
    path: 'more',
    children: [
      {
        index: true,
        lazy: async () => ({ Component: (await import('./MorePage.tsx')).MorePage }),
      },
      {
        path: 'everywhere',
        lazy: async () => ({ Component: (await import('./EverywherePage.tsx')).EverywherePage }),
      },
      {
        path: 'settings',
        lazy: async () => ({
          Component: (await import('../settings/SettingsPage.tsx')).SettingsPage,
        }),
      },
      {
        path: 'health',
        lazy: async () => ({ Component: (await import('../health/HealthPage.tsx')).HealthPage }),
      },
      {
        path: 'health/speech',
        lazy: async () => ({ Component: (await import('../health/SpeechCheck.tsx')).SpeechCheck }),
      },
      {
        path: 'privacy',
        lazy: async () => ({
          Component: (await import('../settings/PrivacyPage.tsx')).PrivacyPage,
        }),
      },
      {
        path: 'feedback',
        lazy: async () => ({
          Component: (await import('../settings/FeedbackPage.tsx')).FeedbackPage,
        }),
      },
    ],
  },
  {
    path: 'welcome',
    lazy: async () => ({ Component: (await import('../welcome/Welcome.tsx')).Welcome }),
  },
  {
    path: 'restore',
    lazy: async () => ({ Component: (await import('../settings/RestorePage.tsx')).RestorePage }),
  },
  {
    path: 'share',
    lazy: async () => ({ Component: (await import('../settings/SharePage.tsx')).SharePage }),
  },
  {
    path: 'audio',
    children: [
      {
        index: true,
        lazy: async () => ({ Component: (await import('../player/SourcesPage.tsx')).SourcesPage }),
      },
      {
        path: 'player',
        lazy: async () => ({ Component: (await import('../player/PlayerPage.tsx')).PlayerPage }),
      },
      {
        // Desktop app only (M12); the Sources page links here only when cables are possible.
        path: 'cable',
        lazy: async () => ({
          Component: (await import('../player/CableWizardPage.tsx')).CableWizardPage,
        }),
      },
    ],
  },
  {
    path: 'quiet',
    children: [
      {
        index: true,
        lazy: async () => ({ Component: (await import('../quiet/QuietLabPage.tsx')).QuietLabPage }),
      },
      {
        path: 'auto-boost',
        lazy: async () => ({
          Component: (await import('../quiet/AutoBoostPage.tsx')).AutoBoostPage,
        }),
      },
      {
        path: 'calm',
        lazy: async () => ({ Component: (await import('../quiet/CalmPage.tsx')).CalmPage }),
      },
    ],
  },
  { path: '*', Component: NotFound },
];

export const routes: RouteObject[] = [
  ...devRoutes,
  { path: '/', Component: Layout, errorElement: <RouteError />, children: appRoutes },
];

/** React Router v7 behaviour, opted into now so the upgrade changes nothing. */
export const ROUTER_FUTURE = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
  v7_fetcherPersist: true,
  v7_normalizeFormMethod: true,
  v7_skipActionErrorRevalidation: true,
} as const;

export const router = createBrowserRouter(routes, { future: ROUTER_FUTURE });
