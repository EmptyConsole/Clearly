import { t } from '../copy/en.ts';
import { ErrorPanel } from '../ui/ErrorPanel.tsx';

/** Shown when a screen fails to load (for example a lost connection while loading a chunk). */
export function RouteError() {
  return (
    <main className="mx-auto max-w-measure px-2 py-8 tablet:px-4">
      <ErrorPanel
        title={t('error.generic.title')}
        what={t('error.generic.body')}
        tryThis={t('error.generic.try')}
        onRetry={() => {
          window.location.reload();
        }}
      />
    </main>
  );
}
