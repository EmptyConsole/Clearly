import { t } from '../copy/en.ts';
import { Button } from './Button.tsx';

export interface ErrorPanelProps {
  readonly title: string;
  /** What happened, in one plain sentence. */
  readonly what: string;
  /** What to try. */
  readonly tryThis: string;
  readonly onRetry?: () => void;
  /** Technical detail included in the feedback message (never shown as the main text). */
  readonly detail?: string;
}

/** Every error says what happened and what to try, with Try again and Send feedback. */
export function ErrorPanel({ title, what, tryThis, onRetry, detail }: ErrorPanelProps) {
  const body = encodeURIComponent(`${title}\n${what}\n${detail ?? ''}`);
  const subject = encodeURIComponent(t('feedback.mailSubject'));
  return (
    <section
      role="alert"
      className="rounded-surface border-control border-danger bg-surface-raised p-3 tablet:p-4"
    >
      <h2 className="text-xl">{title}</h2>
      <h3 className="mt-2 text-base font-semibold">{t('error.whatHappened')}</h3>
      <p>{what}</p>
      <h3 className="mt-2 text-base font-semibold">{t('error.whatToTry')}</h3>
      <p>{tryThis}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {onRetry ? <Button onClick={onRetry}>{t('error.tryAgain')}</Button> : null}
        <a
          className="inline-flex min-h-[var(--t-target-min)] items-center"
          href={`mailto:?subject=${subject}&body=${body}`}
        >
          {t('error.sendFeedback')}
        </a>
      </div>
    </section>
  );
}
