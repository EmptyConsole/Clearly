import { t } from '../copy/en.ts';
import { Button } from './Button.tsx';
import { useToasts } from './toastStore.ts';

/** No automatic timeout: a toast stays until the person closes it (no prompt times out). */
export function ToastHost() {
  const { toasts, dismiss } = useToasts();
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-2 left-1/2 z-[var(--t-z-toast)] flex w-[min(calc(100vw-var(--t-space-4)),var(--t-measure-text))] -translate-x-1/2 flex-col gap-1">
      {toasts.map((x) => (
        <div
          key={x.id}
          role="status"
          className="rounded-surface border-hairline border-border bg-surface-raised p-3 shadow-overlay"
        >
          <p>{x.message}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {x.action ? (
              <Button
                onClick={() => {
                  x.action?.run();
                  dismiss(x.id);
                }}
              >
                {x.action.label}
              </Button>
            ) : null}
            <Button
              variant="secondary"
              onClick={() => {
                dismiss(x.id);
              }}
            >
              {t('settings.close')}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
