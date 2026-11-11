import { t } from '../copy/en.ts';

/** Shown wherever an Estimated (Starter) profile appears. Words and an outline shape, not colour. */
export function EstimatedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-pill border-control border-warning px-2 py-0.5 text-sm font-semibold text-text">
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <circle
          cx="8"
          cy="8"
          r="6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="3 2"
        />
      </svg>
      {t('profile.estimated')}
    </span>
  );
}
