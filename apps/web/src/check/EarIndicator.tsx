import type { Ear } from '@clearly/core';
import { t } from '../copy/en.ts';

/** Which ear is being tested: a shape and a word, never colour alone. 'both': computer speakers. */
export function EarIndicator({ ear }: { ear: Ear | 'both' | null }) {
  return (
    <div className="flex min-h-[var(--t-target-min)] items-center gap-2" aria-live="polite">
      <span className="text-text-muted">{t('stage.ear.label')}</span>
      {ear === 'both' ? (
        <span className="text-xl font-bold">{t('stage.ear.both')}</span>
      ) : ear ? (
        <span className="inline-flex items-center gap-1 text-xl font-bold">
          <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
            {ear === 'right' ? (
              <circle
                cx="14"
                cy="14"
                r="10"
                fill="none"
                stroke="var(--t-color-ear-right)"
                strokeWidth="4"
              />
            ) : (
              <path
                d="M5,5 L23,23 M23,5 L5,23"
                stroke="var(--t-color-ear-left)"
                strokeWidth="4"
                strokeLinecap="round"
              />
            )}
          </svg>
          {ear === 'right' ? t('stage.ear.right') : t('stage.ear.left')}
        </span>
      ) : (
        <span className="text-xl font-bold" aria-hidden="true">
          &nbsp;
        </span>
      )}
    </div>
  );
}
