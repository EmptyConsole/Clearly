import { cx } from './cx.ts';

export interface ProgressBarProps {
  readonly value: number;
  readonly max: number;
  readonly label: string;
  /** Spoken and shown value text, for example "3 of 10 pitches done". */
  readonly valueText: string;
  readonly className?: string;
}

/** One calm bar. role=progressbar with a text value; no animation beyond a short width change. */
export function ProgressBar({ value, max, label, valueText, className }: ProgressBarProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className={cx('w-full', className)}>
      <div className="mb-1 flex justify-between gap-2 text-sm text-text-muted">
        <span>{label}</span>
        <span>{valueText}</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={valueText}
        className="h-[var(--t-space-1)] w-full overflow-hidden rounded-pill bg-surface-sunken"
      >
        <div
          className="h-full rounded-pill bg-primary transition-[width] duration-[var(--t-motion-duration-base)] ease-standard"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
