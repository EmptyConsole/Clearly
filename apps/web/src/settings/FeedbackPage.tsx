import { useId, useState } from 'react';
import { APP_VERSION } from '../app/version.ts';
import { t } from '../copy/en.ts';
import { api, ApiError } from '../sync/api.ts';
import { Button } from '../ui/Button.tsx';
import { BackLink, PageBody, PageHeading } from '../ui/Page.tsx';
import { StatusLine } from '../ui/StatusLine.tsx';
import { cx, focusRing } from '../ui/cx.ts';

const MAX = 2000;

export function FeedbackPage() {
  const id = useId();
  const counterId = useId();
  const [message, setMessage] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'offline' | 'empty'>('idle');
  const mailto = `mailto:?subject=${encodeURIComponent(t('feedback.mailSubject'))}&body=${encodeURIComponent(
    `${message}\n\n${t('feedback.sentVersion', { v: APP_VERSION })}`,
  )}`;
  return (
    <PageBody>
      <BackLink to="/more" label={t('nav.more')} />
      <PageHeading className="mt-2">{t('feedback.title')}</PageHeading>
      <p className="mt-2 text-lg">{t('feedback.lead')}</p>
      <form
        className="mt-4 flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (message.trim().length === 0) {
            setState('empty');
            return;
          }
          setState('sending');
          api
            .feedback(message.trim(), APP_VERSION)
            .then(() => {
              setState('sent');
              setMessage('');
            })
            .catch((err: unknown) => {
              // Offline or refused: either way, offer the same message by email.
              if (err instanceof ApiError) setState('offline');
              else setState('offline');
            });
        }}
      >
        <label htmlFor={id} className="font-semibold">
          {t('feedback.label')}
        </label>
        <textarea
          id={id}
          rows={6}
          maxLength={MAX}
          value={message}
          aria-describedby={counterId}
          onChange={(e) => {
            setMessage(e.target.value);
          }}
          className={cx(
            'w-full max-w-measure rounded-control border-control border-border-control bg-surface-raised p-2 text-base text-text',
            focusRing,
          )}
        />
        <p id={counterId} className="text-sm text-text-muted">
          {t('feedback.counter', { n: message.length, max: MAX })}
        </p>
        <div className="rounded-surface bg-surface-sunken p-3">
          <p className="font-semibold">{t('feedback.sent')}</p>
          <p className="mt-1 whitespace-pre-wrap">{message || ' '}</p>
          <p className="mt-1 text-text-muted">{t('feedback.sentVersion', { v: APP_VERSION })}</p>
        </div>
        <div>
          <Button type="submit" disabled={state === 'sending'}>
            {t('feedback.send')}
          </Button>
        </div>
        <StatusLine>
          {state === 'sent'
            ? t('feedback.thanks')
            : state === 'offline'
              ? t('feedback.offline')
              : state === 'empty'
                ? t('feedback.empty')
                : ''}
        </StatusLine>
        {state === 'offline' ? <a href={mailto}>{t('feedback.mail')}</a> : null}
      </form>
    </PageBody>
  );
}
