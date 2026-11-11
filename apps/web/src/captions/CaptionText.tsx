import { wrapCue } from '@clearly/core';
import { t } from '../copy/en.ts';
import { cx } from '../ui/cx.ts';
import { SCHEME_CLASS, type CaptionDisplay } from './display.ts';

/** Caption lines in the chosen size, line count and colours, in a polite live region. */
export function CaptionText({ text, display }: { text: string | null; display: CaptionDisplay }) {
  const lines = text ? wrapCue(text).split('\n').slice(-display.lines) : [];
  return (
    <div
      role="region"
      aria-label={t('captions.panel')}
      className="flex min-h-[calc(var(--t-space-8)*1.5)] items-end justify-center"
    >
      <p
        aria-live="polite"
        className={cx(
          'max-w-full rounded-control px-2 py-1 text-center font-semibold',
          SCHEME_CLASS[display.scheme],
        )}
        style={{ fontSize: `${display.size}px`, lineHeight: 1.3 }}
      >
        {lines.length > 0
          ? lines.map((l, i) => (
              <span key={i} className="block">
                {l}
              </span>
            ))
          : ' '}
      </p>
    </div>
  );
}
