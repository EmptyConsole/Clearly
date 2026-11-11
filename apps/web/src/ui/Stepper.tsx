import { cx } from './cx.ts';

export interface StepperProps {
  readonly steps: readonly string[];
  /** Zero-based index of the current step. */
  readonly current: number;
  readonly label: string;
}

/** A visible list of steps; the current one is marked with aria-current and in words. */
export function Stepper({ steps, current, label }: StepperProps) {
  return (
    <nav aria-label={label}>
      <ol className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
        {steps.map((s, i) => (
          <li
            key={s}
            aria-current={i === current ? 'step' : undefined}
            className={cx(
              'flex items-center gap-1',
              i === current ? 'font-semibold text-text' : 'text-text-muted',
            )}
          >
            <span
              aria-hidden="true"
              className={cx(
                'inline-flex size-[var(--t-space-3)] items-center justify-center rounded-pill border-control text-sm',
                i < current && 'border-primary bg-primary text-text-on-primary',
                i === current && 'border-primary text-primary',
                i > current && 'border-border-control',
              )}
            >
              {i + 1}
            </span>
            {s}
          </li>
        ))}
      </ol>
    </nav>
  );
}
