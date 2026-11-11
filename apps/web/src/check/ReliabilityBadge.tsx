import type { Reliability } from '@clearly/core';
import { t, type MessageId } from '../copy/en.ts';

/** Reliability in words with a shape (three bars, filled by level), never colour alone. */
export function ReliabilityBadge({ level }: { level: Reliability }) {
  const filled = level === 'High' ? 3 : level === 'Medium' ? 2 : 1;
  return (
    <div className="flex items-center gap-2">
      <svg width="36" height="28" viewBox="0 0 36 28" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <rect
            key={i}
            x={i * 12 + 1}
            y={20 - i * 8}
            width="9"
            height={8 + i * 8}
            rx="2"
            fill={i < filled ? 'var(--t-color-primary)' : 'none'}
            stroke="var(--t-color-primary)"
            strokeWidth="2"
          />
        ))}
      </svg>
      <div>
        <p className="text-sm text-text-muted">{t('results.reliability.label')}</p>
        <p>
          <span className="font-semibold">{t(`results.reliability.${level}` as MessageId)}</span>
          <span aria-hidden="true">. </span>
          <span>{t(`results.reliability.${level}Hint` as MessageId)}</span>
        </p>
      </div>
    </div>
  );
}
