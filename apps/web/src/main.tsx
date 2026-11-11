import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { EngineProvider } from './audio/EngineContext.tsx';
import { PlatformProvider } from './platform/PlatformContext.tsx';
import { router, ROUTER_FUTURE } from './app/router.tsx';
import './index.css';
import { listenForInstall } from './pwa/install.ts';
import { applyTheme, storedTheme } from './ui/theme.ts';

applyTheme(storedTheme());
listenForInstall();
// Inline (not TEST_HOOKS_ENABLED) so the production build drops the import and its chunk.
if (import.meta.env.VITE_TEST_HOOKS === '1') {
  void import('./test/videoHooks.ts').then((m) => {
    m.installVideoHooks();
  });
}

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element in index.html');

createRoot(container).render(
  <StrictMode>
    <PlatformProvider>
      <EngineProvider>
        <RouterProvider
          router={router}
          future={{ v7_startTransition: ROUTER_FUTURE.v7_startTransition }}
        />
      </EngineProvider>
    </PlatformProvider>
  </StrictMode>,
);
